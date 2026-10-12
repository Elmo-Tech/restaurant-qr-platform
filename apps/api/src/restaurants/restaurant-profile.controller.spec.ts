import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import { RestaurantProfileController } from './restaurant-profile.controller';

function buildRequest(restaurantId: string): RestaurantAuthorizedRequest {
  return {
    params: { restaurantId },
    restaurantAccess: { membershipId: 'membership-1', restaurantId, role: 'OWNER', allBranches: true },
  } as unknown as RestaurantAuthorizedRequest;
}

function buildFile(overrides: Partial<{ buffer: Buffer; mimetype: string; size: number }> = {}) {
  return {
    originalname: 'logo.png',
    mimetype: 'image/png',
    size: 8,
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...overrides,
  };
}

describe('RestaurantProfileController', () => {
  let profileService: { updateProfile: jest.Mock; setLogo: jest.Mock; clearLogo: jest.Mock };
  let imageStorageService: { saveImage: jest.Mock; deleteImageBestEffort: jest.Mock };
  let controller: RestaurantProfileController;

  beforeEach(() => {
    profileService = {
      updateProfile: jest.fn().mockResolvedValue({ name: 'New Name', logoAssetPath: null }),
      setLogo: jest.fn().mockResolvedValue({
        data: { name: 'Cairo Bites', logoAssetPath: '/media/new.png' },
        previousLogoAssetPath: null,
      }),
      clearLogo: jest.fn().mockResolvedValue({ previousLogoAssetPath: '/media/old.png' }),
    };
    imageStorageService = {
      saveImage: jest.fn().mockResolvedValue({ assetPath: '/media/new.png' }),
      deleteImageBestEffort: jest.fn().mockResolvedValue(undefined),
    };
    controller = new RestaurantProfileController(profileService as never, imageStorageService as never);
  });

  describe('updateProfile', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    const handler = RestaurantProfileController.prototype.updateProfile;
    /* eslint-enable @typescript-eslint/unbound-method */

    it('declares the settled Restaurant-structural guard chain', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      expect(guards).toEqual([AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard]);
    });

    it('requires restaurant.manage', () => {
      expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toBe(PERMISSIONS.RESTAURANT_MANAGE);
    });

    it('scopes by the authorized restaurantId, not a route param, and wraps result in a data envelope', async () => {
      const body = await controller.updateProfile({ name: 'New Name' }, buildRequest('restaurant-1'));

      expect(profileService.updateProfile).toHaveBeenCalledWith({ restaurantId: 'restaurant-1', name: 'New Name' });
      expect(body).toEqual({ data: { name: 'New Name', logoAssetPath: null } });
    });
  });

  describe('uploadLogo', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    const handler = RestaurantProfileController.prototype.uploadLogo;
    /* eslint-enable @typescript-eslint/unbound-method */

    it('declares the settled Restaurant-structural guard chain', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      expect(guards).toEqual([AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard]);
    });

    it('saves the file, persists it, and best-effort-removes the previous logo only after the DB write succeeds', async () => {
      profileService.setLogo.mockResolvedValue({
        data: { name: 'Cairo Bites', logoAssetPath: '/media/new.png' },
        previousLogoAssetPath: '/media/old.png',
      });

      const body = await controller.uploadLogo(buildFile(), buildRequest('restaurant-1'));

      expect(imageStorageService.saveImage).toHaveBeenCalledWith(expect.any(Buffer), 'image/png');
      expect(profileService.setLogo).toHaveBeenCalledWith({
        restaurantId: 'restaurant-1',
        imageAssetPath: '/media/new.png',
      });
      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith('/media/old.png');
      expect(body).toEqual({ data: { name: 'Cairo Bites', logoAssetPath: '/media/new.png' } });
    });

    it('rejects a missing file before ever touching storage', async () => {
      await expect(
        controller.uploadLogo(undefined, buildRequest('restaurant-1')),
      ).rejects.toThrow();
      expect(imageStorageService.saveImage).not.toHaveBeenCalled();
    });

    it('cleans up the just-saved file if the DB write throws', async () => {
      profileService.setLogo.mockRejectedValue(new Error('db down'));

      await expect(controller.uploadLogo(buildFile(), buildRequest('restaurant-1'))).rejects.toThrow('db down');

      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith('/media/new.png');
    });
  });

  describe('removeLogo', () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    const handler = RestaurantProfileController.prototype.removeLogo;
    /* eslint-enable @typescript-eslint/unbound-method */

    it('declares the settled Restaurant-structural guard chain', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      expect(guards).toEqual([AuthGuard, CsrfGuard, RestaurantAccessGuard, PermissionGuard, AllBranchesRequiredGuard]);
    });

    it('clears the logo and best-effort-removes the previous file', async () => {
      await controller.removeLogo(buildRequest('restaurant-1'));

      expect(profileService.clearLogo).toHaveBeenCalledWith({ restaurantId: 'restaurant-1' });
      expect(imageStorageService.deleteImageBestEffort).toHaveBeenCalledWith('/media/old.png');
    });
  });
});

