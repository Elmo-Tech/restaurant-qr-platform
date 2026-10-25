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
import { ApiError } from '../../../../../../lib/api/errors';
import { validateImageFile } from '../../../../../../lib/menu/image-validation';
import { resolveAssetUrl } from '../../../../../../lib/media/asset-url';
import {
  DEFAULT_EMBER_SETTINGS,
  normalizeEmberTemplateSettings,
  type EmberTemplateSettings,
  type EmberPalette,
  type EmberMotion,
} from '../../../../../../lib/public-menu/ember-settings';
import {
  getEmberTemplateConfig,
  publishEmberTemplateConfig,
  saveEmberTemplateDraft,
  uploadEmberTemplateHeroImage,
  resetEmberTemplateHeroImage,
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
  onDraftChange,
  onCopyLanguageChange,
}: {
  restaurantId: string;
  canManage: boolean;
  onDraftChange: (settings: EmberTemplateSettings) => void;
  onCopyLanguageChange: (locale: 'ar' | 'en') => void;
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
  const [notice, setNotice] = useState<'saved' | 'published' | 'uploaded' | 'reset' | null>(null);
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

  // The left real-menu iframe is the single unsaved preview for all edits.
  useEffect(() => {
    if (!loading) onDraftChange(draft);
  }, [draft, loading, onDraftChange]);

  function update<K extends keyof EmberTemplateSettings>(key: K, value: EmberTemplateSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function photoError(error: unknown): string {
    if (error instanceof ApiError && error.code === 'UNKNOWN_ERROR') {
      // Older API processes and reverse proxies return non-standard errors.
      // Surface HTTP status rather than the unhelpful "The request failed".
      if (error.status === 404) return t('design.emberUploadNotFound');
      if (error.status === 413) return t('design.emberUploadTooLarge');
      if (error.status >= 500) return t('design.emberUploadServerError') + ` (HTTP ${error.status})`;
      return describeError(error) + ` (HTTP ${error.status})`;
    }
    return describeError(error);
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
      else setImageError(photoError(caught));
    } finally {
      setImageUploading(false);
    }
  }

  async function resetPhoto() {
    setImageUploading(true);
    setImageError(null);
    setNotice(null);
    try {
      const result = await resetEmberTemplateHeroImage(restaurantId);
      setSavedDraft(normalizeEmberTemplateSettings(result.draft));
      setPublished(normalizeEmberTemplateSettings(result.published));
      // Keep any unsaved text edits in the form when removing the photo.
      setDraft((current) => ({
        ...current,
        heroImageMode: 'AUTO',
        heroImageAssetPath: null,
      }));
      setNotice('reset');
    } catch (caught) {
      if (isUnauthenticatedError(caught)) redirectToLogin();
      else setImageError(photoError(caught));
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
      {notice === 'reset' ? <Alert variant="success">{t('design.emberPhotoReset')}</Alert> : null}
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
            onClick={() => { setCopyLanguage('Ar'); onCopyLanguageChange('ar'); }}>{t('design.emberLanguageAr')}</Button>
          <Button type="button" variant={copyLanguage === 'En' ? 'primary' : 'secondary'}
            onClick={() => { setCopyLanguage('En'); onCopyLanguageChange('en'); }}>{t('design.emberLanguageEn')}</Button>
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
        <ImageField
          idPrefix="ember-hero"
          imageUrl={draft.heroImageMode === 'CUSTOM' ? resolveAssetUrl(draft.heroImageAssetPath) : null}
          onSelectFile={(file) => void uploadPhoto(file)}
          isBusy={busy || imageUploading || !canManage}
          error={imageError}
          selectLabel={t('design.emberUploadPhoto')}
          helperText={t('design.emberPhotoHelp')}
          previewShape="wide"
        />
        {draft.heroImageMode === 'CUSTOM' && draft.heroImageAssetPath ? (
          <Button
            type="button"
            variant="secondary"
            disabled={!canManage || busy || imageUploading}
            onClick={() => void resetPhoto()}
          >
            {t('design.emberImageResetAuto')}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {draft.heroImageMode === 'CUSTOM'
            ? t('design.emberImagePreviewCustom')
            : t('design.emberImagePreviewAuto')}
        </p>
        <p className="text-xs text-muted-foreground">{t('design.emberImageCustomHint')}</p>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t('design.emberPreviewNotice')}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void saveDraft()} disabled={!canManage || !dirty || busy || imageUploading}>{t('design.emberSaveDraft')}</Button>
        <Button onClick={() => void publish()} disabled={!canManage || dirty || !unpublished || busy || imageUploading}>{t('design.emberPublish')}</Button>
      </div>
    </section>
  );
}
