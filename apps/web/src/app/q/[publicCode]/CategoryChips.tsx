'use client';

import { useEffect, useRef, useState } from 'react';
import { GuestIconSearch, GuestIconStar } from '../../../components/guest/icons';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { DEFAULT_MENU_TEMPLATE, layoutOf, type MenuTemplate } from '../../../lib/public-menu/templates';
import { categoryDomId } from './useMenuNavigation';

/** The category photo as a 22px round thumbnail; a broken image simply drops back to a text-only chip. */
function ChipThumb({ imageUrl }: { imageUrl: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
    <img
      src={imageUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-[22px] rounded-full object-cover"
    />
  );
}

export interface ChipItem {
  id: string;
  name: string;
  /** The category image as a 22px round thumbnail; text only when there is none. */
  imageUrl: string | null;
  isFeatured?: boolean;
}

/**
 * The sticky category strip: pill chips (44px phone / 46px desktop), the active one
 * saffron, driven by scroll-spy (`useMenuNavigation`). The first chip is "Our picks"
 * with a star, present only when the featured section is. Each chip is a real anchor
 * (keyboard reachable, works without JS). Once the hero has scrolled away, a search
 * button appears at the start to jump back to the search field.
 */
export function CategoryChips({
  items,
  activeId,
  onSelect,
  compact,
  onJumpToSearch,
  copy,
  template = DEFAULT_MENU_TEMPLATE,
}: {
  items: ChipItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  compact: boolean;
  onJumpToSearch: () => void;
  copy: PublicMenuCopy;
  /** The menu template (DEC-044): `menu` shows underlined text tabs, `list` squarer chips. */
  template?: MenuTemplate;
}) {
  const scrollerRef = useRef<HTMLElement>(null);
  const chipStyle = layoutOf(template).chips;

  // Keep the active chip centred. `scrollBy` is physical, so the delta from bounding boxes
  // works identically in LTR and RTL.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !activeId) return;
    const chip = scroller.querySelector<HTMLElement>(`[data-chip="${CSS.escape(activeId)}"]`);
    if (!chip) return;
    const scrollerBox = scroller.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const delta = chipBox.left + chipBox.width / 2 - (scrollerBox.left + scrollerBox.width / 2);
    if (Math.abs(delta) > 8) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scroller.scrollBy({ left: delta, behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [activeId]);

  return (
    <div
      className={`sticky top-0 z-30 mt-2 border-b bg-[color-mix(in_srgb,var(--g-bg)_90%,transparent)] backdrop-blur-md transition-colors ${template === 'ember' ? 'ember-v2-chipbar' : ''} ${
        compact ? 'border-g-line' : 'border-transparent'
      }`}
    >
      <div className="px-4 lg:px-8">
        <div className="mx-auto flex max-w-[1280px] items-center gap-2.5 py-3">
          <div
            className={`shrink-0 overflow-hidden transition-[width,opacity] duration-200 ${
              compact ? 'me-0 w-11 opacity-100' : '-me-2.5 w-0 opacity-0'
            }`}
          >
            <button
              type="button"
              onClick={onJumpToSearch}
              aria-label={copy.searchMenu}
              tabIndex={compact ? 0 : -1}
              className="flex size-11 items-center justify-center rounded-full border border-g-line bg-g-surface text-g-text"
            >
              <GuestIconSearch className="size-[18px]" />
            </button>
          </div>
          <nav
            ref={scrollerRef}
            aria-label={copy.categories}
            className="guest-scrollbar-none flex min-w-0 flex-1 gap-2.5 overflow-x-auto py-0.5"
          >
            {items.map((item) => {
              const isActive = item.id === activeId;
              return (
                <a
                  key={item.id}
                  href={`#${categoryDomId(item.id)}`}
                  data-chip={item.id}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    onSelect(item.id);
                  }}
                  className={
                    chipStyle === 'ember'
                      ? `ember-v2-chip flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-bold transition-colors lg:h-[46px] ${isActive ? 'ember-v2-chip-active border-g-accent bg-g-accent text-g-on-accent' : 'border-g-line bg-g-surface text-g-text-2 hover:border-g-accent hover:text-g-text'}`
                      : chipStyle === 'tabs'
                      ? `flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[15px] font-bold transition-colors lg:h-[46px] ${
                          isActive
                            ? 'border-g-accent text-g-text'
                            : 'border-transparent text-g-text-2 hover:text-g-text'
                        }`
                      : `flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border px-4 text-sm font-semibold transition-colors lg:h-[46px] lg:text-[14.5px] ${
                          chipStyle === 'square' ? 'rounded-xl' : 'rounded-full'
                        } ${
                          isActive
                            ? 'border-g-accent bg-g-accent text-g-on-accent'
                            : 'border-g-line bg-g-surface text-g-text hover:border-g-accent'
                        }`
                  }
                >
                  {item.isFeatured ? (
                    <GuestIconStar
                      className={`size-4 ${isActive ? 'text-g-on-accent' : 'text-g-accent'}`}
                    />
                  ) : item.imageUrl ? (
                    <ChipThumb imageUrl={item.imageUrl} />
                  ) : null}
                  <span dir="auto">{item.name}</span>
                </a>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
