#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.MAIL_BRIDGE_PORT || 4100);
const appOrigin = process.env.MAIL_APP_ORIGIN || 'http://localhost:3002';
const tokenFile = resolve(rootDir, process.env.MAIL_BRIDGE_TOKEN_FILE || '.mail-bridge-tokens.json');
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const googleRedirectUri = process.env.GMAIL_REDIRECT_URI || `http://localhost:${port}/auth/gmail/callback`;
const defaultLimit = Number(process.env.GMAIL_SYNC_LIMIT || 50);
const oauthStates = new Set();

const gmailScopes = [
  'https://www.googleapis.com/auth/gmail.modify',
];

const categoryLabels = new Map([
  ['CATEGORY_PERSONAL', 'Primary'],
  ['CATEGORY_UPDATES', 'Updates'],
  ['CATEGORY_SOCIAL', 'Social'],
  ['CATEGORY_PROMOTIONS', 'Promotions'],
  ['CATEGORY_FORUMS', 'Forums'],
]);

const systemLabelNames = new Set([
  'INBOX',
  'UNREAD',
  'STARRED',
  'IMPORTANT',
  'SENT',
  'DRAFT',
  'TRASH',
  'SPAM',
  'SNOOZED',
  'CHAT',
]);

function json(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': appOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
}

