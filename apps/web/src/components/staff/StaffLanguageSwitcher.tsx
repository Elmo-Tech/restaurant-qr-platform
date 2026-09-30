'use client';

import { STAFF_LOCALES } from '../../lib/i18n/locale';
import { useStaffI18n } from '../../lib/i18n/client';

/**
 * FT-10A: the Staff interface language switcher (English | العربية). It
 * changes ONLY the Staff UI language -- never the Restaurant's Menu content
 * languages. Each option is labelled in its own language so it is always
 * recognisable, whichever language the interface is currently in.
 */
export function StaffLanguageSwitcher() {
  const { locale, setLocale, t } = useStaffI18n();

  return (
    <div
      role="group"
      aria-label={t('lang.switcherLabel')}
      className="flex flex-shrink-0 gap-0.5 rounded-full border border-border bg-card p-0.5 text-xs"
    >
      {STAFF_LOCALES.map((option) => {
        const isActive = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-pressed={isActive}
            onClick={() => {
              if (!isActive) setLocale(option);
            }}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
              isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-secondary-foreground'
            }`}
          >
            {t(option === 'ar' ? 'lang.ar' : 'lang.en')}
          </button>
        );
      })}
    </div>
  );
}
