'use client';

import { useEffect, useMemo, useState } from 'react';
import * as menuApi from '../../../../../../lib/menu/api';
import type { ModifierGroup } from '../../../../../../lib/menu/types';
import type { PublicMenuModifierGroup } from '../../../../../../lib/public-menu/types';

interface TranslatedNames {
  /** The locale these names were read for. */
  locale: string;
  groups: Record<string, { name: string; helperText: string | null }>;
  options: Record<string, string>;
}

/**
 * The product's add-ons as a guest would see them, in the language being previewed.
 *
 * Only what the Guest Menu shows: ACTIVE groups with at least one ACTIVE option, in
 * display order. Names come from the default-language data the editor already
 * holds; for another language the saved translations are read (group by group)
 * only while the "Product page" preview is open, and a missing translation falls
 * back to the default-language name -- exactly the guest fallback.
 */
export function useAddonsPreview({
  restaurantId,
  productId,
  groups,
  locale,
  defaultLocale,
  enabled,
}: {
  restaurantId: string;
  productId: string | null;
  groups: ModifierGroup[] | null;
  locale: string;
  defaultLocale: string;
  /** Only fetch translations while the add-ons are actually on screen. */
  enabled: boolean;
}): PublicMenuModifierGroup[] {
  const [translated, setTranslated] = useState<TranslatedNames | null>(null);

  const activeGroups = useMemo(
    () =>
      (groups ?? [])
        .filter((group) => group.status === 'ACTIVE')
        .map((group) => ({
          ...group,
          options: group.options
            .filter((option) => option.status === 'ACTIVE')
            .sort((a, b) => a.displayOrder - b.displayOrder),
        }))
        .filter((group) => group.options.length > 0)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [groups],
  );

  useEffect(() => {
    if (!enabled || !productId || locale === defaultLocale || activeGroups.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: TranslatedNames = { locale, groups: {}, options: {} };
      await Promise.all(
        activeGroups.map(async (group) => {
          const groupRows = await menuApi
            .getModifierGroupTranslations(restaurantId, productId, group.id)
            .catch(() => []);
          const groupRow = groupRows.find((row) => row.locale === locale && row.name.trim() !== '');
          if (groupRow) next.groups[group.id] = { name: groupRow.name, helperText: groupRow.helperText };
          await Promise.all(
            group.options.map(async (option) => {
              const optionRows = await menuApi
                .getModifierOptionTranslations(restaurantId, productId, group.id, option.id)
                .catch(() => []);
              const row = optionRows.find((r) => r.locale === locale && r.name.trim() !== '');
              if (row) next.options[option.id] = row.name;
            }),
          );
        }),
      );
      if (!cancelled) setTranslated(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, productId, locale, defaultLocale, activeGroups, restaurantId]);

  return useMemo(() => {
    const names = translated && translated.locale === locale ? translated : null;
    return activeGroups.map((group) => ({
      id: group.id,
      name: names?.groups[group.id]?.name ?? group.name,
      helperText:
        names?.groups[group.id] !== undefined ? names.groups[group.id].helperText : group.helperText,
      minimumSelections: group.minimumSelections,
      maximumSelections: group.maximumSelections,
      options: group.options.map((option) => ({
        id: option.id,
        name: names?.options[option.id] ?? option.name,
        priceAdjustment: option.priceAdjustment,
      })),
    }));
  }, [activeGroups, translated, locale]);
}
