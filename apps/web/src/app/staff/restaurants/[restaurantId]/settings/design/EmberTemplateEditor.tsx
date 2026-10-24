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
import { ImageField } from '../../../../../../components/menu/ImageField';
import { validateImageFile } from '../../../../../../lib/menu/image-validation';
import { resolveAssetUrl } from '../../../../../../lib/media/asset-url';
import {
  DEFAULT_EMBER_SETTINGS,
  normalizeEmberTemplateSettings,
  type EmberTemplateSettings,
  type EmberPalette,
  type EmberMotion,
  type EmberImageMode,
} from '../../../../../../lib/public-menu/ember-settings';
import {
  getEmberTemplateConfig,
  publishEmberTemplateConfig,
  saveEmberTemplateDraft,
  uploadEmberTemplateHeroImage,
} from '../../../../../../lib/settings/api';

const COPY_FIELDS = [
  { keyAr: 'navTaglineAr', keyEn: 'navTaglineEn', title: 'design.emberNavTagline', limit: 100 },
  { keyAr: 'eyebrowAr', keyEn: 'eyebrowEn', title: 'design.emberEyebrow', limit: 100 },
  { keyAr: 'headlineAr', keyEn: 'headlineEn', title: 'design.emberHeadline', limit: 80 },
  { keyAr: 'subtitleAr', keyEn: 'subtitleEn', title: 'design.emberSubtitle', limit: 180 },
  { keyAr: 'signatureAr', keyEn: 'signatureEn', title: 'design.emberSignature', limit: 120 },
  { keyAr: 'marqueeAr', keyEn: 'marqueeEn', title: 'design.emberMarquee', limit: 180 },
] as const;

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
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [copyLanguage, setCopyLanguage] = useState<'Ar' | 'En'>('Ar');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<'saved' | 'published' | 'uploaded' | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const unpublished = JSON.stringify(savedDraft) !== JSON.stringify(published);

  useEffect(() => {
    let cancelled = false;
    getEmberTemplateConfig(restaurantId)
      .then((result) => {
        if (cancelled) return;
        setDraft(normalizeEmberTemplateSettings(result.draft));
        setSavedDraft(normalizeEmberTemplateSettings(result.draft));
        setPublished(normalizeEmberTemplateSettings(result.published));
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

  async function uploadPhoto(file: File) {
    const message = validateImageFile(file);
    if (message) {
      setImageError(message);
      return;
    }
    setImageUploading(true);
    setImageError(null);
    setNotice(null);
    try {
      const result = await uploadEmberTemplateHeroImage(restaurantId, file);
      // Upload saves a server-side draft. Preserve edits still being typed locally.
      setSavedDraft(normalizeEmberTemplateSettings(result.draft));
      setPublished(normalizeEmberTemplateSettings(result.published));
      setDraft((current) => ({
        ...current,
        heroImageMode: 'CUSTOM',
        heroImageAssetPath: result.draft.heroImageAssetPath,
      }));
      setNotice('uploaded');
    } catch (caught) {
      if (isUnauthenticatedError(caught)) redirectToLogin();
      else setImageError(describeError(caught));
    } finally {
      setImageUploading(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveEmberTemplateDraft(restaurantId, draft);
      setDraft(normalizeEmberTemplateSettings(result.draft));
      setSavedDraft(normalizeEmberTemplateSettings(result.draft));
      setPublished(normalizeEmberTemplateSettings(result.published));
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
    if (dirty || imageUploading) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await publishEmberTemplateConfig(restaurantId);
      setDraft(normalizeEmberTemplateSettings(result.draft));
      setSavedDraft(normalizeEmberTemplateSettings(result.draft));
      setPublished(normalizeEmberTemplateSettings(result.published));
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
      {notice === 'uploaded' ? <Alert variant="success">{t('design.emberPhotoUploaded')}</Alert> : null}
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


      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div>
          <h4 className="font-bold text-foreground">{t('design.emberCopyHeading')}</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('design.emberCopyHint')}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant={copyLanguage === 'Ar' ? 'primary' : 'secondary'}
            onClick={() => setCopyLanguage('Ar')}>{t('design.emberLanguageAr')}</Button>
          <Button type="button" variant={copyLanguage === 'En' ? 'primary' : 'secondary'}
            onClick={() => setCopyLanguage('En')}>{t('design.emberLanguageEn')}</Button>
        </div>
        {COPY_FIELDS.map((field) => {
          const key = copyLanguage === 'Ar' ? field.keyAr : field.keyEn;
          const isLong = key.startsWith('subtitle') || key.startsWith('marquee');
          return (
            <label key={key} className="block space-y-2 text-sm font-semibold">
              <span className="block">{t(field.title)}</span>
              {isLong ? (
                <textarea
                  dir={copyLanguage === 'Ar' ? 'rtl' : 'ltr'}
                  rows={2}
                  value={draft[key] ?? DEFAULT_EMBER_SETTINGS[key]}
                  maxLength={field.limit}
                  disabled={!canManage || busy || imageUploading}
                  onChange={(event) => update(key, event.target.value)}
                  className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2.5 text-foreground"
                />
              ) : (
                <input
                  dir={copyLanguage === 'Ar' ? 'rtl' : 'ltr'}
                  value={draft[key] ?? DEFAULT_EMBER_SETTINGS[key]}
                  maxLength={field.limit}
                  disabled={!canManage || busy || imageUploading}
                  onChange={(event) => update(key, event.target.value)}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-foreground"
                />
              )}
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-normal text-muted-foreground">
                  {(draft[key] ?? DEFAULT_EMBER_SETTINGS[key]).length}/{field.limit}
                </span>
                <button
                  type="button"
                  disabled={!canManage || busy || imageUploading}
                  onClick={() => update(key, DEFAULT_EMBER_SETTINGS[key])}
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >{t('design.emberResetText')}</button>
              </span>
            </label>
          );
        })}
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div>
          <h4 className="font-bold text-foreground">{t('design.emberImageHeading')}</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('design.emberImageAutoHint')}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['AUTO', 'CUSTOM'] as const).map((mode) => (
            <label
              key={mode}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-input p-3 text-sm font-medium"
            >
              <input
                type="radio"
                name="ember-hero-image-mode"
                checked={draft.heroImageMode === mode}
                disabled={!canManage || busy || imageUploading ||
                  (mode === 'CUSTOM' && !draft.heroImageAssetPath)}
                onChange={() => update('heroImageMode', mode as EmberImageMode)}
                className="accent-primary"
              />
              {mode === 'AUTO' ? t('design.emberImageAuto') : t('design.emberImageCustom')}
            </label>
          ))}
        </div>
        <ImageField
          idPrefix="ember-hero"
          imageUrl={resolveAssetUrl(draft.heroImageAssetPath)}
          onSelectFile={(file) => void uploadPhoto(file)}
          isBusy={busy || imageUploading || !canManage}
          error={imageError}
          selectLabel={t('design.emberUploadPhoto')}
          helperText={t('design.emberPhotoHelp')}
          previewShape="wide"
        />
        <p className="text-xs text-muted-foreground">
          {draft.heroImageMode === 'CUSTOM'
            ? t('design.emberImagePreviewCustom')
            : t('design.emberImagePreviewAuto')}
        </p>
        <p className="text-xs text-muted-foreground">{t('design.emberImageCustomHint')}</p>
      </div>

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
        <p dir="auto" className="mt-3 text-[11px] text-orange-200">
          {copyLanguage === 'Ar' ? draft.navTaglineAr : draft.navTaglineEn}
        </p>
        <p dir="auto" className="mt-4 text-[10px] font-bold uppercase tracking-widest text-orange-300">
          {copyLanguage === 'Ar' ? draft.eyebrowAr : draft.eyebrowEn}
        </p>
        <p dir="auto" className="mt-2 text-2xl font-black leading-tight">
          {copyLanguage === 'Ar' ? draft.headlineAr : draft.headlineEn}
        </p>
        <p dir="auto" className="mt-2 text-sm text-white/85">
          {copyLanguage === 'Ar' ? draft.subtitleAr : draft.subtitleEn}
        </p>
        <p dir="auto" className="mt-2 text-xs text-orange-200">
          {copyLanguage === 'Ar' ? draft.signatureAr : draft.signatureEn}
        </p>
        {draft.heroImageMode === 'CUSTOM' && draft.heroImageAssetPath ? (
          // eslint-disable-next-line @next/next/no-img-element -- Asset served by the runtime API.
          <img src={resolveAssetUrl(draft.heroImageAssetPath) ?? undefined}
            alt="" className="mt-3 h-28 w-full rounded-lg object-cover" />
        ) : null}
        <div className="mt-4 overflow-hidden rounded-md bg-orange-400 p-2 text-center text-xs font-bold text-amber-950">
          {copyLanguage === 'Ar' ? draft.marqueeAr : draft.marqueeEn}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t('design.emberPreviewNotice')}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void saveDraft()} disabled={!canManage || !dirty || busy || imageUploading}>{t('design.emberSaveDraft')}</Button>
        <Button onClick={() => void publish()} disabled={!canManage || dirty || !unpublished || busy || imageUploading}>{t('design.emberPublish')}</Button>
      </div>
    </section>
  );
}
