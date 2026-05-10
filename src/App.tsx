import React, { useMemo, useState } from 'react';
import {
  Archive,
  BellDot,
  BookOpen,
  Bookmark,
  Calendar,
  ChevronRight,
  CircleDot,
  Database,
  Filter,
  Grid3X3,
  Inbox,
  List,
  Mail,
  Megaphone,
  Paperclip,
  Send,
  Star,
  Text,
  Trash2,
  User,
} from 'lucide-react';

import { CommandMenu } from './components/CommandMenu';
import { ComposerModal } from './components/ComposerModal';
import { ConnectorModal } from './components/ConnectorModal';
import { FilterBar } from './components/FilterBar';
import { MailList, type MailSection } from './components/MailList';
import { MailSidebar } from './components/MailSidebar';
import { MailToolbar } from './components/MailToolbar';
import { MessagePreview } from './components/MessagePreview';
import { DEFAULT_HOVER_ACTIONS, DEFAULT_VISIBLE_PROPERTIES, MAIL_PROPERTIES, MOCK_MESSAGES } from './data/mockMail';
import type {
  CommandItem,
  ConnectorState,
  FilterKey,
  GroupBy,
  HoverActionId,
  MailMessage,
  MailProperty,
  MailViewId,
} from './types';

type OpenMenu =
  | null
  | 'select'
  | 'view'
  | 'filter'
  | 'edit-view'
  | 'group'
  | 'properties'
  | 'database'
  | 'hover-actions'
  | 'categories'
  | 'labels';

const FILTER_OPTIONS: Array<{ id: FilterKey; label: string; icon: CommandItem['icon']; description?: string }> = [
  { id: 'from', label: 'From', icon: User },
  { id: 'has-attachments', label: 'Has attachments', icon: Paperclip },
  { id: 'date', label: 'Date', icon: Calendar },
  { id: 'calendar-events', label: 'Only show calendar events', icon: Calendar },
  { id: 'hide-social', label: 'Hide "Social" emails', icon: User },
  { id: 'hide-promotions', label: 'Hide "Promotions" emails', icon: Megaphone },
  { id: 'labels', label: 'Labels', icon: Bookmark },
  { id: 'categories', label: 'Categories', icon: Bookmark },
  { id: 'to', label: 'To', icon: User },
  { id: 'cc', label: 'CC', icon: User },
  { id: 'bcc', label: 'BCC', icon: User },
  { id: 'subject', label: 'Subject', icon: Text },
  { id: 'received-date', label: 'Received Date', icon: Calendar },
  { id: 'show-sent', label: 'Show sent', icon: Send },
  { id: 'show-archived', label: 'Show archived', icon: Archive },
];

const HOVER_ACTION_DETAILS: Record<HoverActionId, { label: string; description: string; icon: CommandItem['icon'] }> = {
  star: { label: 'Starred', description: 'Apply a specific label', icon: Star },
  archive: { label: 'Archive', description: 'Move to archive/unarchive', icon: Archive },
  trash: { label: 'Trash', description: 'Move to trash/untrash', icon: Trash2 },
  read: { label: 'Read/unread', description: 'Mark as read/unread', icon: BellDot },
  remind: { label: 'Remind', description: 'Hide from inbox until date', icon: Calendar },
};

const DEFAULT_CONNECTOR: ConnectorState = {
  provider: 'gmail',
  account: 'dev.pro.photo@gmail.com',
  endpoint: (import.meta.env.VITE_MAIL_BRIDGE_URL as string | undefined) || 'http://localhost:4100',
  connected: false,
  lastSync: null,
};

