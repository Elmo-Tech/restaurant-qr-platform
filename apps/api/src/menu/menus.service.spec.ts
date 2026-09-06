import { Prisma } from '../generated/prisma/client';
import { MenusService } from './menus.service';

const RESTAURANT_ID = 'restaurant-1';
const DEFAULT_LOCALE = 'ar';

function buildOnePrimaryMenuRaceError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      driverAdapterError: {
        cause: { constraint: { index: 'menus_one_primary_menu' } },
      },
    },
  });
}

function buildOtherUniqueRaceError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      driverAdapterError: {
        cause: { constraint: { index: 'some_other_unique_index' } },
      },
    },
  });
}

const WELL_FORMED_UUID = '11111111-1111-4111-8111-111111111111';

function buildPrismaMock() {
  const restaurantFindUniqueOrThrow = jest
    .fn()
    .mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
  const menuFindMany = jest.fn().mockResolvedValue([]);
  const menuCount = jest.fn().mockResolvedValue(0);
  const menuCreate = jest.fn();
  const menuFindFirst = jest.fn().mockResolvedValue({ id: 'menu-1' });
  const menuUpdate = jest.fn();
  const menuUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const menuFindUniqueOrThrow = jest.fn();
  const menuTranslationCreate = jest.fn();
  const menuTranslationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const menuTranslationFindFirstOrThrow = jest.fn();

  const txClient = {
    menu: {
      count: menuCount,
      create: menuCreate,
      findFirst: menuFindFirst,
      update: menuUpdate,
      updateMany: menuUpdateMany,
      findUniqueOrThrow: menuFindUniqueOrThrow,
    },
    menuTranslation: {
      create: menuTranslationCreate,
      updateMany: menuTranslationUpdateMany,
      findFirstOrThrow: menuTranslationFindFirstOrThrow,
    },
  };

  const $transaction = jest.fn((callback: (tx: typeof txClient) => unknown) =>
    Promise.resolve(callback(txClient)),
  );

  return {
    prisma: {
      restaurant: { findUniqueOrThrow: restaurantFindUniqueOrThrow },
      menu: { findMany: menuFindMany },
      $transaction,
    },
    restaurantFindUniqueOrThrow,
    menuFindMany,
    menuCount,
    menuCreate,
    menuFindFirst,
    menuUpdate,
    menuUpdateMany,
    menuFindUniqueOrThrow,
    menuTranslationCreate,
    menuTranslationUpdateMany,
    menuTranslationFindFirstOrThrow,
    $transaction,
  };
}

function buildService(mock: ReturnType<typeof buildPrismaMock>): MenusService {
  return new MenusService(mock.prisma as never);
}

