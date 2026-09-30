'use client';

import { IconSearch } from '../../../../../components/staff/icons';
import { ChipGroup, type ChipOption } from '../../../../../components/ui/ChipGroup';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import type { OrderStatus, OrderType } from '../../../../../lib/orders/types';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { orderStatusLabel } from './StatusBadge';
import { orderTypeLabel } from './OrderTypeBadge';

export const ALL_BRANCHES = '__all__';

/** Order types offered by the filter -- one entry per real type, so DELIVERY later is one more item (never a fake option today). */
const TYPE_OPTIONS: readonly OrderType[] = ['DINE_IN', 'PICKUP', 'DELIVERY'];

const INPUT_CLASS =
  'h-10 w-full rounded-md border border-border bg-card ps-9 pe-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-ring';

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
  branchId: string;
  /** Already scoped to this Membership's authorized Branches; the Branch control only renders for more than one. */
  branches: AuthContextBranch[];
  hasActiveFilters: boolean;
  onTypeChange: (type: OrderType | null) => void;
  onStatusChange: (status: OrderStatus | null) => void;
  onSearchChange: (search: string) => void;
  onBranchChange: (branchId: string) => void;
  onClear: () => void;
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
  branchId,
  branches,
  hasActiveFilters,
  onTypeChange,
  onStatusChange,
  onSearchChange,
  onBranchChange,
  onClear,
}: OrdersFilterBarProps) {
  const { t } = useStaffI18n();

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

  return (
    <div role="search" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span>{t('orders.filter.search')}</span>
          <span className="relative">
            <IconSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('orders.filter.searchPlaceholder')}
              className={INPUT_CLASS}
            />
          </span>
        </label>

        {branches.length > 1 ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            <span>{t('orders.filter.branch')}</span>
            <select
              value={branchId}
              onChange={(event) => onBranchChange(event.target.value)}
              className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring"
            >
              <option value={ALL_BRANCHES}>{t('orders.filter.allBranches')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="h-10 rounded-md px-2 text-sm font-medium text-primary hover:underline"
          >
            {t('orders.filter.clear')}
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
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
