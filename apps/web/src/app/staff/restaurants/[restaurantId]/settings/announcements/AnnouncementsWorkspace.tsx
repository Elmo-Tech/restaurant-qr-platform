'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import * as announcementsApi from '../../../../../../lib/announcements/api';
import type {
  Announcement,
  AnnouncementStyle,
} from '../../../../../../lib/announcements/api';
import { useActiveLocales } from '../../../../../../lib/settings/use-active-locales';
import { localeDirection, localeLabel } from '../../../../../../lib/settings/locale-labels';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { ConfirmDialog } from '../../../../../../components/ui/ConfirmDialog';
import { Dialog } from '../../../../../../components/ui/Dialog';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { SectionCard } from '../../../../../../components/ui/SectionCard';
import { Select } from '../../../../../../components/ui/Select';
import { Switch } from '../../../../../../components/ui/Switch';
import { SettingsTabs } from '../SettingsTabs';

const STATE_VARIANT: Record<Announcement['state'], 'success' | 'info' | 'neutral' | 'warning'> = {
  LIVE: 'success',
  SCHEDULED: 'info',
  EXPIRED: 'neutral',
  OFF: 'neutral',
};

/** Looks of the three styles, close to what the Guest sees (the Guest menu has its own theme). */
const PREVIEW_CLASS: Record<AnnouncementStyle, string> = {
  PROMO: 'border-transparent bg-primary text-primary-foreground',
  INFO: 'border-border bg-card text-foreground',
  WARNING: 'border-warning/40 bg-warning-soft text-foreground',
};

interface Draft {
  id: string | null;
  texts: Record<string, string>;
  style: AnnouncementStyle;
  startsOn: string;
  endsOn: string;
  active: boolean;
}

const emptyDraft = (): Draft => ({ id: null, texts: {}, style: 'INFO', startsOn: '', endsOn: '', active: true });

const toDraft = (announcement: Announcement): Draft => ({
  id: announcement.id,
  texts: { ...announcement.texts },
  style: announcement.style,
  startsOn: announcement.startsOn ?? '',
  endsOn: announcement.endsOn ?? '',
  active: announcement.status === 'ACTIVE',
});

