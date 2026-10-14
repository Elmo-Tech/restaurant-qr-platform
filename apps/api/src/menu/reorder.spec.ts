import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import type { RestaurantAuthorizedRequest } from '../auth/guard/restaurant-authorized-request';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { PERMISSIONS } from '../auth/permission/permission';
import { REQUIRED_PERMISSION_KEY } from '../auth/permission/require-permission.decorator';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * Menu management drag-and-drop ordering: `PUT .../categories/order` and
 * `PUT .../products/order`. The order is the full desired list; the service
 * accepts it only when it is exactly the parent's current set, writes
 * `displayOrder = position`, and is Tenant-scoped.
 */

const RESTAURANT_ID = 'restaurant-1';
const MENU_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function buildTx(rows: { id: string; displayOrder: number }[]) {
  const parentFindFirst = jest.fn().mockResolvedValue({ id: 'parent' });
  const childFindMany = jest.fn().mockResolvedValue(rows);
  const childUpdate = jest.fn().mockResolvedValue({});
  return { parentFindFirst, childFindMany, childUpdate };
}

describe('CategoriesService.reorderCategories', () => {
  function build(rows: { id: string; displayOrder: number }[], menuExists = true) {
    const tx = buildTx(rows);
    if (!menuExists) tx.parentFindFirst.mockResolvedValue(null);
    const client = {
      menu: { findFirst: tx.parentFindFirst },
      category: { findMany: tx.childFindMany, update: tx.childUpdate },
    };
    const prisma = {
      $transaction: jest.fn((cb: (c: typeof client) => unknown) =>
        Promise.resolve(cb(client)),
      ),
    };
    return { tx, service: new CategoriesService(prisma as never) };
  }

  const rows = [
    { id: A, displayOrder: 0 },
    { id: B, displayOrder: 1 },
    { id: C, displayOrder: 2 },
  ];

  it('writes displayOrder = position, only for the rows that moved', async () => {
    const { tx, service } = build(rows);

    const result = await service.reorderCategories({
      restaurantId: RESTAURANT_ID,
      menuId: MENU_ID,
      categoryIds: [C, A, B],
    });

    expect(result).toEqual({ outcome: 'reordered', data: { categoryIds: [C, A, B] } });
    expect(tx.childUpdate).toHaveBeenCalledTimes(3);
    expect(tx.childUpdate).toHaveBeenCalledWith({ where: { id: C }, data: { displayOrder: 0 } });
    expect(tx.childUpdate).toHaveBeenCalledWith({ where: { id: A }, data: { displayOrder: 1 } });
    expect(tx.childUpdate).toHaveBeenCalledWith({ where: { id: B }, data: { displayOrder: 2 } });
  });

  it('skips rows already in place', async () => {
    const { tx, service } = build(rows);

    await service.reorderCategories({
      restaurantId: RESTAURANT_ID,
      menuId: MENU_ID,
      categoryIds: [A, C, B],
    });

    expect(tx.childUpdate).toHaveBeenCalledTimes(2);
    expect(tx.childUpdate).not.toHaveBeenCalledWith({
      where: { id: A },
      data: { displayOrder: 0 },
    });
  });

  it('scopes the Menu and the Categories by the authorized restaurantId', async () => {
    const { tx, service } = build(rows);

    await service.reorderCategories({
      restaurantId: RESTAURANT_ID,
      menuId: MENU_ID,
      categoryIds: [A, B, C],
    });

    expect(tx.parentFindFirst).toHaveBeenCalledWith({
      where: { id: MENU_ID, restaurantId: RESTAURANT_ID },
      select: { id: true },
    });
    expect(tx.childFindMany).toHaveBeenCalledWith({
      where: { menuId: MENU_ID, restaurantId: RESTAURANT_ID },
      select: { id: true, displayOrder: true },
    });
  });

  it('refuses a list that is not exactly the current set (missing one), writing nothing', async () => {
    const { tx, service } = build(rows);

    const result = await service.reorderCategories({
      restaurantId: RESTAURANT_ID,
      menuId: MENU_ID,
      categoryIds: [A, B],
    });

    expect(result).toEqual({ outcome: 'orderMismatch' });
    expect(tx.childUpdate).not.toHaveBeenCalled();
  });

  it('refuses an unknown or foreign id in the list, writing nothing', async () => {
    const { tx, service } = build(rows);

    const result = await service.reorderCategories({
      restaurantId: RESTAURANT_ID,
      menuId: MENU_ID,
      categoryIds: [A, B, '99999999-9999-4999-8999-999999999999'],
    });

    expect(result).toEqual({ outcome: 'orderMismatch' });
    expect(tx.childUpdate).not.toHaveBeenCalled();
  });

  it('an unknown or foreign Menu is menuNotFound', async () => {
    const { tx, service } = build(rows, false);

    const result = await service.reorderCategories({
      restaurantId: RESTAURANT_ID,
      menuId: MENU_ID,
      categoryIds: [A, B, C],
    });

    expect(result).toEqual({ outcome: 'menuNotFound' });
    expect(tx.childFindMany).not.toHaveBeenCalled();
  });
});

