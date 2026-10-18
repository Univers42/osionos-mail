import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBridgeEnabled, PREVIEW_NOTICE, resolveBridgeEndpoint } from './bridgeConfig';
import {
  applyBridgeAction,
  disconnectBridge,
  loadBridgeMessage,
  loadBridgeSession,
  openBridgeAuth,
  syncBridgeMessages,
} from './mailBridge';

afterEach(() => vi.restoreAllMocks());

describe('resolveBridgeEndpoint', () => {
  it.each([undefined, '', '   '])('is empty in production when the URL is %j', (configured) => {
    expect(resolveBridgeEndpoint(configured, false)).toBe('');
  });

  it('keeps the localhost fallback in dev only', () => {
    expect(resolveBridgeEndpoint(undefined, true)).toBe('http://localhost:4100');
  });

  it('prefers the configured URL in both modes', () => {
    expect(resolveBridgeEndpoint('https://bridge.example', false)).toBe('https://bridge.example');
    expect(resolveBridgeEndpoint('https://bridge.example', true)).toBe('https://bridge.example');
  });
});

describe('preview mode (empty endpoint)', () => {
  it('reports the bridge as disabled and the notice text is the contract', () => {
    expect(isBridgeEnabled('')).toBe(false);
    expect(isBridgeEnabled('http://x')).toBe(true);
    expect(PREVIEW_NOTICE).toBe('Preview: sample data, no mailbox connected');
  });

  it('never calls fetch or window.open from any bridge function', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    const message = { providerMessageId: 'm1', starred: false, unread: true, mailbox: 'inbox' } as never;

    await expect(loadBridgeSession('')).rejects.toThrow('No mail bridge');
    await expect(syncBridgeMessages('')).rejects.toThrow('No mail bridge');
    await expect(loadBridgeMessage('', 'm1')).rejects.toThrow('No mail bridge');
    await expect(disconnectBridge('')).rejects.toThrow('No mail bridge');
    await expect(applyBridgeAction('', message, 'star')).rejects.toThrow('No mail bridge');
    expect(() => openBridgeAuth('', 'gmail')).toThrow('No mail bridge');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('still calls fetch when an endpoint is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await loadBridgeSession('http://bridge.test/');
    expect(fetchSpy).toHaveBeenCalledWith('http://bridge.test/session', undefined);
  });
});
