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

function bridgeBase(endpoint: string) {
  return endpoint.trim().replace(/\/+$/, '');
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Mail bridge request failed';
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
  const response = await fetch(`${bridgeBase(endpoint)}/session`);
  return readJson<BridgeSessionResponse>(response);
}

export function openBridgeAuth(endpoint: string, provider: MailProvider) {
  const authWindow = globalThis.open(`${bridgeBase(endpoint)}/auth/${provider}/start`, '_blank', 'noopener,noreferrer');
  if (!authWindow) throw new Error('The browser blocked the provider authorization window.');
}

export async function syncBridgeMessages(endpoint: string, limit = 2000, pageToken = '', includeBodies = false): Promise<BridgeMessagesResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (pageToken) params.set('pageToken', pageToken);
  if (pageToken || limit < 2000) params.set('paged', 'true');
  if (includeBodies) params.set('includeBodies', 'true');
  const response = await fetch(`${bridgeBase(endpoint)}/messages?${params}`);
  return readJson<BridgeMessagesResponse>(response);
}

export async function loadBridgeMessage(endpoint: string, messageId: string): Promise<BridgeMessageResponse> {
  const response = await fetch(`${bridgeBase(endpoint)}/messages/${encodeURIComponent(messageId)}`);
  return readJson<BridgeMessageResponse>(response);
}

export async function disconnectBridge(endpoint: string): Promise<BridgeSessionResponse> {
  const response = await fetch(`${bridgeBase(endpoint)}/disconnect`, { method: 'POST' });
  return readJson<BridgeSessionResponse>(response);
}

export async function applyBridgeAction(endpoint: string, message: MailMessage, action: HoverActionId) {
  if (!message.providerMessageId) return;
  const response = await fetch(`${bridgeBase(endpoint)}/messages/${encodeURIComponent(message.providerMessageId)}/actions`, {
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
    bridgeAvailable: true,
    message: session.message,
    lastSync: session.lastSync,
  };
}

export function bridgeErrorStatus(error: unknown) {
  return errorMessage(error);
}