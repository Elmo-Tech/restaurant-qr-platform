import { PERMISSIONS } from '../auth/permission/permission';
import { findOrderTransitionRule } from './order-transitions';
import type { OrderStatus } from '../generated/prisma/client';

const ALL_STATUSES: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'SERVED',
  'REJECTED',
  'CANCELLED',
];

describe('findOrderTransitionRule -- DELIVERY lifecycle (FT-8)', () => {
  it('DELIVERY: READY -> OUT_FOR_DELIVERY is allowed (orders.markServed)', () => {
    expect(findOrderTransitionRule('READY', 'OUT_FOR_DELIVERY', 'DELIVERY')).toEqual({
      to: 'OUT_FOR_DELIVERY',
      permission: PERMISSIONS.ORDERS_MARK_SERVED,
    });
  });

  it('DELIVERY: OUT_FOR_DELIVERY -> SERVED is allowed (orders.markServed)', () => {
    expect(findOrderTransitionRule('OUT_FOR_DELIVERY', 'SERVED', 'DELIVERY')).toEqual({
      to: 'SERVED',
      permission: PERMISSIONS.ORDERS_MARK_SERVED,
    });
  });

  it('DELIVERY cannot skip the handover hop: READY -> SERVED is rejected', () => {
    expect(findOrderTransitionRule('READY', 'SERVED', 'DELIVERY')).toBeNull();
  });

  it('DELIVERY keeps the shared earlier steps and Reject/Cancel rules', () => {
    expect(findOrderTransitionRule('PENDING', 'ACCEPTED', 'DELIVERY')).not.toBeNull();
    expect(findOrderTransitionRule('PENDING', 'REJECTED', 'DELIVERY')).not.toBeNull();
    expect(findOrderTransitionRule('ACCEPTED', 'PREPARING', 'DELIVERY')).not.toBeNull();
    expect(findOrderTransitionRule('PREPARING', 'READY', 'DELIVERY')).not.toBeNull();
    expect(findOrderTransitionRule('PREPARING', 'CANCELLED', 'DELIVERY')).not.toBeNull();
  });

  it.each(['DINE_IN', 'PICKUP'] as const)(
    '%s can never move to OUT_FOR_DELIVERY from any status',
    (type) => {
      for (const from of ALL_STATUSES) {
        expect(findOrderTransitionRule(from, 'OUT_FOR_DELIVERY', type)).toBeNull();
      }
    },
  );

  it.each(['DINE_IN', 'PICKUP'] as const)(
    '%s keeps READY -> SERVED unchanged',
    (type) => {
      expect(findOrderTransitionRule('READY', 'SERVED', type)).toEqual({
        to: 'SERVED',
        permission: PERMISSIONS.ORDERS_MARK_SERVED,
      });
    },
  );

  it('terminal statuses stay terminal for DELIVERY too', () => {
    for (const terminal of ['SERVED', 'REJECTED', 'CANCELLED'] as const) {
      for (const to of ALL_STATUSES) {
        expect(findOrderTransitionRule(terminal, to, 'DELIVERY')).toBeNull();
      }
    }
  });
});
