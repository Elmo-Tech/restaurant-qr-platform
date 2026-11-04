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
  DEFAULT_MAKKBOZ_SETTINGS,
  MAKKBOZ_CATEGORY_EXTRA_TEXT,
  MAKKBOZ_COPY_DEFAULTS,
  MAKKBOZ_COPY_LIMITS,
  MAKKBOZ_IMAGE_FIELD,
  type MakkbozCategoryExtra,
  type MakkbozCopyField,
  type MakkbozCopyKey,
  type MakkbozImageSlot,
  type MakkbozMenuSettings,
} from '../../../../../../lib/public-menu/makkboz-settings';
import {
  getMakkbozMenuConfig,
  publishMakkbozMenu,
  resetMakkbozCategoryImage,
  resetMakkbozImage,
  saveMakkbozMenuDraft,
  uploadMakkbozCategoryImage,
  uploadMakkbozImage,
  type MakkbozMenuConfigView,
} from '../../../../../../lib/settings/api';

type Lang = 'Ar' | 'En';

const GROUPS: { id: 'hero' | 'values' | 'menu' | 'story' | 'contact'; keys: MakkbozCopyKey[] }[] = [
  { id: 'hero', keys: ['brand', 'announcement', 'heroEyebrow', 'heroTitle', 'heroDesc', 'ctaPrimary', 'ctaShare', 'heroFine', 'archLabel', 'archCaption', 'stampTop', 'stampMain'] },
  { id: 'values', keys: ['value1Title', 'value1Sub', 'value2Title', 'value2Sub', 'value3Title', 'value3Sub'] },
  { id: 'menu', keys: ['menuEyebrow', 'menuTitle', 'menuNote'] },
  { id: 'story', keys: ['storyKicker', 'storyTitle', 'storyText', 'storySignature', 'footerTagline'] },
  { id: 'contact', keys: ['contactTitle'] },
];
const MULTILINE = new Set<MakkbozCopyKey>(['heroTitle', 'heroDesc', 'menuNote', 'storyTitle', 'storyText', 'heroFine']);
const SHOW_TOGGLES = ['announcement', 'values', 'story'] as const;
const FIELD_CLASS = 'mt-1 block w-full rounded-lg border border-input bg-card px-3 py-2 text-foreground';
const EMPTY_EXTRA: MakkbozCategoryExtra = { tagAr: '', tagEn: '', introAr: '', introEn: '', imageAssetPath: null };

