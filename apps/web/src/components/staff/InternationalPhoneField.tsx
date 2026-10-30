'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import { useStaffI18n } from '../../lib/i18n/client';
import {
  asciiPhoneDigits,
  changePhoneDraftCountry,
  countryFlag,
  countryOptionsForLocale,
  editPhoneDraft,
  type InternationalPhoneDraft,
  type PhoneCountryOption,
} from '../../lib/contact/international-phone';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';

const BUNDLED_FLAGS = new Set(['EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'JO', 'US', 'GB']);

function CountryFlag({ country }: { country: CountryCode }) {
  const code = country.toLowerCase();
  return (
    <span aria-hidden="true" className="flex h-[20px] w-[28px] shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-black/10 bg-muted shadow-sm">
      {BUNDLED_FLAGS.has(country) ? (
        <svg className="h-full w-full" viewBox="0 0 28 21" preserveAspectRatio="xMidYMid slice">
          <use href={`/flags/wayta-common-flags.svg#wayta-flag-${code}`} />
        </svg>
      ) : (
        <span className="relative flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground">
          {countryFlag(country)}
          {/* Small, lazy, no-key SVG flag fallback; only requested for less common countries.
              If offline, the Unicode/ISO marker remains readable. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            loading="lazy"
            decoding="async"
            src={`https://flagcdn.com/w40/${code}.png`}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        </span>
      )}
    </span>
  );
}

function normalizedSearch(value: string) {
  return asciiPhoneDigits(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064b-\u065f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

/**
 * Premium combined control: one outline, a compact flag/dial-code trigger,
 * a national-number input and a searchable country picker.
 * Numbers and E.164 validation remain owned by the existing contact adapter.
 */
export function InternationalPhoneField({
  id,
  label,
  value,
  onChange,
  error,
  disabled = false,
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
  const englishOptions = useMemo(() => countryOptionsForLocale('en'), []);
  const englishByCountry = useMemo(
    () => new Map([...englishOptions.popular, ...englishOptions.remaining].map((x) => [x.country, x.label])),
    [englishOptions],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filter = normalizedSearch(query);
  const visible = useMemo(() => {
    const matches = (option: PhoneCountryOption) => {
      if (!filter) return true;
      const keys = [option.label, englishByCountry.get(option.country) ?? '', option.country,
        option.callingCode, `+${option.callingCode}`];
      return keys.some((key) => normalizedSearch(key).includes(filter));
    };
    return {
      popular: options.popular.filter(matches),
      remaining: options.remaining.filter(matches),
    };
  }, [options, englishByCountry, filter]);
  const allVisible = [...visible.popular, ...visible.remaining];

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  function toggleCountries() {
    if (disabled) return;
    setQuery('');
    setActiveIndex(0);
    setIsOpen((open) => !open);
  }

  function selectCountry(country: CountryCode) {
    onChange(changePhoneDraftCountry(value, country));
    setIsOpen(false);
    setQuery('');
    inputRef.current?.focus();
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, allVisible.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter' && allVisible.length > 0) {
      event.preventDefault();
      selectCountry(allVisible[Math.min(activeIndex, allVisible.length - 1)].country);
    }
  }

  function renderRow(option: PhoneCountryOption, index: number) {
    const selected = option.country === value.country;
    return (
      <button
        key={option.country}
        type="button"
        tabIndex={index === activeIndex ? 0 : -1}
        aria-current={selected ? 'true' : undefined}
        className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-primary ${selected ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground'}`}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => selectCountry(option.country)}
      >
        <CountryFlag country={option.country} />
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        <span dir="ltr" className="shrink-0 tabular-nums text-xs text-muted-foreground">+{option.callingCode}</span>
        {selected ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-primary">
            <path d="m5 12 4 4L19 6" />
          </svg>
        ) : null}
      </button>
    );
  }

  return (
    <FormField label={label} htmlFor={id} error={error}>
      <div ref={rootRef} className="relative min-w-0">
        <div
          dir="ltr"
          className={`flex h-12 min-w-0 items-center overflow-hidden rounded-xl border bg-card shadow-sm transition-all focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 ${error
            ? 'border-destructive focus-within:border-destructive focus-within:ring-destructive/15'
            : 'border-input'} ${disabled ? 'bg-muted opacity-70' : 'hover:border-ring/60'}`}
        >
          <button
            ref={triggerRef}
            id={`${id}-country`}
            type="button"
            disabled={disabled}
            aria-label={t('contact.country.label', { field: label })}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-controls={isOpen ? `${id}-country-dialog` : undefined}
            className="flex h-full w-[112px] shrink-0 items-center justify-center gap-1.5 border-e border-input bg-muted/35 px-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent/70 focus-visible:bg-accent/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
            onClick={toggleCountries}
          >
            <CountryFlag country={value.country} />
            <span dir="ltr" className="tabular-nums">+{getCountryCallingCode(value.country)}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
              className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <Input
            ref={inputRef}
            id={id}
            type="tel"
            dir="ltr"
            className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 text-[15px] shadow-none focus:border-0 focus:ring-0"
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

        {isOpen ? (
          <>
            <button type="button" tabIndex={-1} aria-label={t('contact.country.close')}
              className="fixed inset-0 z-[80] bg-black/40 sm:hidden"
              onClick={() => setIsOpen(false)} />
            <div
              id={`${id}-country-dialog`}
              role="dialog"
              aria-label={t('contact.country.select')}
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
              className="fixed inset-x-3 bottom-3 z-[81] flex max-h-[min(75dvh,520px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-[calc(100%+8px)] sm:w-[min(370px,calc(100vw-2rem))] sm:max-h-[390px] sm:rounded-xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h3 className="text-sm font-bold text-foreground">{t('contact.country.select')}</h3>
                <button type="button" aria-label={t('contact.country.close')}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={() => { setIsOpen(false); triggerRef.current?.focus(); }}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" className="size-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
              <div className="border-b border-border px-3 py-3">
                <div className="flex h-10 items-center gap-2 rounded-lg border border-input bg-muted/40 px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" className="size-4 shrink-0 text-muted-foreground">
                    <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-4-4" />
                  </svg>
                  <input
                    ref={searchRef}
                    type="search"
                    autoComplete="off"
                    aria-label={t('contact.country.search')}
                    placeholder={t('contact.country.search')}
                    value={query}
                    onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
                    onKeyDown={onSearchKeyDown}
                    className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-2">
                {allVisible.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t('contact.country.noResults')}</p>
                ) : (
                  <>
                    {visible.popular.length > 0 ? (
                      <div className="mb-2">
                        <p className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{t('contact.country.popular')}</p>
                        {visible.popular.map((option, index) => renderRow(option, index))}
                      </div>
                    ) : null}
                    {visible.remaining.length > 0 ? (
                      <div>
                        <p className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">{t('contact.country.all')}</p>
                        {visible.remaining.map((option, index) => renderRow(option, index + visible.popular.length))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </FormField>
  );
}
