import type { MessageKey } from '../i18n/messages';
import type { RestaurantMembershipRole } from '../auth/types';

const DEFAULT_ROLE_NAMES: Record<Exclude<RestaurantMembershipRole, 'CUSTOM'>, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  KITCHEN: 'Kitchen',
  WAITER: 'Waiter',
};

/**
 * What to show for a Role. A Restaurant stores Role names as plain text (they
 * are the Restaurant's own words), but the five starter Roles still carry
 * their default English names -- those are shown in the Staff UI language. A
 * renamed starter Role or any custom Role is shown exactly as typed.
 */
export function roleDisplayName(
  role: { kind: RestaurantMembershipRole; name: string },
  t: (key: MessageKey) => string,
): string {
  if (role.kind !== 'CUSTOM' && role.name === DEFAULT_ROLE_NAMES[role.kind]) {
    return t(`role.${role.kind}` as MessageKey);
  }
  return role.name;
}
