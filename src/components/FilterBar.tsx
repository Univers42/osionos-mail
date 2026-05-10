import React from 'react';
import { Archive, Bookmark, ChevronDown, MailCheck, Plus, Tag } from 'lucide-react';

interface FilterBarProps {
  selectedCategories: string[];
  selectedLabels: string[];
  unreadOnly: boolean;
  showArchived: boolean;
  onOpenCategories: () => void;
  onOpenLabels: () => void;
  onToggleUnread: () => void;
  onToggleArchived: () => void;
  onOpenFilterMenu: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  selectedCategories,
  selectedLabels,
  unreadOnly,
  showArchived,
  onOpenCategories,
  onOpenLabels,
  onToggleUnread,
  onToggleArchived,
  onOpenFilterMenu,
}) => (
  <div className="mail-filterbar">
    <button className="mail-filter-chip" type="button" onClick={onOpenCategories}>
      <Bookmark size={16} fill="currentColor" />
      <span>Categories</span>
      {selectedCategories.length ? <small>{selectedCategories.length}</small> : null}
      <ChevronDown size={14} />
    </button>
    <button className="mail-filter-chip" type="button" onClick={onOpenLabels}>
      <Tag size={16} />
      <span>Labels</span>
      {selectedLabels.length ? <small>{selectedLabels.length}</small> : null}
      <ChevronDown size={14} />
    </button>
    <button
      className={["mail-filter-chip", unreadOnly ? 'mail-filter-chip--active' : ''].join(' ')}
      type="button"
      onClick={onToggleUnread}
    >
      <MailCheck size={16} />
      <span>Is unread</span>
    </button>
    <button
      className={["mail-filter-chip", showArchived ? 'mail-filter-chip--active' : ''].join(' ')}
      type="button"
      onClick={onToggleArchived}
    >
      <Archive size={16} />
      <span>Show archived</span>
    </button>
    <button className="mail-filter-chip mail-filter-chip--add" type="button" onClick={onOpenFilterMenu}>
      <Plus size={16} />
      <span>Filter</span>
    </button>
  </div>
);