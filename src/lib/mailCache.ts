import type { MailMessage } from '../types';

const CACHE_VERSION = 2;
const CACHE_INDEX_KEY = 'osionos-mail-cache:index';
const CACHE_PREFIX = 'osionos-mail-cache:mailbox:';

export interface MailboxCache {
  version: number;
  endpoint: string;
  account: string;
  syncedAt: string;
  nextPageToken: string;
  hasMore: boolean;
  resultSizeEstimate: number;
  activeMessageId: string | null;
  messages: MailMessage[];
}

function canUseStorage() {
  return globalThis.localStorage !== undefined;
}

function cacheKey(endpoint: string, account: string) {
  return `${CACHE_PREFIX}${endpoint.trim().replaceAll(/\W+/g, '_')}:${account.trim().toLowerCase()}`;
}

function compactMessage(message: MailMessage): MailMessage {
  if (message.source !== 'gmail') return message;
  return {
    ...message,
    body: message.snippet || message.body.slice(0, 320),
    bodyHtml: undefined,
    bodyLoaded: false,
  };
}

function readCache(key: string): MailboxCache | null {
  if (!canUseStorage()) return null;
  const raw = globalThis.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MailboxCache;
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadMailboxCache(endpoint: string, account: string) {
  if (!account) return null;
  return readCache(cacheKey(endpoint, account));
}

export function loadLatestMailboxCache() {
  if (!canUseStorage()) return null;
  const key = globalThis.localStorage.getItem(CACHE_INDEX_KEY);
  return key ? readCache(key) : null;
}

export function saveMailboxCache(cache: Omit<MailboxCache, 'version'>) {
  if (!canUseStorage() || !cache.account) return;
  const key = cacheKey(cache.endpoint, cache.account);
  const payload: MailboxCache = {
    ...cache,
    version: CACHE_VERSION,
    messages: cache.messages.map(compactMessage),
  };
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(payload));
    globalThis.localStorage.setItem(CACHE_INDEX_KEY, key);
  } catch {
    globalThis.localStorage.removeItem(key);
  }
}

export function clearMailboxCache(endpoint: string, account: string) {
  if (!canUseStorage() || !account) return;
  globalThis.localStorage.removeItem(cacheKey(endpoint, account));
}