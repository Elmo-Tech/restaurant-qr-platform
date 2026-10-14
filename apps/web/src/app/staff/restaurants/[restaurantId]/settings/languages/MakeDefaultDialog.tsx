'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as settingsApi from '../../../../../../lib/settings/api';
import type {
  DefaultLocaleEntityKind,
  DefaultLocaleReadiness,
} from '../../../../../../lib/settings/types';
import { localeLabel } from '../../../../../../lib/settings/locale-labels';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Dialog } from '../../../../../../components/ui/Dialog';
import { LoadingState } from '../../../../../../components/ui/LoadingState';

const KINDS: readonly DefaultLocaleEntityKind[] = [
  'menus',
  'categories',
  'products',
  'modifierGroups',
  'modifierOptions',
  'modifierPresets',
  'modifierPresetOptions',
  'branches',
  'deliveryZones',
];

/** Where an admin completes the missing names for each kind of content. */
function fixPath(restaurantId: string, kind: DefaultLocaleEntityKind): string {
  const base = `/staff/restaurants/${restaurantId}`;
  switch (kind) {
    case 'modifierPresets':
    case 'modifierPresetOptions':
      return `${base}/menu/modifier-presets`;
    case 'branches':
      return `${base}/settings/branches`;
    case 'deliveryZones':
      return `${base}/settings/delivery`;
    default:
      return `${base}/menu`;
  }
}

/**
 * DEC-037: choosing the Restaurant's default language. The Backend decides
 * whether the change is allowed (every item needs a name in the new default);
 * this dialog first asks it for the counts so the admin sees exactly what is
 * still missing instead of getting a refusal after the fact. While anything is
 * missing the only action is Close, so nothing half-done can be confirmed.
 */
export function MakeDefaultDialog({
  restaurantId,
  locale,
  onClose,
  onChanged,
}: {
  restaurantId: string;
  /** The language to make the default; `null` keeps the dialog closed. */
  locale: string | null;
  onClose: () => void;
  /** The default changed: the parent reloads the language list. */
  onChanged: () => void;
}) {
  const { t } = useStaffI18n();
  const [readiness, setReadiness] = useState<DefaultLocaleReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!locale) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setReadiness(null);
      setError(null);
    });
    settingsApi
      .getDefaultLocaleReadiness(restaurantId, locale)
      .then((data) => {
        if (!cancelled) setReadiness(data);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (isUnauthenticatedError(caught)) {
          redirectToLogin();
          return;
        }
        setError(describeError(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, locale]);

  if (!locale) return null;
  const language = localeLabel(locale);
  const ready = readiness?.ready === true;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !locale) return;
    if (!ready) {
      onClose();
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await settingsApi.setDefaultLocale(restaurantId, locale);
      onChanged();
      onClose();
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setError(describeError(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      title={t('settings.languages.makeDefaultTitle', { language })}
      isSubmitting={isSubmitting}
      submitLabel={
        readiness === null && !error
          ? t('common.loading')
          : ready
            ? t('settings.languages.makeDefaultConfirm')
            : t('common.close')
      }
      submitVariant="primary"
      hideCancel={readiness !== null && !ready}
      onSubmit={(event) => void handleSubmit(event)}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert variant="error">{error}</Alert> : null}

        {readiness === null && !error ? (
          <LoadingState label={t('settings.languages.makeDefaultChecking')} />
        ) : null}

        {readiness && ready ? (
          <p className="text-sm leading-relaxed text-secondary-foreground">
            {t('settings.languages.makeDefaultReady', { language })}
          </p>
        ) : null}

        {readiness && !ready ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-secondary-foreground">
              {t('settings.languages.makeDefaultMissingIntro', { language })}
            </p>
            <ul className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-2">
              {KINDS.filter((kind) => readiness.missing[kind] > 0).map((kind) => (
                <li key={kind}>
                  <Link
                    href={fixPath(restaurantId, kind)}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-destructive-soft px-2 text-xs font-bold text-destructive">
                      {readiness.missing[kind]}
                    </span>
                    <span className="flex-1 font-medium text-foreground">
                      {t(`settings.languages.missing.${kind}` as const)}
                    </span>
                    <span aria-hidden="true" className="text-muted-foreground rtl:rotate-180">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t('settings.languages.makeDefaultMissingHint')}
            </p>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
