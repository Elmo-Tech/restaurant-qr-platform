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

function buildPrismaMock() {
  const restaurantFindUniqueOrThrow = jest
    .fn()
    .mockResolvedValue({ defaultLocale: DEFAULT_LOCALE });
  const menuFindMany = jest.fn().mockResolvedValue([]);
  const menuCount = jest.fn().mockResolvedValue(0);
  const menuCreate = jest.fn();
  const menuTranslationCreate = jest.fn();

  const txClient = {
    menu: { count: menuCount, create: menuCreate },
    menuTranslation: { create: menuTranslationCreate },
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
    menuTranslationCreate,
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
});
