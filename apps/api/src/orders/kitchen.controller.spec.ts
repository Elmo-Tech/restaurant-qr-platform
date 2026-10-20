import { ForbiddenException } from '@nestjs/common';
import type { EntitlementsService } from '../entitlements/entitlements.service';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { KitchenController } from './kitchen.controller';
import type { KitchenService } from './kitchen.service';

const request = {
  restaurantAccess: {
    restaurantId: 'r1',
    membershipId: 'm1',
    allBranches: true,
    role: 'KITCHEN',
    roleId: null,
    permissions: ['kitchen.view'],
  },
} as unknown as RestaurantAuthorizedRequest;

function build(kitchenEnabled: boolean) {
  const listTickets = jest.fn().mockResolvedValue([{ id: 't1' }]);
  const isEnabled = jest.fn().mockResolvedValue(kitchenEnabled);
  const controller = new KitchenController(
    { listTickets } as unknown as KitchenService,
    { isEnabled } as unknown as EntitlementsService,
  );
  return { controller, listTickets, isEnabled };
}

describe('KitchenController (DEC-054)', () => {
  it('lists the tickets when the package includes the kitchen screen', async () => {
    const { controller, listTickets, isEnabled } = build(true);
    await expect(controller.listTickets({}, request)).resolves.toEqual({
      data: [{ id: 't1' }],
    });
    expect(isEnabled).toHaveBeenCalledWith('r1', 'KITCHEN');
    expect(listTickets).toHaveBeenCalledTimes(1);
  });

  it('refuses with 403 FEATURE_NOT_AVAILABLE naming KITCHEN, and reads nothing, when it is not included', async () => {
    const { controller, listTickets } = build(false);
    const outcome = controller.listTickets({}, request);
    await expect(outcome).rejects.toBeInstanceOf(ForbiddenException);
    await expect(outcome).rejects.toMatchObject({
      response: {
        error: { code: 'FEATURE_NOT_AVAILABLE', feature: 'KITCHEN' },
      },
    });
    expect(listTickets).not.toHaveBeenCalled();
  });
});
