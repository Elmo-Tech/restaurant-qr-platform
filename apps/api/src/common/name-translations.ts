import 'reflect-metadata';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import {
  PLATFORM_SUPPORTED_LOCALES,
  type PlatformSupportedLocale,
} from '../restaurants/platform-locales';

/**
 * Bilingual display names for Branches and Delivery zones (V1 final features,
 * Batch 1). Follows the existing translation-table pattern (never `name_ar` /
 * `name_en` columns): `branches.name` / `delivery_zones.name` stay the
 * default-locale name and the legacy fallback, so single-language data and
 * older readers keep working, and `*_translations` rows carry the per-locale
 * names.
 *
 * Contract used by every Staff write:
 * - `name` (create: required; update: optional) is the DEFAULT-locale name.
 * - `translations` is an optional array of `{ locale, name }`. A non-empty name
 *   upserts that locale; an EMPTY name removes that locale's translation. The
 *   default locale can never be removed, and when it appears here it is
 *   authoritative for `name` (so the legacy column always equals the default
 *   locale's value).
 */

export const NAME_TRANSLATION_MAX_LENGTH = 100;

function trimLower(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class NameTranslationDto {
  @Transform(({ value }) => trimLower(value))
  @IsIn(PLATFORM_SUPPORTED_LOCALES, {
    message: `locale must be one of: ${PLATFORM_SUPPORTED_LOCALES.join(', ')}`,
  })
  locale!: PlatformSupportedLocale;

  /** Empty string means "remove this locale's translation". */
  @Transform(({ value }) => trim(value))
  @IsString()
  @MaxLength(NAME_TRANSLATION_MAX_LENGTH, {
    message: `name must be at most ${NAME_TRANSLATION_MAX_LENGTH} characters`,
  })
  name!: string;
}

/** Rejects a `translations` array that lists the same locale twice. */
function HasUniqueLocales(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'hasUniqueLocales',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) return true;
          const locales = value.map((item: { locale?: unknown }) => item?.locale);
          return new Set(locales).size === locales.length;
        },
        defaultMessage: () => 'translations must not repeat a locale',
      },
    });
  };
}

/** Reusable decorator bundle for a DTO's `translations` property. */
export function NameTranslationsProperty() {
  return function (target: object, propertyKey: string): void {
    IsOptional()(target, propertyKey);
    ArrayMaxSize(PLATFORM_SUPPORTED_LOCALES.length)(target, propertyKey);
    HasUniqueLocales()(target, propertyKey);
    ValidateNested({ each: true })(target, propertyKey);
    Type(() => NameTranslationDto)(target, propertyKey);
  };
}

export interface NameTranslationView {
  locale: string;
  name: string;
}

/**
 * Display-name resolution: the requested locale's translation, then the
 * default locale's translation, then the legacy `name` (never an empty label).
 */
export function resolveLocalizedName(input: {
  requestedLocale: string;
  defaultLocale: string;
  translations: readonly NameTranslationView[];
  legacyName: string;
}): string {
  const find = (locale: string) =>
    input.translations.find((row) => row.locale === locale && row.name.trim() !== '');
  return (
    find(input.requestedLocale)?.name ??
    find(input.defaultLocale)?.name ??
    input.legacyName
  );
}

export interface NameTranslationPlan {
  /** The new legacy/default-locale `name`, or `undefined` when it must stay unchanged. */
  name: string | undefined;
  upserts: NameTranslationView[];
  deleteLocales: string[];
}

export type NameTranslationPlanResult =
  | { ok: true; plan: NameTranslationPlan }
  | { ok: false; reason: 'defaultNameRequired' };

/**
 * Pure planner for a Branch / Delivery zone write (see the contract above).
 * `name` is the request's default-locale name (undefined on an update that
 * does not touch it); `translations` the optional per-locale entries.
 */
export function planNameTranslations(input: {
  defaultLocale: string;
  name: string | undefined;
  translations: readonly NameTranslationView[] | undefined;
}): NameTranslationPlanResult {
  const entries = input.translations ?? [];
  const defaultEntry = entries.find((entry) => entry.locale === input.defaultLocale);

  let name: string | undefined = input.name;
  if (defaultEntry) {
    if (defaultEntry.name === '') {
      return { ok: false, reason: 'defaultNameRequired' };
    }
    name = defaultEntry.name;
  }

  const upserts: NameTranslationView[] = entries.filter(
    (entry) => entry.locale !== input.defaultLocale && entry.name !== '',
  );
  if (name !== undefined) {
    upserts.push({ locale: input.defaultLocale, name });
  }
  const deleteLocales = entries
    .filter((entry) => entry.locale !== input.defaultLocale && entry.name === '')
    .map((entry) => entry.locale);

  return { ok: true, plan: { name, upserts, deleteLocales } };
}