describe('ProductsService.reorderProducts', () => {
  function build(rows: { id: string; displayOrder: number }[], categoryExists = true) {
    const tx = buildTx(rows);
    if (!categoryExists) tx.parentFindFirst.mockResolvedValue(null);
    const client = {
      category: { findFirst: tx.parentFindFirst },
      product: { findMany: tx.childFindMany, update: tx.childUpdate },
    };
    const prisma = {
      $transaction: jest.fn((cb: (c: typeof client) => unknown) =>
        Promise.resolve(cb(client)),
      ),
    };
    return { tx, service: new ProductsService(prisma as never) };
  }

  const rows = [
    { id: A, displayOrder: 5 },
    { id: B, displayOrder: 5 },
  ];

  it('normalizes displayOrder to the position, even when stored values collide', async () => {
    const { tx, service } = build(rows);

    const result = await service.reorderProducts({
      restaurantId: RESTAURANT_ID,
      categoryId: CATEGORY_ID,
      productIds: [B, A],
    });

    expect(result).toEqual({ outcome: 'reordered', data: { productIds: [B, A] } });
    expect(tx.childUpdate).toHaveBeenCalledWith({ where: { id: B }, data: { displayOrder: 0 } });
    expect(tx.childUpdate).toHaveBeenCalledWith({ where: { id: A }, data: { displayOrder: 1 } });
  });

  it('scopes the Category and the Products by the authorized restaurantId', async () => {
    const { tx, service } = build(rows);

    await service.reorderProducts({
      restaurantId: RESTAURANT_ID,
      categoryId: CATEGORY_ID,
      productIds: [A, B],
    });

    expect(tx.parentFindFirst).toHaveBeenCalledWith({
      where: { id: CATEGORY_ID, restaurantId: RESTAURANT_ID },
      select: { id: true },
    });
    expect(tx.childFindMany).toHaveBeenCalledWith({
      where: { categoryId: CATEGORY_ID, restaurantId: RESTAURANT_ID },
      select: { id: true, displayOrder: true },
    });
  });

  it('refuses a stale list, writing nothing', async () => {
    const { tx, service } = build(rows);

    const result = await service.reorderProducts({
      restaurantId: RESTAURANT_ID,
      categoryId: CATEGORY_ID,
      productIds: [A, B, C],
    });

    expect(result).toEqual({ outcome: 'orderMismatch' });
    expect(tx.childUpdate).not.toHaveBeenCalled();
  });

  it('an unknown or foreign Category is categoryNotFound', async () => {
    const { service } = build(rows, false);

    const result = await service.reorderProducts({
      restaurantId: RESTAURANT_ID,
      categoryId: CATEGORY_ID,
      productIds: [A, B],
    });

    expect(result).toEqual({ outcome: 'categoryNotFound' });
  });
});

describe('reorder controllers', () => {
  const request = {
    restaurantAccess: { restaurantId: 'authorized-restaurant' },
  } as unknown as RestaurantAuthorizedRequest;

  /* eslint-disable @typescript-eslint/unbound-method */
  const categoriesHandler = CategoriesController.prototype.reorderCategories;
  const productsHandler = ProductsController.prototype.reorderProducts;
  /* eslint-enable @typescript-eslint/unbound-method */

  it.each([
    ['categories', categoriesHandler],
    ['products', productsHandler],
  ] as const)(
    '%s: Restaurant-structural guard chain and menu.manage',
    (_name, handler) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        AuthGuard,
        CsrfGuard,
        RestaurantAccessGuard,
        PermissionGuard,
        AllBranchesRequiredGuard,
      ]);
      expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler)).toBe(
        PERMISSIONS.MENU_MANAGE,
      );
    },
  );

  it('categories: uses the authorized restaurantId and maps outcomes', async () => {
    const service = { reorderCategories: jest.fn() };
    const controller = new CategoriesController(service as never, {} as never);

    service.reorderCategories.mockResolvedValue({
      outcome: 'reordered',
      data: { categoryIds: [A] },
    });
    await expect(
      controller.reorderCategories({ menuId: MENU_ID, categoryIds: [A] }, request),
    ).resolves.toEqual({ data: { categoryIds: [A] } });
    expect(service.reorderCategories).toHaveBeenCalledWith({
      restaurantId: 'authorized-restaurant',
      menuId: MENU_ID,
      categoryIds: [A],
    });

    service.reorderCategories.mockResolvedValue({ outcome: 'menuNotFound' });
    await expect(
      controller.reorderCategories({ menuId: MENU_ID, categoryIds: [A] }, request),
    ).rejects.toBeInstanceOf(NotFoundException);

    service.reorderCategories.mockResolvedValue({ outcome: 'orderMismatch' });
    await expect(
      controller.reorderCategories({ menuId: MENU_ID, categoryIds: [A] }, request),
    ).rejects.toMatchObject({
      response: { error: { code: 'ORDER_MISMATCH' } },
    });
    await expect(
      controller.reorderCategories({ menuId: MENU_ID, categoryIds: [A] }, request),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('products: uses the authorized restaurantId and maps outcomes', async () => {
    const service = { reorderProducts: jest.fn() };
    const controller = new ProductsController(service as never, {} as never);

    service.reorderProducts.mockResolvedValue({
      outcome: 'reordered',
      data: { productIds: [A] },
    });
    await expect(
      controller.reorderProducts({ categoryId: CATEGORY_ID, productIds: [A] }, request),
    ).resolves.toEqual({ data: { productIds: [A] } });
    expect(service.reorderProducts).toHaveBeenCalledWith({
      restaurantId: 'authorized-restaurant',
      categoryId: CATEGORY_ID,
      productIds: [A],
    });

    service.reorderProducts.mockResolvedValue({ outcome: 'categoryNotFound' });
    await expect(
      controller.reorderProducts({ categoryId: CATEGORY_ID, productIds: [A] }, request),
    ).rejects.toBeInstanceOf(NotFoundException);

    service.reorderProducts.mockResolvedValue({ outcome: 'orderMismatch' });
    await expect(
      controller.reorderProducts({ categoryId: CATEGORY_ID, productIds: [A] }, request),
    ).rejects.toMatchObject({
      response: { error: { code: 'ORDER_MISMATCH' } },
    });
  });
});
