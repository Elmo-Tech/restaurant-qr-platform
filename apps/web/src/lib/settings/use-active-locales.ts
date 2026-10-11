'use client';

import { useEffect, useState } from 'react';
import { getRestaurantLocales } from './api';

/**
 * The Restaurant's ACTIVE content locales (default first), for forms that edit
 * per-language names. `null` while loading or when the list cannot be read: the
 * caller then shows only the default-language field, which is always valid.
 * Display only -- the Backend re-validates every locale it receives.
 */
export function useActiveLocales(restaurantId: string, defaultLocale: string): string[] | null {
  const [locales, setLocales] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      getRestaurantLocales(restaurantId)
        .then((response) => {
          if (cancelled) return;
          const active = response.locales
            .filter((row) => row.isActive || row.isDefault)
            .map((row) => row.locale);
          setLocales(
            [defaultLocale, ...active.filter((locale) => locale !== defaultLocale)].filter(
              (locale, index, all) => all.indexOf(locale) === index,
            ),
          );
        })
        .catch(() => {
          if (!cancelled) setLocales(null);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, defaultLocale]);

  return locales;
}
