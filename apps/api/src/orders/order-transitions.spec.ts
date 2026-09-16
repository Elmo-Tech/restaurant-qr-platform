import { PERMISSIONS } from '../auth/permission/permission';
import { hasPermission } from '../auth/permission/has-permission';
import { findOrderTransitionRule } from './order-transitions';
import type { OrderStatus } from '../generated/prisma/client';

const ALL_STATUSES: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'SERVED',
  'REJECTED',
  'CANCELLED',
];

describe('findOrderTransitionRule', () => {
  it.each([
    ['PENDING', 'ACCEPTED', PERMISSIONS.ORDERS_ACCEPT],
    ['PENDING', 'REJECTED', PERMISSIONS.ORDERS_REJECT],
    ['ACCEPTED', 'PREPARING', PERMISSIONS.KITCHEN_UPDATE],
    ['ACCEPTED', 'CANCELLED', PERMISSIONS.ORDERS_CANCEL],
    ['PREPARING', 'READY', PERMISSIONS.KITCHEN_UPDATE],
    ['PREPARING', 'CANCELLED', PERMISSIONS.ORDERS_CANCEL],
    ['READY', 'SERVED', PERMISSIONS.ORDERS_MARK_SERVED],
  ] as const)('allows %s -> %s, requiring %s', (from, to, permission) => {
    expect(findOrderTransitionRule(from, to)).toEqual({ to, permission });
  });

  it.each([
    ['SERVED', 'PREPARING'],
    ['REJECTED', 'ACCEPTED'],
    ['CANCELLED', 'ACCEPTED'],
    ['SERVED', 'CANCELLED'],
    ['PENDING', 'PREPARING'],
    ['PENDING', 'READY'],
    ['PENDING', 'SERVED'],
    ['ACCEPTED', 'READY'],
    ['ACCEPTED', 'SERVED'],
    ['PREPARING', 'ACCEPTED'],
    ['READY', 'PREPARING'],
    ['READY', 'CANCELLED'],
  ] as const)('rejects invalid transition %s -> %s', (from, to) => {
    expect(findOrderTransitionRule(from, to)).toBeNull();
  });

  it('rejects every terminal status transitioning anywhere at all', () => {
    for (const terminal of ['SERVED', 'REJECTED', 'CANCELLED'] as const) {
      for (const to of ALL_STATUSES) {
        expect(findOrderTransitionRule(terminal, to)).toBeNull();
      }
    }
  });

  it('every listed transition permission is actually granted to at least one Role', () => {
    const roles = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER'] as const;
    const transitions: [OrderStatus, OrderStatus][] = [
      ['PENDING', 'ACCEPTED'],
      ['PENDING', 'REJECTED'],
      ['ACCEPTED', 'PREPARING'],
      ['ACCEPTED', 'CANCELLED'],
      ['PREPARING', 'READY'],
      ['PREPARING', 'CANCELLED'],
      ['READY', 'SERVED'],
    ];
    for (const [from, to] of transitions) {
      const rule = findOrderTransitionRule(from, to);
      expect(rule).not.toBeNull();
      expect(roles.some((role) => hasPermission(role, rule!.permission))).toBe(true);
    }
  });
});
