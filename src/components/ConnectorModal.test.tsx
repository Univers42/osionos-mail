import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ConnectorState } from '../types';
import { ConnectorModal } from './ConnectorModal';

const UNAVAILABLE = 'Google sign-in is not available on this deployment.';

function renderConnector(patch: Partial<ConnectorState>) {
  const connector: ConnectorState = {
    provider: 'gmail',
    account: 'Not connected',
    endpoint: '/api/mail/bridge',
    connected: false,
    lastSync: null,
    ...patch,
  };
  const ignore = () => undefined;
  return renderToStaticMarkup(
    <ConnectorModal connector={connector} onChange={ignore} onClose={ignore} onSync={ignore} onStartAuth={ignore} onDisconnect={ignore} />,
  );
}

describe('ConnectorModal', () => {
  it.each([
    ['the bridge reports Google unconfigured', { configured: false }],
    ['the bridge never answered', {}],
  ])('tells the user sign-in is unavailable when %s, with no setup text', (_case, patch) => {
    const markup = renderConnector(patch);
    expect(markup).toContain(UNAVAILABLE);
    expect(markup).not.toContain('npm run bridge');
    expect(markup).toContain('Connect an email provider');
    expect(markup).toContain('Connect Gmail');
  });

  it('keeps the existing help when Google is configured', () => {
    const markup = renderConnector({ configured: true });
    expect(markup).toContain('Run `npm run bridge` with Google OAuth credentials.');
    expect(markup).not.toContain(UNAVAILABLE);
  });
});
