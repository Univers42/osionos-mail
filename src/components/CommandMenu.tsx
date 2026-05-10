import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';

import type { CommandItem } from '../types';

interface CommandMenuProps {
  title: string;
  items: CommandItem[];
  searchPlaceholder?: string;
  onBack?: () => void;
  footer?: React.ReactNode;
  className?: string;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  title,
  items,
  searchPlaceholder,
  onBack,
  footer,
  className,
}) => {
  const [query, setQuery] = useState('');
  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => {
      const haystack = [item.label, item.description, item.meta].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalized);
    });
  }, [items, query]);

  return (
    <div className={['mail-menu', className].filter(Boolean).join(' ')} role="menu">
      <div className="mail-menu__header">
        {onBack ? (
          <button className="mail-icon-button" type="button" onClick={onBack} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        ) : null}
        <span>{title}</span>
      </div>

      {searchPlaceholder ? (
        <div className="mail-menu__search">
          <input
            value={query}
            placeholder={searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}

      <div className="mail-menu__items">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={["mail-menu__item", item.danger ? 'mail-menu__item--danger' : ''].join(' ')}
              role="menuitem"
              type="button"
              onClick={item.onClick}
            >
              <span className="mail-menu__item-icon">
                <Icon size={18} />
              </span>
              <span className="mail-menu__item-text">
                <span>{item.label}</span>
                {item.description ? <small>{item.description}</small> : null}
              </span>
              <span className="mail-menu__item-meta">
                {item.meta ? <small>{item.meta}</small> : null}
                {item.active ? <Check size={15} /> : null}
              </span>
            </button>
          );
        })}
      </div>

      {footer ? <div className="mail-menu__footer">{footer}</div> : null}
    </div>
  );
};