/**
 * Dashboard editor of the exclusive Makkboz menu: draft / publish like BREW, BLOOM and VERDE. Image paths are
 * owned by the server (upload and restore use dedicated routes); this component only edits text, choices and
 * per-section overrides of the Restaurant's own categories, and mirrors every edit to the live preview.
 */
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
  const { t } = useStaffI18n();
  const [draft, setDraft] = useState<MakkbozMenuSettings>(DEFAULT_MAKKBOZ_SETTINGS);
  const [saved, setSaved] = useState<MakkbozMenuSettings>(DEFAULT_MAKKBOZ_SETTINGS);
  const [published, setPublished] = useState<MakkbozMenuSettings>(DEFAULT_MAKKBOZ_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [lang, setLang] = useState<Lang>('Ar');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // Everything except server-owned image paths counts as an unsaved edit.
  const textState = useCallback((s: MakkbozMenuSettings) => {
    const { categoryExtras, ...rest } = s;
    const withoutImages = Object.fromEntries(
      Object.entries(rest).filter(([key]) => !(Object.values(MAKKBOZ_IMAGE_FIELD) as string[]).includes(key)),
    );
    return JSON.stringify({
      ...withoutImages,
      categoryExtras: Object.fromEntries(
        Object.entries(categoryExtras).map(([id, x]) => [id, { tagAr: x.tagAr, tagEn: x.tagEn, introAr: x.introAr, introEn: x.introEn }]),
      ),
    });
  }, []);
  const dirty = textState(draft) !== textState(saved);
  const unpublished = JSON.stringify(saved) !== JSON.stringify(published);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMakkbozMenuConfig(restaurantId), listCategories(restaurantId)])
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

  const update = <K extends keyof MakkbozMenuSettings>(key: K, value: MakkbozMenuSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
  };
  const field = (key: MakkbozCopyKey): MakkbozCopyField => `${key}${lang}` as MakkbozCopyField;

  const apply = (view: MakkbozMenuConfigView, keepText: boolean, message: string) => {
    setSaved(view.draft);
    setPublished(view.published);
    // Image actions keep unsaved text edits; save / publish adopt the server draft.
    setDraft((current) => {
      if (!keepText) return view.draft;
      const images = Object.fromEntries(Object.values(MAKKBOZ_IMAGE_FIELD).map((key) => [key, view.draft[key]]));
      return {
        ...current,
        ...images,
        categoryExtras: Object.fromEntries(
          Object.keys({ ...current.categoryExtras, ...view.draft.categoryExtras }).map((id) => [
            id,
            {
              ...(current.categoryExtras[id] ?? view.draft.categoryExtras[id]),
              imageAssetPath: view.draft.categoryExtras[id]?.imageAssetPath ?? null,
            },
          ]),
        ),
      };
    });
    setNotice(message);
  };
  async function run(job: () => Promise<MakkbozMenuConfigView>, keepText: boolean, message: string) {
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
  function upload(slot: MakkbozImageSlot, file: File) {
    const invalid = validateImageFile(file);
    if (invalid) return setError(invalid);
    void run(() => uploadMakkbozImage(restaurantId, slot, file), true, t('verde.image.uploaded'));
  }

  const slots: { slot: MakkbozImageSlot; label: string; hint: string; shape: 'square' | 'wide' }[] = [
    { slot: 'hero', label: t('makkboz.image.hero'), hint: t('makkboz.image.heroHint'), shape: 'square' },
    { slot: 'heroSmall', label: t('makkboz.image.heroSmall'), hint: t('makkboz.image.heroSmallHint'), shape: 'square' },
  ];
  const extra = categoryId ? draft.categoryExtras[categoryId] : undefined;
  const setExtra = (patch: Partial<MakkbozCategoryExtra>) =>
    update('categoryExtras', {
      ...draft.categoryExtras,
      [categoryId]: { ...(draft.categoryExtras[categoryId] ?? EMPTY_EXTRA), ...patch },
    });
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.translation.name])), [categories]);
  const disabled = busy || !canManage;

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
        <legend className="mb-1 text-sm font-semibold">{t('makkboz.section.look')}</legend>
        <label className="block text-sm">
          {t('makkboz.defaultView')}
          <select className={FIELD_CLASS} value={draft.defaultView} onChange={(e) => update('defaultView', e.target.value === 'LIST' ? 'LIST' : 'CARDS')}>
            <option value="CARDS">{t('makkboz.view.cards')}</option>
            <option value="LIST">{t('makkboz.view.list')}</option>
          </select>
        </label>
        <label className="block text-sm">
          {t('makkboz.motion')}
          <select className={FIELD_CLASS} value={draft.motion} onChange={(e) => update('motion', e.target.value === 'OFF' ? 'OFF' : 'SUBTLE')}>
            <option value="SUBTLE">{t('makkboz.motion.subtle')}</option>
            <option value="OFF">{t('makkboz.motion.off')}</option>
          </select>
        </label>
        {SHOW_TOGGLES.map((part) => {
          const key = `show${part[0].toUpperCase()}${part.slice(1)}` as 'showAnnouncement' | 'showValues' | 'showStory';
          return (
            <label key={part} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft[key]} onChange={(e) => update(key, e.target.checked)} />
              {t(`makkboz.show.${part}`)}
            </label>
          );
        })}
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
          <legend className="mb-1 text-sm font-semibold">{t(`makkboz.section.${group.id}`)}</legend>
          {group.keys.map((key) => {
            const name = field(key);
            const Control = MULTILINE.has(key) ? 'textarea' : 'input';
            return (
              <label key={key} className="block text-sm">
                {t(`makkboz.field.${key}`)}
                <Control
                  dir="auto"
                  className={FIELD_CLASS}
                  maxLength={MAKKBOZ_COPY_LIMITS[name]}
                  value={draft[name]}
                  {...(Control === 'textarea' ? { rows: 2 } : {})}
                  onChange={(e) => update(name, e.target.value)}
                />
                <button type="button" className="mt-1 text-xs text-primary underline" onClick={() => update(name, MAKKBOZ_COPY_DEFAULTS[name])}>
                  {t('verde.restoreDefault')}
                </button>
              </label>
            );
          })}
        </fieldset>
      ))}

      <fieldset className="flex flex-col gap-4" disabled={disabled}>
        <legend className="mb-1 text-sm font-semibold">{t('makkboz.section.photos')}</legend>
        {slots.map(({ slot, label, hint, shape }) => {
          const path = draft[MAKKBOZ_IMAGE_FIELD[slot]];
          return (
            <div key={slot} className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-sm font-medium">{label}</p>
              <ImageField
                idPrefix={`makkboz-${slot}`}
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
                  onClick={() => void run(() => resetMakkbozImage(restaurantId, slot), true, t('verde.image.restored'))}
                >
                  {t('verde.image.restore')}
                </button>
              ) : null}
            </div>
          );
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-3" disabled={disabled}>
        <legend className="mb-1 text-sm font-semibold">{t('makkboz.section.categories')}</legend>
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
            <p className="text-xs text-muted-foreground">{categoryName.get(categoryId)} · {t('makkboz.category.hint')}</p>
            {(['tag', 'intro'] as const).map((part) => (
              <label key={part} className="block text-sm">
                {t(`makkboz.category.${part}`)}
                <input
                  dir={lang === 'Ar' ? 'rtl' : 'ltr'}
                  className={FIELD_CLASS}
                  maxLength={MAKKBOZ_CATEGORY_EXTRA_TEXT[`${part}${lang}`]}
                  value={extra?.[`${part}${lang}`] ?? ''}
                  onChange={(e) => setExtra({ [`${part}${lang}`]: e.target.value })}
                />
              </label>
            ))}
            <div>
              <p className="mb-2 text-sm font-medium">{t('verde.category.photo')}</p>
              <ImageField
                idPrefix={`makkboz-cat-${categoryId}`}
                imageUrl={resolveAssetUrl(extra?.imageAssetPath ?? null)}
                onSelectFile={(file) => {
                  const invalid = validateImageFile(file);
                  if (invalid) return setError(invalid);
                  void run(() => uploadMakkbozCategoryImage(restaurantId, categoryId, file), true, t('verde.image.uploaded'));
                }}
                isBusy={disabled}
                error={null}
                selectLabel={t('verde.image.upload')}
                helperText={t('makkboz.image.categoryHint')}
                previewShape="wide"
              />
              {extra?.imageAssetPath ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-primary underline"
                  onClick={() => void run(() => resetMakkbozCategoryImage(restaurantId, categoryId), true, t('verde.image.restored'))}
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
          <Button disabled={disabled || !dirty} onClick={() => void run(() => saveMakkbozMenuDraft(restaurantId, draft), false, t('verde.notice.saved'))}>
            {t('verde.actions.save')}
          </Button>
          <Button variant="secondary" disabled={disabled || dirty || !unpublished} onClick={() => void run(() => publishMakkbozMenu(restaurantId), false, t('verde.notice.published'))}>
            {t('verde.actions.publish')}
          </Button>
        </div>
      </div>
    </section>
  );
}
