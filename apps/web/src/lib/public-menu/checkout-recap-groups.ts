/**
 * Display-only checkout recap grouping, shared by every Guest Menu template.
 * Category labels and order come from the CURRENT public menu, never the
 * persisted cart or an untrusted client-side price calculation.
 */
export interface CheckoutRecapLineLike {
  offerId: string | null;
  category: { id: string; name: string; order: number } | null;
}

export interface CheckoutRecapGroup<T extends CheckoutRecapLineLike> {
  key: string;
  title: string;
  sortOrder: number;
  lines: T[];
}

/** Offers first, then the restaurant's category order; keep cart order within each category. */
export function groupCheckoutRecapLines<T extends CheckoutRecapLineLike>(
  lines: readonly T[],
  offersTitle: string,
  fallbackTitle: string,
): CheckoutRecapGroup<T>[] {
  const groups = new Map<string, CheckoutRecapGroup<T>>();

  for (const line of lines) {
    const isOffer = line.offerId !== null;
    const key = isOffer
      ? 'offers'
      : line.category
        ? 'category:' + line.category.id
        : 'uncategorized';
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: isOffer ? offersTitle : line.category?.name || fallbackTitle,
        sortOrder: isOffer ? -1 : (line.category?.order ?? Number.POSITIVE_INFINITY),
        lines: [],
      };
      groups.set(key, group);
    }
    group.lines.push(line);
  }

  return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}
