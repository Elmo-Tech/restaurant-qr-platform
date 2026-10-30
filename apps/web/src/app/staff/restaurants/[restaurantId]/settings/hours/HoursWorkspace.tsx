'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as branchesApi from '../../../../../../lib/branches/api';
import * as hoursApi from '../../../../../../lib/branches/hours';
import type { BranchHours, HoursDay, HoursMode } from '../../../../../../lib/branches/hours';
import type { BranchItem } from '../../../../../../lib/branches/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { SectionCard } from '../../../../../../components/ui/SectionCard';
import { Select } from '../../../../../../components/ui/Select';
import { Switch } from '../../../../../../components/ui/Switch';
import { SettingsBackLink } from '../../../../../../components/staff/SettingsBackLink';

const MAX_INTERVALS = 4;
const EMPTY_DAYS: HoursDay[] = Array.from({ length: 7 }, (_, day) => ({ day, intervals: [] }));

/** Weekday names in the Staff UI language ("Sunday" ... ), index 0 = Sunday. 2026-10-18 is a Sunday. */
function weekdayName(day: number, locale: string, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, 9, 18 + day)),
  );
}

/** Arabic weeks start on Saturday here; English on Sunday. */
const weekOrder = (locale: string): number[] => (locale === 'ar' ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]);

/** True when closing is at or before opening: the period ends after midnight. */
const endsAfterMidnight = (opens: string, closes: string): boolean => closes !== '' && opens !== '' && closes <= opens;

