import React from 'react';
import { Cable, CheckCircle2, ExternalLink, Mail, Server, X } from 'lucide-react';

import type { ConnectorState, MailProvider } from '../types';

interface ConnectorModalProps {
  connector: ConnectorState;
  onChange: (connector: ConnectorState) => void;
  onClose: () => void;
  onSync: () => void;
  onStartAuth: () => void;
  onDisconnect: () => void;
}

const PROVIDERS: Array<{ id: MailProvider; label: string; hint: string }> = [
  { id: 'gmail', label: 'Gmail', hint: 'Local OAuth bridge or Gmail API proxy' },
  { id: 'outlook', label: 'Outlook', hint: 'Microsoft Graph localhost bridge' },
  { id: 'imap', label: 'IMAP', hint: 'Generic mailbox adapter' },
];

export const ConnectorModal: React.FC<ConnectorModalProps> = ({ connector, onChange, onClose, onSync, onStartAuth, onDisconnect }) => {
  const update = (patch: Partial<ConnectorState>) => onChange({ ...connector, ...patch });

  return (
    <div className="mail-modal-backdrop">
      <section className="mail-modal" aria-label="Mail connector">
        <header className="mail-modal__header">
          <div>
            <span className="mail-modal__eyebrow">Local bridge</span>
            <h2>Connect an email provider</h2>
          </div>
          <button className="mail-icon-button" type="button" onClick={onClose} aria-label="Close connector">
            <X size={18} />
          </button>
        </header>

        <div className="mail-provider-grid">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              className={["mail-provider-card", connector.provider === provider.id ? 'mail-provider-card--active' : ''].join(' ')}
              type="button"
              onClick={() => update({ provider: provider.id })}
            >
              <Mail size={20} />
              <strong>{provider.label}</strong>
              <span>{provider.hint}</span>
            </button>
          ))}
        </div>

        <label className="mail-field">
          <span>Account</span>
          <input value={connector.account} autoComplete="off" spellCheck={false} onChange={(event) => update({ account: event.target.value })} />
        </label>
        <label className="mail-field">
          <span>Local endpoint</span>
          <input value={connector.endpoint} autoComplete="off" spellCheck={false} onChange={(event) => update({ endpoint: event.target.value })} />
        </label>

        <div className="mail-connector-status">
          {connector.connected ? <CheckCircle2 size={18} /> : <Server size={18} />}
          <span>{connector.connected ? `Connected to Gmail as ${connector.account}` : connector.message || 'Ready for localhost Gmail authorization'}</span>
        </div>

        <div className="mail-bridge-help">
          <strong>Gmail localhost bridge</strong>
          <span>Run `npm run bridge` with Google OAuth credentials. Tokens stay in `.mail-bridge-tokens.json`; the browser only reads normalized mail data from localhost.</span>
        </div>

        <footer className="mail-modal__footer">
          <button type="button" className="mail-secondary-button" onClick={onDisconnect}>
            Disconnect
          </button>
          <button type="button" className="mail-secondary-button" onClick={onSync}>
            <Cable size={16} /> Test sync
          </button>
          <button type="button" className="mail-primary-button" onClick={onStartAuth}>
            <ExternalLink size={16} /> Connect Gmail
          </button>
        </footer>
      </section>
    </div>
  );
};