import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import { DashboardController } from './dashboard.controller';

function buildRequest(restaurantId: string): RestaurantAuthorizedRequest {
  return {
    params: { restaurantId },
    restaurantAccess: {
      membershipId: 'membership-1',
      restaurantId,
      role: 'OWNER',
      allBranches: true,
    },
  } as unknown as RestaurantAuthorizedRequest;
}

describe('DashboardController', () => {
  let dashboardService: { getMetrics: jest.Mock };
  let controller: DashboardController;

  /* eslint-disable @typescript-eslint/unbound-method */
  const metricsHandler = DashboardController.prototype.getMetrics;
  /* eslint-enable @typescript-eslint/unbound-method */

  beforeEach(() => {
    dashboardService = { getMetrics: jest.fn().mockResolvedValue({}) };
    controller = new DashboardController(dashboardService as never);
  });

  it('declares exactly AuthGuard -> RestaurantAccessGuard -> PermissionGuard (read-only, no CsrfGuard)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, metricsHandler) as unknown[];
    expect(guards).toEqual([AuthGuard, RestaurantAccessGuard, PermissionGuard]);
  });

  it('requires the analytics.view Permission -- not orders.view or any other', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, metricsHandler)).toBe(
      PERMISSIONS.ANALYTICS_VIEW,
    );
  });

  it('passes the authorized scope and query through to the service', async () => {
    const request = buildRequest('restaurant-1');
    await controller.getMetrics({ range: 'today' }, request);

    expect(dashboardService.getMetrics).toHaveBeenCalledWith(
      { restaurantId: 'restaurant-1', membershipId: 'membership-1', allBranches: true },
      { range: 'today' },
    );
  });

  it('wraps the service result in a { data } envelope', async () => {
    dashboardService.getMetrics.mockResolvedValue({ kpis: { totalOrders: 5 } });
    const result = await controller.getMetrics({ range: 'today' }, buildRequest('restaurant-1'));

    expect(result).toEqual({ data: { kpis: { totalOrders: 5 } } });
  });
});
