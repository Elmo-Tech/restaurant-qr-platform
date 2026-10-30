'use client';

import { useMemo } from 'react';
import type { CountryCode } from 'libphonenumber-js';
import { useStaffI18n } from '../../lib/i18n/client';
import {
  changePhoneDraftCountry,
  countryFlag,
  countryOptionsForLocale,
  editPhoneDraft,
  type InternationalPhoneDraft,
  type PhoneCountryOption,
} from '../../lib/contact/international-phone';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

/** Native country selection (keyboard/touch accessible), plus a local-number field. */
export function InternationalPhoneField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  label: string;
  value: InternationalPhoneDraft;
  onChange: (value: InternationalPhoneDraft) => void;
  error?: string;
  disabled?: boolean;
}) {
  const { locale, t } = useStaffI18n();
  const options = useMemo(() => countryOptionsForLocale(locale), [locale]);
  const renderOption = (option: PhoneCountryOption) => (
    <option key={option.country} value={option.country}>
      {countryFlag(option.country)} +{option.callingCode} · {option.label}
    </option>
  );

  return (
    <FormField label={label} htmlFor={id} error={error}>
      <div className="flex min-w-0 flex-col gap-2 min-[380px]:flex-row" dir="ltr">
        <Select
          className="min-w-0 min-[380px]:w-[148px] min-[380px]:shrink-0"
          id={`${id}-country`}
          aria-label={t('contact.country.label', { field: label })}
          value={value.country}
          disabled={disabled}
          onChange={(event) => onChange(changePhoneDraftCountry(value, event.target.value as CountryCode))}
        >
          <optgroup label={t('contact.country.popular')}>
            {options.popular.map(renderOption)}
          </optgroup>
          <optgroup label={t('contact.country.all')}>
            {options.remaining.map(renderOption)}
          </optgroup>
        </Select>
        <Input
          id={id}
          type="tel"
          dir="ltr"
          className="min-w-0 flex-1"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={t('contact.phone.placeholder')}
          value={value.national}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(editPhoneDraft(value, event.target.value))}
        />
      </div>
    </FormField>
  );
}
