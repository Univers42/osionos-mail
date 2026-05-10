import React from 'react';
import {
  Bot,
  ChevronDown,
  Filter,
  Inbox,
  ListFilter,
  RefreshCw,
  SlidersHorizontal,
  Square,
} from 'lucide-react';

import type { MailViewId } from '../types';

interface MailToolbarProps {
  activeView: MailViewId;
  selectedCount: number;
  visibleCount: number;
  isSyncing: boolean;
  onToggleSelectAll: () => void;
  onOpenSelectMenu: () => void;
  onOpenViewMenu: () => void;
  onAutoLabel: () => void;
  onOpenFilterMenu: () => void;
  onOpenEditViewMenu: () => void;
  onRefresh: () => void;
}

const VIEW_LABELS: Record<MailViewId, string> = {
  inbox: 'Inbox',
  starred: 'Starred',
  snoozed: 'Snoozed',
  sent: 'Sent',
  labels: 'Labels',
  'all-mail': 'All Mail',
  drafts: 'Drafts',
  important: 'Important',
  scheduled: 'Scheduled',
  purchases: 'Purchases',
  spam: 'Spam',
  trash: 'Trash',
  settings: 'Settings',
  support: 'Support',
};

export const MailToolbar: React.FC<MailToolbarProps> = ({
  activeView,
  selectedCount,
  visibleCount,
  isSyncing,
  onToggleSelectAll,
  onOpenSelectMenu,
  onOpenViewMenu,
  onAutoLabel,
  onOpenFilterMenu,
  onOpenEditViewMenu,
  onRefresh,
}) => (
  <header className="mail-toolbar">
    <div className="mail-toolbar__left">
      <div className="mail-select-split">
        <button type="button" onClick={onToggleSelectAll} aria-label="Toggle visible messages">
          <Square size={20} fill={selectedCount === visibleCount && visibleCount > 0 ? 'currentColor' : 'none'} />
        </button>
        <button type="button" onClick={onOpenSelectMenu} aria-label="Open selection options">
          <ChevronDown size={14} />
        </button>
      </div>

      <button className="mail-view-button" type="button" onClick={onOpenViewMenu}>
        <Inbox size={20} />
        <span>{VIEW_LABELS[activeView]}</span>
      </button>
    </div>

    <div className="mail-toolbar__right">
      <button className="mail-pill-button" type="button" onClick={onAutoLabel}>
        <Bot size={19} />
        <span>Auto label</span>
      </button>
      <button className="mail-icon-button" type="button" onClick={onOpenFilterMenu} title="Filter">
        <ListFilter size={19} />
      </button>
      <button className="mail-icon-button" type="button" onClick={onOpenEditViewMenu} title="Edit view">
        <SlidersHorizontal size={19} />
      </button>
      <button className="mail-icon-button" type="button" onClick={onRefresh} title="Refresh">
        <RefreshCw size={19} className={isSyncing ? 'is-spinning' : ''} />
      </button>
      <button className="mail-pill-button mail-pill-button--quiet" type="button" onClick={onOpenFilterMenu}>
        <Filter size={16} />
        <span>{selectedCount ? `${selectedCount} selected` : `${visibleCount} messages`}</span>
      </button>
    </div>
  </header>
);