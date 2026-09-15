import {
  isPlatformSupportedLocale,
  normalizePlatformLocale,
  type PlatformSupportedLocale,
} from '../restaurants/platform-locales';

export interface ResolvePublicLocaleInput {
  /** Raw, not-yet-validated `?lang=` query value, or `null` if the Guest never supplied one. */
  explicitLang: string | null;
  /** Raw `Accept-Language` request header value, or `null` if absent. */
  acceptLanguageHeader: string | null;
  /** The Restaurant's currently ACTIVE Platform locales (already normalized). */
  activeLocales: readonly PlatformSupportedLocale[];
  /** `Restaurant.defaultLocale`, already normalized to a Platform locale. */
  defaultLocale: PlatformSupportedLocale;
}

export interface ResolvedPublicLocale {
  /** Exactly what the Guest asked for via `?lang=`, unnormalized -- `null` when none was supplied at all (never guessed from Accept-Language). */
  requested: string | null;
  /** The locale actually used to resolve every public field below. */
  resolved: PlatformSupportedLocale;
}

/**
 * FT-3, Section 8: the public Guest Menu's locale priority chain --
 * 1) a valid, currently-ACTIVE explicit `?lang=`, 2) an Accept-Language
 * preference matching an ACTIVE Restaurant locale, 3) `Restaurant.
 * defaultLocale`. An explicit `?lang=` that is unsupported or not currently
 * active falls back DIRECTLY to the default locale (Section 8's own stated
 * rule) -- it deliberately never falls through to Accept-Language, which
 * only ever applies when the Guest supplied no explicit `lang` at all. Pure
 * function: never touches the database, never mutates anything.
 */
export function resolvePublicLocale(
  input: ResolvePublicLocaleInput,
): ResolvedPublicLocale {
  const activeLocaleSet = new Set(input.activeLocales);

  if (input.explicitLang !== null) {
    const normalized = normalizePlatformLocale(input.explicitLang);
    if (normalized && activeLocaleSet.has(normalized)) {
      return { requested: input.explicitLang, resolved: normalized };
    }
    return { requested: input.explicitLang, resolved: input.defaultLocale };
  }

  const acceptLanguageMatch = matchAcceptLanguage(
    input.acceptLanguageHeader,
    activeLocaleSet,
  );
  if (acceptLanguageMatch) {
    return { requested: null, resolved: acceptLanguageMatch };
  }

  return { requested: null, resolved: input.defaultLocale };
}

/**
 * Minimal `Accept-Language` matcher -- no new dependency (CLAUDE.md #52).
 * Parses `<tag>[;q=<weight>]` comma-separated candidates, sorts by
 * descending weight (default weight 1), and matches each candidate's
 * primary subtag (`ar` from `ar-EG`) against the Restaurant's currently
 * ACTIVE locales. Returns `null` for an absent/empty header or one that
 * matches no active locale.
 */
function matchAcceptLanguage(
  header: string | null,
  activeLocales: Set<PlatformSupportedLocale>,
): PlatformSupportedLocale | null {
  if (!header) return null;

  const candidates = header
    .split(',')
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(';');
      const qParam = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      const quality = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return {
        tag: rawTag.trim().toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 1,
      };
    })
    .filter((candidate) => candidate.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const candidate of candidates) {
    const primarySubtag = candidate.tag.split('-')[0];
    if (
      isPlatformSupportedLocale(primarySubtag) &&
      activeLocales.has(primarySubtag)
    ) {
      return primarySubtag;
    }
  }
  return null;
}
