import { apiFetch } from '../api/client';

/**
 * "Complete your meal" (DEC-042): ask the Backend which products to suggest for what is in the
 * cart. The answer is a list of product ids the page already holds in its loaded menu. Never
 * throws: a failed or slow request simply means no suggestions, and ordering is unaffected.
 */
export async function fetchSuggestions(
  publicCode: string,
  productIds: readonly string[],
): Promise<string[]> {
  if (productIds.length === 0) return [];
  try {
    const body = await apiFetch<{ data: { productIds: string[] } }>(
      `/public/qr/${encodeURIComponent(publicCode)}/suggestions`,
      { method: 'POST', body: { productIds } },
    );
    return Array.isArray(body.data.productIds) ? body.data.productIds : [];
  } catch {
    return [];
  }
}
