import type { LucideIcon } from 'lucide-react';

export type MailProvider = 'gmail' | 'outlook' | 'imap';

export type MailViewId =
  | 'inbox'
  | 'starred'
  | 'snoozed'
  | 'sent'
  | 'labels'
  | 'all-mail'
  | 'drafts'
  | 'important'
  | 'scheduled'
  | 'purchases'
  | 'spam'
  | 'trash'
  | 'settings'
  | 'support';

export type Mailbox = 'inbox' | 'all-mail' | 'drafts' | 'sent' | 'snoozed' | 'scheduled' | 'spam' | 'trash';

export type MailPriority = 'high' | 'normal' | 'low';

export type MailCategory = 'Primary' | 'Updates' | 'Social' | 'Promotions' | 'Forums' | 'Purchases' | 'Calendar';

export type MailProperty =
  | 'Date'
  | 'Starred'
  | 'Important'
  | 'Email or Domain'
  | 'Priority'
  | 'Labels'
  | 'Unread';

export type GroupBy = 'Date' | 'Priority' | 'Labels' | 'Unread' | 'Email or Domain' | 'None';

export type FilterKey =
  | 'from'
  | 'has-attachments'
  | 'date'
  | 'hide-social'
  | 'hide-promotions'
  | 'labels'
  | 'categories'
  | 'to'
  | 'cc'
  | 'bcc'
  | 'subject'
  | 'received-date'
  | 'show-sent'
  | 'show-archived';

export type HoverActionId = 'star' | 'archive' | 'trash' | 'read' | 'remind';

export interface MailMessage {
  id: string;
  providerMessageId?: string;
  threadId?: string;
  source?: MailProvider | 'mock';
  fromName: string;
  fromEmail: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string;
  mailbox: Mailbox;
  labels: string[];
  category: MailCategory;
  unread: boolean;
  archived: boolean;
  starred: boolean;
  important: boolean;
  priority: MailPriority;
  hasAttachments: boolean;
  calendarEvent: boolean;
  sent: boolean;
  rawLabelIds?: string[];
  bodyHtml?: string;
  bodyLoaded?: boolean;
  remindedUntil?: string;
}

export interface ConnectorState {
  provider: MailProvider;
  account: string;
  endpoint: string;
  connected: boolean;
  bridgeAvailable?: boolean;
  message?: string;
  lastSync: string | null;
}

export interface SidebarLabel {
  id: string;
  label: string;
  count: number;
}

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  meta?: string;
  icon: LucideIcon;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}