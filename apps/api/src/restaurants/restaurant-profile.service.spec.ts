import { RestaurantProfileService } from './restaurant-profile.service';

const RESTAURANT_ID = 'restaurant-1';

function buildMocks() {
  const findUniqueOrThrow = jest.fn().mockResolvedValue({ logoAssetPath: null });
  const update = jest
    .fn()
    .mockResolvedValue({ name: 'Cairo Bites', logoAssetPath: null, coverAssetPath: null });

  const prisma = {
    restaurant: { findUniqueOrThrow, update },
  };

  return { prisma, findUniqueOrThrow, update };
}

function buildService(mocks: ReturnType<typeof buildMocks>): RestaurantProfileService {
  return new RestaurantProfileService(mocks.prisma as never);
}

describe('RestaurantProfileService.updateProfile', () => {
  it('scopes the update by the exact authorized restaurantId (Tenant isolation)', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.updateProfile({ restaurantId: RESTAURANT_ID, name: 'New Name' });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { name: 'New Name' },
      select: { name: true, logoAssetPath: true, coverAssetPath: true },
    });
  });

  it('never writes logoAssetPath, currencyCode, or status', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    await service.updateProfile({ restaurantId: RESTAURANT_ID, name: 'New Name' });

    const args = mocks.update.mock.calls[0][0];
    expect(Object.keys(args.data)).toEqual(['name']);
  });
});

describe('RestaurantProfileService.setLogo', () => {
  it('persists the new logoAssetPath scoped by restaurantId and returns the previous one', async () => {
    const mocks = buildMocks();
    mocks.findUniqueOrThrow.mockResolvedValue({ logoAssetPath: '/media/old.png' });
    mocks.update.mockResolvedValue({ name: 'Cairo Bites', logoAssetPath: '/media/new.png' });
    const service = buildService(mocks);

    const result = await service.setLogo({ restaurantId: RESTAURANT_ID, imageAssetPath: '/media/new.png' });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { logoAssetPath: '/media/new.png' },
      select: { name: true, logoAssetPath: true, coverAssetPath: true },
    });
    expect(result).toEqual({
      data: { name: 'Cairo Bites', logoAssetPath: '/media/new.png' },
      previousLogoAssetPath: '/media/old.png',
    });
  });

  it('reports previousLogoAssetPath: null when no logo existed before', async () => {
    const mocks = buildMocks();
    const service = buildService(mocks);

    const result = await service.setLogo({ restaurantId: RESTAURANT_ID, imageAssetPath: '/media/new.png' });

    expect(result.previousLogoAssetPath).toBeNull();
  });
});

describe('RestaurantProfileService.clearLogo', () => {
  it('sets logoAssetPath to null and reports the previous value', async () => {
    const mocks = buildMocks();
    mocks.findUniqueOrThrow.mockResolvedValue({ logoAssetPath: '/media/old.png' });
    const service = buildService(mocks);

    const result = await service.clearLogo({ restaurantId: RESTAURANT_ID });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { logoAssetPath: null },
    });
    expect(result).toEqual({ previousLogoAssetPath: '/media/old.png' });
  });

  it('is a no-op write when there is already no logo (idempotent)', async () => {
    const mocks = buildMocks();
    mocks.findUniqueOrThrow.mockResolvedValue({ logoAssetPath: null });
    const service = buildService(mocks);

    const result = await service.clearLogo({ restaurantId: RESTAURANT_ID });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(result).toEqual({ previousLogoAssetPath: null });
  });
});

describe('RestaurantProfileService cover image', () => {
  it('setCover persists coverAssetPath scoped by restaurantId, never touching the logo, and returns the previous cover', async () => {
    const mocks = buildMocks();
    mocks.findUniqueOrThrow.mockResolvedValue({ coverAssetPath: '/media/old-cover.jpg' });
    mocks.update.mockResolvedValue({
      name: 'Cairo Bites',
      logoAssetPath: '/media/logo.png',
      coverAssetPath: '/media/new-cover.jpg',
    });
    const service = buildService(mocks);

    const result = await service.setCover({
      restaurantId: RESTAURANT_ID,
      imageAssetPath: '/media/new-cover.jpg',
    });

    expect(mocks.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      select: { coverAssetPath: true },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { coverAssetPath: '/media/new-cover.jpg' },
      select: { name: true, logoAssetPath: true, coverAssetPath: true },
    });
    expect(result.previousCoverAssetPath).toBe('/media/old-cover.jpg');
    expect(result.data.coverAssetPath).toBe('/media/new-cover.jpg');
  });

  it('clearCover nulls the cover and reports the previous value', async () => {
    const mocks = buildMocks();
    mocks.findUniqueOrThrow.mockResolvedValue({ coverAssetPath: '/media/old-cover.jpg' });
    const service = buildService(mocks);

    const result = await service.clearCover({ restaurantId: RESTAURANT_ID });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: RESTAURANT_ID },
      data: { coverAssetPath: null },
    });
    expect(result).toEqual({ previousCoverAssetPath: '/media/old-cover.jpg' });
  });

  it('clearCover is an idempotent no-op write when there is no cover', async () => {
    const mocks = buildMocks();
    mocks.findUniqueOrThrow.mockResolvedValue({ coverAssetPath: null });
    const service = buildService(mocks);

    const result = await service.clearCover({ restaurantId: RESTAURANT_ID });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(result).toEqual({ previousCoverAssetPath: null });
  });
});
