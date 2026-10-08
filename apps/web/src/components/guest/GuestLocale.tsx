'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * The resolved Guest content locale (`en`/`ar`), so leaf components such as `Price`
 * can pick the right currency label and reading order without every call site
 * threading it through props.
 */
const GuestLocaleContext = createContext<'en' | 'ar'>('en');

export function GuestLocaleProvider({ locale, children }: { locale: string; children: ReactNode }) {
  return (
    <GuestLocaleContext.Provider value={locale === 'ar' ? 'ar' : 'en'}>
      {children}
    </GuestLocaleContext.Provider>
  );
}

export function useGuestLocale(): 'en' | 'ar' {
  return useContext(GuestLocaleContext);
}
