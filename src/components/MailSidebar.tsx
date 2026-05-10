import React, { useState } from 'react';
import {
  Archive,
  ChevronDown,
  CircleHelp,
  Clock3,
  Edit3,
  Forward,
  Inbox,
  Mail,
  MessageSquare,
  Plus,
  Send,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Star,
  Tag,
  Trash2,
  TriangleAlert,
} from 'lucide-react';

import type { ConnectorState, MailViewId, SidebarLabel } from '../types';

interface SidebarItem {
  id: MailViewId;
  label: string;
  icon: React.ReactNode;
  count?: number;
  indent?: number;
}

interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

interface MailSidebarProps {
  activeView: MailViewId;
  counts: Partial<Record<MailViewId, number>>;
  connector: ConnectorState;
  labels: SidebarLabel[];
  activeLabel: string | null;
  onViewChange: (view: MailViewId) => void;
  onLabelChange: (label: string) => void;
  onCompose: () => void;
  onOpenConnector: () => void;
  onOpenSupport: () => void;
}

const SidebarSection: React.FC<SidebarSectionProps> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mail-sidebar-section">
      <button className="mail-sidebar-section__header" type="button" onClick={() => setOpen((value) => !value)}>
        <span>{title}</span>
        <ChevronDown size={12} className={open ? '' : 'is-collapsed'} />
      </button>
      {open ? <div className="mail-sidebar-section__body">{children}</div> : null}
    </section>
  );
};

export const MailSidebar: React.FC<MailSidebarProps> = ({
  activeView,
  counts,
  connector,
  labels,
  activeLabel,
  onViewChange,
  onLabelChange,
  onCompose,
  onOpenConnector,
  onOpenSupport,
}) => {
  const primary: SidebarItem[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={18} />, count: counts.inbox },
    { id: 'starred', label: 'Starred', icon: <Star size={18} />, count: counts.starred },
    { id: 'snoozed', label: 'Snoozed', icon: <Clock3 size={18} />, count: counts.snoozed },
    { id: 'sent', label: 'Sent', icon: <Send size={18} />, count: counts.sent },
    { id: 'drafts', label: 'Drafts', icon: <Edit3 size={18} />, count: counts.drafts },
  ];
  const categories: SidebarItem[] = [
    { id: 'purchases', label: 'Purchases', icon: <ShoppingBag size={18} />, count: counts.purchases },
  ];
  const more: SidebarItem[] = [
    { id: 'important', label: 'Important', icon: <ShieldAlert size={18} />, count: counts.important },
    { id: 'scheduled', label: 'Scheduled', icon: <Forward size={18} />, count: counts.scheduled },
    { id: 'all-mail', label: 'All Mail', icon: <Mail size={18} />, count: counts['all-mail'] },
    { id: 'spam', label: 'Spam', icon: <TriangleAlert size={18} />, count: counts.spam },
    { id: 'trash', label: 'Trash', icon: <Trash2 size={18} />, count: counts.trash },
  ];

  const renderItem = (item: SidebarItem) => (
    <button
      key={item.id}
      className={["mail-sidebar-row", activeView === item.id ? 'mail-sidebar-row--active' : ''].join(' ')}
      type="button"
      style={{ paddingLeft: 10 + (item.indent ?? 0) * 14 }}
      onClick={() => onViewChange(item.id)}
    >
      <span className="mail-sidebar-row__icon">{item.icon}</span>
      <span className="mail-sidebar-row__label">{item.label}</span>
      {item.count ? <span className="mail-sidebar-row__count">{item.count}</span> : null}
    </button>
  );

  const renderLabel = (label: SidebarLabel) => (
    <button
      key={label.id}
      className={["mail-sidebar-row", activeView === 'labels' && activeLabel === label.label ? 'mail-sidebar-row--active' : ''].join(' ')}
      type="button"
      style={{ paddingLeft: 24 }}
      onClick={() => onLabelChange(label.label)}
    >
      <span className="mail-sidebar-row__icon"><Tag size={16} /></span>
      <span className="mail-sidebar-row__label">{label.label}</span>
      {label.count ? <span className="mail-sidebar-row__count">{label.count}</span> : null}
    </button>
  );

  return (
    <aside className="mail-sidebar">
      <div className="mail-sidebar__brand">
        <button className="mail-sidebar__workspace" type="button" onClick={onOpenConnector}>
          <span className="mail-sidebar__mark">M</span>
          <span>
            <strong>osionos Mail</strong>
            <small>{connector.connected ? connector.account : 'Gmail localhost bridge'}</small>
          </span>
        </button>
      </div>

      <div className="mail-sidebar__actions">
        <button className="mail-compose-button" type="button" onClick={onCompose}>
          <Plus size={16} />
          <span>Compose</span>
        </button>
      </div>

      <nav className="mail-sidebar__nav" aria-label="Mail navigation">
        <SidebarSection title="Gmail">{primary.map(renderItem)}</SidebarSection>
        <SidebarSection title="Categories">{categories.map(renderItem)}</SidebarSection>
        <SidebarSection title="More">{more.map(renderItem)}</SidebarSection>
        <SidebarSection title="Labels">
          {labels.length ? labels.map(renderLabel) : (
            <button className="mail-sidebar-row" type="button" onClick={() => onViewChange('labels')}>
              <span className="mail-sidebar-row__icon"><Tag size={16} /></span>
              <span className="mail-sidebar-row__label">No Gmail labels yet</span>
            </button>
          )}
          <button className="mail-sidebar-row mail-sidebar-row--muted" type="button" onClick={() => onViewChange('labels')}>
            <span className="mail-sidebar-row__icon"><Archive size={16} /></span>
            <span className="mail-sidebar-row__label">Manage labels</span>
          </button>
        </SidebarSection>
      </nav>

      <div className="mail-sidebar__footer">
        <button className="mail-sidebar-row" type="button" onClick={() => onViewChange('settings')}>
          <span className="mail-sidebar-row__icon"><Settings size={18} /></span>
          <span className="mail-sidebar-row__label">Settings</span>
        </button>
        <button className="mail-sidebar-row" type="button" onClick={onOpenSupport}>
          <span className="mail-sidebar-row__icon"><CircleHelp size={18} /></span>
          <span className="mail-sidebar-row__label">Support & feedback</span>
        </button>
        <button className="mail-bridge-status" type="button" onClick={onOpenConnector}>
          <MessageSquare size={15} />
          <span>{connector.connected ? 'Gmail connected' : 'Connect Gmail locally'}</span>
        </button>
        <div className="mail-sidebar__resize" aria-hidden="true" />
      </div>
    </aside>
  );
};