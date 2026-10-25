'use client';

import { useEffect, useState } from 'react';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { ImageField } from '../../../../../../components/menu/ImageField';
import { ApiError } from '../../../../../../lib/api/errors';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { validateImageFile } from '../../../../../../lib/menu/image-validation';
import { describeError, isUnauthenticatedError, redirectToLogin } from '../../../../../../lib/menu/error-message';
import { resolveAssetUrl } from '../../../../../../lib/media/asset-url';
import {
  DEFAULT_BLOOM_SETTINGS,
  normalizeBloomTemplateSettings,
  type BloomTemplateSettings,
  type BloomPalette,
  type BloomMotion,
} from '../../../../../../lib/public-menu/bloom-settings';
import {
  getBloomTemplateConfig,
  saveBloomTemplateDraft,
  publishBloomTemplateConfig,
  uploadBloomTemplateHeroImage,
  resetBloomTemplateHeroImage,
} from '../../../../../../lib/settings/api';

const FIELDS = [
  { keyAr: 'ribbonAr', keyEn: 'ribbonEn', label: 'design.bloomRibbon', limit: 180 },
  { keyAr: 'navTaglineAr', keyEn: 'navTaglineEn', label: 'design.bloomNavTagline', limit: 100 },
  { keyAr: 'eyebrowAr', keyEn: 'eyebrowEn', label: 'design.bloomEyebrow', limit: 120 },
  { keyAr: 'headlineTopAr', keyEn: 'headlineTopEn', label: 'design.bloomHeadlineTop', limit: 60 },
  { keyAr: 'headlineMiddleAr', keyEn: 'headlineMiddleEn', label: 'design.bloomHeadlineMiddle', limit: 60 },
  { keyAr: 'headlineBottomAr', keyEn: 'headlineBottomEn', label: 'design.bloomHeadlineBottom', limit: 60 },
  { keyAr: 'subtitleAr', keyEn: 'subtitleEn', label: 'design.bloomSubtitle', limit: 180 },
  { keyAr: 'ctaAr', keyEn: 'ctaEn', label: 'design.bloomCta', limit: 60 },
  { keyAr: 'sectionEyebrowAr', keyEn: 'sectionEyebrowEn', label: 'design.bloomSectionEyebrow', limit: 100 },
  { keyAr: 'sectionHeadlineAr', keyEn: 'sectionHeadlineEn', label: 'design.bloomSectionHeadline', limit: 100 },
] as const;