function toggleArrayValue<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function toggleSetValue<T>(values: Set<T>, value: T) {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function messageDomain(message: MailMessage) {
  return message.fromEmail.split('@')[1] ?? message.fromEmail;
}

function dateGroupTitle(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function sectionMessages(messages: MailMessage[], groupBy: GroupBy): MailSection[] {
  if (groupBy === 'None') return [{ title: 'Messages', messages }];

  const groups = new Map<string, MailMessage[]>();
  messages.forEach((message) => {
    const key = (() => {
      if (groupBy === 'Date') return dateGroupTitle(message.receivedAt);
      if (groupBy === 'Priority') return `${message.priority[0].toUpperCase()}${message.priority.slice(1)} priority`;
      if (groupBy === 'Labels') return message.labels[0] ?? 'No label';
      if (groupBy === 'Unread') return message.unread ? 'Unread' : 'Read';
      return messageDomain(message);
    })();
    groups.set(key, [...(groups.get(key) ?? []), message]);
  });

  return Array.from(groups.entries()).map(([title, groupedMessages]) => ({ title, messages: groupedMessages }));
}

function includesAny(values: string[], accepted: string[]) {
  if (!accepted.length) return true;
  return values.some((value) => accepted.includes(value));
}

function propertyIcon(property: MailProperty): CommandItem['icon'] {
  if (property === 'Date') return Calendar;
  if (property === 'Labels') return Bookmark;
  if (property === 'Starred') return Star;
  if (property === 'Unread') return BellDot;
  if (property === 'Email or Domain') return User;
  return Text;
}

export const App: React.FC = () => {
  const [messages, setMessages] = useState<MailMessage[]>(MOCK_MESSAGES);
  const [activeView, setActiveView] = useState<MailViewId>('inbox');
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeMessageId, setActiveMessageId] = useState<string | null>(MOCK_MESSAGES[0]?.id ?? null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [visibleProperties, setVisibleProperties] = useState<MailProperty[]>(DEFAULT_VISIBLE_PROPERTIES);
  const [groupBy, setGroupBy] = useState<GroupBy>('Date');
  const [hoverActions, setHoverActions] = useState<HoverActionId[]>(DEFAULT_HOVER_ACTIONS);
  const [connector, setConnector] = useState<ConnectorState>(DEFAULT_CONNECTOR);
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState('Local mock database ready');

  const categories = useMemo(
    () => Array.from(new Set(messages.map((message) => message.category))).sort((left, right) => left.localeCompare(right)),
    [messages],
  );
  const labels = useMemo(
    () => Array.from(new Set(messages.flatMap((message) => message.labels))).sort((left, right) => left.localeCompare(right)),
    [messages],
  );

  const counts = useMemo<Partial<Record<MailViewId, number>>>(() => ({
    inbox: messages.filter((message) => message.mailbox === 'inbox' && !message.archived).length,
    labels: messages.filter((message) => message.labels.length > 0).length,
    'all-mail': messages.filter((message) => message.mailbox !== 'trash' && message.mailbox !== 'spam').length,
    drafts: messages.filter((message) => message.mailbox === 'drafts').length,
    spam: messages.filter((message) => message.mailbox === 'spam').length,
    trash: messages.filter((message) => message.mailbox === 'trash').length,
  }), [messages]);

  const visibleMessages = useMemo(() => {
    return messages
      .filter((message) => {
        if (activeView === 'inbox') return message.mailbox === 'inbox' && (showArchived || !message.archived);
        if (activeView === 'labels') return message.labels.length > 0 && (showArchived || !message.archived);
        if (activeView === 'all-mail') return message.mailbox !== 'trash' && message.mailbox !== 'spam' && (showArchived || !message.archived);
        if (activeView === 'drafts') return message.mailbox === 'drafts';
        if (activeView === 'spam') return message.mailbox === 'spam';
        if (activeView === 'trash') return message.mailbox === 'trash';
        if (activeView === 'notion-calendar') return message.calendarEvent;
        return true;
      })
      .filter((message) => !unreadOnly || message.unread)
      .filter((message) => includesAny([message.category], selectedCategories))
      .filter((message) => includesAny(message.labels, selectedLabels))
      .filter((message) => !activeFilters.includes('has-attachments') || message.hasAttachments)
      .filter((message) => !activeFilters.includes('calendar-events') || message.calendarEvent)
      .filter((message) => !activeFilters.includes('hide-social') || message.category !== 'Social')
      .filter((message) => !activeFilters.includes('hide-promotions') || message.category !== 'Promotions')
      .filter((message) => !activeFilters.includes('show-sent') || message.sent)
      .filter((message) => !activeFilters.includes('show-archived') || message.archived)
      .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime());
  }, [activeFilters, activeView, messages, selectedCategories, selectedLabels, showArchived, unreadOnly]);

  const sections = useMemo(() => sectionMessages(visibleMessages, groupBy), [groupBy, visibleMessages]);
  const activeMessage = messages.find((message) => message.id === activeMessageId) ?? null;

  const runRefresh = () => {
    setIsSyncing(true);
    setStatus('Refreshing localhost bridge...');
    globalThis.setTimeout(() => {
      setConnector((current) => ({ ...current, connected: true, lastSync: new Date().toISOString() }));
      setStatus('Mailbox refreshed from localhost mock bridge');
      setIsSyncing(false);
    }, 450);
  };

  const runHoverAction = (id: string, action: HoverActionId) => {
    setMessages((current) => current.map((message) => {
      if (message.id !== id) return message;
      if (action === 'star') return { ...message, starred: !message.starred };
      if (action === 'archive') return { ...message, archived: !message.archived, mailbox: message.mailbox === 'trash' ? message.mailbox : 'all-mail' };
      if (action === 'trash') return { ...message, mailbox: message.mailbox === 'trash' ? 'inbox' : 'trash', archived: false };
      if (action === 'read') return { ...message, unread: !message.unread };
      return { ...message, remindedUntil: new Date(Date.now() + 86400000).toISOString(), archived: true };
    }));
    setStatus(`${HOVER_ACTION_DETAILS[action].label} action applied`);
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      const visibleIds = visibleMessages.map((message) => message.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => current.has(id));
      if (allSelected) return new Set([...current].filter((id) => !visibleIds.includes(id)));
      return new Set([...current, ...visibleIds]);
    });
  };

  const markSelectedReadState = (unread: boolean) => {
    setMessages((current) => current.map((message) => selectedIds.has(message.id) ? { ...message, unread } : message));
    setStatus(unread ? 'Selected messages marked unread' : 'Selected messages marked read');
  };

  const autoLabelMessages = () => {
    setMessages((current) => current.map((message) => {
      const nextLabels = new Set(message.labels);
      if (message.fromEmail.includes('github')) nextLabels.add('Builds');
      if (message.calendarEvent) nextLabels.add('Calendar');
      if (message.category === 'Promotions') nextLabels.add('Promotions');
      if (message.important) nextLabels.add('Needs reply');
      return { ...message, labels: Array.from(nextLabels) };
    }));
    setStatus('Auto labels applied to matching messages');
  };

  const toggleProperty = (property: MailProperty) => {
    setVisibleProperties((current) => toggleArrayValue(current, property));
  };

  const moveHoverActionUp = (action: HoverActionId) => {
    setHoverActions((current) => {
      const index = current.indexOf(action);
      if (index <= 0) return current;
      const next = [...current];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const removeHoverAction = (action: HoverActionId) => {
    setHoverActions((current) => current.filter((item) => item !== action));
  };

  const addHoverAction = (action: HoverActionId) => {
    setHoverActions((current) => [...current, action]);
  };

  const viewItems: CommandItem[] = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, active: activeView === 'inbox', onClick: () => { setActiveView('inbox'); setOpenMenu(null); } },
    { id: 'labels', label: 'Labels', icon: Bookmark, active: activeView === 'labels', onClick: () => { setActiveView('labels'); setOpenMenu(null); } },
    { id: 'all-mail', label: 'All Mail', icon: Mail, active: activeView === 'all-mail', onClick: () => { setActiveView('all-mail'); setOpenMenu(null); } },
    { id: 'notion-calendar', label: 'Notion Calendar', icon: Calendar, active: activeView === 'notion-calendar', onClick: () => { setActiveView('notion-calendar'); setOpenMenu(null); } },
  ];

  const selectItems: CommandItem[] = [
    { id: 'select-all', label: 'Select all visible', icon: Grid3X3, onClick: () => { toggleSelectAll(); setOpenMenu(null); } },
    { id: 'clear', label: 'Clear selection', icon: CircleDot, onClick: () => { setSelectedIds(new Set()); setOpenMenu(null); } },
    { id: 'read', label: 'Mark selected read', icon: BellDot, onClick: () => { markSelectedReadState(false); setOpenMenu(null); } },
    { id: 'unread', label: 'Mark selected unread', icon: BellDot, onClick: () => { markSelectedReadState(true); setOpenMenu(null); } },
  ];

  const filterItems: CommandItem[] = FILTER_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    icon: option.icon,
    active: activeFilters.includes(option.id),
    onClick: () => {
      setActiveFilters((current) => toggleArrayValue(current, option.id));
      if (option.id === 'show-archived') setShowArchived((current) => !current);
    },
  }));

  const editViewItems: CommandItem[] = [
    { id: 'group', label: 'Group', icon: Grid3X3, meta: groupBy, onClick: () => setOpenMenu('group') },
    { id: 'filter', label: 'Filter', icon: Filter, onClick: () => setOpenMenu('filter') },
    { id: 'properties', label: 'Properties', icon: List, meta: `${visibleProperties.length} properties`, onClick: () => setOpenMenu('properties') },
    { id: 'database', label: 'Database', icon: Database, onClick: () => setOpenMenu('database') },
    {
      id: 'hover-actions',
      label: 'Customize hover actions',
      description: 'Apply label, archive, trash, read/unread, remind',
      icon: BookOpen,
      onClick: () => setOpenMenu('hover-actions'),
    },
  ];

  const groupItems: CommandItem[] = (['Date', 'Priority', 'Labels', 'Unread', 'Email or Domain', 'None'] as GroupBy[]).map((value) => ({
    id: value,
    label: value,
    icon: Grid3X3,
    active: groupBy === value,
    onClick: () => { setGroupBy(value); setOpenMenu('edit-view'); },
  }));

  const propertyItems: CommandItem[] = MAIL_PROPERTIES.map((property) => ({
    id: property,
    label: property,
    icon: propertyIcon(property),
    active: visibleProperties.includes(property),
    onClick: () => toggleProperty(property),
  }));

  const categoryItems: CommandItem[] = categories.map((category) => ({
    id: category,
    label: category,
    icon: Bookmark,
    active: selectedCategories.includes(category),
    onClick: () => setSelectedCategories((current) => toggleArrayValue(current, category)),
  }));

  const labelItems: CommandItem[] = labels.map((label) => ({
    id: label,
    label,
    icon: Bookmark,
    active: selectedLabels.includes(label),
    onClick: () => setSelectedLabels((current) => toggleArrayValue(current, label)),
  }));

  const renderMenu = () => {
    if (openMenu === 'select') return <CommandMenu title="Selection" items={selectItems} />;
    if (openMenu === 'view') return <CommandMenu title="Views" items={viewItems} />;
    if (openMenu === 'filter') return <CommandMenu title="Filter" searchPlaceholder="Filter by" items={filterItems} />;
    if (openMenu === 'edit-view') return <CommandMenu title="Edit view" items={editViewItems} />;
    if (openMenu === 'group') return <CommandMenu title="Group by" items={groupItems} onBack={() => setOpenMenu('edit-view')} />;
    if (openMenu === 'properties') return <CommandMenu title="Properties" items={propertyItems} onBack={() => setOpenMenu('edit-view')} />;
    if (openMenu === 'categories') return <CommandMenu title="Categories" searchPlaceholder="Filter categories" items={categoryItems} />;
    if (openMenu === 'labels') return <CommandMenu title="Labels" searchPlaceholder="Filter labels" items={labelItems} />;
    if (openMenu === 'database') {
      return (
        <CommandMenu
          title="Database"
          onBack={() => setOpenMenu('edit-view')}
          items={MAIL_PROPERTIES.map((property) => ({
            id: property,
            label: property,
            description: 'Mail database property',
            icon: Database,
            active: visibleProperties.includes(property),
            onClick: () => toggleProperty(property),
          }))}
          footer={(
            <button className="mail-primary-button mail-menu-wide-button" type="button" onClick={runRefresh}>
              Sync database from bridge
            </button>
          )}
        />
      );
    }
    if (openMenu === 'hover-actions') {
      const hiddenActions = (Object.keys(HOVER_ACTION_DETAILS) as HoverActionId[]).filter((action) => !hoverActions.includes(action));
      return (
        <div className="mail-menu mail-hover-panel" role="menu">
          <div className="mail-menu__header">
            <button className="mail-icon-button" type="button" onClick={() => setOpenMenu('edit-view')} aria-label="Back">
              <ChevronRight size={18} className="rotate-180" />
            </button>
            <span>Hover actions</span>
          </div>
          <div className="mail-hover-preview">
            <span><CircleDot size={20} /> Notion</span>
            <strong>Welcome to mail!</strong>
            <div>
              {hoverActions.map((action) => {
                const Icon = HOVER_ACTION_DETAILS[action].icon;
                return <button type="button" key={action} title={HOVER_ACTION_DETAILS[action].label}><Icon size={18} /></button>;
              })}
            </div>
          </div>
          <span className="mail-menu__section-label">Visible actions</span>
          <div className="mail-hover-list">
            {hoverActions.map((action, index) => {
              const details = HOVER_ACTION_DETAILS[action];
              const Icon = details.icon;
              return (
                <div className="mail-hover-action" key={action}>
                  <span className="mail-hover-action__drag">::</span>
                  <Icon size={18} />
                  <span><strong>{details.label}</strong><small>{details.description}</small></span>
                  <button type="button" disabled={index === 0} onClick={() => moveHoverActionUp(action)}>Up</button>
                  <button type="button" onClick={() => removeHoverAction(action)}>Remove</button>
                </div>
              );
            })}
          </div>
          {hiddenActions.length ? (
            <div className="mail-menu__footer">
              {hiddenActions.map((action) => (
                <button className="mail-secondary-button" type="button" key={action} onClick={() => addHoverAction(action)}>
                  Add {HOVER_ACTION_DETAILS[action].label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="mail-app" data-theme="dark">
      <MailSidebar
        activeView={activeView}
        counts={counts}
        connector={connector}
        onViewChange={(view) => {
          setActiveView(view);
          if (view === 'settings') setConnectorOpen(true);
          if (view === 'support') setSupportOpen(true);
        }}
        onCompose={() => setComposerOpen(true)}
        onOpenConnector={() => setConnectorOpen(true)}
        onOpenSupport={() => setSupportOpen(true)}
      />

      <main className="mail-main">
        <div className="mail-main__bar">
          <MailToolbar
            activeView={activeView}
            selectedCount={selectedIds.size}
            visibleCount={visibleMessages.length}
            isSyncing={isSyncing}
            onToggleSelectAll={toggleSelectAll}
            onOpenSelectMenu={() => setOpenMenu(openMenu === 'select' ? null : 'select')}
            onOpenViewMenu={() => setOpenMenu(openMenu === 'view' ? null : 'view')}
            onAutoLabel={autoLabelMessages}
            onOpenFilterMenu={() => setOpenMenu(openMenu === 'filter' ? null : 'filter')}
            onOpenEditViewMenu={() => setOpenMenu(openMenu === 'edit-view' ? null : 'edit-view')}
            onRefresh={runRefresh}
          />
          <FilterBar
            selectedCategories={selectedCategories}
            selectedLabels={selectedLabels}
            unreadOnly={unreadOnly}
            showArchived={showArchived}
            onOpenCategories={() => setOpenMenu(openMenu === 'categories' ? null : 'categories')}
            onOpenLabels={() => setOpenMenu(openMenu === 'labels' ? null : 'labels')}
            onToggleUnread={() => setUnreadOnly((current) => !current)}
            onToggleArchived={() => setShowArchived((current) => !current)}
            onOpenFilterMenu={() => setOpenMenu(openMenu === 'filter' ? null : 'filter')}
          />
          {openMenu ? <div className="mail-menu-layer">{renderMenu()}</div> : null}
        </div>

        <div className="mail-workspace">
          <section className="mail-page">
            <MailList
              sections={sections}
              selectedIds={selectedIds}
              activeMessageId={activeMessageId}
              visibleProperties={visibleProperties}
              hoverActions={hoverActions}
              groupBy={groupBy}
              onToggleMessage={(id) => setSelectedIds((current) => toggleSetValue(current, id))}
              onOpenMessage={(id) => {
                setActiveMessageId(id);
                setMessages((current) => current.map((message) => message.id === id ? { ...message, unread: false } : message));
              }}
              onRunAction={runHoverAction}
            />
          </section>
          <MessagePreview message={activeMessage} onClose={() => setActiveMessageId(null)} onRunAction={runHoverAction} />
        </div>

        <footer className="mail-statusbar">
          <span>{status}</span>
          <span>{connector.lastSync ? `Last sync ${new Date(connector.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet'}</span>
        </footer>
      </main>

      {connectorOpen ? (
        <ConnectorModal
          connector={connector}
          onChange={setConnector}
          onClose={() => setConnectorOpen(false)}
          onSync={runRefresh}
        />
      ) : null}
      {composerOpen ? <ComposerModal onClose={() => setComposerOpen(false)} onCreateDraft={(draft) => setMessages((current) => [draft, ...current])} /> : null}
      {supportOpen ? (
        <div className="mail-modal-backdrop">
          <section className="mail-modal" aria-label="Support">
            <header className="mail-modal__header">
              <div><span className="mail-modal__eyebrow">Support</span><h2>Feedback channel</h2></div>
            </header>
            <p className="mail-support-copy">Share connector issues, view ideas, and mailbox bridge notes here. This local panel keeps the workflow inside the app while the backend is still mocked.</p>
            <footer className="mail-modal__footer"><button className="mail-primary-button" type="button" onClick={() => setSupportOpen(false)}>Done</button></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
};