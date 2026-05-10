import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BellDot,
  BookOpen,
  Bookmark,
  Calendar,
  ChevronRight,
  Clock3,
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
  ShieldAlert,
  ShoppingBag,
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
import {
  applyBridgeAction,
  bridgeErrorStatus,
  bridgeSessionToConnector,
  disconnectBridge,
  loadBridgeMessage,
  loadBridgeSession,
  openBridgeAuth,
  syncBridgeMessages,
} from './lib/mailBridge';
import { clearMailboxCache, loadLatestMailboxCache, loadMailboxCache, saveMailboxCache } from './lib/mailCache';
import type {
  CommandItem,
  ConnectorState,
  FilterKey,
  GroupBy,
  HoverActionId,
  MailMessage,
  MailProperty,
  MailViewId,
  SidebarLabel,
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

function positiveEnvInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const DEFAULT_SYNC_LIMIT = positiveEnvInt(import.meta.env.VITE_GMAIL_SYNC_LIMIT, 2000);
const SYNC_PAGE_SIZE = positiveEnvInt(import.meta.env.VITE_GMAIL_SYNC_PAGE_SIZE, 100);
const INITIAL_MAIL_CACHE = loadLatestMailboxCache();

const DEFAULT_CONNECTOR: ConnectorState = {
  provider: 'gmail',
  account: 'Not connected',
  endpoint: (import.meta.env.VITE_MAIL_BRIDGE_URL as string | undefined) || 'http://localhost:4100',
  connected: false,
  bridgeAvailable: false,
  message: 'Gmail bridge not checked yet',
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

function nextActiveMessageId(current: string | null, messages: MailMessage[]) {
  if (current && messages.some((message) => message.id === current)) return current;
  return messages[0]?.id ?? null;
}

function hasGmailMessages(messages: MailMessage[]) {
  return messages.some((message) => message.source === 'gmail');
}

function mergeMailMessages(current: MailMessage[], incoming: MailMessage[]) {
  const merged = new Map<string, MailMessage>();
  for (const message of current) merged.set(message.id, message);
  for (const message of incoming) merged.set(message.id, { ...merged.get(message.id), ...message });
  return Array.from(merged.values()).sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime());
}

function replaceMailMessage(current: MailMessage[], replacement: MailMessage) {
  return current.map((message) => message.id === replacement.id ? { ...message, ...replacement } : message);
}

function removeSetValue<T>(current: Set<T>, value: T) {
  const next = new Set(current);
  next.delete(value);
  return next;
}

function clampReaderWidth(value: number) {
  const viewportLimit = Math.max(360, globalThis.innerWidth - 420);
  return Math.min(Math.max(value, 360), Math.min(860, viewportLimit));
}

function estimatedTotalText(estimate: number, actualCount: number) {
  return estimate > actualCount ? ` of about ${estimate.toLocaleString()}` : '';
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

function isPurchaseMessage(message: MailMessage) {
  return message.category === 'Purchases' || message.labels.some((label) => /purchase|achat/i.test(label));
}

function messageMatchesView(message: MailMessage, activeView: MailViewId, showArchived: boolean, activeLabel: string | null) {
  switch (activeView) {
    case 'inbox': return message.mailbox === 'inbox' && (showArchived || !message.archived);
    case 'starred': return message.starred;
    case 'snoozed': return message.mailbox === 'snoozed' || Boolean(message.remindedUntil);
    case 'sent': return message.mailbox === 'sent' || message.sent;
    case 'labels': return activeLabel ? message.labels.includes(activeLabel) : message.labels.length > 0;
    case 'all-mail': return message.mailbox !== 'trash' && message.mailbox !== 'spam' && (showArchived || !message.archived);
    case 'drafts': return message.mailbox === 'drafts';
    case 'important': return message.important;
    case 'scheduled': return message.mailbox === 'scheduled';
    case 'purchases': return isPurchaseMessage(message);
    case 'spam': return message.mailbox === 'spam';
    case 'trash': return message.mailbox === 'trash';
    default: return true;
  }
}

export const App: React.FC = () => {
  const [messages, setMessages] = useState<MailMessage[]>(() => INITIAL_MAIL_CACHE?.messages.length ? INITIAL_MAIL_CACHE.messages : MOCK_MESSAGES);
  const [activeView, setActiveView] = useState<MailViewId>('inbox');
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeMessageId, setActiveMessageId] = useState<string | null>(() => INITIAL_MAIL_CACHE?.activeMessageId ?? INITIAL_MAIL_CACHE?.messages[0]?.id ?? MOCK_MESSAGES[0]?.id ?? null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
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
  const [hasAutoSynced, setHasAutoSynced] = useState(false);
  const [syncCursor, setSyncCursor] = useState(INITIAL_MAIL_CACHE?.nextPageToken ?? '');
  const [syncHasMore, setSyncHasMore] = useState(Boolean(INITIAL_MAIL_CACHE?.hasMore));
  const [syncEstimate, setSyncEstimate] = useState(INITIAL_MAIL_CACHE?.resultSizeEstimate ?? 0);
  const [loadingBodyIds, setLoadingBodyIds] = useState<Set<string>>(new Set());
  const [readerWidth, setReaderWidth] = useState(520);
  const [status, setStatus] = useState(() => INITIAL_MAIL_CACHE?.messages.length
    ? `Loaded ${INITIAL_MAIL_CACHE.messages.length.toLocaleString()} cached Gmail messages; refresh continues from the saved cursor.`
    : 'Gmail bridge ready; mock inbox loaded until you sync localhost');

  useEffect(() => {
    let cancelled = false;
    loadBridgeSession(connector.endpoint)
      .then((session) => {
        if (cancelled) return;
        setConnector((current) => bridgeSessionToConnector(connector.endpoint, current, session));
        if (session.connected) {
          const cached = loadMailboxCache(connector.endpoint, session.account);
          if (cached?.messages.length) {
            setMessages(cached.messages);
            setActiveMessageId((current) => nextActiveMessageId(current ?? cached.activeMessageId, cached.messages));
            setSyncCursor(cached.nextPageToken);
            setSyncHasMore(cached.hasMore);
            setSyncEstimate(cached.resultSizeEstimate);
            setHasAutoSynced(true);
            setStatus(`Loaded ${cached.messages.length.toLocaleString()} cached Gmail messages for ${session.account}; refresh continues from the saved cursor.`);
            return;
          }
        }
        setStatus(session.connected ? `Gmail bridge connected as ${session.account}` : session.message || 'Gmail bridge is reachable');
      })
      .catch((error) => {
        if (cancelled) return;
        setConnector((current) => ({ ...current, bridgeAvailable: false, connected: false, message: bridgeErrorStatus(error) }));
        setStatus(`${bridgeErrorStatus(error)}. Using mock messages until the bridge starts.`);
      });
    return () => {
      cancelled = true;
    };
  }, [connector.endpoint]);

  const categories = useMemo(
    () => Array.from(new Set(messages.map((message) => message.category))).sort((left, right) => left.localeCompare(right)),
    [messages],
  );
  const labels = useMemo(
    () => Array.from(new Set(messages.flatMap((message) => message.labels))).sort((left, right) => left.localeCompare(right)),
    [messages],
  );

  const sidebarLabels = useMemo<SidebarLabel[]>(() => labels.map((label) => ({
    id: label,
    label,
    count: messages.filter((message) => message.labels.includes(label)).length,
  })).filter((label) => label.count > 0).slice(0, 10), [labels, messages]);

  const counts = useMemo<Partial<Record<MailViewId, number>>>(() => ({
    inbox: messages.filter((message) => message.mailbox === 'inbox' && !message.archived).length,
    starred: messages.filter((message) => message.starred).length,
    snoozed: messages.filter((message) => message.mailbox === 'snoozed' || message.remindedUntil).length,
    sent: messages.filter((message) => message.mailbox === 'sent' || message.sent).length,
    labels: messages.filter((message) => message.labels.length > 0).length,
    'all-mail': messages.filter((message) => message.mailbox !== 'trash' && message.mailbox !== 'spam').length,
    drafts: messages.filter((message) => message.mailbox === 'drafts').length,
    important: messages.filter((message) => message.important).length,
    scheduled: messages.filter((message) => message.mailbox === 'scheduled').length,
    purchases: messages.filter(isPurchaseMessage).length,
    spam: messages.filter((message) => message.mailbox === 'spam').length,
    trash: messages.filter((message) => message.mailbox === 'trash').length,
  }), [messages]);

  const visibleMessages = useMemo(() => {
    return messages
      .filter((message) => messageMatchesView(message, activeView, showArchived, activeLabel))
      .filter((message) => !unreadOnly || message.unread)
      .filter((message) => includesAny([message.category], selectedCategories))
      .filter((message) => includesAny(message.labels, selectedLabels))
      .filter((message) => !activeFilters.includes('has-attachments') || message.hasAttachments)
      .filter((message) => !activeFilters.includes('hide-social') || message.category !== 'Social')
      .filter((message) => !activeFilters.includes('hide-promotions') || message.category !== 'Promotions')
      .filter((message) => !activeFilters.includes('show-sent') || message.sent)
      .filter((message) => !activeFilters.includes('show-archived') || message.archived)
      .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime());
  }, [activeFilters, activeLabel, activeView, messages, selectedCategories, selectedLabels, showArchived, unreadOnly]);

  const sections = useMemo(() => sectionMessages(visibleMessages, groupBy), [groupBy, visibleMessages]);
  const activeMessage = messages.find((message) => message.id === activeMessageId) ?? null;
  const activeVisibleIndex = useMemo(
    () => visibleMessages.findIndex((message) => message.id === activeMessageId),
    [activeMessageId, visibleMessages],
  );

  const navigateMessage = useCallback((direction: 'previous' | 'next') => {
    if (activeVisibleIndex < 0) return;
    const nextIndex = direction === 'previous' ? activeVisibleIndex - 1 : activeVisibleIndex + 1;
    const nextMessage = visibleMessages[nextIndex];
    if (!nextMessage) return;
    setActiveMessageId(nextMessage.id);
    setMessages((current) => current.map((message) => message.id === nextMessage.id ? { ...message, unread: false } : message));
  }, [activeVisibleIndex, visibleMessages]);

  const runRefresh = useCallback(async () => {
    setIsSyncing(true);
    setStatus('Checking Gmail bridge before fetching the next mailbox page...');
    try {
      const session = await loadBridgeSession(connector.endpoint);
      setConnector((current) => bridgeSessionToConnector(connector.endpoint, current, session));
      if (!session.connected) {
        setConnectorOpen(true);
        setStatus('Gmail is configured but not authorized yet. Connect Gmail first, then refresh to replace the mock inbox.');
        return;
      }

      const account = session.account || connector.account;
      const baseMessages = hasGmailMessages(messages) ? messages : [];
      if (baseMessages.length >= DEFAULT_SYNC_LIMIT) {
        setStatus(`Cached Gmail mailbox already reached the ${DEFAULT_SYNC_LIMIT.toLocaleString()} message local limit.`);
        return;
      }
      if (baseMessages.length > 0 && !syncCursor && !syncHasMore) {
        setStatus(`Cached Gmail mailbox has ${baseMessages.length.toLocaleString()} messages and no saved next page.`);
        return;
      }

      const remaining = DEFAULT_SYNC_LIMIT - baseMessages.length;
      const pageLimit = Math.min(SYNC_PAGE_SIZE, remaining);
      setStatus(syncCursor
        ? `Fetching the next ${pageLimit.toLocaleString()} Gmail headers from the saved cursor...`
        : `Fetching the latest ${pageLimit.toLocaleString()} Gmail headers...`);

      const synced = await syncBridgeMessages(connector.endpoint, pageLimit, syncCursor, false);
      const mergedMessages = mergeMailMessages(baseMessages, synced.messages);
      const nextCursor = synced.nextPageToken || '';
      const nextHasMore = Boolean(synced.nextPageToken);
      const nextEstimate = Math.max(syncEstimate, synced.resultSizeEstimate || 0);
      const activeId = nextActiveMessageId(activeMessageId, mergedMessages);

      setMessages(mergedMessages);
      setSelectedIds(new Set());
      setActiveMessageId(activeId);
      setSyncCursor(nextCursor);
      setSyncHasMore(nextHasMore);
      setSyncEstimate(nextEstimate);
      setConnector((current) => ({
        ...current,
        provider: 'gmail',
        account,
        connected: true,
        bridgeAvailable: true,
        message: 'Gmail headers loaded through localhost bridge',
        lastSync: synced.syncedAt,
      }));
      saveMailboxCache({
        endpoint: connector.endpoint,
        account,
        syncedAt: synced.syncedAt,
        nextPageToken: nextCursor,
        hasMore: nextHasMore,
        resultSizeEstimate: nextEstimate,
        activeMessageId: activeId,
        messages: mergedMessages,
      });

      const estimate = estimatedTotalText(nextEstimate, mergedMessages.length);
      const more = nextHasMore ? ' Refresh again to continue from this point.' : '';
      setStatus(`Loaded ${synced.messages.length.toLocaleString()} Gmail headers; cache now has ${mergedMessages.length.toLocaleString()}${estimate} messages from ${account}.${more}`);
    } catch (error) {
      setConnector((current) => ({ ...current, bridgeAvailable: false, connected: false, message: bridgeErrorStatus(error) }));
      setStatus(`${bridgeErrorStatus(error)}. Mock inbox is still available.`);
    } finally {
      setIsSyncing(false);
    }
  }, [activeMessageId, connector.account, connector.endpoint, messages, syncCursor, syncEstimate, syncHasMore]);

  useEffect(() => {
    if (!connector.connected || hasAutoSynced || isSyncing) return;
    setHasAutoSynced(true);
    runRefresh();
  }, [connector.connected, hasAutoSynced, isSyncing, runRefresh]);

  useEffect(() => {
    if (!activeMessage?.providerMessageId || activeMessage.source !== 'gmail' || activeMessage.bodyLoaded) return;
    let cancelled = false;
    setLoadingBodyIds((current) => new Set(current).add(activeMessage.id));
    setStatus(`Loading original Gmail content for "${activeMessage.subject}"...`);
    loadBridgeMessage(connector.endpoint, activeMessage.providerMessageId)
      .then((payload) => {
        if (cancelled) return;
        setMessages((current) => replaceMailMessage(current, payload.message));
        setStatus(`Loaded original Gmail content for "${payload.message.subject}".`);
      })
      .catch((error) => {
        if (!cancelled) setStatus(bridgeErrorStatus(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingBodyIds((current) => removeSetValue(current, activeMessage.id));
      });
    return () => {
      cancelled = true;
    };
  }, [activeMessage?.bodyLoaded, activeMessage?.id, activeMessage?.providerMessageId, activeMessage?.source, activeMessage?.subject, connector.endpoint]);

  const startBridgeAuth = useCallback(() => {
    try {
      openBridgeAuth(connector.endpoint, connector.provider);
      setStatus(`Opened ${connector.provider} authorization. Return here and refresh after approval.`);
    } catch (error) {
      setStatus(bridgeErrorStatus(error));
    }
  }, [connector.endpoint, connector.provider]);

  const disconnectProvider = useCallback(async () => {
    try {
      const session = await disconnectBridge(connector.endpoint);
      setConnector((current) => bridgeSessionToConnector(connector.endpoint, current, session));
      clearMailboxCache(connector.endpoint, connector.account);
      setMessages(MOCK_MESSAGES);
      setActiveMessageId(MOCK_MESSAGES[0]?.id ?? null);
      setSyncCursor('');
      setSyncHasMore(false);
      setSyncEstimate(0);
      setHasAutoSynced(false);
      setStatus('Disconnected Gmail and restored the mock inbox');
    } catch (error) {
      setStatus(bridgeErrorStatus(error));
    }
  }, [connector.endpoint]);

  const startReaderResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = readerWidth;
    const moveReader = (moveEvent: PointerEvent) => {
      setReaderWidth(clampReaderWidth(startWidth + startX - moveEvent.clientX));
    };
    const stopReader = () => {
      globalThis.document.body.classList.remove('mail-reader-resizing');
      globalThis.removeEventListener('pointermove', moveReader);
      globalThis.removeEventListener('pointerup', stopReader);
    };
    globalThis.document.body.classList.add('mail-reader-resizing');
    globalThis.addEventListener('pointermove', moveReader);
    globalThis.addEventListener('pointerup', stopReader, { once: true });
  }, [readerWidth]);

  const runHoverAction = (id: string, action: HoverActionId) => {
    const targetMessage = messages.find((message) => message.id === id);
    setMessages((current) => current.map((message) => {
      if (message.id !== id) return message;
      if (action === 'star') return { ...message, starred: !message.starred };
      if (action === 'archive') return { ...message, archived: !message.archived, mailbox: message.mailbox === 'trash' ? message.mailbox : 'all-mail' };
      if (action === 'trash') return { ...message, mailbox: message.mailbox === 'trash' ? 'inbox' : 'trash', archived: false };
      if (action === 'read') return { ...message, unread: !message.unread };
      return { ...message, remindedUntil: new Date(Date.now() + 86400000).toISOString(), archived: true };
    }));
    setStatus(`${HOVER_ACTION_DETAILS[action].label} action applied`);
    if (targetMessage?.providerMessageId) {
      applyBridgeAction(connector.endpoint, targetMessage, action).catch((error) => setStatus(bridgeErrorStatus(error)));
    }
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
      if (message.calendarEvent) nextLabels.add('Invites');
      if (message.category === 'Promotions') nextLabels.add('Promotions');
      if (message.category === 'Purchases') nextLabels.add('Purchases');
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
    { id: 'starred', label: 'Starred', icon: Star, active: activeView === 'starred', onClick: () => { setActiveView('starred'); setOpenMenu(null); } },
    { id: 'snoozed', label: 'Snoozed', icon: Clock3, active: activeView === 'snoozed', onClick: () => { setActiveView('snoozed'); setOpenMenu(null); } },
    { id: 'sent', label: 'Sent', icon: Send, active: activeView === 'sent', onClick: () => { setActiveView('sent'); setOpenMenu(null); } },
    { id: 'labels', label: 'Labels', icon: Bookmark, active: activeView === 'labels', onClick: () => { setActiveView('labels'); setOpenMenu(null); } },
    { id: 'important', label: 'Important', icon: ShieldAlert, active: activeView === 'important', onClick: () => { setActiveView('important'); setOpenMenu(null); } },
    { id: 'purchases', label: 'Purchases', icon: ShoppingBag, active: activeView === 'purchases', onClick: () => { setActiveView('purchases'); setOpenMenu(null); } },
    { id: 'all-mail', label: 'All Mail', icon: Mail, active: activeView === 'all-mail', onClick: () => { setActiveView('all-mail'); setOpenMenu(null); } },
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
              Sync Gmail from bridge
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
            <span><CircleDot size={20} /> Gmail</span>
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
        labels={sidebarLabels}
        activeLabel={activeLabel}
        onViewChange={(view) => {
          setActiveView(view);
          if (view !== 'labels') setActiveLabel(null);
          if (view === 'settings') setConnectorOpen(true);
          if (view === 'support') setSupportOpen(true);
        }}
        onLabelChange={(label) => {
          setActiveView('labels');
          setActiveLabel(label);
          setSelectedLabels([]);
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

        <div
          className={activeMessage ? 'mail-workspace mail-workspace--reader-open' : 'mail-workspace'}
          style={{ '--mail-reader-width': `${readerWidth}px` } as React.CSSProperties}
        >
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
          {activeMessage ? (
            <MessagePreview
              message={activeMessage}
              bodyLoading={loadingBodyIds.has(activeMessage.id)}
              hasPrevious={activeVisibleIndex > 0}
              hasNext={activeVisibleIndex >= 0 && activeVisibleIndex < visibleMessages.length - 1}
              onClose={() => setActiveMessageId(null)}
              onNavigate={navigateMessage}
              onResizeStart={startReaderResize}
              onRunAction={runHoverAction}
            />
          ) : null}
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
          onStartAuth={startBridgeAuth}
          onDisconnect={disconnectProvider}
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