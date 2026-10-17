import { apiFetch } from '../api/client';

/** Branch opening hours (DEC-042): types and the thin request layer. Times are "HH:MM" in the Branch's own timezone. */

export type HoursMode = 'ALWAYS_OPEN' | 'SCHEDULE';

export interface HoursInterval {
  opens: string;
  closes: string;
}

export interface HoursDay {
  /** 0 = Sunday ... 6 = Saturday. */
  day: number;
  intervals: HoursInterval[];
}

export interface HoursStatus {
  open: boolean;
  temporarilyClosed: boolean;
  opensAt: { dayOffset: number; minute: number; dayOfWeek: number } | null;
  closesAtMinute: number | null;
}

export interface BranchHours {
  mode: HoursMode;
  temporarilyClosed: boolean;
  timezone: string;
  days: HoursDay[];
  status: HoursStatus | null;
}

const hoursPath = (restaurantId: string, branchId: string): string =>
  `/restaurants/${restaurantId}/branches/${branchId}/hours`;

export async function getBranchHours(restaurantId: string, branchId: string): Promise<BranchHours> {
  const body = await apiFetch<{ data: BranchHours }>(hoursPath(restaurantId, branchId));
  return body.data;
}

export async function saveBranchHours(
  restaurantId: string,
  branchId: string,
  input: { mode: HoursMode; temporarilyClosed: boolean; days?: HoursDay[] },
): Promise<BranchHours> {
  const body = await apiFetch<{ data: BranchHours }>(hoursPath(restaurantId, branchId), {
    method: 'PUT',
    body: input,
  });
  return body.data;
}

/** "570" -> "09:30". */
export function clockOf(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}
