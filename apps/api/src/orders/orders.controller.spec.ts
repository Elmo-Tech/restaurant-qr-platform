import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import { OrdersController } from './orders.controller';
import type { OrderDetail } from './orders.service';

function buildRequest(
  restaurantId: string,
  overrides: Partial<RestaurantAuthorizedRequest['restaurantAccess']> = {},
): RestaurantAuthorizedRequest {
  return {
    params: { restaurantId },
    restaurantAccess: {
      membershipId: 'membership-1',
      restaurantId,
      role: 'OWNER',
      allBranches: true,
      ...overrides,
    },
  } as unknown as RestaurantAuthorizedRequest;
}

const SAMPLE_DETAIL: OrderDetail = {
  id: 'order-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  status: 'PENDING',
  type: 'DINE_IN',
  restaurant: { id: 'restaurant-1', name: 'Elmo Bistro' },
  branch: { id: 'branch-1', name: 'Main Branch' },
  table: { id: 'table-1', tableNumber: '7' },
  customer: null,
  delivery: null,
  subtotalAmount: '100.00',
  deliveryFee: '0.00',
  currencyCode: 'EGP',
  totalAmount: '100.00',
  items: [],
};

describe('OrdersController', () => {
  let ordersService: {
    listOrders: jest.Mock;
    getOrderDetail: jest.Mock;
    updateOrderStatus: jest.Mock;
  };
  let controller: OrdersController;

  /* eslint-disable @typescript-eslint/unbound-method */
  const listHandler = OrdersController.prototype.listOrders;
  const detailHandler = OrdersController.prototype.getOrderDetail;
  const statusHandler = OrdersController.prototype.updateOrderStatus;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    ordersService = {
      listOrders: jest.fn().mockResolvedValue([]),
      getOrderDetail: jest.fn(),
      updateOrderStatus: jest.fn(),
    };
    controller = new OrdersController(ordersService as never);
  });

  it('List declares exactly AuthGuard -> RestaurantAccessGuard -> PermissionGuard (read-only, no CsrfGuard)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, listHandler) as unknown[];
    expect(guards).toEqual([AuthGuard, RestaurantAccessGuard, PermissionGuard]);
  });

  it('Detail declares exactly AuthGuard -> RestaurantAccessGuard -> PermissionGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, detailHandler) as unknown[];
    expect(guards).toEqual([AuthGuard, RestaurantAccessGuard, PermissionGuard]);
  });

  it('Status update declares exactly AuthGuard -> CsrfGuard -> RestaurantAccessGuard -> PermissionGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, statusHandler) as unknown[];
    expect(guards).toEqual([AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard]);
  });

  it('every route requires exactly the orders.view baseline Permission', () => {
    for (const handler of [listHandler, detailHandler, statusHandler]) {
      expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toBe(
        PERMISSIONS.ORDERS_VIEW,
      );
    }
  });

  describe('listOrders', () => {
    it('passes the authorized scope and filters through', async () => {
      await controller.listOrders(
        { branchId: 'branch-1', status: 'PENDING' },
        buildRequest('restaurant-1'),
      );

      expect(ordersService.listOrders).toHaveBeenCalledWith(
        {
          restaurantId: 'restaurant-1',
          membershipId: 'membership-1',
          allBranches: true,
          role: 'OWNER',
        },
        { branchId: 'branch-1', status: 'PENDING' },
      );
    });
  });

  describe('getOrderDetail', () => {
    it('returns the data on success', async () => {
      ordersService.getOrderDetail.mockResolvedValue({ outcome: 'found', data: SAMPLE_DETAIL });

      const body = await controller.getOrderDetail('order-1', buildRequest('restaurant-1'));

      expect(body).toEqual({ data: SAMPLE_DETAIL });
    });

    it('maps notFound to 404 ORDER_NOT_FOUND', async () => {
      ordersService.getOrderDetail.mockResolvedValue({ outcome: 'notFound' });

      await expect(
        controller.getOrderDetail('unknown', buildRequest('restaurant-1')),
      ).rejects.toMatchObject({
        response: { error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } },
      });
    });
  });

  describe('updateOrderStatus', () => {
    const dto = { expectedStatus: 'PENDING' as const, status: 'ACCEPTED' as const };

    it('returns the updated data on success', async () => {
      ordersService.updateOrderStatus.mockResolvedValue({
        outcome: 'updated',
        data: SAMPLE_DETAIL,
      });

      const body = await controller.updateOrderStatus(
        'order-1',
        dto,
        buildRequest('restaurant-1'),
      );

      expect(body).toEqual({ data: SAMPLE_DETAIL });
    });

    it('maps notFound to 404 ORDER_NOT_FOUND', async () => {
      ordersService.updateOrderStatus.mockResolvedValue({ outcome: 'notFound' });

      await expect(
        controller.updateOrderStatus('order-1', dto, buildRequest('restaurant-1')),
      ).rejects.toMatchObject({
        response: { error: { code: 'ORDER_NOT_FOUND' } },
      });
    });

    it('maps invalidTransition to 409 ORDER_INVALID_TRANSITION', async () => {
      ordersService.updateOrderStatus.mockResolvedValue({ outcome: 'invalidTransition' });

      await expect(
        controller.updateOrderStatus('order-1', dto, buildRequest('restaurant-1')),
      ).rejects.toMatchObject({
        response: { error: { code: 'ORDER_INVALID_TRANSITION' } },
      });
    });

    it('maps permissionDenied to 403 PERMISSION_DENIED', async () => {
      ordersService.updateOrderStatus.mockResolvedValue({ outcome: 'permissionDenied' });

      await expect(
        controller.updateOrderStatus('order-1', dto, buildRequest('restaurant-1')),
      ).rejects.toMatchObject({
        response: { error: { code: 'PERMISSION_DENIED' } },
      });
    });

    it('maps staleStatus to 409 ORDER_STATUS_CHANGED, including the current status', async () => {
      ordersService.updateOrderStatus.mockResolvedValue({
        outcome: 'staleStatus',
        currentStatus: 'REJECTED',
      });

      await expect(
        controller.updateOrderStatus('order-1', dto, buildRequest('restaurant-1')),
      ).rejects.toMatchObject({
        response: {
          error: { code: 'ORDER_STATUS_CHANGED', details: { currentStatus: 'REJECTED' } },
        },
      });
    });
  });
});