function html(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': appOrigin,
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      if (chunks.length === 0) return resolveBody({});
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function configured() {
  return Boolean(googleClientId && googleClientSecret);
}

function readTokens() {
  if (!existsSync(tokenFile)) return null;
  return JSON.parse(readFileSync(tokenFile, 'utf8'));
}

function writeTokens(tokens) {
  mkdirSync(dirname(tokenFile), { recursive: true });
  writeFileSync(tokenFile, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function publicSession(extra = {}) {
  const tokens = readTokens();
  const account = tokens?.account || '';
  return {
    provider: 'gmail',
    configured: configured(),
    connected: Boolean(tokens?.refresh_token || tokens?.access_token),
    account,
    lastSync: tokens?.lastSync || null,
    message: configured()
      ? 'Gmail bridge is configured for localhost OAuth.'
      : 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before connecting Gmail.',
    ...extra,
  };
}

async function exchangeToken(parameters) {
  const body = new URLSearchParams(parameters);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.error || 'Google token exchange failed');
  return payload;
}

async function accessToken() {
  const tokens = readTokens();
  if (!tokens) throw new Error('Gmail is not connected yet. Open the connector and authorize Gmail first.');
  if (tokens.access_token && tokens.expiresAt && tokens.expiresAt > Date.now() + 60000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error('Gmail refresh token is missing. Reconnect Gmail from the app.');

  const refreshed = await exchangeToken({
    client_id: googleClientId,
    client_secret: googleClientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });
  const nextTokens = {
    ...tokens,
    ...refreshed,
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
    expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
  };
  writeTokens(nextTokens);
  return nextTokens.access_token;
}

async function gmailFetch(path, options = {}) {
  const token = await accessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Gmail API request failed with HTTP ${response.status}`);
  return payload;
}

function decodeBase64Url(value = '') {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function header(payload, name) {
  return payload.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function parseAddress(value) {
  const match = /^(.*)<([^>]+)>$/.exec(value.trim());
  if (!match) return { name: value || 'Unknown sender', email: value || 'unknown@localhost' };
  const name = match[1].trim().replace(/^"|"$/g, '') || match[2].trim();
  return { name, email: match[2].trim() };
}

function splitAddresses(value) {
  if (!value) return [];
  return value.split(',').map((item) => parseAddress(item).email).filter(Boolean);
}

function walkParts(part, visitor) {
  visitor(part);
  for (const child of part.parts || []) walkParts(child, visitor);
}

function hasAttachment(payload) {
  let found = false;
  walkParts(payload, (part) => {
    if (part.filename || part.body?.attachmentId) found = true;
  });
  return found;
}

function stripHtml(value) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function messageBody(payload) {
  const plainParts = [];
  const htmlParts = [];
  walkParts(payload, (part) => {
    if (!part.body?.data) return;
    if (part.mimeType === 'text/plain') plainParts.push(decodeBase64Url(part.body.data));
    if (part.mimeType === 'text/html') htmlParts.push(decodeBase64Url(part.body.data));
  });
  if (plainParts.length) return plainParts.join('\n\n').trim();
  if (htmlParts.length) return stripHtml(htmlParts.join('\n\n'));
  if (payload.body?.data) return decodeBase64Url(payload.body.data).trim();
  return '';
}

function categoryFromLabels(labelIds, labels) {
  for (const [id, category] of categoryLabels) {
    if (labelIds.includes(id)) return category;
  }
  const lowered = labels.map((label) => label.toLowerCase());
  if (lowered.some((label) => label.includes('purchase') || label.includes('achat'))) return 'Purchases';
  return 'Primary';
}

function mailboxFromLabels(labelIds) {
  if (labelIds.includes('TRASH')) return 'trash';
  if (labelIds.includes('SPAM')) return 'spam';
  if (labelIds.includes('DRAFT')) return 'drafts';
  if (labelIds.includes('SENT')) return 'sent';
  if (labelIds.includes('SNOOZED')) return 'snoozed';
  if (labelIds.includes('SCHEDULED')) return 'scheduled';
  if (labelIds.includes('INBOX')) return 'inbox';
  return 'all-mail';
}

function displayLabels(labelIds, labelMap) {
  return labelIds
    .map((id) => labelMap.get(id)?.name || id)
    .filter((label) => !systemLabelNames.has(label))
    .filter((label) => !categoryLabels.has(label));
}

function normalizeMessage(message, labelMap) {
  const payload = message.payload || {};
  const labelIds = message.labelIds || [];
  const labels = displayLabels(labelIds, labelMap);
  const from = parseAddress(header(payload, 'From'));
  const subject = header(payload, 'Subject') || '(no subject)';
  const body = messageBody(payload) || message.snippet || '';
  const receivedAt = header(payload, 'Date') ? new Date(header(payload, 'Date')).toISOString() : new Date(Number(message.internalDate || Date.now())).toISOString();
  const category = categoryFromLabels(labelIds, labels);

  return {
    id: `gmail-${message.id}`,
    providerMessageId: message.id,
    threadId: message.threadId,
    source: 'gmail',
    fromName: from.name,
    fromEmail: from.email,
    to: splitAddresses(header(payload, 'To')),
    cc: splitAddresses(header(payload, 'Cc')),
    bcc: splitAddresses(header(payload, 'Bcc')),
    subject,
    snippet: message.snippet || body.slice(0, 180),
    body,
    receivedAt,
    mailbox: mailboxFromLabels(labelIds),
    labels,
    category,
    unread: labelIds.includes('UNREAD'),
    archived: !labelIds.includes('INBOX') && !labelIds.includes('TRASH') && !labelIds.includes('SPAM'),
    starred: labelIds.includes('STARRED'),
    important: labelIds.includes('IMPORTANT'),
    priority: labelIds.includes('IMPORTANT') ? 'high' : category === 'Promotions' ? 'low' : 'normal',
    hasAttachments: hasAttachment(payload),
    calendarEvent: labels.some((label) => label.toLowerCase().includes('calendar')),
    sent: labelIds.includes('SENT'),
    rawLabelIds: labelIds,
  };
}

async function loadLabelMap() {
  const payload = await gmailFetch('labels');
  return new Map((payload.labels || []).map((label) => [label.id, label]));
}

async function loadMessages(limit) {
  const labelMap = await loadLabelMap();
  const list = await gmailFetch(`messages?maxResults=${limit}&includeSpamTrash=true`);
  const items = list.messages || [];
  const messages = await Promise.all(items.map((item) => gmailFetch(`messages/${item.id}?format=full`)));
  const normalized = messages.map((message) => normalizeMessage(message, labelMap));
  const tokens = readTokens();
  const profile = await gmailFetch('profile');
  writeTokens({ ...(tokens || {}), account: profile.emailAddress || tokens?.account || '', lastSync: new Date().toISOString() });
  return { account: profile.emailAddress || '', messages: normalized };
}

async function applyAction(messageId, body) {
  const action = body.action;
  const current = body.current || {};
  if (action === 'star') {
    await gmailFetch(`messages/${messageId}/modify`, {
      method: 'POST',
      body: JSON.stringify(current.starred ? { removeLabelIds: ['STARRED'] } : { addLabelIds: ['STARRED'] }),
    });
    return;
  }
  if (action === 'archive') {
    await gmailFetch(`messages/${messageId}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['INBOX'] }) });
    return;
  }
  if (action === 'trash') {
    await gmailFetch(`messages/${messageId}/trash`, { method: 'POST', body: JSON.stringify({}) });
    return;
  }
  if (action === 'read') {
    await gmailFetch(`messages/${messageId}/modify`, {
      method: 'POST',
      body: JSON.stringify(current.unread ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] }),
    });
  }
}

