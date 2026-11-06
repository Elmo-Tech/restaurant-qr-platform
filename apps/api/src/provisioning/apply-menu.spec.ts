import {
  applyMenuToExistingRestaurant,
  findRestaurantByOwnerEmail,
  type ApplyMenuPrisma,
} from './apply-menu';
import { seedMenu, type MenuSeed } from './seed-menu';

jest.mock('./seed-menu', () => ({ seedMenu: jest.fn() }));

const seedMenuMock = seedMenu as jest.MockedFunction<typeof seedMenu>;
const seed = { version: 1 } as unknown as MenuSeed;
const shop = { id: 'r-1', publicId: 'restaurant-1', name: 'Shop' };
const other = { id: 'r-2', publicId: 'restaurant-2', name: 'Other' };

function prismaDouble(options: {
  user?: { id: string } | null;
  owned?: Array<typeof shop>;
  menus?: number;
}) {
  const tx = {};
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.user === undefined ? { id: 'u-1' } : options.user),
    },
    restaurantMembership: {
      findMany: jest
        .fn()
        .mockResolvedValue((options.owned ?? [shop]).map((restaurant) => ({ restaurant }))),
    },
    menu: { count: jest.fn().mockResolvedValue(options.menus ?? 0) },
    $transaction: jest.fn((callback: (t: unknown) => unknown) => callback(tx)),
  };
  return { prisma: prisma as unknown as ApplyMenuPrisma, raw: prisma, tx };
}

const base = { seed, ownerEmail: 'Owner@Example.com', apply: true, replaceMenu: false };
const seeded = {
  outcome: 'seeded' as const,
  counts: { categories: 1, products: 1, variants: 0, modifierGroups: 0 },
  photos: 2,
  exclusiveDesign: 'assigned' as const,
  archivedMenus: 0,
  announcements: 1,
  deliveryZones: 0,
  offers: 0,
};

describe('applying a menu to an existing restaurant', () => {
  beforeEach(() => seedMenuMock.mockReset());

  it('finds the restaurant from the OWNER e-mail, normalized, and only through active OWNER memberships', async () => {
    const { prisma, raw } = prismaDouble({});
    const found = await findRestaurantByOwnerEmail(prisma, '  Owner@Example.com ');
    expect(found).toEqual({ outcome: 'found', restaurant: shop });
    expect((raw.user.findUnique.mock.calls as [[{ where: unknown }]])[0][0].where).toEqual({
      emailNormalized: 'owner@example.com',
    });
    expect((raw.restaurantMembership.findMany.mock.calls as [[{ where: unknown }]])[0][0].where).toEqual({
      userId: 'u-1',
      role: 'OWNER',
      status: 'ACTIVE',
    });
  });

  it('refuses an unknown owner, an owner without a restaurant and an ambiguous owner, writing nothing', async () => {
    const cases: Array<[Parameters<typeof prismaDouble>[0], string]> = [
      [{ user: null }, 'ownerNotFound'],
      [{ owned: [] }, 'noRestaurant'],
      [{ owned: [shop, other] }, 'ambiguous'],
    ];
    for (const [options, outcome] of cases) {
      const { prisma, raw } = prismaDouble(options);
      expect((await applyMenuToExistingRestaurant(prisma, base)).outcome).toBe(outcome);
      expect(raw.$transaction).not.toHaveBeenCalled();
    }
  });

  it('lets --restaurant pick one of several owned restaurants, and never a restaurant the owner does not own', async () => {
    const both = prismaDouble({ owned: [shop, other] });
    expect(
      await findRestaurantByOwnerEmail(both.prisma, 'o@x.com', 'restaurant-2'),
    ).toEqual({ outcome: 'found', restaurant: other });
    expect(
      await findRestaurantByOwnerEmail(both.prisma, 'o@x.com', 'restaurant-999'),
    ).toEqual({ outcome: 'noRestaurant' });
  });

  it('refuses a restaurant that already has a menu unless replace is asked for', async () => {
    const { prisma, raw } = prismaDouble({ menus: 2 });
    expect(await applyMenuToExistingRestaurant(prisma, base)).toEqual({
      outcome: 'menuExists',
      restaurant: shop,
      existingMenus: 2,
    });
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it('a dry run only reads', async () => {
    const { prisma, raw } = prismaDouble({ menus: 0 });
    expect(await applyMenuToExistingRestaurant(prisma, { ...base, apply: false })).toEqual({
      outcome: 'dryRun',
      restaurant: shop,
      existingMenus: 0,
      willReplace: false,
    });
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it('applies inside one transaction for exactly the resolved restaurant and passes the replace choice through', async () => {
    seedMenuMock.mockResolvedValue({ ...seeded, archivedMenus: 1 });
    const { prisma, raw, tx } = prismaDouble({ menus: 1 });
    const outcome = await applyMenuToExistingRestaurant(prisma, { ...base, replaceMenu: true });
    expect(outcome).toMatchObject({ outcome: 'applied', restaurant: shop });
    expect(raw.$transaction).toHaveBeenCalledTimes(1);
    expect(seedMenuMock).toHaveBeenCalledWith(tx, 'r-1', seed, undefined, { replaceMenu: true });
  });

  it('removes the photos it already wrote when the transaction fails', async () => {
    seedMenuMock.mockImplementation(async (_tx, _id, _seed, assets) => {
      await assets!.store('a.jpg');
      await assets!.store('b.jpg');
      throw new Error('boom');
    });
    const { prisma } = prismaDouble({});
    const discard = jest.fn().mockResolvedValue(undefined);
    const store = jest.fn((name: string) => Promise.resolve(`/media/${name}`));
    await expect(
      applyMenuToExistingRestaurant(prisma, { ...base, assets: { store, discard } }),
    ).rejects.toThrow('boom');
    expect(discard).toHaveBeenCalledWith(['/media/a.jpg', '/media/b.jpg']);
  });

  it('removes its photos and reports "menu exists" when another run filled the menu first', async () => {
    seedMenuMock.mockImplementation(async (_tx, _id, _seed, assets) => {
      await assets!.store('a.jpg');
      return { outcome: 'alreadySeeded' };
    });
    const { prisma } = prismaDouble({});
    const discard = jest.fn().mockResolvedValue(undefined);
    const outcome = await applyMenuToExistingRestaurant(prisma, {
      ...base,
      assets: { store: (name) => Promise.resolve(`/media/${name}`), discard },
    });
    expect(outcome.outcome).toBe('menuExists');
    expect(discard).toHaveBeenCalledWith(['/media/a.jpg']);
  });
});
