'use client';

import { useEffect, useState } from 'react';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { describeError, isUnauthenticatedError, redirectToLogin } from '../../../../../../lib/menu/error-message';
import { DEFAULT_MAKKBOZ_SETTINGS, MAKKBOZ_COPY_LIMITS, type MakkbozCopyField, type MakkbozMenuSettings } from '../../../../../../lib/public-menu/makkboz-settings';
import {
  getMakkbozMenuConfig,
  publishMakkbozMenu,
  saveMakkbozMenuDraft,
  type MakkbozMenuConfigView,
} from '../../../../../../lib/settings/api';

const FIELD_CLASS = 'mt-1 block w-full rounded-lg border border-input bg-card px-3 py-2 text-foreground';
const COPY_GROUPS = [
  { title: 'makkboz.copy.opening', keys: ['heroTitle', 'heroDesc', 'ctaPrimary'] },
  { title: 'makkboz.copy.menu', keys: ['menuTitle', 'menuNote'] },
  { title: 'makkboz.copy.footer', keys: ['footerTagline'] },
] as const;

/** The approved artwork is fixed; the Restaurant can edit six key messages and the menu display. */
export function MakkbozMenuEditor({
  restaurantId,
  canManage,
  onDraftChange,
  onCopyLanguageChange,
}: {
  restaurantId: string;
  canManage: boolean;
  onDraftChange: (draft: MakkbozMenuSettings) => void;
  onCopyLanguageChange: (language: 'ar' | 'en') => void;
}) {
  const { t, locale } = useStaffI18n();
  const [language, setLanguage] = useState<'ar' | 'en'>(locale);
  const [draft, setDraft] = useState<MakkbozMenuSettings>(DEFAULT_MAKKBOZ_SETTINGS);
  const [saved, setSaved] = useState<MakkbozMenuSettings>(DEFAULT_MAKKBOZ_SETTINGS);
  const [published, setPublished] = useState<MakkbozMenuSettings>(DEFAULT_MAKKBOZ_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const dirty = draft.defaultView !== saved.defaultView || draft.priceDisplay !== saved.priceDisplay ||
    COPY_GROUPS.some((group) => group.keys.some((key) => draft[`${key}Ar`] !== saved[`${key}Ar`] || draft[`${key}En`] !== saved[`${key}En`]));
  const unpublished = JSON.stringify(saved) !== JSON.stringify(published);
  const disabled = busy || !canManage || !hasLoaded;

  useEffect(() => {
    let cancelled = false;
    getMakkbozMenuConfig(restaurantId)
      .then((config) => {
        if (cancelled) return;
        setDraft(config.draft);
        setSaved(config.draft);
        setPublished(config.published);
        setHasLoaded(true);
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        if (isUnauthenticatedError(caught)) redirectToLogin();
        else setError(describeError(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [restaurantId]);

  useEffect(() => {
    if (hasLoaded) onDraftChange(draft);
  }, [draft, hasLoaded, onDraftChange]);

  useEffect(() => { onCopyLanguageChange(language); }, [language, onCopyLanguageChange]);

  async function run(job: () => Promise<MakkbozMenuConfigView>, message: string) {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const view = await job();
      setDraft(view.draft);
      setSaved(view.draft);
      setPublished(view.published);
      setNotice(message);
    } catch (caught) {
      if (isUnauthenticatedError(caught)) redirectToLogin();
      else setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t('verde.loading')}</p>;

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-secondary/40 p-4">
      <div>
        <h3 className="font-bold">{t('makkboz.editor.title')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('makkboz.editor.hint')}</p>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <fieldset className="flex flex-col gap-3" disabled={disabled}>
        <label className="block text-sm">
          {t('makkboz.defaultView')}
          <select className={FIELD_CLASS} value={draft.defaultView} onChange={(event) => {
            const defaultView = event.target.value === 'LIST' ? 'LIST' : 'CARDS';
            setDraft((current) => ({ ...current, defaultView }));
            setNotice('');
          }}>
            <option value="CARDS">{t('makkboz.view.cards')}</option>
            <option value="LIST">{t('makkboz.view.list')}</option>
          </select>
        </label>
        <label className="block text-sm">
          {t('makkboz.priceDisplay')}
          <select className={FIELD_CLASS} value={draft.priceDisplay} onChange={(event) => {
            const priceDisplay = event.target.value === 'ALL_VARIANTS' ? 'ALL_VARIANTS' : 'STARTING_PRICE';
            setDraft((current) => ({ ...current, priceDisplay }));
            setNotice('');
          }}>
            <option value="STARTING_PRICE">{t('makkboz.priceDisplay.starting')}</option>
            <option value="ALL_VARIANTS">{t('makkboz.priceDisplay.sizes')}</option>
          </select>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t('makkboz.priceDisplay.hint')}</span>
        </label>
      </fieldset>

      <div role="group" aria-label={t('verde.language')} className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{t('verde.language')}</span>
        {(['ar', 'en'] as const).map((code) => (
          <button key={code} type="button" disabled={disabled} aria-pressed={language === code}
            className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm ${language === code ? 'bg-primary text-primary-foreground' : 'bg-card'}`}
            onClick={() => setLanguage(code)}>
            {code === 'ar' ? 'العربية' : 'English'}
          </button>
        ))}
      </div>
      {COPY_GROUPS.map((group) => (
        <fieldset key={group.title} className="flex flex-col gap-3" disabled={disabled}>
          <legend className="mb-1 text-sm font-semibold">{t(group.title)}</legend>
          {group.keys.map((key) => {
            const field = `${key}${language === 'ar' ? 'Ar' : 'En'}` as MakkbozCopyField;
            return (
              <label key={key} className="block text-sm">
                {t(`makkboz.copy.${key}`)}
                <input dir="auto" className={FIELD_CLASS} maxLength={MAKKBOZ_COPY_LIMITS[field]} value={draft[field]}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((current) => ({ ...current, [field]: value }));
                    setNotice('');
                  }} />
              </label>
            );
          })}
        </fieldset>
      ))}

      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground" role="status">
          {dirty ? t('verde.state.dirty') : unpublished ? t('verde.state.unpublished') : t('verde.state.live')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={disabled || !dirty} onClick={() => void run(() => saveMakkbozMenuDraft(restaurantId, draft), t('verde.notice.saved'))}>
            {t('verde.actions.save')}
          </Button>
          <Button variant="secondary" disabled={disabled || dirty || !unpublished} onClick={() => void run(() => publishMakkbozMenu(restaurantId), t('verde.notice.published'))}>
            {t('verde.actions.publish')}
          </Button>
        </div>
      </div>
    </section>
  );
}