/** BLOOM appearance: all reference demo copy starts as actual editable field data. */
export function BloomTemplateEditor({
  restaurantId,
  canManage,
  onDraftChange,
  onCopyLanguageChange,
}: {
  restaurantId: string;
  canManage: boolean;
  onDraftChange: (settings: BloomTemplateSettings) => void;
  onCopyLanguageChange: (locale: 'ar' | 'en') => void;
}) {
  const { t } = useStaffI18n();
  const [draft, setDraft] = useState<BloomTemplateSettings>(DEFAULT_BLOOM_SETTINGS);
  const [savedDraft, setSavedDraft] = useState<BloomTemplateSettings>(DEFAULT_BLOOM_SETTINGS);
  const [published, setPublished] = useState<BloomTemplateSettings>(DEFAULT_BLOOM_SETTINGS);
  const [copyLanguage, setCopyLanguage] = useState<'Ar' | 'En'>('Ar');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<'saved' | 'published' | 'uploaded' | 'reset' | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const unpublished = JSON.stringify(savedDraft) !== JSON.stringify(published);

  useEffect(() => {
    let cancelled = false;
    getBloomTemplateConfig(restaurantId)
      .then((result) => {
        if (cancelled) return;
        setDraft(normalizeBloomTemplateSettings(result.draft));
        setSavedDraft(normalizeBloomTemplateSettings(result.draft));
        setPublished(normalizeBloomTemplateSettings(result.published));
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

  useEffect(() => {
    if (!loading) onDraftChange(draft);
  }, [draft, loading, onDraftChange]);

  function update<K extends keyof BloomTemplateSettings>(key: K, value: BloomTemplateSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function photoError(caught: unknown): string {
    if (caught instanceof ApiError && caught.code === 'UNKNOWN_ERROR') {
      if (caught.status === 404) return t('design.bloomUploadNotFound');
      if (caught.status === 413) return t('design.bloomUploadTooLarge');
      if (caught.status >= 500) return t('design.bloomUploadServerError') + ` (HTTP ${caught.status})`;
      return describeError(caught) + ` (HTTP ${caught.status})`;
    }
    return describeError(caught);
  }

  async function uploadPhoto(file: File) {
    const invalid = validateImageFile(file);
    if (invalid) { setImageError(invalid); return; }
    setImageUploading(true); setImageError(null); setNotice(null);
    try {
      const result = await uploadBloomTemplateHeroImage(restaurantId, file);
      setSavedDraft(normalizeBloomTemplateSettings(result.draft));
      setPublished(normalizeBloomTemplateSettings(result.published));
      // Preserve any currently unsaved copy; the upload only changes draft artwork.
      setDraft((current) => ({
        ...current, heroImageMode: 'CUSTOM', heroImageAssetPath: result.draft.heroImageAssetPath,
      }));
      setNotice('uploaded');
    } catch (caught) {
      if (isUnauthenticatedError(caught)) redirectToLogin();
      else setImageError(photoError(caught));
    } finally { setImageUploading(false); }
  }

  async function resetPhoto() {
    setImageUploading(true); setImageError(null); setNotice(null);
    try {
      const result = await resetBloomTemplateHeroImage(restaurantId);
      setSavedDraft(normalizeBloomTemplateSettings(result.draft));
      setPublished(normalizeBloomTemplateSettings(result.published));
      setDraft((current) => ({ ...current, heroImageMode: 'ART', heroImageAssetPath: null }));
      setNotice('reset');
    } catch (caught) {
      if (isUnauthenticatedError(caught)) redirectToLogin();
      else setImageError(photoError(caught));
    } finally { setImageUploading(false); }
  }

  async function saveDraft() {
    if (imageUploading) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await saveBloomTemplateDraft(restaurantId, draft);
      setDraft(normalizeBloomTemplateSettings(result.draft));
      setSavedDraft(normalizeBloomTemplateSettings(result.draft));
      setPublished(normalizeBloomTemplateSettings(result.published));
      setNotice('saved');
    } catch (caught) {
      if (isUnauthenticatedError(caught)) redirectToLogin();
      else setError(describeError(caught));
    } finally { setBusy(false); }
  }

  async function publish() {
    if (dirty || imageUploading) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await publishBloomTemplateConfig(restaurantId);
      setDraft(normalizeBloomTemplateSettings(result.draft));
      setSavedDraft(normalizeBloomTemplateSettings(result.draft));
      setPublished(normalizeBloomTemplateSettings(result.published));
      setNotice('published');
    } catch (caught) {
      if (isUnauthenticatedError(caught)) redirectToLogin();
      else setError(describeError(caught));
    } finally { setBusy(false); }
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t('design.bloomLoading')}</p>;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-secondary/40 p-4"
      aria-label={t('design.bloomSettings')}>
      <header>
        <h3 className="text-base font-bold">{t('design.bloomSettings')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('design.bloomSettingsHint')}</p>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice === 'saved' ? <Alert variant="success">{t('design.bloomDraftSaved')}</Alert> : null}
      {notice === 'published' ? <Alert variant="success">{t('design.bloomPublished')}</Alert> : null}
      {notice === 'uploaded' ? <Alert variant="success">{t('design.bloomPhotoUploaded')}</Alert> : null}
      {notice === 'reset' ? <Alert variant="success">{t('design.bloomPhotoReset')}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-semibold">
          <span>{t('design.bloomPalette')}</span>
          <select className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-foreground"
            value={draft.palette} disabled={!canManage || busy || imageUploading}
            onChange={(event) => update('palette', event.target.value as BloomPalette)}>
            <option value="ROSE">{t('design.bloomPaletteRose')}</option>
            <option value="LILAC">{t('design.bloomPaletteLilac')}</option>
            <option value="PEACH">{t('design.bloomPalettePeach')}</option>
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold">
          <span>{t('design.bloomMotion')}</span>
          <select className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-foreground"
            value={draft.motion} disabled={!canManage || busy || imageUploading}
            onChange={(event) => update('motion', event.target.value as BloomMotion)}>
            <option value="SUBTLE">{t('design.bloomMotionSubtle')}</option>
            <option value="OFF">{t('design.bloomMotionOff')}</option>
          </select>
        </label>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h4 className="font-bold">{t('design.bloomCopyHeading')}</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('design.bloomCopyHint')}</p>
        <div className="flex gap-2">
          <Button type="button" variant={copyLanguage === 'Ar' ? 'primary' : 'secondary'}
            onClick={() => { setCopyLanguage('Ar'); onCopyLanguageChange('ar'); }}>
            {t('design.bloomLanguageAr')}
          </Button>
          <Button type="button" variant={copyLanguage === 'En' ? 'primary' : 'secondary'}
            onClick={() => { setCopyLanguage('En'); onCopyLanguageChange('en'); }}>
            {t('design.bloomLanguageEn')}
          </Button>
        </div>
        {FIELDS.map((field) => {
          const key = copyLanguage === 'Ar' ? field.keyAr : field.keyEn;
          const value = draft[key] ?? DEFAULT_BLOOM_SETTINGS[key];
          const isLong = key.startsWith('subtitle') || key.startsWith('ribbon');
          const shared = {
            dir: copyLanguage === 'Ar' ? 'rtl' : 'ltr',
            value,
            maxLength: field.limit,
            disabled: !canManage || busy || imageUploading,
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              update(key, event.target.value),
          } as const;
          return (
            <label key={key} className="block space-y-2 text-sm font-semibold">
              <span className="block">{t(field.label)}</span>
              {isLong ? (
                <textarea {...shared} rows={2}
                  className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2.5 text-foreground" />
              ) : (
                <input {...shared} className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-foreground" />
              )}
              <span className="flex items-center justify-between gap-2 text-[11px] font-normal text-muted-foreground">
                <span>{value.length}/{field.limit}</span>
                <button type="button" disabled={!canManage || busy || imageUploading}
                  onClick={() => update(key, DEFAULT_BLOOM_SETTINGS[key])}
                  className="text-primary hover:underline disabled:opacity-50">
                  {t('design.bloomRestoreDefault')}
                </button>
              </span>
            </label>
          );
        })}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h4 className="font-bold">{t('design.bloomImageHeading')}</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('design.bloomImageHint')}</p>
        <ImageField
          idPrefix="bloom-hero"
          imageUrl={draft.heroImageMode === 'CUSTOM' ? resolveAssetUrl(draft.heroImageAssetPath) : null}
          onSelectFile={(file) => void uploadPhoto(file)}
          isBusy={busy || imageUploading || !canManage}
          error={imageError}
          selectLabel={t('design.bloomUploadPhoto')}
          helperText={t('design.bloomPhotoHelp')}
          previewShape="wide"
        />
        {draft.heroImageMode === 'CUSTOM' && draft.heroImageAssetPath ? (
          <Button type="button" variant="secondary"
            disabled={!canManage || busy || imageUploading} onClick={() => void resetPhoto()}>
            {t('design.bloomImageResetArt')}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">{t('design.bloomImageCustomHint')}</p>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{t('design.bloomPreviewNotice')}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void saveDraft()} disabled={!canManage || !dirty || busy || imageUploading}>
          {t('design.bloomSaveDraft')}
        </Button>
        <Button onClick={() => void publish()} disabled={!canManage || dirty || !unpublished || busy || imageUploading}>
          {t('design.bloomPublish')}
        </Button>
      </div>
    </section>
  );
}
