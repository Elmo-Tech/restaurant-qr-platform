'use client';

import { useEffect, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import * as suggestionsApi from '../../../../../../lib/suggestions/api';
import type { SuggestionsMode, SuggestionsSettings } from '../../../../../../lib/suggestions/api';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { SettingsTabs } from '../SettingsTabs';

const MODES: { key: SuggestionsMode; title: MessageKey; hint: MessageKey }[] = [
  { key: 'OFF', title: 'suggestions.mode.off', hint: 'suggestions.mode.offHint' },
  { key: 'MANUAL', title: 'suggestions.mode.manual', hint: 'suggestions.mode.manualHint' },
  { key: 'AUTO', title: 'suggestions.mode.auto', hint: 'suggestions.mode.autoHint' },
  { key: 'BOTH', title: 'suggestions.mode.both', hint: 'suggestions.mode.bothHint' },
];

/**
 * Restaurant Settings -> Suggestions (DEC-042): the source of the cart's "Complete your meal"
 * row. Each choice saves at once (like the ordering switches); the automatic source shows how
 * much data it has learned from.
 */
export function SuggestionsWorkspace({
  restaurantId,
  canManage,
  allowed,
}: {
  restaurantId: string;
  canManage: boolean;
  /** The platform allows smart suggestions (DEC-043): only "Off" can be chosen otherwise. */
  allowed: boolean;
}) {
  const { t } = useStaffI18n();
  const [settings, setSettings] = useState<SuggestionsSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    suggestionsApi
      .getSuggestionsSettings(restaurantId)
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch((caught) => {
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
  }, [restaurantId]);

  async function choose(mode: SuggestionsMode) {
    if (isBusy || settings?.mode === mode) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      setSettings(await suggestionsApi.setSuggestionsMode(restaurantId, mode));
      setNotice(t('suggestions.saved'));
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setError(describeError(caught));
    } finally {
      setIsBusy(false);
    }
  }

  const usesAutomatic = settings?.mode === 'AUTO' || settings?.mode === 'BOTH';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      <SettingsTabs restaurantId={restaurantId} active="suggestions" />

      <section className="flex max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('suggestions.heading')}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {t('suggestions.description')}
          </p>
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {notice ? <Alert variant="success">{notice}</Alert> : null}
        {!canManage ? <Alert variant="info">{t('suggestions.needsFullScope')}</Alert> : null}
        {!allowed ? <Alert variant="warning">{t('features.suggestions.locked')}</Alert> : null}
        {settings === null && !error ? <LoadingState label={t('suggestions.loading')} /> : null}

        {settings ? (
          <>
            <ul role="radiogroup" aria-label={t('suggestions.heading')} className="grid gap-3 sm:grid-cols-2">
              {MODES.map((mode) => {
                const isSelected = settings.mode === mode.key;
                return (
                  <li key={mode.key}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={!canManage || isBusy || (!allowed && mode.key !== 'OFF')}
                      onClick={() => void choose(mode.key)}
                      className={`flex h-full w-full flex-col gap-1 rounded-xl border p-4 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                        isSelected
                          ? 'border-primary bg-accent ring-2 ring-primary/40'
                          : 'border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{t(mode.title)}</span>
                        {isSelected ? (
                          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                            {t('suggestions.current')}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">{t(mode.hint)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {usesAutomatic ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-foreground">{t('suggestions.auto.title')}</h3>
                <Alert variant={settings.automatic.ready ? 'success' : 'warning'}>
                  {t(settings.automatic.ready ? 'suggestions.auto.ready' : 'suggestions.auto.notReady', {
                    count: String(settings.automatic.servedOrders),
                    minimum: String(settings.automatic.minimumOrders),
                    days: String(settings.automatic.windowDays),
                  })}
                </Alert>
                <p className="text-xs text-muted-foreground">{t('suggestions.auto.whatsappNote')}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
