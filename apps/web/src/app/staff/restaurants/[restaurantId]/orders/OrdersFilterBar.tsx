'use client';

import { IconSearch } from '../../../../../components/staff/icons';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import type { OrderStatus, OrderType } from '../../../../../lib/orders/types';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { orderStatusLabel } from './StatusBadge';
import { orderTypeLabel } from './OrderTypeBadge';

export const ALL_BRANCHES = '__all__';

/** Order types offered by the filter -- one entry per real type, so DELIVERY later is one more item (never a fake option today). */
const TYPE_OPTIONS: readonly OrderType[] = ['DINE_IN', 'PICKUP', 'DELIVERY'];

const CONTROL_CLASS =
  'rounded-md border border-[#E5DED6] bg-white px-3 py-2 text-sm text-[#1D1A18] outline-none focus:border-[#7A5138] focus:ring-1 focus:ring-[#7A5138]';

export interface OrdersFilterBarProps {
  type: OrderType | null;
  status: OrderStatus | null;
  /** Statuses relevant to the selected Active/Completed/All view. */
  statusOptions: readonly OrderStatus[];
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

/** FT-7B: one compact filter row -- search, Order type, status, and (only when several are authorized) Branch. Pure controlled UI; owns no state. */
export function OrdersFilterBar({
  type,
  status,
  statusOptions,
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
  return (
    <div
      role="search"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-[#E5DED6] bg-white p-3"
    >
      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-[#655D56]">
        <span>{t('orders.filter.search')}</span>
        <span className="relative">
          <IconSearch className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#AFA397]" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('orders.filter.searchPlaceholder')}
            className={`${CONTROL_CLASS} w-full ps-9`}
          />
        </span>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
        <span>{t('orders.filter.type')}</span>
        <select
          value={type ?? ''}
          onChange={(event) => onTypeChange((event.target.value || null) as OrderType | null)}
          className={CONTROL_CLASS}
        >
          <option value="">{t('orders.filter.all')}</option>
          {TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {orderTypeLabel(t, option)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
        <span>{t('orders.filter.status')}</span>
        <select
          value={status ?? ''}
          onChange={(event) => onStatusChange((event.target.value || null) as OrderStatus | null)}
          className={CONTROL_CLASS}
        >
          <option value="">{t('orders.filter.all')}</option>
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {orderStatusLabel(t, option)}
            </option>
          ))}
        </select>
      </label>

      {branches.length > 1 ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-[#655D56]">
          <span>{t('orders.filter.branch')}</span>
          <select
            value={branchId}
            onChange={(event) => onBranchChange(event.target.value)}
            className={CONTROL_CLASS}
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
          className="rounded-md px-2 py-2 text-sm font-medium text-[#7A5138] hover:underline"
        >
          {t('orders.filter.clear')}
        </button>
      ) : null}
    </div>
  );
}
