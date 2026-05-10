import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BellDot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  ExternalLink,
  Forward,
  MailOpen,
  MoreHorizontal,
  Printer,
  Reply,
  ReplyAll,
  ShieldAlert,
  Star,
  Trash2,
  UserX,
} from 'lucide-react';

import type { HoverActionId, MailMessage } from '../types';

interface MessagePreviewProps {
  message: MailMessage | null;
  bodyLoading?: boolean;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onClose: () => void;
  onNavigate?: (direction: 'previous' | 'next') => void;
  onResizeStart?: React.PointerEventHandler<HTMLButtonElement>;
  onRunAction: (id: string, action: HoverActionId) => void;
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const emailDocumentHead = `<base target="_blank" />
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; min-height: 100%; background: #ffffff; color: #111111; }
      img { max-width: 100%; height: auto; }
      table { max-width: 100%; }
      pre, code { white-space: pre-wrap; overflow-wrap: anywhere; }
      .mail-plain-body { box-sizing: border-box; min-height: 100vh; padding: 28px; background: #252525; color: rgba(255,255,255,0.9); font: 14px/1.58 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
      .mail-plain-body p { margin: 0 0 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
    </style>`;

function wrapHtmlEmail(bodyHtml: string) {
  if (/<head[\s>]/i.test(bodyHtml)) return bodyHtml.replace(/<head([^>]*)>/i, `<head$1>${emailDocumentHead}`);
  if (/<html[\s>]/i.test(bodyHtml)) return bodyHtml.replace(/<html([^>]*)>/i, `<html$1><head>${emailDocumentHead}</head>`);
  return `<!doctype html>
<html>
  <head>${emailDocumentHead}</head>
  <body>${bodyHtml}</body>
</html>`;
}

function plainTextDocument(message: MailMessage) {
  const body = message.body.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n');

  return `<!doctype html>
<html>
  <head>${emailDocumentHead}</head>
  <body><main class="mail-plain-body">${body}</main></body>
</html>`;
}

function loadingDocument() {
  return `<!doctype html>
<html>
  <head>${emailDocumentHead}</head>
  <body><main class="mail-plain-body"><p>Loading original message...</p></main></body>
</html>`;
}

function messageDocument(message: MailMessage, bodyLoading: boolean) {
  if (bodyLoading || (message.source === 'gmail' && !message.bodyLoaded)) return loadingDocument();
  if (message.bodyHtml?.trim()) return wrapHtmlEmail(message.bodyHtml.trim());
  return plainTextDocument(message);
}

function gmailUrl(message: MailMessage) {
  if (message.source !== 'gmail' || !message.providerMessageId) return '';
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(message.providerMessageId)}`;
}

export const MessagePreview: React.FC<MessagePreviewProps> = ({
  message,
  bodyLoading = false,
  hasPrevious = false,
  hasNext = false,
  onClose,
  onNavigate,
  onResizeStart,
  onRunAction,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [frameHeight, setFrameHeight] = useState(520);
  const srcDoc = useMemo(() => message ? messageDocument(message, bodyLoading) : '', [bodyLoading, message]);

  useEffect(() => {
    setFrameHeight(520);
  }, [message?.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!message) {
    return (
      <aside className="mail-preview mail-preview--empty">
        <MailOpen size={32} />
        <strong>Select a message</strong>
        <span>The mail reader opens messages with sender details, actions, and a safe content frame.</span>
      </aside>
    );
  }

  const sourceUrl = gmailUrl(message);

  const runOverflowAction = (label: string, action?: HoverActionId) => {
    if (action) onRunAction(message.id, action);
    setNotice(label);
    setMenuOpen(false);
  };

  const resizeFrame = (event: React.SyntheticEvent<HTMLIFrameElement>) => {
    const documentElement = event.currentTarget.contentDocument?.documentElement;
    const body = event.currentTarget.contentDocument?.body;
    const contentHeight = Math.max(documentElement?.scrollHeight || 0, body?.scrollHeight || 0, 420);
    setFrameHeight(Math.min(contentHeight + 2, 2400));
  };

  return (
    <aside className="mail-preview mail-reader" aria-label="Message content">
      <button className="mail-reader-resizer" type="button" aria-label="Resize message reader" onPointerDown={onResizeStart} />
      <div className="mail-reader-toolbar">
        <div className="mail-reader-toolbar__group">
          <button className="mail-reader-icon-button" type="button" onClick={onClose} aria-label="Close message reader" title="Close reader">
            <ChevronRight size={18} />
            <ChevronRight size={18} />
          </button>
          <div className="mail-reader-toolbar__stepper" aria-label="Message navigation">
            <button className="mail-reader-icon-button" type="button" disabled={!hasPrevious} onClick={() => onNavigate?.('previous')} aria-label="Previous message" title="Previous message">
              <ChevronUp size={19} />
            </button>
            <button className="mail-reader-icon-button" type="button" disabled={!hasNext} onClick={() => onNavigate?.('next')} aria-label="Next message" title="Next message">
              <ChevronDown size={19} />
            </button>
          </div>
        </div>

        <div className="mail-reader-toolbar__group">
          <button className="mail-reader-icon-button" type="button" disabled={!sourceUrl} onClick={() => sourceUrl && globalThis.open(sourceUrl, '_blank', 'noopener,noreferrer')} aria-label="Open in Gmail" title="Open in Gmail">
            <ExternalLink size={19} />
          </button>
          <button className="mail-reader-icon-button" type="button" onClick={() => globalThis.print()} aria-label="Print message" title="Print message">
            <Printer size={19} />
          </button>
          <button className="mail-reader-icon-button" type="button" onClick={() => onRunAction(message.id, 'remind')} aria-label="Remind later" title="Remind later">
            <Clock3 size={19} />
          </button>
          <button className="mail-reader-icon-button" type="button" onClick={() => onRunAction(message.id, 'read')} aria-label="Mark read or unread" title="Mark read or unread">
            <BellDot size={19} />
          </button>
          <button className="mail-reader-icon-button" type="button" onClick={() => onRunAction(message.id, 'archive')} aria-label="Archive message" title="Archive message">
            <Archive size={19} />
          </button>
          <button className="mail-reader-icon-button mail-reader-icon-button--danger" type="button" onClick={() => onRunAction(message.id, 'trash')} aria-label="Trash message" title="Trash message">
            <Trash2 size={19} />
          </button>
          <div className="mail-reader-overflow">
            <button className="mail-reader-icon-button" type="button" onClick={() => setMenuOpen((current) => !current)} aria-label="More message actions" title="More actions">
              <MoreHorizontal size={20} />
            </button>
            {menuOpen ? (
              <div className="mail-reader-menu" role="menu" aria-label="More message actions">
                <button type="button" role="menuitem" onClick={() => runOverflowAction('Marked as spam locally', 'trash')}>
                  <ShieldAlert size={18} />
                  <span>Mark as spam</span>
                </button>
                <button type="button" role="menuitem" onClick={() => runOverflowAction('Phishing report noted locally', 'trash')}>
                  <ShieldAlert size={18} />
                  <span>Report phishing</span>
                </button>
                <hr />
                <button type="button" role="menuitem" className="is-danger" onClick={() => runOverflowAction(`Blocked ${message.fromEmail} locally`)}>
                  <UserX size={18} />
                  <span>Block {message.fromEmail}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mail-reader-scroll">
        <section className="mail-reader-head">
          <h2>{message.subject}</h2>
          <div className="mail-reader-head__meta">
            <div className="mail-reader-avatar">{message.fromName.slice(0, 1).toUpperCase()}</div>
            <div className="mail-reader-identity">
              <div><strong>{message.fromName}</strong><span>{message.fromEmail}</span></div>
              <div><span>To</span><strong>{message.to.join(', ') || 'Undisclosed recipients'}</strong></div>
              {message.cc?.length ? <div><span>CC</span><strong>{message.cc.join(', ')}</strong></div> : null}
            </div>
            <button className="mail-reader-icon-button" type="button" title="Expand details" aria-label="Expand message details">
              <ChevronDown size={16} />
            </button>
          </div>

          <div className="mail-reader-head__actions">
            <div className="mail-reader-reply-icons">
              <button className="mail-reader-icon-button" type="button" title="Reply" aria-label="Reply"><Reply size={19} /></button>
              <button className="mail-reader-icon-button" type="button" title="Reply all" aria-label="Reply all"><ReplyAll size={19} /></button>
              <button className="mail-reader-icon-button" type="button" title="Forward" aria-label="Forward"><Forward size={19} /></button>
            </div>
            <time>{formatMessageTime(message.receivedAt)}</time>
          </div>

          <div className="mail-reader-tags" aria-label="Message labels">
            <button type="button" onClick={() => onRunAction(message.id, 'star')} className={message.starred ? 'is-active' : ''}><Star size={14} /> Star</button>
            <span>{message.source === 'gmail' ? 'Gmail' : 'Local mock'}</span>
            <span>{message.category}</span>
            <span>{message.priority}</span>
            {message.labels.slice(0, 4).map((label) => <span key={label}>{label}</span>)}
            {message.hasAttachments ? <span>Attachments</span> : null}
          </div>

          {notice ? <div className="mail-reader-notice">{notice}</div> : null}
        </section>

        <section className="mail-reader-frame-wrap" aria-label="Email body">
          <iframe
            key={message.id}
            className="mail-message-frame"
            data-test="message-content-iframe"
            title={`Message body: ${message.subject}`}
            sandbox="allow-downloads allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            srcDoc={srcDoc}
            style={{ height: frameHeight }}
            onLoad={resizeFrame}
          />
        </section>

        <div className="mail-reader-bottom-actions">
          <button type="button"><Reply size={18} /> Reply</button>
          <button type="button"><ReplyAll size={18} /> Reply all</button>
          <button type="button"><Forward size={18} /> Forward</button>
        </div>
      </div>
    </aside>
  );
};