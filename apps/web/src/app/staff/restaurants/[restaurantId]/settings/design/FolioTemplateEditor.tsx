'use client';

import { useEffect, useState } from 'react';
import { ImageField } from '../../../../../../components/menu/ImageField';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { validateImageFile } from '../../../../../../lib/menu/image-validation';
import { describeError, isUnauthenticatedError, redirectToLogin } from '../../../../../../lib/menu/error-message';
import { resolveAssetUrl } from '../../../../../../lib/media/asset-url';
import {
  DEFAULT_FOLIO_SETTINGS, FOLIO_COPY_LIMITS, normalizeFolioTemplateSettings,
  type FolioTemplateConfigView, type FolioTemplateSettings, type FolioPalette, type FolioArtworkMode,
} from '../../../../../../lib/public-menu/folio-settings';
import {
  getFolioTemplateConfig, saveFolioTemplateDraft, publishFolioTemplate,
  uploadFolioArtwork, resetFolioArtwork,
} from '../../../../../../lib/settings/api';

const FIELDS = [
  { key: 'eyebrow', ar: 'النص الصغير أعلى العنوان', en: 'Hero eyebrow' },
  { key: 'headline', ar: 'العنوان الرئيسي', en: 'Main headline' },
  { key: 'coverTagline', ar: 'عبارة غلاف الكتاب', en: 'Cover tagline' },
  { key: 'coverCta', ar: 'زر فتح الكتاب', en: 'Open-book button' },
  { key: 'collectionLabel', ar: 'عنوان المجموعة أعلى الصفحات', en: 'Page collection label' },
  { key: 'chapterSubtitle', ar: 'الوصف أسفل عنوان القسم', en: 'Chapter description' },
  { key: 'pageFooter', ar: 'العبارة أسفل الصفحة والغلاف', en: 'Book footer tagline' },
] as const;
const PALETTES: { key: FolioPalette; ar: string; en: string; swatch: string }[] = [
  { key: 'FOREST', ar: 'الأخضر الكلاسيكي (الأصلي)', en: 'Classic forest (original)', swatch: '#233629' },
  { key: 'BURGUNDY', ar: 'عنابي فاخر', en: 'Luxury burgundy', swatch: '#4b3036' },
  { key: 'MIDNIGHT', ar: 'أزرق منتصف الليل', en: 'Midnight navy', swatch: '#213743' },
];

