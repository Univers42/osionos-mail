#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function unquote(value) {
  return value.trim().replaceAll(/^"|"$/g, '');
}

for (const envFile of ['.env.local', '.env']) {
  const envPath = resolve(rootDir, envFile);
  if (!existsSync(envPath)) continue;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_]\w*)\s*=\s*(.*)\s*$/.exec(rawLine);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = unquote(match[2]);
  }
}

const port = Number(process.env.MAIL_BRIDGE_PORT || 4100);
const appOrigin = process.env.MAIL_APP_ORIGIN || 'http://localhost:3002';
const bridgeOrigin = process.env.MAIL_BRIDGE_PUBLIC_ORIGIN || `http://localhost:${port}`;
const tokenFile = resolve(rootDir, process.env.MAIL_BRIDGE_TOKEN_FILE || '.mail-bridge-tokens.json');
const stateFile = resolve(rootDir, process.env.MAIL_BRIDGE_STATE_FILE || '.mail-bridge-state.json');
const vaultStatus = { enabled: process.env.MAIL_BRIDGE_VAULT_ENABLED === 'true', loaded: false, message: '' };
const vaultCredentials = await loadVaultGoogleCredentials();
const googleClientId = process.env.GOOGLE_CLIENT_ID || vaultCredentials.googleClientId || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || vaultCredentials.googleClientSecret || '';
const googleRedirectUri = process.env.GMAIL_REDIRECT_URI || `${bridgeOrigin}/auth/gmail/callback`;
const defaultLimit = positiveInt(process.env.GMAIL_SYNC_LIMIT, 2000);
const maxSyncLimit = positiveInt(process.env.GMAIL_MAX_SYNC_LIMIT, 5000);
const gmailListPageSize = Math.min(positiveInt(process.env.GMAIL_LIST_PAGE_SIZE, 500), 500);
const gmailDetailBatchSize = positiveInt(process.env.GMAIL_DETAIL_BATCH_SIZE, 20);
const oauthStateTtlMs = Number(process.env.MAIL_BRIDGE_OAUTH_STATE_TTL_MS || 10 * 60 * 1000);
const callbackPaths = new Set([
  new URL(googleRedirectUri).pathname,
  ...String(process.env.GMAIL_CALLBACK_PATHS || '').split(',').map((pathValue) => pathValue.trim()).filter(Boolean),
]);

