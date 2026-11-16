import { isBridgeEnabled } from './bridgeConfig';
import type { ConnectorState, HoverActionId, MailMessage, MailProvider } from '../types';

export interface BridgeSessionResponse {
  provider: MailProvider;
  configured: boolean;
  connected: boolean;
  account: string;
  lastSync: string | null;
  message?: string;
}

export interface BridgeMessagesResponse {
  provider: MailProvider;
  account: string;
  syncedAt: string;
  requestedLimit?: number;
  fetchedCount?: number;
  resultSizeEstimate?: number;
  nextPageToken?: string;
  hasMore?: boolean;
  messages: MailMessage[];
}

export interface BridgeMessageResponse {
  provider: MailProvider;
  account: string;
  message: MailMessage;
}

function validateBridgeBase(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('No mail bridge is configured');
  }
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) {
      throw new Error('Invalid bridge endpoint');
    }
    return trimmed;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid bridge endpoint URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid bridge endpoint protocol');
  }
    let pathname = parsed.pathname;
  while (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  return parsed.origin + pathname;
}

// Single exit to the network: every bridge call passes here, so an empty endpoint
// fails before fetch is ever reached.
function bridgeFetch(endpoint: string, path: string, init?: RequestInit) {
  if (!isBridgeEnabled(endpoint)) throw new Error('No mail bridge is configured');
  const base = validateBridgeBase(endpoint);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // NOSONAR: base endpoint is strictly validated and normalized
  return fetch(`${base}${normalizedPath}`, init); // NOSONAR
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : `Mail bridge returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function loadBridgeSession(endpoint: string): Promise<BridgeSessionResponse> {
  const response = await bridgeFetch(endpoint, '/session');
  return readJson<BridgeSessionResponse>(response);
}

export function openBridgeAuth(endpoint: string, provider: MailProvider) {
  if (!isBridgeEnabled(endpoint)) throw new Error('No mail bridge is configured');
  const safeProvider = encodeURIComponent(provider);
  const base = validateBridgeBase(endpoint);
  const authUrl = `${base}/auth/${safeProvider}/start`;
  let resolvedUrl: string;
  if (authUrl.startsWith('/')) {
    resolvedUrl = new URL(authUrl, globalThis.location?.origin || 'http://localhost').toString();
  } else {
    const parsed = new URL(authUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid auth URL protocol');
    }
    resolvedUrl = parsed.toString();
  }
  const authWindow = globalThis.open(resolvedUrl, '_blank', 'noopener,noreferrer');
  if (!authWindow) throw new Error('The browser blocked the provider authorization window.');
}

export async function syncBridgeMessages(endpoint: string, limit = 2000, pageToken = '', includeBodies = false): Promise<BridgeMessagesResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (pageToken) params.set('pageToken', pageToken);
  if (pageToken || limit < 2000) params.set('paged', 'true');
  if (includeBodies) params.set('includeBodies', 'true');
  const response = await bridgeFetch(endpoint, `/messages?${params}`);
  return readJson<BridgeMessagesResponse>(response);
}

export async function loadBridgeMessage(endpoint: string, messageId: string): Promise<BridgeMessageResponse> {
  const response = await bridgeFetch(endpoint, `/messages/${encodeURIComponent(messageId)}`);
  return readJson<BridgeMessageResponse>(response);
}

export async function disconnectBridge(endpoint: string): Promise<BridgeSessionResponse> {
  const response = await bridgeFetch(endpoint, '/disconnect', { method: 'POST' });
  return readJson<BridgeSessionResponse>(response);
}

export async function applyBridgeAction(endpoint: string, message: MailMessage, action: HoverActionId) {
  if (!message.providerMessageId) return;
  const response = await bridgeFetch(endpoint, `/messages/${encodeURIComponent(message.providerMessageId)}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, current: { starred: message.starred, unread: message.unread, mailbox: message.mailbox } }),
  });
  await readJson<{ ok: boolean }>(response);
}

export function bridgeSessionToConnector(endpoint: string, current: ConnectorState, session: BridgeSessionResponse): ConnectorState {
  return {
    ...current,
    endpoint,
    provider: session.provider,
    account: session.account || current.account,
    connected: session.connected,
    configured: session.configured,
    bridgeAvailable: true,
    message: session.message,
    lastSync: session.lastSync,
  };
}

export function bridgeErrorStatus(error: unknown) {
  return error instanceof Error ? error.message : 'Mail bridge request failed';
}