export function FolioTemplateEditor({ restaurantId, canManage, onDraftChange, onCopyLanguageChange }: {
  restaurantId: string; canManage: boolean;
  onDraftChange: (value: FolioTemplateSettings) => void;
  onCopyLanguageChange: (value: 'ar' | 'en') => void;
}) {
  const { isRtl } = useStaffI18n();
  const [draft, setDraft] = useState<FolioTemplateSettings>(DEFAULT_FOLIO_SETTINGS);
  const [saved, setSaved] = useState<FolioTemplateSettings>(DEFAULT_FOLIO_SETTINGS);
  const [published, setPublished] = useState<FolioTemplateSettings>(DEFAULT_FOLIO_SETTINGS);
  const [copyLanguage, setCopyLanguage] = useState<'Ar' | 'En'>('Ar');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const unpublished = JSON.stringify(saved) !== JSON.stringify(published);
  const text = (ar: string, en: string) => isRtl ? ar : en;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFolioTemplateConfig(restaurantId).then(value => {
      if (cancelled) return;
      setDraft(value.draft); setSaved(value.draft); setPublished(value.published);
      setError(null);
    }).catch(reason => {
      if (cancelled) return;
      if (isUnauthenticatedError(reason)) redirectToLogin();
      else setError(describeError(reason));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  useEffect(() => { if (!loading) onDraftChange(draft); }, [draft, loading, onDraftChange]);

  function change<K extends keyof FolioTemplateSettings>(key: K, value: FolioTemplateSettings[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
    setNotice('');
  }
  async function run(job: () => Promise<FolioTemplateConfigView>, success: string) {
    setBusy(true); setError(null); setNotice('');
    try {
      const data = await job();
      setDraft(data.draft); setSaved(data.draft); setPublished(data.published);
      setNotice(success);
    } catch (reason) {
      if (isUnauthenticatedError(reason)) redirectToLogin();
      else setError(describeError(reason));
    } finally { setBusy(false); }
  }
  // Media mutation only saves the managed image in the draft; keep other unsaved edits.
  async function runArtwork(job: () => Promise<FolioTemplateConfigView>, success: string) {
    setBusy(true); setError(null); setNotice('');
    try {
      const data = await job();
      setSaved(data.draft); setPublished(data.published);
      setDraft(current => ({
        ...current,
        artworkMode: data.draft.artworkMode,
        artworkAssetPath: data.draft.artworkAssetPath,
      }));
      setNotice(success);
    } catch (reason) {
      if (isUnauthenticatedError(reason)) redirectToLogin();
      else setError(describeError(reason));
    } finally { setBusy(false); }
  }
  async function upload(file: File) {
    const validation = validateImageFile(file);
    if (validation) { setError(validation); return; }
    await runArtwork(() => uploadFolioArtwork(restaurantId, file),
      text('تم رفع الصورة للمسودة فقط؛ انشر المظهر لإظهارها للزوار.', 'Artwork uploaded to draft. Publish to show it to guests.'));
  }

  if (loading) return <p className="text-sm text-muted-foreground">
    {text('جارٍ تحميل إعدادات فوليو…', 'Loading Folio appearance…')}
  </p>;
  return <section className="space-y-5 rounded-xl border border-border bg-secondary/40 p-3 sm:p-4">
    <div>
      <h3 className="text-base font-bold text-foreground">
        {text('فوليو · تخصيص الكتاب التفاعلي', 'FOLIO · Interactive book appearance')}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {text(
          'بنحافظ على تصميم الكتاب الأصلي وخطي Cormorant Garamond وTajawal. كل تغيير بيظهر في المعاينة فورًا؛ العملاء بيشوفوا النسخة المنشورة فقط.',
          'Original book, Cormorant Garamond and Tajawal fonts are preserved. Draft changes update the preview instantly; guests see published settings only.',
        )}
      </p>
    </div>
    {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    {notice ? <p role="status" className="text-sm font-semibold text-green-700">{notice}</p> : null}

    <fieldset disabled={busy || !canManage} className="space-y-2">
      <legend className="mb-2 text-sm font-bold">{text('ألوان الكتاب', 'Book colors')}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {PALETTES.map(option => <label key={option.key} className={
          'flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border p-2 text-xs ' +
          (draft.palette === option.key ? 'border-primary bg-accent' : 'border-border bg-card')
        }>
          <input type="radio" name="folioPalette" checked={draft.palette === option.key}
            onChange={() => change('palette', option.key)} className="accent-primary"/>
          <span className="size-7 shrink-0 rounded-full border border-white/50"
            style={{ background: option.swatch }} aria-hidden="true"/>
          <span>{isRtl ? option.ar : option.en}</span>
        </label>)}
      </div>
    </fieldset>

    <label className="block text-sm font-semibold text-foreground">
      {text('حركة تقليب الصفحات', 'Page-turn motion')}
      <select value={draft.motion} disabled={!canManage || busy}
        onChange={e => change('motion', e.target.value === 'OFF' ? 'OFF' : 'SUBTLE')}
        className="mt-2 block w-full rounded-lg border border-input bg-card p-3 text-foreground">
        <option value="SUBTLE">{text('حركة ناعمة', 'Subtle motion')}</option>
        <option value="OFF">{text('بدون حركة', 'No motion')}</option>
      </select>
    </label>

    <div className="space-y-3">
      <h4 className="text-sm font-bold text-foreground">{text('العبارات والعناوين', 'Headings and copy')}</h4>
      <div className="flex gap-2" role="group" aria-label={text('لغة النصوص', 'Copy language')}>
        {(['Ar', 'En'] as const).map(lang => <button key={lang} type="button"
          className={'min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold ' +
            (copyLanguage === lang ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground')}
          onClick={() => { setCopyLanguage(lang); onCopyLanguageChange(lang.toLowerCase() as 'ar' | 'en'); }}>
          {lang === 'Ar' ? 'العربية' : 'English'}
        </button>)}
      </div>
      {FIELDS.map(field => {
        const key = `${field.key}${copyLanguage}` as keyof typeof FOLIO_COPY_LIMITS;
        const value = draft[key];
        return <div className="space-y-1" key={key}>
          <label htmlFor={`folio-field-${key}`} className="block text-xs font-semibold">
            {isRtl ? field.ar : field.en}
          </label>
          <input id={`folio-field-${key}`} className="block min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
            dir={copyLanguage === 'Ar' ? 'rtl' : 'ltr'} maxLength={FOLIO_COPY_LIMITS[key]}
            disabled={busy || !canManage} value={value}
            onChange={e => change(key, e.target.value)}/>
          <button type="button" disabled={busy || !canManage}
            className="text-xs text-primary underline" onClick={() => change(key, DEFAULT_FOLIO_SETTINGS[key])}>
            {text('استعادة النص الأصلي', 'Restore original')}
          </button>
        </div>;
      })}
    </div>
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <h4 className="text-sm font-bold">{text('صورة الصفحة المقابلة للمنتجات', 'Artwork facing the menu page')}</h4>
      <fieldset disabled={busy || !canManage} className="grid gap-2">
        <legend className="sr-only">{text('نوع الصورة', 'Artwork mode')}</legend>
        {([
          ['ILLUSTRATION', text('رسم الطبق الأصلي (الافتراضي)', 'Original illustrated plate')],
          ['FEATURED', text('صورة من منتجات المطعم تلقائيًا', 'Use a restaurant product photo')],
          ['CUSTOM', text('صورة خاصة بالقالب', 'Custom uploaded photo')],
        ] as const).map(([mode, label]) =>
          <label key={mode} className={'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ' +
            (draft.artworkMode === mode ? 'border-primary bg-accent' : 'border-border')}>
            <input type="radio" name="folioArtMode" checked={draft.artworkMode === mode}
              disabled={mode === 'CUSTOM' && !draft.artworkAssetPath}
              onChange={() => change('artworkMode', mode as FolioArtworkMode)} className="accent-primary"/>
            {label}
          </label>,
        )}
      </fieldset>
      <ImageField idPrefix="folio-artwork" imageUrl={resolveAssetUrl(draft.artworkAssetPath)}
        onSelectFile={file => void upload(file)} isBusy={busy || !canManage} error={error}
        selectLabel={text('رفع صورة خاصة لفوليو', 'Upload custom Folio image')}
        helperText={text('JPG أو PNG أو WebP، الصورة اختيارية ولا تغير صورة غلاف المطعم.', 'Optional JPG/PNG/WebP; does not change the restaurant cover image.')}
        previewShape="wide"/>
      {draft.artworkAssetPath ? <button type="button" disabled={busy || !canManage}
        className="text-xs text-primary underline"
        onClick={() => void runArtwork(() => resetFolioArtwork(restaurantId),
          text('تمت استعادة الرسم الأصلي في المسودة.', 'Original illustration restored in draft.'))}>
        {text('حذف الصورة واستعادة الرسم', 'Remove image and restore illustration')}
      </button> : null}
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || !canManage || !dirty}
        className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        onClick={() => void run(() => saveFolioTemplateDraft(restaurantId, draft),
          text('تم حفظ مسودة فوليو.', 'Folio draft saved.'))}>
        {text('حفظ المسودة', 'Save draft')}
      </button>
      <button type="button" disabled={busy || !canManage || dirty || !unpublished}
        className="min-h-11 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold disabled:opacity-50"
        onClick={() => void run(() => publishFolioTemplate(restaurantId),
          text('تم نشر مظهر فوليو للعملاء.', 'Folio appearance published to guests.'))}>
        {text('نشر المظهر', 'Publish appearance')}
      </button>
    </div>
    {dirty ? <p className="text-xs text-amber-700">
      {text('فيه تغييرات غير محفوظة. احفظ المسودة قبل النشر.', 'You have unsaved changes. Save draft before publishing.')}
    </p> : null}
  </section>;
}
