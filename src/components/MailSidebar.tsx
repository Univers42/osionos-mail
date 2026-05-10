import React, { useState } from 'react';
import {
  Archive,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Edit3,
  Inbox,
  Mail,
  MessageSquare,
  Plus,
  Settings,
  Tag,
  Trash2,
  TriangleAlert,
} from 'lucide-react';

import type { ConnectorState, MailViewId } from '../types';

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
  onViewChange: (view: MailViewId) => void;
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
  onViewChange,
  onCompose,
  onOpenConnector,
  onOpenSupport,
}) => {
  const views: SidebarItem[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={18} />, count: counts.inbox },
    { id: 'labels', label: 'Labels', icon: <Tag size={16} />, count: counts.labels, indent: 1 },
  ];
  const mail: SidebarItem[] = [
    { id: 'all-mail', label: 'All Mail', icon: <Mail size={18} />, count: counts['all-mail'] },
    { id: 'drafts', label: 'Drafts', icon: <Edit3 size={18} />, count: counts.drafts },
    { id: 'spam', label: 'Spam', icon: <TriangleAlert size={18} />, count: counts.spam },
    { id: 'trash', label: 'Trash', icon: <Trash2 size={18} />, count: counts.trash },
  ];
  const apps: SidebarItem[] = [
    { id: 'notion-calendar', label: 'Notion Calendar', icon: <CalendarDays size={18} /> },
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

  return (
    <aside className="mail-sidebar">
      <div className="mail-sidebar__brand">
        <button className="mail-sidebar__workspace" type="button" onClick={onOpenConnector}>
          <span className="mail-sidebar__mark">M</span>
          <span>
            <strong>osionos Mail</strong>
            <small>{connector.connected ? connector.account : 'localhost bridge'}</small>
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
        <SidebarSection title="Views category">{views.map(renderItem)}</SidebarSection>
        <SidebarSection title="Mail">{mail.map(renderItem)}</SidebarSection>
        <SidebarSection title="osionos apps">{apps.map(renderItem)}</SidebarSection>
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
          <span>{connector.connected ? 'Bridge connected' : 'Connect Gmail or Outlook'}</span>
        </button>
        <div className="mail-sidebar__resize" aria-hidden="true" />
      </div>
    </aside>
  );
};