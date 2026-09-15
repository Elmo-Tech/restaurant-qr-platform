import { apiFetch, apiFetchFormData } from '../api/client';
import type {
  Category,
  CategoryStatus,
  CategoryTranslation,
  Menu,
  MenuStatus,
  MenuTranslation,
  Product,
  ProductAvailability,
  ProductStatus,
  ProductTranslation,
} from './types';

/** Shared PUT-translation body shape -- identical across Menu/Category/Product (API_CONVENTIONS.md #108E). */
export interface TranslationInput {
  name: string;
  description?: string | null;
}

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

/** `menuId` omitted lists every Category across the whole Restaurant (Backend `ListCategoriesQueryDto`) -- used by the Product Editor route to build one Menu-grouped Category picker. */
export async function listCategories(
  restaurantId: string,
  menuId?: string,
): Promise<Category[]> {
  const query = menuId ? `?menuId=${menuId}` : '';
  const body = await apiFetch<{ data: Category[] }>(
    `${restaurantPath(restaurantId)}/categories${query}`,
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

/** FT-2: uploads (or replaces) the Category's one image. `field name` must be exactly `image`, matching the Backend's `FileInterceptor('image', ...)`. */
export async function uploadCategoryImage(
  restaurantId: string,
  categoryId: string,
  file: File,
): Promise<{ imageAssetPath: string }> {
  const formData = new FormData();
  formData.set('image', file);
  const body = await apiFetchFormData<{ data: { imageAssetPath: string } }>(
    `${restaurantPath(restaurantId)}/categories/${categoryId}/image`,
    formData,
  );
  return body.data;
}

export async function removeCategoryImage(
  restaurantId: string,
  categoryId: string,
): Promise<void> {
  await apiFetch<undefined>(
    `${restaurantPath(restaurantId)}/categories/${categoryId}/image`,
    { method: 'DELETE' },
  );
}

/** `categoryId` omitted lists every Product across the whole Restaurant (Backend `ListProductsQueryDto`) -- used by the Product Editor route to locate one Product by id without already knowing its Category. */
export async function listProducts(
  restaurantId: string,
  categoryId?: string,
): Promise<Product[]> {
  const query = categoryId ? `?categoryId=${categoryId}` : '';
  const body = await apiFetch<{ data: Product[] }>(
    `${restaurantPath(restaurantId)}/products${query}`,
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

/** FT-2: uploads (or replaces) the Product's one primary image. `field name` must be exactly `image`, matching the Backend's `FileInterceptor('image', ...)`. */
export async function uploadProductImage(
  restaurantId: string,
  productId: string,
  file: File,
): Promise<{ primaryImageAssetPath: string }> {
  const formData = new FormData();
  formData.set('image', file);
  const body = await apiFetchFormData<{ data: { primaryImageAssetPath: string } }>(
    `${restaurantPath(restaurantId)}/products/${productId}/image`,
    formData,
  );
  return body.data;
}

export async function removeProductImage(
  restaurantId: string,
  productId: string,
): Promise<void> {
  await apiFetch<undefined>(
    `${restaurantPath(restaurantId)}/products/${productId}/image`,
    { method: 'DELETE' },
  );
}

// Menu translations -- raw editing resources, no fallback logic (Section 5).

export async function getMenuTranslations(
  restaurantId: string,
  menuId: string,
): Promise<MenuTranslation[]> {
  const body = await apiFetch<{ data: MenuTranslation[] }>(
    `${restaurantPath(restaurantId)}/menus/${menuId}/translations`,
  );
  return body.data;
}

export async function putMenuTranslation(
  restaurantId: string,
  menuId: string,
  locale: string,
  input: TranslationInput,
): Promise<MenuTranslation> {
  const body = await apiFetch<{ data: MenuTranslation }>(
    `${restaurantPath(restaurantId)}/menus/${menuId}/translations/${locale}`,
    { method: 'PUT', body: input },
  );
  return body.data;
}

export async function deleteMenuTranslation(
  restaurantId: string,
  menuId: string,
  locale: string,
): Promise<void> {
  await apiFetch<undefined>(
    `${restaurantPath(restaurantId)}/menus/${menuId}/translations/${locale}`,
    { method: 'DELETE' },
  );
}

// Category translations -- same pattern as Menu translations.

export async function getCategoryTranslations(
  restaurantId: string,
  categoryId: string,
): Promise<CategoryTranslation[]> {
  const body = await apiFetch<{ data: CategoryTranslation[] }>(
    `${restaurantPath(restaurantId)}/categories/${categoryId}/translations`,
  );
  return body.data;
}

export async function putCategoryTranslation(
  restaurantId: string,
  categoryId: string,
  locale: string,
  input: TranslationInput,
): Promise<CategoryTranslation> {
  const body = await apiFetch<{ data: CategoryTranslation }>(
    `${restaurantPath(restaurantId)}/categories/${categoryId}/translations/${locale}`,
    { method: 'PUT', body: input },
  );
  return body.data;
}

export async function deleteCategoryTranslation(
  restaurantId: string,
  categoryId: string,
  locale: string,
): Promise<void> {
  await apiFetch<undefined>(
    `${restaurantPath(restaurantId)}/categories/${categoryId}/translations/${locale}`,
    { method: 'DELETE' },
  );
}

// Product translations -- same pattern as Menu translations.

export async function getProductTranslations(
  restaurantId: string,
  productId: string,
): Promise<ProductTranslation[]> {
  const body = await apiFetch<{ data: ProductTranslation[] }>(
    `${restaurantPath(restaurantId)}/products/${productId}/translations`,
  );
  return body.data;
}

export async function putProductTranslation(
  restaurantId: string,
  productId: string,
  locale: string,
  input: TranslationInput,
): Promise<ProductTranslation> {
  const body = await apiFetch<{ data: ProductTranslation }>(
    `${restaurantPath(restaurantId)}/products/${productId}/translations/${locale}`,
    { method: 'PUT', body: input },
  );
  return body.data;
}

export async function deleteProductTranslation(
  restaurantId: string,
  productId: string,
  locale: string,
): Promise<void> {
  await apiFetch<undefined>(
    `${restaurantPath(restaurantId)}/products/${productId}/translations/${locale}`,
    { method: 'DELETE' },
  );
}
