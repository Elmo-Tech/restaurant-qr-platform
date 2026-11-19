'use client';

import { IconSearch } from '../../../../../components/staff/icons';
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

  return (
    <div
      role="search"
      className={`flex flex-col rounded-lg border border-border bg-card ${compact ? 'gap-2 px-3 py-2.5' : 'gap-3 p-3'}`}
    >
      <div className={`flex flex-wrap gap-3 ${compact ? 'items-center' : 'items-end'}`}>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          {/* Compact: the visible placeholder + search icon carry the meaning; the label stays for assistive tech. */}
          <span className={compact ? 'sr-only' : undefined}>{t('orders.filter.search')}</span>
          <span className="relative">
            <IconSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('orders.filter.searchPlaceholder')}
              className={`${controlHeight} ${INPUT_CLASS}`}
            />
          </span>
        </label>

        <label className={selectLabelClass}>
          <span>{t('orders.filter.sort')}</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as OrdersSort)}
            className={`${controlHeight} ${SELECT_CLASS}`}
          >
            {sortOptions.map((option) => (
              <option key={option} value={option}>
                {t(`orders.sort.${option}`)}
              </option>
            ))}
          </select>
        </label>

        {branches.length > 1 ? (
          <label className={selectLabelClass}>
            <span>{t('orders.filter.branch')}</span>
            <select
              value={branchId}
              onChange={(event) => onBranchChange(event.target.value)}
              className={`${controlHeight} ${SELECT_CLASS}`}
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

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClear}
            className={`${controlHeight} rounded-md px-2 text-sm font-medium text-primary hover:underline`}
          >
            {t('orders.filter.clear')}
          </button>
        ) : null}
      </div>

      <div className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
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
    </div>
  );
}
