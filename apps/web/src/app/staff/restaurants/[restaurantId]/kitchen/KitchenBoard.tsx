'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { localizedName } from '../../../../../lib/i18n/localized-name';
import * as kitchenApi from '../../../../../lib/kitchen/api';
import { canUpdateKitchen } from '../../../../../lib/kitchen/capabilities';
import type { KitchenStatus, KitchenTicket } from '../../../../../lib/kitchen/types';
import * as ordersApi from '../../../../../lib/orders/api';
import type { AuthContextBranch } from '../../../../../lib/auth/types';
import { ApiError } from '../../../../../lib/api/errors';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { ChipGroup, type ChipOption } from '../../../../../components/ui/ChipGroup';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { KitchenTicketCard } from './KitchenTicketCard';

const POLL_INTERVAL_MS = 5_000;
const CLOCK_INTERVAL_MS = 20_000;
const SOUND_KEY = 'kitchen-sound';
const COLUMNS: readonly KitchenStatus[] = ['ACCEPTED', 'PREPARING', 'READY'];

const NEXT_STATUS: Record<'ACCEPTED' | 'PREPARING', 'PREPARING' | 'READY'> = {
  ACCEPTED: 'PREPARING',
  PREPARING: 'READY',
};

/** A short, soft two-note chime (no audio file). Browsers only allow it after the user has interacted with the page, which the Sound toggle guarantees. */
function playChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, now + index * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.18 + 0.3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * 0.18);
      oscillator.stop(now + index * 0.18 + 0.32);
    });
    window.setTimeout(() => void context.close(), 900);
  } catch {
    // A blocked or unsupported audio device must never break the board.
  }
}

export interface KitchenBoardProps {
  restaurantId: string;
  /** Already scoped to this Membership's authorized Branches by `/auth/me`. */
  branches: AuthContextBranch[];
  permissions: string[];
}

/**
 * Kitchen View V1 (VERSION_ROADMAP, STAFF_DASHBOARD_UX_SPEC #99-#110): one
 * Branch at a time, three columns -- New, Preparing, Ready -- oldest ticket
 * first. It refreshes itself every few seconds (and the moment the tab
 * becomes visible again), chimes when a new ticket arrives (opt-in), and moves
 * a ticket forward with one big button through the existing, Backend-checked
 * status route. Below the large breakpoint the columns become tabs so a phone
 * or a small tablet shows one column at a time.
 */
