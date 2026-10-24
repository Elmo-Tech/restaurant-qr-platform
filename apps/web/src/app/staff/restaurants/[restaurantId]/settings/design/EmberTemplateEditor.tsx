'use client';

import { useEffect, useState } from 'react';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import {
  DEFAULT_EMBER_SETTINGS,
  type EmberTemplateSettings,
  type EmberPalette,
  type EmberMotion,
} from '../../../../../../lib/public-menu/ember-settings';
import {
  getEmberTemplateConfig,
  publishEmberTemplateConfig,
  saveEmberTemplateDraft,
} from '../../../../../../lib/settings/api';

/** Separate, versioned settings for EMBER. Never edits the restaurant's menu data. */
export function EmberTemplateEditor({
  restaurantId,
  canManage,
  onPublished,
}: {
  restaurantId: string;
  canManage: boolean;
  onPublished: () => void;
}) {
  const { t } = useStaffI18n();
  const [draft, setDraft] = useState<EmberTemplateSettings>(DEFAULT_EMBER_SETTINGS);
  const [savedDraft, setSavedDraft] = useState<EmberTemplateSettings>(DEFAULT_EMBER_SETTINGS);
  const [published, setPublished] = useState<EmberTemplateSettings>(DEFAULT_EMBER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<'saved' | 'published' | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const unpublished = JSON.stringify(savedDraft) !== JSON.stringify(published);

  useEffect(() => {
    let cancelled = false;
    getEmberTemplateConfig(restaurantId)
      .then((result) => {
        if (cancelled) return;
        setDraft(result.draft);
        setSavedDraft(result.draft);
        setPublished(result.published);
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        if (isUnauthenticatedError(caught)) redirectToLogin();
        else setError(describeError(caught));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  function update<K extends keyof EmberTemplateSettings>(key: K, value: EmberTemplateSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveEmberTemplateDraft(restaurantId, draft);
      setDraft(result.draft);
      setSavedDraft(result.draft);
      setPublished(result.published);
      setNotice('saved');
    } catch (caught) {
      if (isUnauthenticatedError(caught)) redirectToLogin();
      else setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    // A stale local draft must not publish an older saved snapshot accidentally.
    if (dirty) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await publishEmberTemplateConfig(restaurantId);
      setDraft(result.draft);
      setSavedDraft(result.draft);
      setPublished(result.published);
      setNotice('published');
      onPublished();
    } catch (caught) {
      if (isUnauthenticatedError(caught)) redirectToLogin();
      else setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t('design.emberLoading')}</p>;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-secondary/40 p-4" aria-label={t('design.emberSettings')}>
      <div>
        <h3 className="text-base font-bold text-foreground">{t('design.emberSettings')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('design.emberSettingsHint')}</p>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice === 'saved' ? <Alert variant="success">{t('design.emberDraftSaved')}</Alert> : null}
      {notice === 'published' ? <Alert variant="success">{t('design.emberPublished')}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-semibold">
          <span>{t('design.emberPalette')}</span>
          <select
            value={draft.palette}
            disabled={!canManage || busy}
            onChange={(event) => update('palette', event.target.value as EmberPalette)}
            className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-foreground"
          >
            <option value="EMBER">{t('design.emberPaletteWarm')}</option>
            <option value="NOIR">{t('design.emberPaletteNoir')}</option>
            <option value="COPPER">{t('design.emberPaletteCopper')}</option>
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold">
          <span>{t('design.emberMotion')}</span>
          <select
            value={draft.motion}
            disabled={!canManage || busy}
            onChange={(event) => update('motion', event.target.value as EmberMotion)}
            className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-foreground"
          >
            <option value="SUBTLE">{t('design.emberMotionSubtle')}</option>
            <option value="OFF">{t('design.emberMotionOff')}</option>
          </select>
        </label>
      </div>

      {([
        ['headlineAr', 'design.emberHeadlineAr', 80],
        ['headlineEn', 'design.emberHeadlineEn', 80],
        ['subtitleAr', 'design.emberSubtitleAr', 180],
        ['subtitleEn', 'design.emberSubtitleEn', 180],
      ] as const).map(([key, label, limit]) => (
        <label key={key} className="block space-y-1.5 text-sm font-semibold">
          <span>{t(label)}</span>
          <input
            dir={key.endsWith('Ar') ? 'rtl' : 'ltr'}
            value={draft[key]}
            maxLength={limit}
            disabled={!canManage || busy}
            onChange={(event) => update(key, event.target.value)}
            placeholder={t('design.emberOptional')}
            className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-foreground"
          />
          <span className="block text-end text-[11px] font-normal text-muted-foreground">{draft[key].length}/{limit}</span>
        </label>
      ))}

      <div
        className="rounded-xl p-5 text-white"
        style={{
          background:
            draft.palette === 'NOIR'
              ? 'linear-gradient(120deg,#0c0d11,#40342b)'
              : draft.palette === 'COPPER'
                ? 'linear-gradient(120deg,#26140f,#9a5732)'
                : 'linear-gradient(120deg,#1e0f09,#b95b29)',
        }}
      >
        <div className="text-[11px] font-bold uppercase tracking-widest text-white/70">{t('design.emberDraftPreview')}</div>
        <p dir="auto" className="mt-3 text-2xl font-bold leading-tight">
          {draft.headlineAr || draft.headlineEn || t('design.emberPreviewTitle')}
        </p>
        <p dir="auto" className="mt-2 text-sm text-white/85">
          {draft.subtitleAr || draft.subtitleEn || t('design.emberPreviewSubtitle')}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t('design.emberPreviewNotice')}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void saveDraft()} disabled={!canManage || !dirty || busy}>{t('design.emberSaveDraft')}</Button>
        <Button onClick={() => void publish()} disabled={!canManage || dirty || !unpublished || busy}>{t('design.emberPublish')}</Button>
      </div>
    </section>
  );
}
