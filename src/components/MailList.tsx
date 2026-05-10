import React from 'react';
import {
  Archive,
  BellDot,
  Clock3,
  Paperclip,
  Star,
  Trash2,
} from 'lucide-react';

import type { GroupBy, HoverActionId, MailMessage, MailProperty } from '../types';

interface MailSection {
  title: string;
  messages: MailMessage[];
}

interface MailListProps {
  sections: MailSection[];
  selectedIds: Set<string>;
  activeMessageId: string | null;
  visibleProperties: MailProperty[];
  hoverActions: HoverActionId[];
  groupBy: GroupBy;
  onToggleMessage: (id: string) => void;
  onOpenMessage: (id: string) => void;
  onRunAction: (id: string, action: HoverActionId) => void;
}

const ACTION_ICONS: Record<HoverActionId, React.ReactNode> = {
  star: <Star size={18} />,
  archive: <Archive size={18} />,
  trash: <Trash2 size={18} />,
  read: <BellDot size={18} />,
  remind: <Clock3 size={18} />,
};

const ACTION_LABELS: Record<HoverActionId, string> = {
  star: 'Starred',
  archive: 'Archive',
  trash: 'Trash',
  read: 'Read/unread',
  remind: 'Remind',
};

function formatMessageTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function senderDomain(message: MailMessage) {
  return message.fromEmail.split('@')[1] ?? message.fromEmail;
}

export const MailList: React.FC<MailListProps> = ({
  sections,
  selectedIds,
  activeMessageId,
  visibleProperties,
  hoverActions,
  groupBy,
  onToggleMessage,
  onOpenMessage,
  onRunAction,
}) => (
  <div className="mail-list" aria-label="Messages">
    {sections.length === 0 ? (
      <div className="mail-list-empty">
        <strong>No messages match this view</strong>
        <span>Change the filters or sync the localhost bridge.</span>
      </div>
    ) : null}

    {sections.map((section) => (
      <section className="mail-list-section" key={section.title}>
        {groupBy !== 'None' ? <div className="mail-list-section__title">{section.title}</div> : null}
        {section.messages.map((message) => {
          const selected = selectedIds.has(message.id);
          const active = activeMessageId === message.id;

          return (
            <article
              className={[
                'mail-row',
                message.unread ? 'mail-row--unread' : '',
                selected ? 'mail-row--selected' : '',
                active ? 'mail-row--active' : '',
              ].join(' ')}
              key={message.id}
              onClick={() => onOpenMessage(message.id)}
            >
              <button
                className="mail-row__check"
                type="button"
                aria-label={`Select ${message.subject}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleMessage(message.id);
                }}
              >
                <span className={selected ? 'is-selected' : ''} />
              </button>
              <div className="mail-row__sender">
                <span className="mail-row__sender-name">{message.fromName}</span>
                {visibleProperties.includes('Email or Domain') ? <small>{senderDomain(message)}</small> : null}
              </div>
              <div className="mail-row__content">
                <div className="mail-row__subject-line">
                  {message.starred && visibleProperties.includes('Starred') ? <Star size={13} fill="currentColor" /> : null}
                  {message.important && visibleProperties.includes('Important') ? <BellDot size={13} /> : null}
                  <span className="mail-row__subject">{message.subject}</span>
                  <span className="mail-row__snippet">{message.snippet}</span>
                </div>
                <div className="mail-row__meta">
                  {visibleProperties.includes('Priority') ? <span data-priority={message.priority}>{message.priority}</span> : null}
                  {visibleProperties.includes('Labels')
                    ? message.labels.slice(0, 3).map((label) => <span key={label}>{label}</span>)
                    : null}
                  {visibleProperties.includes('Unread') && message.unread ? <span>Unread</span> : null}
                  {message.hasAttachments ? <Paperclip size={13} /> : null}
                </div>
              </div>
              <div className="mail-row__time">{visibleProperties.includes('Date') ? formatMessageTime(message.receivedAt) : ''}</div>
              <div className="mail-row__hover-actions">
                {hoverActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    title={ACTION_LABELS[action]}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRunAction(message.id, action);
                    }}
                  >
                    {ACTION_ICONS[action]}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    ))}
  </div>
);

export type { MailSection };