describe('RestaurantProfileController.updateOrderingOptions', () => {
  /* eslint-disable @typescript-eslint/unbound-method */
  const handler = RestaurantProfileController.prototype.updateOrderingOptions;
  /* eslint-enable @typescript-eslint/unbound-method */

  it('declares the Restaurant-structural guard chain and restaurant.manage', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
    expect(guards).toEqual([
      AuthGuard,
      CsrfGuard,
      RestaurantAccessGuard,
      PermissionGuard,
      AllBranchesRequiredGuard,
    ]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toBe(
      PERMISSIONS.RESTAURANT_MANAGE,
    );
  });

  it('scopes by the authorized restaurantId and wraps the result in a data envelope', async () => {
    const service = {
      updateOrderingOptions: jest
        .fn()
        .mockResolvedValue({ pickupEnabled: false, deliveryEnabled: true }),
    };
    const controller = new RestaurantProfileController(service as never, {} as never);

    const body = await controller.updateOrderingOptions(
      { pickupEnabled: false },
      buildRequest('restaurant-1'),
    );

    expect(service.updateOrderingOptions).toHaveBeenCalledWith({
      restaurantId: 'restaurant-1',
      pickupEnabled: false,
      deliveryEnabled: undefined,
    });
    expect(body).toEqual({ data: { pickupEnabled: false, deliveryEnabled: true } });
  });
});

describe('RestaurantProfileController.updateQrStyle', () => {
  /* eslint-disable @typescript-eslint/unbound-method */
  const handler = RestaurantProfileController.prototype.updateQrStyle;
  /* eslint-enable @typescript-eslint/unbound-method */

  it('declares the Restaurant-structural guard chain and restaurant.manage', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
    expect(guards).toEqual([
      AuthGuard,
      CsrfGuard,
      RestaurantAccessGuard,
      PermissionGuard,
      AllBranchesRequiredGuard,
    ]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toBe(
      PERMISSIONS.RESTAURANT_MANAGE,
    );
  });

  it('wraps an accepted style in a data envelope, scoped by the authorized restaurantId', async () => {
    const style = {
      foregroundColor: '#14532D',
      backgroundColor: '#F0FDF4',
      showLogo: false,
      showName: true,
    };
    const service = {
      updateQrStyle: jest.fn().mockResolvedValue({ outcome: 'updated', data: style }),
    };
    const controller = new RestaurantProfileController(service as never, {} as never);

    const body = await controller.updateQrStyle(
      { foregroundColor: '#14532D' },
      buildRequest('restaurant-1'),
    );

    expect(service.updateQrStyle).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'restaurant-1', foregroundColor: '#14532D' }),
    );
    expect(body).toEqual({ data: style });
  });

  it('maps a refused style to 400 with its stable code', async () => {
    const service = {
      updateQrStyle: jest
        .fn()
        .mockResolvedValue({ outcome: 'invalid', code: 'QR_STYLE_LOW_CONTRAST' }),
    };
    const controller = new RestaurantProfileController(service as never, {} as never);

    await expect(
      controller.updateQrStyle({ foregroundColor: '#BBBBBB' }, buildRequest('restaurant-1')),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: { code: 'QR_STYLE_LOW_CONTRAST' } },
    });
  });
});