export function AnnouncementsWorkspace({
  restaurantId,
  defaultLocale,
  canManage,
}: {
  restaurantId: string;
  defaultLocale: string;
  canManage: boolean;
}) {
  const { t, locale, formatDayMonth } = useStaffI18n();
  const locales = useActiveLocales(restaurantId, defaultLocale);
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Announcement | null>(null);

  const fail = useCallback((caught: unknown, target: 'page' | 'dialog' = 'page') => {
    if (isUnauthenticatedError(caught)) {
      redirectToLogin();
      return;
    }
    (target === 'page' ? setError : setDialogError)(describeError(caught));
  }, []);

  const reload = useCallback(async () => {
    try {
      setItems(await announcementsApi.listAnnouncements(restaurantId));
    } catch (caught) {
      fail(caught);
    }
  }, [restaurantId, fail]);

  useEffect(() => {
    let cancelled = false;
    announcementsApi
      .listAnnouncements(restaurantId)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((caught: unknown) => {
        if (!cancelled) fail(caught);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, fail]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setDialogError(null);
    setSaving(true);
    try {
      // Every active language is sent: a blank one removes that language's text.
      const texts: Record<string, string | null> = {};
      for (const code of locales ?? [defaultLocale]) texts[code] = draft.texts[code]?.trim() || null;
      const input = {
        status: draft.active ? ('ACTIVE' as const) : ('INACTIVE' as const),
        style: draft.style,
        startsOn: draft.startsOn || null,
        endsOn: draft.endsOn || null,
        texts,
      };
      if (draft.id) await announcementsApi.updateAnnouncement(restaurantId, draft.id, input);
      else await announcementsApi.createAnnouncement(restaurantId, input);
      setDraft(null);
      setNotice(t('announcements.saved'));
      await reload();
    } catch (caught) {
      fail(caught, 'dialog');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setSaving(true);
    try {
      await announcementsApi.deleteAnnouncement(restaurantId, toDelete.id);
      setToDelete(null);
      setNotice(t('announcements.deleted'));
      await reload();
    } catch (caught) {
      setToDelete(null);
      fail(caught);
    } finally {
      setSaving(false);
    }
  }

  const dateText = (item: Announcement): string => {
    const format = (value: string): string => formatDayMonth(`${value}T12:00:00`);
    if (item.startsOn && item.endsOn) return t('announcements.dates.range', { from: format(item.startsOn), to: format(item.endsOn) });
    if (item.startsOn) return t('announcements.dates.from', { date: format(item.startsOn) });
    if (item.endsOn) return t('announcements.dates.until', { date: format(item.endsOn) });
    return t('announcements.dates.always');
  };

  const previewLocale = draft ? (locales ?? [defaultLocale]).find((code) => draft.texts[code]?.trim()) : undefined;
  const previewText = draft && previewLocale ? draft.texts[previewLocale] : '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      <SettingsTabs restaurantId={restaurantId} active="announcements" />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <SectionCard
        title={t('announcements.heading')}
        description={t('announcements.description')}
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setNotice(null);
                setDialogError(null);
                setDraft(emptyDraft());
              }}
            >
              {t('announcements.add')}
            </Button>
          ) : null
        }
      >
        {items === null && !error ? <LoadingState label={t('announcements.loading')} /> : null}
        {items !== null && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('announcements.empty')}</p>
        ) : null}
        {items !== null && items.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const shown = item.texts[locale] ?? item.texts[defaultLocale] ?? Object.values(item.texts)[0] ?? '';
              return (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="text-sm font-semibold text-foreground">
                      {shown}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{dateText(item)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{t(`announcements.style.${item.style}` as MessageKey)}</Badge>
                    <Badge variant={STATE_VARIANT[item.state]} dot>
                      {t(`announcements.state.${item.state}` as MessageKey)}
                    </Badge>
                    {canManage ? (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setNotice(null);
                            setDialogError(null);
                            setDraft(toDraft(item));
                          }}
                        >
                          {t('announcements.edit')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setToDelete(item)}>
                          {t('announcements.delete')}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </SectionCard>

      <Dialog
        open={draft !== null}
        title={draft?.id ? t('announcements.dialog.edit') : t('announcements.dialog.create')}
        isSubmitting={saving}
        submitLabel={t('announcements.dialog.save')}
        onSubmit={(event) => void handleSave(event)}
        onClose={() => setDraft(null)}
      >
        {draft ? (
          <div className="flex flex-col gap-4">
            {dialogError ? <Alert variant="error">{dialogError}</Alert> : null}

            {(locales ?? [defaultLocale]).map((code) => (
              <FormField
                key={code}
                label={t(code === defaultLocale ? 'announcements.field.textDefault' : 'announcements.field.text', {
                  language: localeLabel(code),
                })}
                htmlFor={`announcement-text-${code}`}
              >
                <Input
                  id={`announcement-text-${code}`}
                  dir={localeDirection(code)}
                  maxLength={200}
                  value={draft.texts[code] ?? ''}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, texts: { ...current.texts, [code]: event.target.value } } : current))
                  }
                />
              </FormField>
            ))}
            <p className="-mt-2 text-xs text-muted-foreground">{t('announcements.field.textHint')}</p>

            <FormField label={t('announcements.field.style')} htmlFor="announcement-style">
              <Select
                id="announcement-style"
                value={draft.style}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, style: event.target.value as AnnouncementStyle } : current))
                }
              >
                {(['INFO', 'PROMO', 'WARNING'] as const).map((style) => (
                  <option key={style} value={style}>
                    {t(`announcements.style.${style}` as MessageKey)}
                  </option>
                ))}
              </Select>
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('announcements.field.startsOn')} htmlFor="announcement-starts">
                <Input
                  id="announcement-starts"
                  type="date"
                  dir="ltr"
                  value={draft.startsOn}
                  onChange={(event) => setDraft((current) => (current ? { ...current, startsOn: event.target.value } : current))}
                />
              </FormField>
              <FormField label={t('announcements.field.endsOn')} htmlFor="announcement-ends">
                <Input
                  id="announcement-ends"
                  type="date"
                  dir="ltr"
                  value={draft.endsOn}
                  min={draft.startsOn || undefined}
                  onChange={(event) => setDraft((current) => (current ? { ...current, endsOn: event.target.value } : current))}
                />
              </FormField>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{t('announcements.field.active')}</p>
                <p className="text-xs text-muted-foreground">{t('announcements.field.activeHint')}</p>
              </div>
              <Switch
                checked={draft.active}
                onCheckedChange={(next) => setDraft((current) => (current ? { ...current, active: next } : current))}
                label={t('announcements.field.active')}
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('announcements.preview')}</p>
              <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${PREVIEW_CLASS[draft.style]}`}>
                <p dir="auto">{previewText || t('announcements.previewEmpty')}</p>
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        title={t('announcements.delete.title')}
        description={t('announcements.delete.body')}
        confirmLabel={t('announcements.delete')}
        isSubmitting={saving}
        onConfirm={() => void handleDelete()}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