describe('MenusService', () => {
  describe('listMenus', () => {
    it('scopes the query by restaurantId and orders by displayOrder asc, id asc', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      await service.listMenus({ restaurantId: RESTAURANT_ID });

      expect(mock.menuFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: RESTAURANT_ID },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('returns an empty array as data when there are no Menus', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.listMenus({ restaurantId: RESTAURANT_ID });

      expect(result).toEqual([]);
    });

    it("maps each Menu's own default-locale translation row", async () => {
      const mock = buildPrismaMock();
      mock.menuFindMany.mockResolvedValue([
        {
          id: 'menu-1',
          nameInternal: 'Main',
          status: 'ACTIVE',
          displayOrder: 0,
          isPrimary: true,
          translations: [
            { locale: DEFAULT_LOCALE, name: 'الرئيسية', description: null },
          ],
        },
      ]);
      const service = buildService(mock);

      const result = await service.listMenus({ restaurantId: RESTAURANT_ID });

      expect(result).toEqual([
        {
          id: 'menu-1',
          nameInternal: 'Main',
          status: 'ACTIVE',
          displayOrder: 0,
          isPrimary: true,
          translation: {
            locale: DEFAULT_LOCALE,
            name: 'الرئيسية',
            description: null,
          },
        },
      ]);
    });
  });

  describe('createMenu', () => {
    const baseInput = {
      restaurantId: RESTAURANT_ID,
      nameInternal: 'Main Menu',
      name: 'القائمة الرئيسية',
      description: null,
      status: 'ACTIVE' as const,
      displayOrder: 0,
    };

    it('the first Menu for a Restaurant becomes isPrimary=true', async () => {
      const mock = buildPrismaMock();
      mock.menuCount.mockResolvedValue(0);
      mock.menuCreate.mockResolvedValue({
        id: 'menu-1',
        nameInternal: baseInput.nameInternal,
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
      });
      mock.menuTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      await service.createMenu(baseInput);

      expect(mock.menuCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            restaurantId: RESTAURANT_ID,
            nameInternal: baseInput.nameInternal,
            status: 'ACTIVE',
            displayOrder: 0,
            isPrimary: true,
          },
        }),
      );
    });

    it('a later Menu for a Restaurant that already has one becomes isPrimary=false', async () => {
      const mock = buildPrismaMock();
      mock.menuCount.mockResolvedValue(1);
      mock.menuCreate.mockResolvedValue({
        id: 'menu-2',
        nameInternal: baseInput.nameInternal,
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: false,
      });
      mock.menuTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      await service.createMenu(baseInput);

      expect(mock.menuCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            restaurantId: RESTAURANT_ID,
            nameInternal: baseInput.nameInternal,
            status: 'ACTIVE',
            displayOrder: 0,
            isPrimary: false,
          },
        }),
      );
    });

    it('never persists a Menu without its translation created in the same transaction', async () => {
      const mock = buildPrismaMock();
      mock.menuCreate.mockResolvedValue({
        id: 'menu-1',
        nameInternal: baseInput.nameInternal,
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
      });
      mock.menuTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      await service.createMenu(baseInput);

      expect(mock.$transaction).toHaveBeenCalledTimes(1);
      expect(mock.menuCreate).toHaveBeenCalledTimes(1);
      expect(mock.menuTranslationCreate).toHaveBeenCalledTimes(1);
      expect(mock.menuTranslationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            menuId: 'menu-1',
            locale: DEFAULT_LOCALE,
            name: baseInput.name,
            description: baseInput.description,
          },
        }),
      );
    });

    it('a losing concurrent first-Menu race (menus_one_primary_menu P2002) is retried once and resolves to isPrimary=false, never a raw Prisma error', async () => {
      const mock = buildPrismaMock();
      mock.menuCount
        .mockResolvedValueOnce(0) // attempt 1: this request also thinks it's first
        .mockResolvedValueOnce(1); // attempt 2 (retry): the winner has now committed
      mock.menuCreate
        .mockRejectedValueOnce(buildOnePrimaryMenuRaceError())
        .mockResolvedValueOnce({
          id: 'menu-2',
          nameInternal: baseInput.nameInternal,
          status: 'ACTIVE',
          displayOrder: 0,
          isPrimary: false,
        });
      mock.menuTranslationCreate.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: baseInput.name,
        description: null,
      });
      const service = buildService(mock);

      const result = await service.createMenu(baseInput);

      expect(mock.$transaction).toHaveBeenCalledTimes(2);
      expect(result.isPrimary).toBe(false);
    });

    it('a P2002 on an unrelated constraint is never treated as the primary-Menu race and rethrows immediately', async () => {
      const mock = buildPrismaMock();
      mock.menuCreate.mockRejectedValue(buildOtherUniqueRaceError());
      const service = buildService(mock);

      await expect(service.createMenu(baseInput)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('exhausting the bounded retry still surfaces a thrown error, never an unhandled hang', async () => {
      const mock = buildPrismaMock();
      mock.menuCreate.mockRejectedValue(buildOnePrimaryMenuRaceError());
      const service = buildService(mock);

      await expect(service.createMenu(baseInput)).rejects.toThrow();
      expect(mock.$transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateMenu', () => {
    it('a malformed menuId -> menuNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.updateMenu({
        restaurantId: RESTAURANT_ID,
        menuId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'menuNotFound' });
      expect(mock.restaurantFindUniqueOrThrow).not.toHaveBeenCalled();
      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('resolves the Menu by id AND restaurantId together, never id alone', async () => {
      const mock = buildPrismaMock();
      mock.menuUpdate.mockResolvedValue({
        id: 'menu-1',
        nameInternal: 'Main',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
      });
      mock.menuTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'الرئيسية',
        description: null,
      });
      const service = buildService(mock);

      await service.updateMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
      });

      expect(mock.menuFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID },
        }),
      );
    });

    it('unknown/foreign menuId -> menuNotFound, no update ever attempted', async () => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.updateMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({ outcome: 'menuNotFound' });
      expect(mock.menuUpdate).not.toHaveBeenCalled();
    });

    it('only supplied base fields are included in the Menu update data -- isPrimary can never appear', async () => {
      const mock = buildPrismaMock();
      mock.menuUpdate.mockResolvedValue({
        id: 'menu-1',
        nameInternal: 'Main',
        status: 'ACTIVE',
        displayOrder: 5,
        isPrimary: true,
      });
      mock.menuTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'الرئيسية',
        description: null,
      });
      const service = buildService(mock);

      await service.updateMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
        displayOrder: 5,
      });

      expect(mock.menuUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { displayOrder: 5 } }),
      );
    });

    it('supplying name/description updates the default-locale translation via updateMany, then re-reads it for the response', async () => {
      const mock = buildPrismaMock();
      mock.menuUpdate.mockResolvedValue({
        id: 'menu-1',
        nameInternal: 'Main',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
      });
      mock.menuTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'New Name',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.updateMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
        name: 'New Name',
      });

      expect(mock.menuTranslationUpdateMany).toHaveBeenCalledWith({
        where: { menuId: 'menu-1', locale: DEFAULT_LOCALE },
        data: { name: 'New Name' },
      });
      expect(result).toEqual({
        outcome: 'updated',
        data: expect.objectContaining({
          translation: {
            locale: DEFAULT_LOCALE,
            name: 'New Name',
            description: null,
          },
        }) as unknown,
      });
    });

    it('description: null clears the translation description', async () => {
      const mock = buildPrismaMock();
      mock.menuUpdate.mockResolvedValue({
        id: 'menu-1',
        nameInternal: 'Main',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
      });
      mock.menuTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'الرئيسية',
        description: null,
      });
      const service = buildService(mock);

      await service.updateMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
        description: null,
      });

      expect(mock.menuTranslationUpdateMany).toHaveBeenCalledWith({
        where: { menuId: 'menu-1', locale: DEFAULT_LOCALE },
        data: { description: null },
      });
    });

    it('omitting every field still performs a safe no-op Menu update and returns the current translation, using one transaction', async () => {
      const mock = buildPrismaMock();
      mock.menuUpdate.mockResolvedValue({
        id: 'menu-1',
        nameInternal: 'Main',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
      });
      mock.menuTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'الرئيسية',
        description: null,
      });
      const service = buildService(mock);

      await service.updateMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
      });

      expect(mock.menuUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: {} }),
      );
      expect(mock.menuTranslationUpdateMany).not.toHaveBeenCalled();
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('setPrimaryMenu', () => {
    it('a malformed menuId -> menuNotFound with zero database queries', async () => {
      const mock = buildPrismaMock();
      const service = buildService(mock);

      const result = await service.setPrimaryMenu({
        restaurantId: RESTAURANT_ID,
        menuId: 'not-a-uuid',
      });

      expect(result).toEqual({ outcome: 'menuNotFound' });
      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('resolves the target Menu by id AND restaurantId together, never id alone', async () => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue({ id: 'menu-2', isPrimary: false });
      mock.menuFindUniqueOrThrow.mockResolvedValue({
        id: 'menu-2',
        nameInternal: 'Second',
        status: 'ACTIVE',
        displayOrder: 1,
        isPrimary: true,
      });
      mock.menuTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'Second',
        description: null,
      });
      const service = buildService(mock);

      await service.setPrimaryMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
      });

      expect(mock.menuFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: WELL_FORMED_UUID, restaurantId: RESTAURANT_ID },
        }),
      );
    });

    it('unknown/foreign target menuId -> menuNotFound', async () => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue(null);
      const service = buildService(mock);

      const result = await service.setPrimaryMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
      });

      expect(result).toEqual({ outcome: 'menuNotFound' });
      expect(mock.menuUpdateMany).not.toHaveBeenCalled();
      expect(mock.menuUpdate).not.toHaveBeenCalled();
    });

    it('an already-primary target is idempotent -- no unset/set write at all', async () => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue({ id: 'menu-1', isPrimary: true });
      mock.menuFindUniqueOrThrow.mockResolvedValue({
        id: 'menu-1',
        nameInternal: 'Main',
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
      });
      mock.menuTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'الرئيسية',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.setPrimaryMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
      });

      expect(mock.menuUpdateMany).not.toHaveBeenCalled();
      expect(mock.menuUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({
        outcome: 'updated',
        data: expect.objectContaining({ isPrimary: true }) as unknown,
      });
    });

    it('a non-primary target unsets the Restaurant-scoped current primary, then sets the target, inside one transaction', async () => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue({ id: 'menu-2', isPrimary: false });
      mock.menuFindUniqueOrThrow.mockResolvedValue({
        id: 'menu-2',
        nameInternal: 'Second',
        status: 'ACTIVE',
        displayOrder: 1,
        isPrimary: true,
      });
      mock.menuTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'Second',
        description: null,
      });
      const service = buildService(mock);

      await service.setPrimaryMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
      });

      expect(mock.menuUpdateMany).toHaveBeenCalledWith({
        where: { restaurantId: RESTAURANT_ID, isPrimary: true },
        data: { isPrimary: false },
      });
      expect(mock.menuUpdate).toHaveBeenCalledWith({
        where: { id: 'menu-2' },
        data: { isPrimary: true },
      });
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('a losing concurrent Set-Primary race (menus_one_primary_menu P2002) is retried once and resolves correctly, never a raw Prisma error', async () => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue({ id: 'menu-2', isPrimary: false });
      mock.menuUpdate
        .mockRejectedValueOnce(buildOnePrimaryMenuRaceError())
        .mockResolvedValueOnce({ id: 'menu-2', isPrimary: true });
      mock.menuFindUniqueOrThrow.mockResolvedValue({
        id: 'menu-2',
        nameInternal: 'Second',
        status: 'ACTIVE',
        displayOrder: 1,
        isPrimary: true,
      });
      mock.menuTranslationFindFirstOrThrow.mockResolvedValue({
        locale: DEFAULT_LOCALE,
        name: 'Second',
        description: null,
      });
      const service = buildService(mock);

      const result = await service.setPrimaryMenu({
        restaurantId: RESTAURANT_ID,
        menuId: WELL_FORMED_UUID,
      });

      expect(mock.$transaction).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        outcome: 'updated',
        data: expect.objectContaining({ isPrimary: true }) as unknown,
      });
    });

    it('a P2002 on an unrelated constraint is never treated as the primary-Menu race and rethrows immediately', async () => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue({ id: 'menu-2', isPrimary: false });
      mock.menuUpdate.mockRejectedValue(buildOtherUniqueRaceError());
      const service = buildService(mock);

      await expect(
        service.setPrimaryMenu({
          restaurantId: RESTAURANT_ID,
          menuId: WELL_FORMED_UUID,
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('exhausting the bounded retry on repeated contention still surfaces the thrown error, never silently swallowed', async () => {
      const mock = buildPrismaMock();
      mock.menuFindFirst.mockResolvedValue({ id: 'menu-2', isPrimary: false });
      mock.menuUpdate.mockRejectedValue(buildOnePrimaryMenuRaceError());
      const service = buildService(mock);

      await expect(
        service.setPrimaryMenu({
          restaurantId: RESTAURANT_ID,
          menuId: WELL_FORMED_UUID,
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
      expect(mock.$transaction).toHaveBeenCalledTimes(2);
    });
  });
});
