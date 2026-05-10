import React, { useState } from 'react';
import { Send, X } from 'lucide-react';

import type { MailMessage } from '../types';

interface ComposerModalProps {
  onClose: () => void;
  onCreateDraft: (message: MailMessage) => void;
}

export const ComposerModal: React.FC<ComposerModalProps> = ({ onClose, onCreateDraft }) => {
  const [to, setTo] = useState('team@univers42.local');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const saveDraft = () => {
    const created: MailMessage = {
      id: `draft-${Date.now()}`,
      fromName: 'Me',
      fromEmail: 'dylan@univers42.local',
      to: to.split(',').map((value) => value.trim()).filter(Boolean),
      subject: subject.trim() || 'Untitled draft',
      snippet: body.trim() || 'Empty draft',
      body: body.trim() || 'Empty draft',
      receivedAt: new Date().toISOString(),
      mailbox: 'drafts',
      labels: ['Draft'],
      category: 'Primary',
      unread: false,
      archived: false,
      starred: false,
      important: false,
      priority: 'normal',
      hasAttachments: false,
      calendarEvent: false,
      sent: false,
    };
    onCreateDraft(created);
    onClose();
  };

  return (
    <div className="mail-modal-backdrop">
      <section className="mail-modal mail-modal--composer" aria-label="Compose mail">
        <header className="mail-modal__header">
          <div>
            <span className="mail-modal__eyebrow">Composer</span>
            <h2>New message</h2>
          </div>
          <button className="mail-icon-button" type="button" onClick={onClose} aria-label="Close composer">
            <X size={18} />
          </button>
        </header>
        <label className="mail-field">
          <span>To</span>
          <input value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label className="mail-field">
          <span>Subject</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" />
        </label>
        <label className="mail-field mail-field--body">
          <span>Body</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write an email..." />
        </label>
        <footer className="mail-modal__footer">
          <button type="button" className="mail-secondary-button" onClick={saveDraft}>Save draft</button>
          <button type="button" className="mail-primary-button" onClick={saveDraft}><Send size={16} /> Queue locally</button>
        </footer>
      </section>
    </div>
  );
};