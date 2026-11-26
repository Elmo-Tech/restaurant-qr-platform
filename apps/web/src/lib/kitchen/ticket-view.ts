import type { KitchenStatus, KitchenTicket, KitchenTicketItem } from './types.ts';

/**
 * Kitchen K2: the pure rules behind ticket readability and time priority. No
 * React, no network. These only change how the board presents what the
 * Backend returned; they never change a status, a permission or a request.
 */

/**
 * The approved timer thresholds (Kitchen View V1, STAFF_DASHBOARD_UX_SPEC #99):
 * a ticket still waiting or cooking for this long gets a warning, then an
 * alert. Fixed in V1, never configurable.
 */
export const KITCHEN_WARN_MINUTES = 10;
export const KITCHEN_ALERT_MINUTES = 20;

export type KitchenDelayLevel = 'none' | 'warn' | 'alert';

/**
 * How late a ticket is in its current stage. READY is never "late": that
 * ticket is finished and only waits for front-of-house service, which is a
 * different team's step (READY is not SERVED).
 */
export function kitchenDelayLevel(status: KitchenStatus, minutesInStage: number): KitchenDelayLevel {
  if (status === 'READY') return 'none';
  if (minutesInStage >= KITCHEN_ALERT_MINUTES) return 'alert';
  if (minutesInStage >= KITCHEN_WARN_MINUTES) return 'warn';
  return 'none';
}

/** An unparseable timestamp must sort last and never throw or produce an unstable comparator. */
function timeOf(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Longest waiting in its CURRENT stage first. `statusSince` is when the order
 * entered its status, so an order accepted just now sorts after one that has
 * been accepted for 20 minutes even if it was placed earlier. Ties are broken
 * by creation time, then by id, so two polls of the same data always render
 * the same order. Returns a new array.
 */
export function sortKitchenTickets(tickets: readonly KitchenTicket[]): KitchenTicket[] {
  return [...tickets].sort((a, b) => {
    const bySince = timeOf(a.statusSince) - timeOf(b.statusSince);
    if (bySince !== 0 && !Number.isNaN(bySince)) return bySince;
    const byCreated = timeOf(a.createdAt) - timeOf(b.createdAt);
    if (byCreated !== 0 && !Number.isNaN(byCreated)) return byCreated;
    return compareText(a.id, b.id);
  });
}

export interface KitchenModifierGroup {
  /** The Modifier Group (or Offer slot) name, or null when the snapshot has none. */
  groupName: string | null;
  options: string[];
}

/**
 * Options listed under their own group name, in the order the Guest saw them.
 * Options of one group that arrive apart (the API lists a line's modifiers
 * and then its Offer choices) are gathered under the first appearance of that
 * group, so "Extras" is never repeated and an option never ends up under a
 * neighbouring group.
 */
export function groupKitchenModifiers(modifiers: KitchenTicketItem['modifiers']): KitchenModifierGroup[] {
  const groups: KitchenModifierGroup[] = [];
  const byName = new Map<string, KitchenModifierGroup>();
  for (const modifier of modifiers) {
    const groupName = modifier.groupName.trim() === '' ? null : modifier.groupName;
    const key = groupName ?? '';
    let group = byName.get(key);
    if (!group) {
      group = { groupName, options: [] };
      byName.set(key, group);
      groups.push(group);
    }
    group.options.push(modifier.optionName);
  }
  return groups;
}
