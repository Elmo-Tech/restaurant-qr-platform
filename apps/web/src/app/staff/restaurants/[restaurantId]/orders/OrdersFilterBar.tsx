'use client';

import { useId, useState } from 'react';
import { IconChevronDown, IconClose, IconSearch, IconSliders } from '../../../../../components/staff/icons';
import { ChipGroup, type ChipOption } from '../../../../../components/ui/ChipGroup';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import type { OrderStatus, OrderType } from '../../../../../lib/orders/types';
import type { OrdersSort } from '../../../../../lib/orders/order-views';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { localizedName } from '../../../../../lib/i18n/localized-name';
import { orderStatusLabel } from './StatusBadge';
import { orderTypeLabel } from './OrderTypeBadge';

export const ALL_BRANCHES = '__all__';

/** Order types offered by the filter -- one entry per real type, so DELIVERY later is one more item (never a fake option today). */
const TYPE_OPTIONS: readonly OrderType[] = ['DINE_IN', 'PICKUP', 'DELIVERY'];

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-card ps-9 pe-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-ring';
const SELECT_CLASS =
  'rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring';

export interface OrdersFilterBarProps {
  type: OrderType | null;
  status: OrderStatus | null;
  /** Statuses relevant to the selected Active/Completed/All view. */
  statusOptions: readonly OrderStatus[];
  /** Already-loaded-data counts (view + search applied, Type/Status ignored) for the Type chips. */
  typeCounts: Record<OrderType, number>;
  /** Same, scoped to the current view's statuses, for the Status chips. */
  statusCounts: Partial<Record<OrderStatus, number>>;
  search: string;
  /** The sort actually applied (an explicit choice or the view's default). */
  sort: OrdersSort;
  /** The current view's own default sort (no explicit choice). A different applied sort is shown as an applied pill on narrow screens. */
  defaultSort: OrdersSort;
  /** Sorts the current view offers (Priority is Active-only). */
  sortOptions: readonly OrdersSort[];
  branchId: string;
  /** Already scoped to this Membership's authorized Branches; the Branch control only renders for more than one. */
  branches: AuthContextBranch[];
  hasActiveFilters: boolean;
  onTypeChange: (type: OrderType | null) => void;
  onStatusChange: (status: OrderStatus | null) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: OrdersSort) => void;
  onBranchChange: (branchId: string) => void;
  onClear: () => void;
  /** Drops an explicit sort choice so the view's default applies again (the sort pill's remove). */
  onSortReset: () => void;
  /**
   * Desktop Split Mode only: the same controls in a tighter panel (one-line
   * search/sort/branch row, inline labels, 36px controls) so the queue and
   * detail pane start higher. Every control and its accessible label stays.
   */
  compact?: boolean;
}

/**
 * Design-system-v2, Migration 01: search stays a text input and Branch stays
 * a `<select>` (a picklist is the right control for a potentially long,
 * infrequently-changed list), but Type and Status -- the filters Staff
 * flips constantly while working an order queue -- are now visible chip
 * rows instead of hidden dropdowns, each option showing its own
 * already-loaded-data count.
 */