const gmailScopes = [
  'https://www.googleapis.com/auth/gmail.modify',
];

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function clampLimit(value) {
  return Math.min(Math.max(positiveInt(value, defaultLimit), 1), maxSyncLimit);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function vaultRequest(path, token, body) {
  const vaultAddr = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
  const response = await fetch(`${vaultAddr.replace(/\/+$/, '')}/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Vault-Token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.errors?.[0] || `Vault request failed with HTTP ${response.status}`);
  return payload;
}

async function loadVaultToken() {
  if (process.env.VAULT_TOKEN) return process.env.VAULT_TOKEN;
  if (process.env.VAULT_ROLE_ID && process.env.VAULT_SECRET_ID) {
    const login = await vaultRequest('auth/approle/login', '', {
      role_id: process.env.VAULT_ROLE_ID,
      secret_id: process.env.VAULT_SECRET_ID,
    });
    return login.auth?.client_token || '';
  }
  return '';
}

async function loadVaultGoogleCredentials() {
  if (process.env.MAIL_BRIDGE_VAULT_ENABLED !== 'true') return {};
  try {
    const token = await loadVaultToken();
    if (!token) throw new Error('VAULT_TOKEN or VAULT_ROLE_ID/VAULT_SECRET_ID is required');
    const path = process.env.MAIL_BRIDGE_VAULT_OAUTH_PATH || 'secret/data/mini-baas/oauth';
    const payload = await vaultRequest(path, token);
    const data = payload.data?.data || {};
    vaultStatus.loaded = Boolean(data.google_client_id && data.google_client_secret);
    vaultStatus.message = vaultStatus.loaded
      ? 'Google OAuth credentials loaded from BaaS Vault.'
      : 'BaaS Vault responded but Google OAuth credentials are empty.';
    return {
      googleClientId: data.google_client_id,
      googleClientSecret: data.google_client_secret,
    };
  } catch (error) {
    vaultStatus.message = error instanceof Error ? error.message : 'BaaS Vault credential lookup failed';
    return {};
  }
}

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

function readStates() {
  if (!existsSync(stateFile)) return {};
  return JSON.parse(readFileSync(stateFile, 'utf8'));
}

function writeStates(states) {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(states, null, 2), { mode: 0o600 });
}

function pruneStates(states) {
  const now = Date.now();
  return Object.fromEntries(Object.entries(states).filter(([, value]) => now - value.createdAt < oauthStateTtlMs));
}

function saveOauthState(state, redirectUri) {
  const states = pruneStates(readStates());
  states[state] = { createdAt: Date.now(), redirectUri };
  writeStates(states);
}

function consumeOauthState(state) {
  const states = pruneStates(readStates());
  const value = states[state];
  delete states[state];
  writeStates(states);
  return value || null;
}

function callbackDebug() {
  return {
    bridgeOrigin,
    redirectUri: googleRedirectUri,
    callbackPaths: Array.from(callbackPaths),
    vault: vaultStatus.enabled ? { enabled: true, loaded: vaultStatus.loaded, message: vaultStatus.message } : { enabled: false },
  };
}

function publicSession(extra = {}) {
  const tokens = readTokens();
  const account = tokens?.account || '';
  let message = 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before connecting Gmail.';
  if (configured()) {
    message = vaultStatus.loaded ? 'Gmail bridge is configured from BaaS Vault.' : 'Gmail bridge is configured for localhost OAuth.';
  }
  return {
    provider: 'gmail',
    configured: configured(),
    connected: Boolean(tokens?.refresh_token || tokens?.access_token),
    account,
    lastSync: tokens?.lastSync || null,
    message,
    callback: callbackDebug(),
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
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (options.headers) Object.assign(headers, options.headers);
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Gmail API request failed with HTTP ${response.status}`);
  return payload;
}

function decodeBase64Url(value = '') {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function header(payload, name) {
  return payload.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function parseAddress(value) {
  const match = /^(.*)<([^>]+)>$/.exec(value.trim());
  if (!match) return { name: value || 'Unknown sender', email: value || 'unknown@localhost' };
  const name = unquote(match[1]) || match[2].trim();
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
    .replaceAll(/<style[\s\S]*?<\/style>/gi, ' ')
    .replaceAll(/<script[\s\S]*?<\/script>/gi, ' ')
    .replaceAll(/<br\s*\/?\s*>/gi, '\n')
    .replaceAll(/<\/p>/gi, '\n')
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll(/\n{3,}/g, '\n\n')
    .replaceAll(/[ \t]{2,}/g, ' ')
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

function messageHtml(payload) {
  const htmlParts = [];
  walkParts(payload, (part) => {
    if (part.body?.data && part.mimeType === 'text/html') htmlParts.push(decodeBase64Url(part.body.data));
  });
  if (htmlParts.length) return htmlParts.join('\n\n').trim();
  if (payload.mimeType === 'text/html' && payload.body?.data) return decodeBase64Url(payload.body.data).trim();
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

function messagePriority(labelIds, category) {
  if (labelIds.includes('IMPORTANT')) return 'high';
  if (category === 'Promotions') return 'low';
  return 'normal';
}

function normalizeMessage(message, labelMap) {
  const payload = message.payload || {};
  const labelIds = message.labelIds || [];
  const labels = displayLabels(labelIds, labelMap);
  const from = parseAddress(header(payload, 'From'));
  const subject = header(payload, 'Subject') || '(no subject)';
  const bodyHtml = messageHtml(payload);
  const body = messageBody(payload) || message.snippet || '';
  const receivedAt = header(payload, 'Date') ? new Date(header(payload, 'Date')).toISOString() : new Date(Number(message.internalDate || Date.now())).toISOString();
  const category = categoryFromLabels(labelIds, labels);
  const priority = messagePriority(labelIds, category);

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
    priority,
    hasAttachments: hasAttachment(payload),
    calendarEvent: labels.some((label) => label.toLowerCase().includes('calendar')),
    sent: labelIds.includes('SENT'),
    rawLabelIds: labelIds,
    bodyHtml,
    bodyLoaded: true,
  };
}

function normalizeMessageMetadata(message, labelMap) {
  const payload = message.payload || {};
  const labelIds = message.labelIds || [];
  const labels = displayLabels(labelIds, labelMap);
  const from = parseAddress(header(payload, 'From'));
  const subject = header(payload, 'Subject') || '(no subject)';
  const receivedAt = header(payload, 'Date') ? new Date(header(payload, 'Date')).toISOString() : new Date(Number(message.internalDate || Date.now())).toISOString();
  const category = categoryFromLabels(labelIds, labels);
  const priority = messagePriority(labelIds, category);

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
    snippet: message.snippet || '',
    body: message.snippet || '',
    receivedAt,
    mailbox: mailboxFromLabels(labelIds),
    labels,
    category,
    unread: labelIds.includes('UNREAD'),
    archived: !labelIds.includes('INBOX') && !labelIds.includes('TRASH') && !labelIds.includes('SPAM'),
    starred: labelIds.includes('STARRED'),
    important: labelIds.includes('IMPORTANT'),
    priority,
    hasAttachments: false,
    calendarEvent: labels.some((label) => label.toLowerCase().includes('calendar')),
    sent: labelIds.includes('SENT'),
    rawLabelIds: labelIds,
    bodyLoaded: false,
  };
}

function metadataPath(messageId) {
  const params = new URLSearchParams({ format: 'metadata' });
  for (const headerName of ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date']) params.append('metadataHeaders', headerName);
  return `messages/${messageId}?${params}`;
}

async function loadLabelMap() {
  const payload = await gmailFetch('labels');
  return new Map((payload.labels || []).map((label) => [label.id, label]));
}

async function loadMessageListPage(limit, pageToken = '') {
  const pageSize = Math.min(gmailListPageSize, limit);
  const params = new URLSearchParams({ maxResults: String(pageSize), includeSpamTrash: 'true' });
  if (pageToken) params.set('pageToken', pageToken);
  const list = await gmailFetch(`messages?${params}`);
  return {
    items: list.messages || [],
    resultSizeEstimate: Number(list.resultSizeEstimate || 0),
    nextPageToken: list.nextPageToken || '',
    hasMore: Boolean(list.nextPageToken),
  };
}

async function loadMessageList(limit) {
  const items = [];
  let pageToken = '';
  let resultSizeEstimate = 0;
  let hasMore = false;

  do {
    const page = await loadMessageListPage(limit - items.length, pageToken);
    items.push(...page.items);
    resultSizeEstimate = Math.max(resultSizeEstimate, page.resultSizeEstimate);
    pageToken = page.nextPageToken;
    hasMore = page.hasMore;
  } while (pageToken && items.length < limit);

  return {
    items: items.slice(0, limit),
    resultSizeEstimate,
    nextPageToken: pageToken,
    hasMore,
  };
}

async function mapBatches(items, batchSize, mapper) {
  const results = [];
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    results.push(...await Promise.all(batch.map(mapper)));
  }
  return results;
}

async function currentAccount() {
  const tokens = readTokens();
  if (tokens?.account) return tokens.account;
  const profile = await gmailFetch('profile');
  const currentTokens = readTokens() ?? {};
  writeTokens({ ...currentTokens, account: profile.emailAddress || currentTokens.account || '' });
  return profile.emailAddress || '';
}

async function loadMessages(limit, includeBodies = false) {
  const labelMap = await loadLabelMap();
  const list = await loadMessageList(limit);
  const messages = await mapBatches(list.items, gmailDetailBatchSize, (item) => gmailFetch(includeBodies ? `messages/${item.id}?format=full` : metadataPath(item.id)));
  const normalized = messages.map((message) => includeBodies ? normalizeMessage(message, labelMap) : normalizeMessageMetadata(message, labelMap));
  const tokens = readTokens();
  const account = await currentAccount();
  const currentTokens = tokens ?? {};
  writeTokens({ ...currentTokens, account, lastSync: new Date().toISOString() });
  return {
    account,
    messages: normalized,
    resultSizeEstimate: list.resultSizeEstimate,
    nextPageToken: list.nextPageToken,
    hasMore: list.hasMore,
    fetchedCount: normalized.length,
  };
}

async function loadMessagePage(limit, pageToken, includeBodies = false) {
  const labelMap = await loadLabelMap();
  const list = await loadMessageListPage(limit, pageToken);
  const messages = await mapBatches(list.items, gmailDetailBatchSize, (item) => gmailFetch(includeBodies ? `messages/${item.id}?format=full` : metadataPath(item.id)));
  const normalized = messages.map((message) => includeBodies ? normalizeMessage(message, labelMap) : normalizeMessageMetadata(message, labelMap));
  const tokens = readTokens();
  const account = await currentAccount();
  const currentTokens = tokens ?? {};
  writeTokens({ ...currentTokens, account, lastSync: new Date().toISOString() });
  return {
    account,
    messages: normalized,
    resultSizeEstimate: list.resultSizeEstimate,
    nextPageToken: list.nextPageToken,
    hasMore: list.hasMore,
    fetchedCount: normalized.length,
  };
}

async function loadMessageDetail(messageId) {
  const labelMap = await loadLabelMap();
  const message = await gmailFetch(`messages/${messageId}?format=full`);
  return normalizeMessage(message, labelMap);
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
  saveOauthState(state, googleRedirectUri);
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
  const googleError = requestUrl.searchParams.get('error');
  const googleErrorDescription = requestUrl.searchParams.get('error_description');
  const oauthState = state ? consumeOauthState(state) : null;
  if (googleError) {
    const description = googleErrorDescription || googleError;
    const testerHelp = googleError === 'access_denied'
      ? '<p>Google blocked this account before sending a Gmail authorization code. Add this Gmail address to OAuth consent screen test users, or move the app out of testing after Google verification.</p>'
      : '';
    html(response, 400, `
      <h1>Gmail authorization blocked by Google</h1>
      <p>${escapeHtml(description)}</p>
      ${testerHelp}
      ${oauthState ? '' : '<p>The callback also did not match a live bridge state. Start again from osionos Mail after fixing Google consent access.</p>'}
      <pre>${escapeHtml(JSON.stringify(callbackDebug(), null, 2))}</pre>
    `);
    return;
  }
  if (!code || !state || !oauthState) {
    html(response, 400, `
      <h1>Gmail authorization failed</h1>
      <p>Invalid or expired OAuth state.</p>
      <p>Start again from osionos Mail so the bridge can create a fresh state token.</p>
      <pre>${escapeHtml(JSON.stringify(callbackDebug(), null, 2))}</pre>
    `);
    return;
  }
  const tokens = await exchangeToken({
    code,
    client_id: googleClientId,
    client_secret: googleClientSecret,
    redirect_uri: oauthState.redirectUri,
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

async function handleSessionRoutes(request, requestUrl, response) {
  if (request.method === 'GET' && requestUrl.pathname === '/') {
    json(response, 200, { ok: true, service: 'osionos-mail-bridge', ...publicSession() });
    return true;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    json(response, 200, { ok: true, provider: 'gmail' });
    return true;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/session') {
    json(response, 200, publicSession());
    return true;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/disconnect') {
    if (existsSync(tokenFile)) rmSync(tokenFile);
    json(response, 200, publicSession({ connected: false, account: '', lastSync: null }));
    return true;
  }
  return false;
}

async function handleAuthRoutes(request, requestUrl, response) {
  if (request.method !== 'GET') return false;
  if (requestUrl.pathname === '/auth/gmail/start') {
    startGmailAuth(response);
    return true;
  }
  if (callbackPaths.has(requestUrl.pathname)) {
    await finishGmailAuth(requestUrl, response);
    return true;
  }
  if (/^\/auth\/(outlook|imap)\/start$/.test(requestUrl.pathname)) {
    json(response, 501, { message: 'This localhost bridge is Gmail-ready now. Outlook and IMAP can plug into the same endpoint shape next.' });
    return true;
  }
  return false;
}

async function handleMessageRoutes(request, requestUrl, response) {
  if (request.method === 'GET' && requestUrl.pathname === '/messages') {
    const limit = clampLimit(requestUrl.searchParams.get('limit') || defaultLimit);
    const pageToken = requestUrl.searchParams.get('pageToken') || '';
    const paged = requestUrl.searchParams.get('paged') === 'true' || pageToken;
    const includeBodies = requestUrl.searchParams.get('includeBodies') === 'true';
    const loaded = paged ? await loadMessagePage(limit, pageToken, includeBodies) : await loadMessages(limit, includeBodies);
    json(response, 200, {
      provider: 'gmail',
      account: loaded.account,
      syncedAt: new Date().toISOString(),
      requestedLimit: limit,
      fetchedCount: loaded.fetchedCount,
      resultSizeEstimate: loaded.resultSizeEstimate,
      nextPageToken: loaded.nextPageToken,
      hasMore: loaded.hasMore,
      messages: loaded.messages,
    });
    return true;
  }
  const detailMatch = /^\/messages\/([^/]+)$/.exec(requestUrl.pathname);
  if (request.method === 'GET' && detailMatch) {
    json(response, 200, {
      provider: 'gmail',
      account: await currentAccount(),
      message: await loadMessageDetail(decodeURIComponent(detailMatch[1])),
    });
    return true;
  }
  const actionMatch = /^\/messages\/([^/]+)\/actions$/.exec(requestUrl.pathname);
  if (request.method === 'POST' && actionMatch) {
    await applyAction(decodeURIComponent(actionMatch[1]), await readBody(request));
    json(response, 200, { ok: true });
    return true;
  }
  return false;
}

async function route(request, response) {
  if (request.method === 'OPTIONS') return json(response, 204, {});
  const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);
  try {
    if (await handleSessionRoutes(request, requestUrl, response)) return;
    if (await handleAuthRoutes(request, requestUrl, response)) return;
    if (await handleMessageRoutes(request, requestUrl, response)) return;
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