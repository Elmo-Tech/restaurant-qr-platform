import type { OnboardingCase } from '../../generated/prisma/client';
import { normalizePlatformLocale } from '../../restaurants/platform-locales';
import type { OnboardingDetails } from './onboarding-details';
import {
  sanitizeOnboardingMenuDraft,
  validateOnboardingMenuDraft,
} from './onboarding-menu';

type MenuCase = Pick<
  OnboardingCase,
  | 'mode'
  | 'menuDraft'
  | 'menuPublishedAt'
  | 'importExpiresAt'
  | 'importReviewed'
>;

export function readCaseMenu(row: MenuCase, now = new Date()) {
  if (!row.menuDraft || (row.importExpiresAt && row.importExpiresAt <= now))
    return null;
  const draft = sanitizeOnboardingMenuDraft(row.menuDraft);
  return draft.ok ? draft.value : null;
}

export function onboardingLocales(details: OnboardingDetails) {
  const defaultLocale =
    normalizePlatformLocale(details.restaurant.defaultLocale) ?? '';
  const activeLocales = [
    defaultLocale,
    ...details.restaurant.additionalLocales.map(normalizePlatformLocale),
  ].filter(
    (locale): locale is 'ar' | 'en' => locale === 'ar' || locale === 'en',
  );
  return { defaultLocale, activeLocales };
}

export function menuContentProblems(
  row: MenuCase,
  details: OnboardingDetails,
  now = new Date(),
) {
  if (row.importExpiresAt && row.importExpiresAt <= now)
    return ['ONBOARDING_IMPORT_EXPIRED'];
  const draft = readCaseMenu(row, now);
  if (!draft) return ['ONBOARDING_MENU_INCOMPLETE'];
  return validateOnboardingMenuDraft(draft, onboardingLocales(details));
}

export function menuProblemsForCase(
  row: MenuCase,
  details: OnboardingDetails,
  now = new Date(),
) {
  if (row.mode === 'DEMO' || row.menuPublishedAt) return [];
  const problems = menuContentProblems(row, details, now);
  if (row.importExpiresAt && row.importExpiresAt > now && !row.importReviewed)
    problems.push('ONBOARDING_IMPORT_REVIEW_REQUIRED');
  return problems;
}
