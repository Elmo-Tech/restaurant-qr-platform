import { MenusService } from './menus.service';

const RESTAURANT_ID = 'restaurant-one';
const MENU_ID = '11111111-1111-4111-8111-111111111111';
const NEW_MENU_ID = '22222222-2222-4222-8222-222222222222';

function build() {
  const tx = {
    menu: {
      findFirst: jest.fn().mockResolvedValue({
        id: MENU_ID,
        isPrimary: true,
        status: 'ACTIVE',
        displayOrder: 0,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: NEW_MENU_ID }),
    },
    menuImportJob: { count: jest.fn().mockResolvedValue(0) },
    category: { count: jest.fn().mockResolvedValue(3) },
    restaurant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ defaultLocale: 'ar' }),
    },
    menuTranslation: { create: jest.fn().mockResolvedValue({}) },
  };
  const db = {
    $transaction: jest.fn((fn: (tx: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { tx, db, service: new MenusService(db as never) };
}

describe('Start fresh with an empty primary Menu', () => {
  it('rejects malformed Menu ID before any database transaction', async () => {
    const m = build();
    await expect(m.service.startFreshMenu({
      restaurantId: RESTAURANT_ID,
      expectedPrimaryMenuId: 'bad',
    })).resolves.toEqual({ outcome: 'menuNotFound' });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it('does not expose another Restaurant menu or make any writes', async () => {
    const m = build();
    m.tx.menu.findFirst.mockResolvedValue(null);
    await expect(m.service.startFreshMenu({
      restaurantId: RESTAURANT_ID,
      expectedPrimaryMenuId: MENU_ID,
    })).resolves.toEqual({ outcome: 'menuNotFound' });
    expect(m.tx.menu.findFirst).toHaveBeenCalledWith({
      where: { id: MENU_ID, restaurantId: RESTAURANT_ID },
      select: { id: true, isPrimary: true, status: true, displayOrder: true },
    });
    expect(m.tx.menu.updateMany).not.toHaveBeenCalled();
    expect(m.tx.menu.create).not.toHaveBeenCalled();
  });

  it('refuses to archive a stale or inactive primary Menu', async () => {
    const m = build();
    m.tx.menu.findFirst.mockResolvedValue({
      id: MENU_ID, isPrimary: false, status: 'INACTIVE', displayOrder: 0,
    });
    await expect(m.service.startFreshMenu({
      restaurantId: RESTAURANT_ID,
      expectedPrimaryMenuId: MENU_ID,
    })).resolves.toEqual({ outcome: 'menuChanged' });
    expect(m.tx.menu.updateMany).not.toHaveBeenCalled();
  });

  it('blocks pending AI import before archiving a target Menu', async () => {
    const m = build();
    m.tx.menuImportJob.count.mockResolvedValue(1);
    await expect(m.service.startFreshMenu({
      restaurantId: RESTAURANT_ID,
      expectedPrimaryMenuId: MENU_ID,
    })).resolves.toEqual({ outcome: 'activeImport' });
    expect(m.tx.menuImportJob.count).toHaveBeenCalledWith({
      where: {
        restaurantId: RESTAURANT_ID,
        targetMenuId: MENU_ID,
        status: { in: ['PROCESSING', 'READY_FOR_REVIEW'] },
      },
    });
    expect(m.tx.menu.create).not.toHaveBeenCalled();
  });

  it('is a no-op when the selected current primary already has no Categories', async () => {
    const m = build();
    m.tx.category.count.mockResolvedValue(0);
    await expect(m.service.startFreshMenu({
      restaurantId: RESTAURANT_ID,
      expectedPrimaryMenuId: MENU_ID,
    })).resolves.toEqual({ outcome: 'alreadyEmpty', menuId: MENU_ID });
    expect(m.tx.menu.updateMany).not.toHaveBeenCalled();
  });

  it('archives current primary and creates an empty Arabic menu in one transaction', async () => {
    const m = build();
    await expect(m.service.startFreshMenu({
      restaurantId: RESTAURANT_ID,
      expectedPrimaryMenuId: MENU_ID,
    })).resolves.toEqual({ outcome: 'started', menuId: NEW_MENU_ID });

    expect(m.db.$transaction).toHaveBeenCalledTimes(1);
    expect(m.tx.menu.updateMany).toHaveBeenCalledWith({
      where: { id: MENU_ID, restaurantId: RESTAURANT_ID, isPrimary: true, status: 'ACTIVE' },
      data: { isPrimary: false, status: 'INACTIVE' },
    });
    expect(m.tx.menu.create).toHaveBeenCalledWith({
      data: {
        restaurantId: RESTAURANT_ID,
        nameInternal: 'New Menu',
        status: 'ACTIVE',
        isPrimary: true,
        displayOrder: 0,
      },
      select: { id: true },
    });
    expect(m.tx.menuTranslation.create).toHaveBeenCalledWith({
      data: { menuId: NEW_MENU_ID, locale: 'ar', name: 'منيو جديدة', description: null },
    });
    // No Product, Category, Order or historical snapshots are deleted.
    expect(Object.keys(m.tx).sort()).toEqual([
      'menu', 'menuImportJob', 'category', 'restaurant', 'menuTranslation',
    ].sort());
  });

  it('does not create a replacement when a concurrent operation changed the primary', async () => {
    const m = build();
    m.tx.menu.updateMany.mockResolvedValue({ count: 0 });
    await expect(m.service.startFreshMenu({
      restaurantId: RESTAURANT_ID,
      expectedPrimaryMenuId: MENU_ID,
    })).resolves.toEqual({ outcome: 'menuChanged' });
    expect(m.tx.menu.create).not.toHaveBeenCalled();
  });

  it('produces an English blank menu when English is the default locale', async () => {
    const m = build();
    m.tx.restaurant.findUniqueOrThrow.mockResolvedValue({ defaultLocale: 'en' });
    await m.service.startFreshMenu({
      restaurantId: RESTAURANT_ID,
      expectedPrimaryMenuId: MENU_ID,
    });
    expect(m.tx.menuTranslation.create).toHaveBeenCalledWith({
      data: { menuId: NEW_MENU_ID, locale: 'en', name: 'New Menu', description: null },
    });
  });
});
