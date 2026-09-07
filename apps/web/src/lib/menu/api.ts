import { apiFetch } from '../api/client';
import type {
  Category,
  CategoryStatus,
  Menu,
  MenuStatus,
  Product,
  ProductAvailability,
  ProductStatus,
} from './types';

/**
 * Thin Menu/Category/Product request layer (Batch H, Section 8): each
 * function calls the one documented Backend route exactly, using the
 * existing `apiFetch` transport -- no generic repository-wide SDK, no
 * second API abstraction. Every payload here matches the Backend DTO's
 * writable-field set exactly (API_CONVENTIONS.md); fields the DTOs strip or
 * reject (`restaurantId`, `isPrimary`, `locale`, `publicId`,
 * `primaryImageAssetPath`, timestamps) are never sent.
 */

function restaurantPath(restaurantId: string): string {
  return `/restaurants/${restaurantId}`;
}

export async function listMenus(restaurantId: string): Promise<Menu[]> {
  const body = await apiFetch<{ data: Menu[] }>(
    `${restaurantPath(restaurantId)}/menus`,
  );
  return body.data;
}

export interface CreateMenuInput {
  nameInternal: string;
  name: string;
  description?: string | null;
  status: MenuStatus;
  displayOrder: number;
}

export async function createMenu(
  restaurantId: string,
  input: CreateMenuInput,
): Promise<Menu> {
  const body = await apiFetch<{ data: Menu }>(
    `${restaurantPath(restaurantId)}/menus`,
    { method: 'POST', body: input },
  );
  return body.data;
}

export interface UpdateMenuInput {
  nameInternal?: string;
  name?: string;
  description?: string | null;
  status?: MenuStatus;
  displayOrder?: number;
}

export async function updateMenu(
  restaurantId: string,
  menuId: string,
  input: UpdateMenuInput,
): Promise<Menu> {
  const body = await apiFetch<{ data: Menu }>(
    `${restaurantPath(restaurantId)}/menus/${menuId}`,
    { method: 'PATCH', body: input },
  );
  return body.data;
}

/** No meaningful request body -- the Backend alone performs the primary switch (Section 12). */
export async function setPrimaryMenu(
  restaurantId: string,
  menuId: string,
): Promise<Menu> {
  const body = await apiFetch<{ data: Menu }>(
    `${restaurantPath(restaurantId)}/menus/${menuId}/primary`,
    { method: 'PATCH', body: {} },
  );
  return body.data;
}

export async function listCategories(
  restaurantId: string,
  menuId: string,
): Promise<Category[]> {
  const body = await apiFetch<{ data: Category[] }>(
    `${restaurantPath(restaurantId)}/categories?menuId=${menuId}`,
  );
  return body.data;
}

export interface CreateCategoryInput {
  menuId: string;
  name: string;
  description?: string | null;
  status: CategoryStatus;
  displayOrder: number;
}

export async function createCategory(
  restaurantId: string,
  input: CreateCategoryInput,
): Promise<Category> {
  const body = await apiFetch<{ data: Category }>(
    `${restaurantPath(restaurantId)}/categories`,
    { method: 'POST', body: input },
  );
  return body.data;
}

export interface UpdateCategoryInput {
  menuId?: string;
  name?: string;
  description?: string | null;
  status?: CategoryStatus;
  displayOrder?: number;
}

export async function updateCategory(
  restaurantId: string,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const body = await apiFetch<{ data: Category }>(
    `${restaurantPath(restaurantId)}/categories/${categoryId}`,
    { method: 'PATCH', body: input },
  );
  return body.data;
}

export async function listProducts(
  restaurantId: string,
  categoryId: string,
): Promise<Product[]> {
  const body = await apiFetch<{ data: Product[] }>(
    `${restaurantPath(restaurantId)}/products?categoryId=${categoryId}`,
  );
  return body.data;
}

export interface CreateProductInput {
  categoryId: string;
  name: string;
  description?: string | null;
  status: ProductStatus;
  availability: ProductAvailability;
  basePrice: string;
  displayOrder: number;
  allowCustomerNotes: boolean;
  featured: boolean;
}

export async function createProduct(
  restaurantId: string,
  input: CreateProductInput,
): Promise<Product> {
  const body = await apiFetch<{ data: Product }>(
    `${restaurantPath(restaurantId)}/products`,
    { method: 'POST', body: input },
  );
  return body.data;
}

export interface UpdateProductInput {
  categoryId?: string;
  name?: string;
  description?: string | null;
  status?: ProductStatus;
  basePrice?: string;
  displayOrder?: number;
  allowCustomerNotes?: boolean;
  featured?: boolean;
}

export async function updateProduct(
  restaurantId: string,
  productId: string,
  input: UpdateProductInput,
): Promise<Product> {
  const body = await apiFetch<{ data: Product }>(
    `${restaurantPath(restaurantId)}/products/${productId}`,
    { method: 'PATCH', body: input },
  );
  return body.data;
}

/** The only field this endpoint accepts (Section 20) -- never sent through generic Product Update. */
export async function updateProductAvailability(
  restaurantId: string,
  productId: string,
  availability: ProductAvailability,
): Promise<{ id: string; availability: ProductAvailability }> {
  const body = await apiFetch<{
    data: { id: string; availability: ProductAvailability };
  }>(`${restaurantPath(restaurantId)}/products/${productId}/availability`, {
    method: 'PATCH',
    body: { availability },
  });
  return body.data;
}