export function KitchenBoard({ restaurantId, branches, permissions }: KitchenBoardProps) {
  const { t, locale } = useStaffI18n();
  const canUpdate = canUpdateKitchen(permissions);
  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.status === 'ACTIVE'),
    [branches],
  );
  const [branchId, setBranchId] = useState<string | null>(activeBranches[0]?.id ?? null);
  const [tickets, setTickets] = useState<KitchenTicket[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<number>(0);
  const [column, setColumn] = useState<KitchenStatus>('ACCEPTED');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [soundOn, setSoundOn] = useState(false);

  const requestRef = useRef(0);
  const seenNewRef = useRef<Set<string> | null>(null);
  const soundRef = useRef(false);

  // The ticket timers share one clock owned here, so they all tick together.
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  // The Sound choice is a per-device convenience.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SOUND_KEY) === 'on';
      queueMicrotask(() => setSoundOn(stored));
    } catch {
      // Storage may be unavailable; the board works without it.
    }
  }, []);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const load = useCallback(async () => {
    if (branchId === null) return;
    const requestId = ++requestRef.current;
    try {
      const list = await kitchenApi.listKitchenTickets(restaurantId, branchId);
      if (requestRef.current !== requestId) return; // superseded -- discard
      // Chime for tickets that are new since the last look (never for the first load).
      const newIds = new Set(list.filter((ticket) => ticket.status === 'ACCEPTED').map((ticket) => ticket.id));
      const seen = seenNewRef.current;
      if (seen !== null && soundRef.current && [...newIds].some((id) => !seen.has(id))) {
        playChime();
      }
      seenNewRef.current = newIds;
      setTickets(list);
      setLoadFailed(false);
      setUpdatedAt(new Date());
      setNow(Date.now());
    } catch (error) {
      if (requestRef.current !== requestId) return;
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setLoadFailed(true);
    }
  }, [restaurantId, branchId]);

  // First load, a new Branch, the polling loop and "tab visible again".
  useEffect(() => {
    seenNewRef.current = null;
    queueMicrotask(() => {
      setTickets(null);
      void load();
    });
    const timer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const advance = useCallback(
    async (ticket: KitchenTicket) => {
      if (ticket.status === 'READY') return;
      setBusyId(ticket.id);
      setCardErrors((current) => {
        const rest = { ...current };
        delete rest[ticket.id];
        return rest;
      });
      try {
        await ordersApi.updateOrderStatus(restaurantId, ticket.id, {
          expectedStatus: ticket.status,
          status: NEXT_STATUS[ticket.status],
        });
        await load();
      } catch (error) {
        if (isUnauthenticatedError(error)) {
          redirectToLogin();
          return;
        }
        // Someone else (another tablet, the Orders page) already moved this ticket: say so and show the truth.
        if (error instanceof ApiError && error.status === 409) {
          setCardErrors((current) => ({ ...current, [ticket.id]: t('kitchen.staleAction') }));
          await load();
        } else {
          setCardErrors((current) => ({
            ...current,
            [ticket.id]: describeError(error) || t('kitchen.actionFailed'),
          }));
        }
      } finally {
        setBusyId(null);
      }
    },
    [restaurantId, load, t],
  );

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {
      // Ignore: the toggle still works for this visit.
    }
    if (next) playChime(); // a preview, and the user gesture the browser needs
  }

  const byColumn = useMemo(() => {
    const groups: Record<KitchenStatus, KitchenTicket[]> = { ACCEPTED: [], PREPARING: [], READY: [] };
    for (const ticket of tickets ?? []) groups[ticket.status].push(ticket);
    return groups;
  }, [tickets]);

  const columnLabel: Record<KitchenStatus, string> = {
    ACCEPTED: t('kitchen.col.new'),
    PREPARING: t('kitchen.col.preparing'),
    READY: t('kitchen.col.ready'),
  };
  const emptyLabel: Record<KitchenStatus, string> = {
    ACCEPTED: t('kitchen.empty.new'),
    PREPARING: t('kitchen.empty.preparing'),
    READY: t('kitchen.empty.ready'),
  };
  const columnAccent: Record<KitchenStatus, string> = {
    ACCEPTED: 'bg-info',
    PREPARING: 'bg-warning',
    READY: 'bg-success',
  };
  const columnOptions: ChipOption<KitchenStatus>[] = COLUMNS.map((status) => ({
    value: status,
    label: columnLabel[status],
    count: byColumn[status].length,
  }));
  const branchOptions: ChipOption<string>[] = activeBranches.map((branch) => ({
    value: branch.id,
    label: localizedName(branch, locale),
  }));

  if (activeBranches.length === 0) {
    return <Alert variant="info">{t('kitchen.noBranches')}</Alert>;
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('kitchen.title')}
        description={t('kitchen.subtitle')}
        actions={
          <>
            <span
              role="status"
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                loadFailed ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${loadFailed ? 'bg-warning' : 'animate-pulse bg-success'}`}
              />
              {loadFailed
                ? t('kitchen.loadFailed')
                : updatedAt
                  ? t('kitchen.updatedAt', { time: updatedAt.toLocaleTimeString() })
                  : t('kitchen.live')}
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={toggleSound} aria-pressed={soundOn}>
              {soundOn ? t('kitchen.sound.on') : t('kitchen.sound.off')}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
              {t('kitchen.refresh')}
            </Button>
          </>
        }
      />

      {activeBranches.length > 1 ? (
        <ChipGroup
          ariaLabel={t('kitchen.branch')}
          options={branchOptions}
          value={branchId ?? ''}
          onChange={setBranchId}
          size="lg"
        />
      ) : null}

      {!canUpdate ? <Alert variant="info">{t('kitchen.readOnly')}</Alert> : null}

      {tickets === null ? (
        loadFailed ? (
          <Alert variant="error">{t('kitchen.loadFailed')}</Alert>
        ) : (
          <LoadingState label={t('kitchen.loading')} />
        )
      ) : (
        <>
          <div className="lg:hidden">
            <ChipGroup
              ariaLabel={t('kitchen.columns')}
              options={columnOptions}
              value={column}
              onChange={setColumn}
              variant="segmented"
              size="lg"
            />
          </div>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
            {COLUMNS.map((status) => (
              <section
                key={status}
                aria-label={columnLabel[status]}
                className={`${status === column ? 'flex' : 'hidden'} min-w-0 flex-col gap-3 lg:flex`}
              >
                <h2 className="hidden items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2.5 lg:flex">
                  <span className="flex items-center gap-2 text-base font-bold text-foreground">
                    <span aria-hidden="true" className={`size-3 rounded-full ${columnAccent[status]}`} />
                    {columnLabel[status]}
                  </span>
                  <span className="rounded-full bg-card px-2.5 py-0.5 text-sm font-bold tabular-nums text-foreground">
                    {byColumn[status].length}
                  </span>
                </h2>
                {byColumn[status].length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm font-medium text-muted-foreground">
                    {emptyLabel[status]}
                  </p>
                ) : (
                  byColumn[status].map((ticket) => (
                    <KitchenTicketCard
                      key={ticket.id}
                      ticket={ticket}
                      now={now}
                      canUpdate={canUpdate}
                      busy={busyId === ticket.id}
                      error={cardErrors[ticket.id] ?? null}
                      onAdvance={(target) => void advance(target)}
                    />
                  ))
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
