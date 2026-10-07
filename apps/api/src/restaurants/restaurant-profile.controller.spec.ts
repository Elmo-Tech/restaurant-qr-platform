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