export function OrdersFilterBar({
  type,
  status,
  statusOptions,
  typeCounts,
  statusCounts,
  search,
  sort,
  defaultSort,
  sortOptions,
  branchId,
  branches,
  hasActiveFilters,
  onTypeChange,
  onStatusChange,
  onSearchChange,
  onSortChange,
  onBranchChange,
  onClear,
  onSortReset,
  compact = false,
}: OrdersFilterBarProps) {
  const { t, locale } = useStaffI18n();

  const typeTotal = TYPE_OPTIONS.reduce((sum, option) => sum + typeCounts[option], 0);
  const typeChipOptions: ChipOption<OrderType | 'ALL'>[] = [
    { value: 'ALL', label: t('orders.filter.all'), count: typeTotal },
    ...TYPE_OPTIONS.map((option) => ({
      value: option,
      label: orderTypeLabel(t, option),
      count: typeCounts[option],
    })),
  ];

  const statusTotal = statusOptions.reduce((sum, option) => sum + (statusCounts[option] ?? 0), 0);
  const statusChipOptions: ChipOption<OrderStatus | 'ALL'>[] = [
    { value: 'ALL', label: t('orders.filter.all'), count: statusTotal },
    ...statusOptions.map((option) => ({
      value: option,
      label: orderStatusLabel(t, option),
      count: statusCounts[option] ?? 0,
    })),
  ];

  const controlHeight = compact ? 'h-9' : 'h-10';
  // Compact: Sort / Branch labels sit beside their select instead of above it.
  const selectLabelClass = compact
    ? 'flex items-center gap-2 text-xs font-medium text-muted-foreground'
    : 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

  // Phase 1 PR 4 -- below `md` the secondary controls (Sort, Branch, Order
  // type, Status) sit behind one disclosure so the queue starts higher. Every
  // applied one stays visible as a removable pill while it is collapsed, and
  // the toggle's badge counts them, so a deep-linked Status or `?sort=` is
  // never hidden. At `md` and up the panel is always shown and the toggle and
  // pills are not rendered visibly (layout unchanged from PR 2/3).
  const sortCustomized = sort !== defaultSort;
  const branchName =
    branchId === ALL_BRANCHES
      ? null
      : (() => {
          const branch = branches.find((candidate) => candidate.id === branchId);
          return branch ? localizedName(branch, locale) : null;
        })();
  const appliedPills: { key: string; label: string; ariaLabel: string; onRemove: () => void }[] = [];
  if (type !== null) {
    const label = orderTypeLabel(t, type);
    appliedPills.push({
      key: 'type',
      label,
      ariaLabel: t('orders.filter.remove', { label: `${t('orders.filter.type')}: ${label}` }),
      onRemove: () => onTypeChange(null),
    });
  }
  if (status !== null) {
    const label = orderStatusLabel(t, status);
    appliedPills.push({
      key: 'status',
      label,
      ariaLabel: t('orders.filter.remove', { label: `${t('orders.filter.status')}: ${label}` }),
      onRemove: () => onStatusChange(null),
    });
  }
  if (branchName !== null) {
    appliedPills.push({
      key: 'branch',
      label: branchName,
      ariaLabel: t('orders.filter.remove', { label: `${t('orders.filter.branch')}: ${branchName}` }),
      onRemove: () => onBranchChange(ALL_BRANCHES),
    });
  }
  if (sortCustomized) {
    const label = t('orders.filter.sortValue', { sort: t(`orders.sort.${sort}`) });
    appliedPills.push({
      key: 'sort',
      label,
      ariaLabel: t('orders.filter.remove', { label }),
      onRemove: onSortReset,
    });
  }
  const secondaryCount = appliedPills.length;

  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = useId();
  const sortPanelId = `${panelId}-sort`;
  const chipsPanelId = `${panelId}-chips`;
  // Below `md` only: hidden while collapsed. `md:contents` / `md:flex` keep
  // the wide layout exactly as before regardless of the toggle state.
  const narrowHidden = filtersOpen ? '' : 'max-md:hidden';
  const showSummary = !filtersOpen && (secondaryCount > 0 || hasActiveFilters);

  const clearButton = (className: string) => (
    <button
      type="button"
      onClick={onClear}
      className={`rounded-md px-2 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className}`}
    >
      {t('orders.filter.clear')}
    </button>
  );

  return (
    <div
      role="search"
      className={`flex flex-col rounded-lg border border-border bg-card ${compact ? 'gap-2 px-3 py-2.5' : 'gap-3 p-3'}`}
    >
      <div className={`flex flex-wrap gap-3 max-md:items-center max-md:gap-2 ${compact ? 'items-center' : 'items-end'}`}>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground max-md:basis-full md:min-w-[220px]">
          {/* Compact and narrow: the visible placeholder + search icon carry the meaning; the label stays for assistive tech. */}
          <span className={compact ? 'sr-only' : 'max-md:sr-only'}>{t('orders.filter.search')}</span>
          <span className="relative">
            <IconSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('orders.filter.searchPlaceholder')}
              className={`${controlHeight} max-md:h-11 ${INPUT_CLASS}`}
            />
          </span>
        </label>

        <button
          type="button"
          data-orders-filters-toggle=""
          aria-expanded={filtersOpen}
          aria-controls={`${sortPanelId} ${chipsPanelId}`}
          onClick={() => setFiltersOpen((open) => !open)}
          className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden ${
            secondaryCount > 0 || filtersOpen
              ? 'border-primary/40 bg-accent text-accent-foreground'
              : 'border-border bg-card text-foreground hover:bg-muted'
          }`}
        >
          <IconSliders className="h-4 w-4" />
          <span>{t('orders.filter.toggle')}</span>
          {secondaryCount > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground"
              >
                {secondaryCount}
              </span>
              <span className="sr-only">{t('orders.filter.activeCount', { count: secondaryCount })}</span>
            </>
          ) : null}
          <IconChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Narrow, collapsed: what is applied, each removable, then Clear filters. */}
        {showSummary && secondaryCount > 0 ? (
          <ul role="list" aria-label={t('orders.filter.applied')} className="contents md:hidden">
            {appliedPills.map((pill) => (
              <li key={pill.key} className="min-w-0 max-w-full md:hidden">
                <button
                  type="button"
                  onClick={pill.onRemove}
                  aria-label={pill.ariaLabel}
                  className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-primary/40 bg-accent ps-3 pe-2 text-sm font-medium text-accent-foreground hover:bg-accent/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <bdi className="truncate">{pill.label}</bdi>
                  <IconClose className="h-3.5 w-3.5 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {showSummary && hasActiveFilters ? clearButton('min-h-9 md:hidden') : null}

        <div id={sortPanelId} className={`flex w-full flex-wrap items-end gap-3 md:contents ${narrowHidden}`}>
          <label className={`${selectLabelClass} max-md:min-w-0 max-md:flex-1`}>
            <span>{t('orders.filter.sort')}</span>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as OrdersSort)}
              className={`${controlHeight} max-md:h-11 max-md:w-full ${SELECT_CLASS}`}
            >
              {sortOptions.map((option) => (
                <option key={option} value={option}>
                  {t(`orders.sort.${option}`)}
                </option>
              ))}
            </select>
          </label>

          {branches.length > 1 ? (
            <label className={`${selectLabelClass} max-md:min-w-0 max-md:flex-1`}>
              <span>{t('orders.filter.branch')}</span>
              <select
                value={branchId}
                onChange={(event) => onBranchChange(event.target.value)}
                className={`${controlHeight} max-md:h-11 max-md:w-full ${SELECT_CLASS}`}
              >
                <option value={ALL_BRANCHES}>{t('orders.filter.allBranches')}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {localizedName(branch, locale)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {hasActiveFilters ? clearButton(`${controlHeight} max-md:hidden`) : null}
      </div>

      <div id={chipsPanelId} className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'} ${narrowHidden}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t('orders.filter.type')}</span>
          <ChipGroup
            ariaLabel={t('orders.filter.type')}
            options={typeChipOptions}
            value={type ?? 'ALL'}
            onChange={(next) => onTypeChange(next === 'ALL' ? null : next)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t('orders.filter.status')}</span>
          <ChipGroup
            ariaLabel={t('orders.filter.status')}
            options={statusChipOptions}
            value={status ?? 'ALL'}
            onChange={(next) => onStatusChange(next === 'ALL' ? null : next)}
          />
        </div>
      </div>

      {/* Narrow, expanded: Clear filters closes the panel's controls. */}
      {filtersOpen && hasActiveFilters ? <div className="md:hidden">{clearButton('min-h-9')}</div> : null}
    </div>
  );
}
