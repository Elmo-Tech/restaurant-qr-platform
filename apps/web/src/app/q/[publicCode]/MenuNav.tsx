'use client';

import { useEffect, useRef } from 'react';
import { GuestIconClose, GuestIconSearch } from '../../../components/guest/icons';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { categoryDomId } from './useMenuNavigation';

/**
 * The sticky strip under the brand block: category chips (scroll-spied,
 * keyboard-reachable anchors) and a product search that takes over the same
 * row while open, so opening it never changes the sticky height (no layout
 * jump). `compact` only moves the sticky `top` to sit beneath the compact bar.
 */
export function MenuNav({
  categories,
  activeId,
  onSelect,
  compact,
  searchOpen,
  query,
  onSearchOpen,
  onSearchClose,
  onQueryChange,
  copy,
}: {
  categories: { id: string; name: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  compact: boolean;
  searchOpen: boolean;
  query: string;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onQueryChange: (value: string) => void;
  copy: PublicMenuCopy;
}) {
  const scrollerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the active chip centred in the strip. `scrollBy` is physical, so the
  // delta computed from bounding boxes works identically in LTR and RTL.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !activeId) return;
    const chip = scroller.querySelector<HTMLElement>(`[data-chip="${CSS.escape(activeId)}"]`);
    if (!chip) return;
    const scrollerBox = scroller.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const delta = chipBox.left + chipBox.width / 2 - (scrollerBox.left + scrollerBox.width / 2);
    if (Math.abs(delta) > 8) scroller.scrollBy({ left: delta, behavior: 'smooth' });
  }, [activeId]);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  return (
    <div
      className={`sticky z-20 border-b border-guest-line bg-guest-paper/95 backdrop-blur transition-[top] duration-300 ease-out ${
        compact ? 'top-[52px]' : 'top-0'
      }`}
    >
      <div className="px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-2">
          {searchOpen ? (
            <div role="search" className="flex min-w-0 flex-1 items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <label htmlFor="guest-menu-search" className="sr-only">
                  {copy.searchMenu}
                </label>
                <GuestIconSearch className="pointer-events-none absolute start-3.5 top-1/2 size-[18px] -translate-y-1/2 text-guest-muted" />
                <input
                  ref={inputRef}
                  id="guest-menu-search"
                  type="search"
                  dir="auto"
                  enterKeyHint="search"
                  autoComplete="off"
                  value={query}
                  placeholder={copy.searchPlaceholder}
                  onChange={(event) => onQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      onSearchClose();
                    }
                  }}
                  className="h-11 w-full rounded-full border border-guest-line-strong bg-guest-surface ps-10 pe-11 text-base text-guest-ink placeholder:text-guest-muted focus:border-guest-pine focus:outline-2 focus:outline-offset-0 focus:outline-guest-pine/30 [&::-webkit-search-cancel-button]:hidden"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      onQueryChange('');
                      inputRef.current?.focus();
                    }}
                    aria-label={copy.clearSearch}
                    className="absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-guest-muted hover:bg-guest-pine-soft focus-visible:outline-2 focus-visible:outline-guest-pine"
                  >
                    <GuestIconClose className="size-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onSearchClose}
                className="h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-guest-pine hover:bg-guest-pine-soft focus-visible:outline-2 focus-visible:outline-guest-pine"
              >
                {copy.close}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onSearchOpen}
                aria-label={copy.searchMenu}
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-guest-line-strong bg-guest-surface text-guest-ink transition-colors hover:border-guest-pine hover:text-guest-pine focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-guest-pine"
              >
                <GuestIconSearch className="size-[18px]" />
              </button>
              <nav
                ref={scrollerRef}
                aria-label={copy.categories}
                className="guest-scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 [mask-image:linear-gradient(to_right,transparent,#000_10px,#000_calc(100%-10px),transparent)]"
              >
                {categories.map((category) => {
                  const isActive = category.id === activeId;
                  return (
                    <a
                      key={category.id}
                      href={`#${categoryDomId(category.id)}`}
                      data-chip={category.id}
                      aria-current={isActive ? 'true' : undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        onSelect(category.id);
                      }}
                      dir="auto"
                      className={`flex h-10 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[0.95rem] font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-guest-pine ${
                        isActive
                          ? 'bg-guest-pine text-white'
                          : 'text-guest-ink-soft hover:bg-guest-surface hover:text-guest-ink'
                      }`}
                    >
                      {category.name}
                    </a>
                  );
                })}
              </nav>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
