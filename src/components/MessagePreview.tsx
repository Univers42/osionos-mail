import React from 'react';
import { Archive, BellDot, Clock3, MailOpen, Star, Trash2, X } from 'lucide-react';

import type { HoverActionId, MailMessage } from '../types';

interface MessagePreviewProps {
  message: MailMessage | null;
  onClose: () => void;
  onRunAction: (id: string, action: HoverActionId) => void;
}

export const MessagePreview: React.FC<MessagePreviewProps> = ({ message, onClose, onRunAction }) => {
  if (!message) {
    return (
      <aside className="mail-preview mail-preview--empty">
        <MailOpen size={32} />
        <strong>Select a message</strong>
        <span>The page preview reuses the same compact surface as the main app.</span>
      </aside>
    );
  }

  return (
    <aside className="mail-preview">
      <div className="mail-preview__header">
        <div>
          <span>{message.fromName}</span>
          <small>{message.fromEmail}</small>
        </div>
        <button className="mail-icon-button" type="button" onClick={onClose} aria-label="Close preview">
          <X size={18} />
        </button>
      </div>
      <h2>{message.subject}</h2>
      <div className="mail-preview__actions">
        <button type="button" onClick={() => onRunAction(message.id, 'star')}><Star size={16} /> Star</button>
        <button type="button" onClick={() => onRunAction(message.id, 'archive')}><Archive size={16} /> Archive</button>
        <button type="button" onClick={() => onRunAction(message.id, 'trash')}><Trash2 size={16} /> Trash</button>
        <button type="button" onClick={() => onRunAction(message.id, 'read')}><BellDot size={16} /> Read</button>
        <button type="button" onClick={() => onRunAction(message.id, 'remind')}><Clock3 size={16} /> Remind</button>
      </div>
      <div className="mail-preview__body">
        <p>{message.body}</p>
        <dl>
          <div><dt>To</dt><dd>{message.to.join(', ')}</dd></div>
          <div><dt>Category</dt><dd>{message.category}</dd></div>
          <div><dt>Labels</dt><dd>{message.labels.join(', ') || 'None'}</dd></div>
          <div><dt>Priority</dt><dd>{message.priority}</dd></div>
        </dl>
      </div>
    </aside>
  );
};