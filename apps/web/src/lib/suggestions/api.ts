import { apiFetch } from '../api/client';

/** Smart suggestions (DEC-042), Staff side: the Restaurant's mode and the manual rules per product. */
export type SuggestionsMode = 'OFF' | 'MANUAL' | 'AUTO' | 'BOTH';

export interface SuggestionsSettings {
  mode: SuggestionsMode;
  automatic: { servedOrders: number; minimumOrders: number; windowDays: number; ready: boolean };
}

export const MAX_RULES_PER_PRODUCT = 6;

export async function getSuggestionsSettings(restaurantId: string): Promise<SuggestionsSettings> {
  const body = await apiFetch<{ data: SuggestionsSettings }>(`/restaurants/${restaurantId}/suggestions`);
  return body.data;
}

export async function setSuggestionsMode(
  restaurantId: string,
  mode: SuggestionsMode,
): Promise<SuggestionsSettings> {
  const body = await apiFetch<{ data: SuggestionsSettings }>(`/restaurants/${restaurantId}/suggestions`, {
    method: 'PATCH',
    body: { mode },
  });
  return body.data;
}

export async function getProductSuggestions(restaurantId: string, productId: string): Promise<string[]> {
  const body = await apiFetch<{ data: { productIds: string[] } }>(
    `/restaurants/${restaurantId}/products/${productId}/suggestions`,
  );
  return body.data.productIds;
}

export async function saveProductSuggestions(
  restaurantId: string,
  productId: string,
  productIds: string[],
): Promise<string[]> {
  const body = await apiFetch<{ data: { productIds: string[] } }>(
    `/restaurants/${restaurantId}/products/${productId}/suggestions`,
    { method: 'PUT', body: { productIds } },
  );
  return body.data.productIds;
}