export function HoursWorkspace({ restaurantId, canManage, initialBranchId }: {
  restaurantId: string; canManage: boolean; initialBranchId?: string;
}) {
  const { t, locale } = useStaffI18n();
  const [branches, setBranches] = useState<BranchItem[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((caught: unknown) => {
    if (isUnauthenticatedError(caught)) {
      redirectToLogin();
      return;
    }
    setError(describeError(caught));
  }, []);

  useEffect(() => {
    let cancelled = false;
    branchesApi
      .listBranches(restaurantId)
      .then((list) => {
        if (cancelled) return;
        setBranches(list);
        setBranchId((list.find((branch) => branch.id === initialBranchId)
          ?? list.find((branch) => branch.status === 'ACTIVE')
          ?? list[0])?.id ?? '');
      })
      .catch((caught: unknown) => {
        if (!cancelled) fail(caught);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, initialBranchId, fail]);

  return (
    <div className="flex flex-col gap-6">
      <SettingsBackLink restaurantId={restaurantId} parent="branches" />
      <PageHeader title={t('settingsHub.hours')} description={t('hours.description')} />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {branches === null && !error ? <LoadingState label={t('hours.loading')} /> : null}
      {branches !== null && branches.length === 0 ? <Alert variant="info">{t('hours.noBranches')}</Alert> : null}

      {branches !== null && branches.length > 0 ? (
        <SectionCard title={t('hours.heading')} description={t('hours.description')}>
          <div className="flex max-w-2xl flex-col gap-6">
            {branches.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="hours-branch" className="text-sm font-medium text-secondary-foreground">
                  {t('hours.branch')}
                </label>
                <Select id="hours-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {branchId ? (
              <BranchHoursEditor
                key={branchId}
                restaurantId={restaurantId}
                branchId={branchId}
                canManage={canManage}
                locale={locale}
                onError={setError}
                onFail={fail}
              />
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function BranchHoursEditor({
  restaurantId,
  branchId,
  canManage,
  locale,
  onError,
  onFail,
}: {
  restaurantId: string;
  branchId: string;
  canManage: boolean;
  locale: string;
  onError: (message: string | null) => void;
  onFail: (caught: unknown) => void;
}) {
  const { t } = useStaffI18n();
  const [saved, setSaved] = useState<BranchHours | null>(null);
  const [mode, setMode] = useState<HoursMode>('ALWAYS_OPEN');
  const [temporarilyClosed, setTemporarilyClosed] = useState(false);
  const [days, setDays] = useState<HoursDay[]>(EMPTY_DAYS);
  const [quickOpens, setQuickOpens] = useState('09:00');
  const [quickCloses, setQuickCloses] = useState('23:00');
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hoursApi
      .getBranchHours(restaurantId, branchId)
      .then((loaded) => {
        if (cancelled) return;
        setSaved(loaded);
        setMode(loaded.mode);
        setTemporarilyClosed(loaded.temporarilyClosed);
        setDays(loaded.days);
      })
      .catch((caught: unknown) => {
        if (!cancelled) onFail(caught);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, branchId, onFail]);

  const order = useMemo(() => weekOrder(locale), [locale]);
  const disabled = !canManage || saving;

  function updateInterval(day: number, index: number, patch: Partial<{ opens: string; closes: string }>) {
    setNotice(null);
    setDays((current) =>
      current.map((entry) =>
        entry.day === day
          ? { ...entry, intervals: entry.intervals.map((interval, i) => (i === index ? { ...interval, ...patch } : interval)) }
          : entry,
      ),
    );
  }

  function setDayOpen(day: number, open: boolean) {
    setNotice(null);
    setDays((current) =>
      current.map((entry) =>
        entry.day === day
          ? { ...entry, intervals: open ? [{ opens: quickOpens, closes: quickCloses }] : [] }
          : entry,
      ),
    );
  }

  function addInterval(day: number) {
    setNotice(null);
    setDays((current) =>
      current.map((entry) =>
        entry.day === day && entry.intervals.length < MAX_INTERVALS
          ? { ...entry, intervals: [...entry.intervals, { opens: '18:00', closes: '23:00' }] }
          : entry,
      ),
    );
  }

  function removeInterval(day: number, index: number) {
    setNotice(null);
    setDays((current) =>
      current.map((entry) =>
        entry.day === day ? { ...entry, intervals: entry.intervals.filter((_, i) => i !== index) } : entry,
      ),
    );
  }

  function applyToAll() {
    setNotice(null);
    setDays(EMPTY_DAYS.map((entry) => ({ ...entry, intervals: [{ opens: quickOpens, closes: quickCloses }] })));
  }

  async function handleSave() {
    onError(null);
    setNotice(null);
    setSaving(true);
    try {
      const result = await hoursApi.saveBranchHours(restaurantId, branchId, {
        mode,
        temporarilyClosed,
        ...(mode === 'SCHEDULE' ? { days } : {}),
      });
      setSaved(result);
      setDays(result.days);
      setNotice(t('hours.saved'));
    } catch (caught) {
      onFail(caught);
    } finally {
      setSaving(false);
    }
  }

  if (saved === null) return <LoadingState label={t('hours.loading')} />;

  return (
    <div className="flex flex-col gap-6">
      {notice ? <Alert variant="success">{notice}</Alert> : null}
      <StatusLine status={saved.status} mode={saved.mode} locale={locale} />

      <fieldset className="flex flex-col gap-3" disabled={disabled}>
        <legend className="mb-1 text-sm font-medium text-secondary-foreground">{t('hours.mode')}</legend>
        {(
          [
            ['ALWAYS_OPEN', 'hours.mode.always', 'hours.mode.alwaysHint'],
            ['SCHEDULE', 'hours.mode.schedule', 'hours.mode.scheduleHint'],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40"
          >
            <input
              type="radio"
              name="hours-mode"
              className="mt-1 size-4"
              checked={mode === value}
              onChange={() => {
                setMode(value);
                setNotice(null);
              }}
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">{t(label)}</span>
              <span className="block text-xs text-muted-foreground">{t(hint)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{t('hours.closedNow')}</p>
          <p className="text-xs text-muted-foreground">{t('hours.closedNowHint')}</p>
        </div>
        <Switch
          checked={temporarilyClosed}
          onCheckedChange={(next) => {
            setTemporarilyClosed(next);
            setNotice(null);
          }}
          disabled={disabled}
          label={t('hours.closedNow')}
        />
      </div>

      {mode === 'SCHEDULE' ? (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">{t('hours.timezone', { timezone: saved.timezone })}</p>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border p-3">
            <span className="w-full text-sm font-medium text-secondary-foreground">{t('hours.quickFill')}</span>
            <TimeField label={t('hours.from')} value={quickOpens} onChange={setQuickOpens} disabled={disabled} />
            <TimeField label={t('hours.to')} value={quickCloses} onChange={setQuickCloses} disabled={disabled} />
            <Button type="button" variant="secondary" size="sm" onClick={applyToAll} disabled={disabled}>
              {t('hours.quickFill.apply')}
            </Button>
          </div>

          <ul className="flex flex-col gap-2">
            {order.map((day) => {
              const entry = days.find((candidate) => candidate.day === day) ?? { day, intervals: [] };
              const open = entry.intervals.length > 0;
              const name = weekdayName(day, locale);
              return (
                <li key={day} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">{name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {open ? t('hours.day.open', { day: name }) : t('hours.day.closed')}
                      </span>
                      <Switch
                        checked={open}
                        onCheckedChange={(next) => setDayOpen(day, next)}
                        disabled={disabled}
                        label={t('hours.day.open', { day: name })}
                      />
                    </div>
                  </div>
                  {entry.intervals.map((interval, index) => (
                    <div key={index} className="flex flex-wrap items-end gap-3">
                      <TimeField
                        label={t('hours.from')}
                        value={interval.opens}
                        onChange={(value) => updateInterval(day, index, { opens: value })}
                        disabled={disabled}
                      />
                      <TimeField
                        label={t('hours.to')}
                        value={interval.closes}
                        onChange={(value) => updateInterval(day, index, { closes: value })}
                        disabled={disabled}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeInterval(day, index)}
                        disabled={disabled}
                        aria-label={t('hours.removeInterval')}
                      >
                        ✕
                      </Button>
                      {endsAfterMidnight(interval.opens, interval.closes) ? (
                        <span className="w-full text-xs text-muted-foreground">{t('hours.overnight')}</span>
                      ) : null}
                    </div>
                  ))}
                  {open && entry.intervals.length < MAX_INTERVALS ? (
                    <div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => addInterval(day)} disabled={disabled}>
                        + {t('hours.addInterval')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {canManage ? (
        <div>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t('common.saving') : t('hours.save')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="time"
        dir="ltr"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted"
      />
    </label>
  );
}

/** One plain sentence about the state right now, from the Backend's own evaluation. */
function StatusLine({
  status,
  mode,
  locale,
}: {
  status: BranchHours['status'];
  mode: HoursMode;
  locale: string;
}) {
  const { t } = useStaffI18n();
  const clock = (minute: number): string =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 0, 1, 0, minute)),
    );

  let text: string;
  let variant: 'success' | 'warning' | 'info' = 'info';
  if (status === null) {
    text = t('hours.status.alwaysOpen');
  } else if (status.open) {
    variant = 'success';
    text =
      status.closesAtMinute === null
        ? t('hours.status.openNoTime')
        : t('hours.status.open', { time: clock(status.closesAtMinute) });
  } else {
    variant = 'warning';
    const base = status.temporarilyClosed ? t('hours.status.closedManual') : t('hours.status.closed');
    let next = '';
    if (mode === 'SCHEDULE' && status.opensAt) {
      const { dayOffset, minute, dayOfWeek } = status.opensAt;
      next =
        dayOffset === 0
          ? t('hours.status.opensToday', { time: clock(minute) })
          : t('hours.status.opensOn', {
              day: weekdayName(dayOfWeek, locale),
              time: clock(minute),
            });
    }
    text = next ? `${base} ${next}` : base;
  }
  return <Alert variant={variant}>{text}</Alert>;
}
