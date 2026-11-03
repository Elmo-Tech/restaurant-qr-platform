'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageField } from '../../../../../../components/menu/ImageField';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { listCategories } from '../../../../../../lib/menu/api';
import { describeError, isUnauthenticatedError, redirectToLogin } from '../../../../../../lib/menu/error-message';
import { validateImageFile } from '../../../../../../lib/menu/image-validation';
import type { Category } from '../../../../../../lib/menu/types';
import { resolveAssetUrl } from '../../../../../../lib/media/asset-url';
import {
  DEFAULT_VERDE_SETTINGS,
  VERDE_BRAND_WORD_MAX,
  VERDE_CATEGORY_EXTRA_TEXT,
  VERDE_COPY_DEFAULTS,
  VERDE_COPY_LIMITS,
  type VerdeCopyField,
  type VerdeCopyKey,
  type VerdeImageSlot,
  type VerdeMenuSettings,
} from '../../../../../../lib/public-menu/verde-settings';
import {
  getVerdeMenuConfig,
  publishVerdeMenu,
  resetVerdeCategoryImage,
  resetVerdeImage,
  saveVerdeMenuDraft,
  uploadVerdeCategoryImage,
  uploadVerdeImage,
  type VerdeMenuConfigView,
} from '../../../../../../lib/settings/api';

type Lang = 'Ar' | 'En';

const GROUPS: { id: 'hero' | 'discover' | 'menu' | 'ending'; keys: VerdeCopyKey[] }[] = [
  { id: 'hero', keys: ['tagline', 'kicker', 'headlineTop', 'headlineLine', 'description', 'cta', 'heroNote', 'stampSub', 'sticker', 'marquee'] },
  { id: 'discover', keys: ['introEyebrow', 'introTitle', 'introDescription', 'chapter1Eyebrow', 'chapter1Title', 'chapter2Eyebrow', 'chapter2Title'] },
  { id: 'menu', keys: ['menuTopId', 'menuTopNote', 'sidebarHeading', 'sectionEyebrow', 'spotlightEyebrow'] },
  { id: 'ending', keys: ['endEyebrow', 'endHeadline', 'endDescription'] },
];
const MULTILINE = new Set<VerdeCopyKey>(['description', 'introTitle', 'introDescription', 'endHeadline', 'endDescription']);
const FIELD_CLASS = 'mt-1 block w-full rounded-lg border border-input bg-card px-3 py-2 text-foreground';

/**
 * Dashboard editor of the exclusive VERDE menu (DEC-062): draft / publish like BREW and BLOOM. Image paths are
 * owned by the server (upload and restore use dedicated routes); this component only edits text, choices and
 * references to the Restaurant's own categories, and mirrors every edit to the live preview.
 */
