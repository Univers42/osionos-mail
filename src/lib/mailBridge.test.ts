import { describe, expect, it } from 'vitest';

import type { ConnectorState } from '../types';
import { bridgeSessionToConnector, type BridgeSessionResponse } from './mailBridge';

const CURRENT: ConnectorState = { provider: 'gmail', account: 'Not connected', endpoint: '', connected: false, lastSync: null };

function session(configured: boolean): BridgeSessionResponse {
  return { provider: 'gmail', configured, connected: false, account: '', lastSync: null, message: 'status' };
}

describe('bridgeSessionToConnector', () => {
  it.each([true, false])('carries configured=%s from the bridge', (configured) => {
    expect(bridgeSessionToConnector('/api/mail/bridge', CURRENT, session(configured)).configured).toBe(configured);
  });
});
