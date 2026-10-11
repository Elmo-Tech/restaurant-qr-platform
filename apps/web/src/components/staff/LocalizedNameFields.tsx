'use client';

import { useStaffI18n } from '../../lib/i18n/client';
import { localeDirection, localeLabel } from '../../lib/settings/locale-labels';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';

export interface LocalizedNameFieldsProps {
  idPrefix: string;
  /** The Restaurant default locale: its name is required and also the fallback for every other language. */
  defaultLocale: string;
  /** Active content locales (default first), or `null` while unknown: only the default field shows. */
  activeLocales: string[] | null;
  values: Record<string, string>;
  onChange: (locale: string, value: string) => void;
  disabled?: boolean;
  /** Error for the required default-language field. */
  defaultError?: string;
  maxLength?: number;
  placeholder?: string;
  /** Focus target for the default-language field. */
  defaultInputRef?: React.Ref<HTMLInputElement>;
}

/**
 * One name input per active content language, default language first. Each
 * input is `dir`-aware for its own language (an Arabic name is RTL even inside
 * an English dashboard) and `lang`-tagged. Non-default names are optional and
 * clearing one removes that translation; the default-language field is the
 * fallback shown wherever a language has no name of its own.
 */
export function LocalizedNameFields({
  idPrefix,
  defaultLocale,
  activeLocales,
  values,
  onChange,
  disabled = false,
  defaultError,
  maxLength,
  placeholder,
  defaultInputRef,
}: LocalizedNameFieldsProps) {
  const { t } = useStaffI18n();
  const others = (activeLocales ?? []).filter((locale) => locale !== defaultLocale);

  return (
    <div className="flex flex-col gap-4">
      <FormField
        label={
          others.length > 0
            ? t('localizedName.label', { language: localeLabel(defaultLocale) })
            : t('localizedName.plainLabel')
        }
        htmlFor={`${idPrefix}-${defaultLocale}`}
        error={defaultError}
      >
        <Input
          ref={defaultInputRef}
          id={`${idPrefix}-${defaultLocale}`}
          lang={defaultLocale}
          dir={localeDirection(defaultLocale)}
          value={values[defaultLocale] ?? ''}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(defaultLocale, event.target.value)}
        />
        {others.length > 0 ? (
          <p className="text-xs text-muted-foreground">{t('localizedName.defaultHint')}</p>
        ) : null}
      </FormField>

      {others.map((locale) => (
        <FormField
          key={locale}
          label={`${t('localizedName.label', { language: localeLabel(locale) })} (${t('common.optional')})`}
          htmlFor={`${idPrefix}-${locale}`}
        >
          <Input
            id={`${idPrefix}-${locale}`}
            lang={locale}
            dir={localeDirection(locale)}
            value={values[locale] ?? ''}
            maxLength={maxLength}
            disabled={disabled}
            onChange={(event) => onChange(locale, event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('localizedName.otherHint')}</p>
        </FormField>
      ))}
    </div>
  );
}