export function VerdeMenuEditor({
  restaurantId,
  canManage,
  onDraftChange,
  onCopyLanguageChange,
}: {
  restaurantId: string;
  canManage: boolean;
  onDraftChange: (draft: VerdeMenuSettings) => void;
  onCopyLanguageChange: (language: 'ar' | 'en') => void;
}) {
  const { t } = useStaffI18n();
  const [draft, setDraft] = useState<VerdeMenuSettings>(DEFAULT_VERDE_SETTINGS);
  const [saved, setSaved] = useState<VerdeMenuSettings>(DEFAULT_VERDE_SETTINGS);
  const [published, setPublished] = useState<VerdeMenuSettings>(DEFAULT_VERDE_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [lang, setLang] = useState<Lang>('Ar');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // Everything except server-owned image paths counts as an unsaved edit.
  const textState = useCallback((s: VerdeMenuSettings) => {
    const { heroImageAssetPath: _a, chapter1ImageAssetPath: _b, chapter2ImageAssetPath: _c, bannerImageAssetPath: _d, categoryExtras, ...rest } = s;
    void [_a, _b, _c, _d];
    return JSON.stringify({ ...rest, categoryExtras: Object.fromEntries(Object.entries(categoryExtras).map(([id, x]) => [id, { introAr: x.introAr, introEn: x.introEn, descAr: x.descAr, descEn: x.descEn }])) });
  }, []);
  const dirty = textState(draft) !== textState(saved);
  const unpublished = JSON.stringify(saved) !== JSON.stringify(published);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getVerdeMenuConfig(restaurantId), listCategories(restaurantId)])
      .then(([config, items]) => {
        if (cancelled) return;
        setDraft(config.draft);
        setSaved(config.draft);
        setPublished(config.published);
        setCategories(items.filter((category) => category.status === 'ACTIVE'));
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
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!loading) onDraftChange(draft);
  }, [draft, loading, onDraftChange]);

  const update = <K extends keyof VerdeMenuSettings>(key: K, value: VerdeMenuSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
  };
  const field = (key: VerdeCopyKey): VerdeCopyField => `${key}${lang}` as VerdeCopyField;

  const apply = (view: VerdeMenuConfigView, keepText: boolean, message: string) => {
    setSaved(view.draft);
    setPublished(view.published);
    // Image actions keep unsaved text edits; save / publish adopt the server draft.
    setDraft((current) =>
      keepText
        ? {
            ...current,
            heroImageAssetPath: view.draft.heroImageAssetPath,
            chapter1ImageAssetPath: view.draft.chapter1ImageAssetPath,
            chapter2ImageAssetPath: view.draft.chapter2ImageAssetPath,
            bannerImageAssetPath: view.draft.bannerImageAssetPath,
            categoryExtras: Object.fromEntries(
              Object.keys({ ...current.categoryExtras, ...view.draft.categoryExtras }).map((id) => [
                id,
                {
                  ...(current.categoryExtras[id] ?? view.draft.categoryExtras[id]),
                  imageAssetPath: view.draft.categoryExtras[id]?.imageAssetPath ?? null,
                },
              ]),
            ),
          }
        : view.draft,
    );
    setNotice(message);
  };
  async function run(job: () => Promise<VerdeMenuConfigView>, keepText: boolean, message: string) {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      apply(await job(), keepText, message);
    } catch (caught) {
      if (isUnauthenticatedError(caught)) redirectToLogin();
      else setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }
  function upload(slot: VerdeImageSlot, file: File) {
    const invalid = validateImageFile(file);
    if (invalid) return setError(invalid);
    void run(() => uploadVerdeImage(restaurantId, slot, file), true, t('verde.image.uploaded'));
  }

  const slots: { slot: VerdeImageSlot; label: string; hint: string; path: string | null; shape: 'square' | 'wide' }[] = [
    { slot: 'hero', label: t('verde.image.hero'), hint: t('verde.image.heroHint'), path: draft.heroImageAssetPath, shape: 'square' },
    { slot: 'chapter1', label: t('verde.image.chapter1'), hint: t('verde.image.chapterHint'), path: draft.chapter1ImageAssetPath, shape: 'wide' },
    { slot: 'chapter2', label: t('verde.image.chapter2'), hint: t('verde.image.chapterHint'), path: draft.chapter2ImageAssetPath, shape: 'wide' },
    { slot: 'banner', label: t('verde.image.banner'), hint: t('verde.image.bannerHint'), path: draft.bannerImageAssetPath, shape: 'square' },
  ];
  const extra = categoryId ? draft.categoryExtras[categoryId] : undefined;
  const setExtra = (patch: Partial<NonNullable<typeof extra>>) =>
    update('categoryExtras', {
      ...draft.categoryExtras,
      [categoryId]: { ...(draft.categoryExtras[categoryId] ?? { introAr: '', introEn: '', descAr: '', descEn: '', imageAssetPath: null }), ...patch },
    });
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.translation.name])), [categories]);
  const disabled = busy || !canManage;

  if (loading) return <p className="text-sm text-muted-foreground">{t('verde.loading')}</p>;

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-secondary/40 p-4">
      <div>
        <h3 className="font-bold">{t('verde.editor.title')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('verde.editor.hint')}</p>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <fieldset className="flex flex-col gap-3" disabled={disabled}>
        <legend className="mb-1 text-sm font-semibold">{t('verde.section.look')}</legend>
        <label className="block text-sm">
          {t('verde.theme')}
          <select className={FIELD_CLASS} value={draft.theme} onChange={(e) => update('theme', e.target.value === 'LIGHT' ? 'LIGHT' : 'SIGNATURE')}>
            <option value="SIGNATURE">{t('verde.theme.signature')}</option>
            <option value="LIGHT">{t('verde.theme.light')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.allowThemeSwitch} onChange={(e) => update('allowThemeSwitch', e.target.checked)} />
          {t('verde.allowThemeSwitch')}
        </label>
        <label className="block text-sm">
          {t('verde.motion')}
          <select className={FIELD_CLASS} value={draft.motion} onChange={(e) => update('motion', e.target.value === 'OFF' ? 'OFF' : 'SUBTLE')}>
            <option value="SUBTLE">{t('verde.motion.subtle')}</option>
            <option value="OFF">{t('verde.motion.off')}</option>
          </select>
        </label>
        <label className="block text-sm">
          {t('verde.heroShape')}
          <select className={FIELD_CLASS} value={draft.heroImageShape} onChange={(e) => update('heroImageShape', e.target.value === 'CUTOUT' ? 'CUTOUT' : 'ROUND')}>
            <option value="ROUND">{t('verde.heroShape.round')}</option>
            <option value="CUTOUT">{t('verde.heroShape.cutout')}</option>
          </select>
        </label>
        {(['marquee', 'chapters', 'spotlight', 'ending'] as const).map((part) => {
          const key = `show${part[0].toUpperCase()}${part.slice(1)}` as 'showMarquee' | 'showChapters' | 'showSpotlight' | 'showEnding';
          return (
            <label key={part} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft[key]} onChange={(e) => update(key, e.target.checked)} />
              {t(`verde.show.${part}`)}
            </label>
          );
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 text-sm font-semibold">{t('verde.section.brand')}</legend>
        <label className="block text-sm">
          {t('verde.brandWord')}
          <input className={FIELD_CLASS} maxLength={VERDE_BRAND_WORD_MAX} value={draft.brandWord} onChange={(e) => update('brandWord', e.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">{t('verde.brandWordHint')}</p>
      </fieldset>

      <div role="group" aria-label={t('verde.language')} className="flex items-center gap-2">
        <span className="text-sm">{t('verde.language')}</span>
        {(['Ar', 'En'] as const).map((code) => (
          <button
            key={code}
            type="button"
            aria-pressed={lang === code}
            className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm ${lang === code ? 'bg-primary text-primary-foreground' : 'bg-card'}`}
            onClick={() => {
              setLang(code);
              onCopyLanguageChange(code === 'Ar' ? 'ar' : 'en');
            }}
          >
            {code === 'Ar' ? 'العربية' : 'English'}
          </button>
        ))}
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">{t('verde.tokenHint')}</p>

      {GROUPS.map((group) => (
        <fieldset key={group.id} className="flex flex-col gap-3" disabled={disabled}>
          <legend className="mb-1 text-sm font-semibold">{t(`verde.section.${group.id}`)}</legend>
          {group.keys.map((key) => {
            const name = field(key);
            const Control = MULTILINE.has(key) ? 'textarea' : 'input';
            return (
              <label key={key} className="block text-sm">
                {t(`verde.field.${key}`)}
                <Control
                  dir="auto"
                  className={FIELD_CLASS}
                  maxLength={VERDE_COPY_LIMITS[name]}
                  value={draft[name]}
                  {...(Control === 'textarea' ? { rows: 2 } : {})}
                  onChange={(e) => update(name, e.target.value)}
                />
                <button type="button" className="mt-1 text-xs text-primary underline" onClick={() => update(name, VERDE_COPY_DEFAULTS[name])}>
                  {t('verde.restoreDefault')}
                </button>
              </label>
            );
          })}
          {group.id === 'discover'
            ? ([1, 2] as const).map((n) => {
                const key = n === 1 ? 'chapter1CategoryId' : 'chapter2CategoryId';
                return (
                  <label key={n} className="block text-sm">
                    {t(`verde.chapterTarget.${n}`)}
                    <select className={FIELD_CLASS} value={draft[key] ?? ''} onChange={(e) => update(key, e.target.value || null)}>
                      <option value="">{t('verde.chapterTarget.auto')}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.translation.name}</option>
                      ))}
                    </select>
                  </label>
                );
              })
            : null}
        </fieldset>
      ))}

      <fieldset className="flex flex-col gap-4" disabled={disabled}>
        <legend className="mb-1 text-sm font-semibold">{t('verde.section.photos')}</legend>
        {slots.map(({ slot, label, hint, path, shape }) => (
          <div key={slot} className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-sm font-medium">{label}</p>
            <ImageField
              idPrefix={`verde-${slot}`}
              imageUrl={resolveAssetUrl(path)}
              onSelectFile={(file) => upload(slot, file)}
              isBusy={disabled}
              error={null}
              selectLabel={t('verde.image.upload')}
              helperText={hint}
              previewShape={shape}
            />
            {path ? (
              <button
                type="button"
                className="mt-2 text-xs text-primary underline"
                onClick={() => void run(() => resetVerdeImage(restaurantId, slot), true, t('verde.image.restored'))}
              >
                {t('verde.image.restore')}
              </button>
            ) : null}
          </div>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3" disabled={disabled}>
        <legend className="mb-1 text-sm font-semibold">{t('verde.section.categories')}</legend>
        <label className="block text-sm">
          {t('verde.category.select')}
          <select className={FIELD_CLASS} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('verde.category.none')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.translation.name}</option>
            ))}
          </select>
        </label>
        {categoryId ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{categoryName.get(categoryId)} · {t('verde.category.hint')}</p>
            <label className="block text-sm">
              {t('verde.category.intro')}
              <input
                dir={lang === 'Ar' ? 'rtl' : 'ltr'}
                className={FIELD_CLASS}
                maxLength={VERDE_CATEGORY_EXTRA_TEXT[`intro${lang}`]}
                value={extra?.[`intro${lang}`] ?? ''}
                onChange={(e) => setExtra({ [`intro${lang}`]: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              {t('verde.category.desc')}
              <textarea
                rows={2}
                dir={lang === 'Ar' ? 'rtl' : 'ltr'}
                className={FIELD_CLASS}
                maxLength={VERDE_CATEGORY_EXTRA_TEXT[`desc${lang}`]}
                value={extra?.[`desc${lang}`] ?? ''}
                onChange={(e) => setExtra({ [`desc${lang}`]: e.target.value })}
              />
            </label>
            <div>
              <p className="mb-2 text-sm font-medium">{t('verde.category.photo')}</p>
              <ImageField
                idPrefix={`verde-cat-${categoryId}`}
                imageUrl={resolveAssetUrl(extra?.imageAssetPath ?? null)}
                onSelectFile={(file) => {
                  const invalid = validateImageFile(file);
                  if (invalid) return setError(invalid);
                  void run(() => uploadVerdeCategoryImage(restaurantId, categoryId, file), true, t('verde.image.uploaded'));
                }}
                isBusy={disabled}
                error={null}
                selectLabel={t('verde.image.upload')}
                helperText={t('verde.image.chapterHint')}
                previewShape="wide"
              />
              {extra?.imageAssetPath ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-primary underline"
                  onClick={() => void run(() => resetVerdeCategoryImage(restaurantId, categoryId), true, t('verde.image.restored'))}
                >
                  {t('verde.image.restore')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground" role="status">
          {dirty ? t('verde.state.dirty') : unpublished ? t('verde.state.unpublished') : t('verde.state.live')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={disabled || !dirty} onClick={() => void run(() => saveVerdeMenuDraft(restaurantId, draft), false, t('verde.notice.saved'))}>
            {t('verde.actions.save')}
          </Button>
          <Button variant="secondary" disabled={disabled || dirty || !unpublished} onClick={() => void run(() => publishVerdeMenu(restaurantId), false, t('verde.notice.published'))}>
            {t('verde.actions.publish')}
          </Button>
        </div>
      </div>
    </section>
  );
}