function startGmailAuth(response) {
  if (!configured()) {
    json(response, 400, publicSession());
    return;
  }
  const state = randomBytes(24).toString('hex');
  oauthStates.add(state);
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: googleRedirectUri,
    response_type: 'code',
    scope: gmailScopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  response.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  response.end();
}

async function finishGmailAuth(requestUrl, response) {
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  if (!code || !state || !oauthStates.has(state)) {
    html(response, 400, '<h1>Gmail authorization failed</h1><p>Invalid OAuth state.</p>');
    return;
  }
  oauthStates.delete(state);
  const tokens = await exchangeToken({
    code,
    client_id: googleClientId,
    client_secret: googleClientSecret,
    redirect_uri: googleRedirectUri,
    grant_type: 'authorization_code',
  });
  const nextTokens = {
    ...tokens,
    provider: 'gmail',
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    lastSync: null,
  };
  writeTokens(nextTokens);
  const profile = await gmailFetch('profile');
  writeTokens({ ...readTokens(), account: profile.emailAddress || '' });
  html(response, 200, '<h1>Gmail connected</h1><p>You can close this tab and refresh osionos Mail.</p>');
}

async function route(request, response) {
  if (request.method === 'OPTIONS') return json(response, 204, {});
  const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);
  try {
    if (request.method === 'GET' && requestUrl.pathname === '/health') return json(response, 200, { ok: true, provider: 'gmail' });
    if (request.method === 'GET' && requestUrl.pathname === '/session') return json(response, 200, publicSession());
    if (request.method === 'GET' && requestUrl.pathname === '/auth/gmail/start') return startGmailAuth(response);
    if (request.method === 'GET' && requestUrl.pathname === '/auth/gmail/callback') return finishGmailAuth(requestUrl, response);
    if (request.method === 'GET' && /^\/auth\/(outlook|imap)\/start$/.test(requestUrl.pathname)) {
      return json(response, 501, { message: 'This localhost bridge is Gmail-ready now. Outlook and IMAP can plug into the same endpoint shape next.' });
    }
    if (request.method === 'GET' && requestUrl.pathname === '/messages') {
      const limit = Math.min(Number(requestUrl.searchParams.get('limit') || defaultLimit), 100);
      const loaded = await loadMessages(limit);
      return json(response, 200, { provider: 'gmail', account: loaded.account, syncedAt: new Date().toISOString(), messages: loaded.messages });
    }
    const actionMatch = /^\/messages\/([^/]+)\/actions$/.exec(requestUrl.pathname);
    if (request.method === 'POST' && actionMatch) {
      await applyAction(decodeURIComponent(actionMatch[1]), await readBody(request));
      return json(response, 200, { ok: true });
    }
    if (request.method === 'POST' && requestUrl.pathname === '/disconnect') {
      if (existsSync(tokenFile)) rmSync(tokenFile);
      return json(response, 200, publicSession({ connected: false, account: '', lastSync: null }));
    }
    return json(response, 404, { message: 'Mail bridge route not found' });
  } catch (error) {
    return json(response, 500, { message: error instanceof Error ? error.message : 'Mail bridge error' });
  }
}

createServer((request, response) => {
  route(request, response);
}).listen(port, '0.0.0.0', () => {
  console.log(`[mail-bridge] Gmail bridge listening on http://localhost:${port}`);
  console.log(`[mail-bridge] OAuth redirect URI: ${googleRedirectUri}`);
});