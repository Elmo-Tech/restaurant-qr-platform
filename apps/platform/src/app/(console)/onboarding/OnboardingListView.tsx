"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconPlus, IconSearch } from "@/components/icons";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Skeleton, TableWrap, Th } from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import { listLeads, type SignupLead } from "@/lib/api/leads";
import {
  createOnboardingCase,
  listOnboardingCases,
  openOnboardingForLead,
  restoreOnboardingCase,
  type OnboardingCasePage,
  type OnboardingCaseSummary,
  type OnboardingStatus,
} from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { stepProgress } from "@/lib/onboarding-steps";
import { cn } from "@/lib/utils";
import { RemoveCaseDialog } from "./RemoveCaseDialog";
import { OnboardingStatusBadge, transportErrorKey } from "./shared";

const FILTERS: { value: OnboardingStatus | ""; label: MessageKey }[] = [
  { value: "", label: "common.all" },
  { value: "DRAFT", label: "onboarding.status.DRAFT" },
  { value: "READY_FOR_REVIEW", label: "onboarding.status.READY_FOR_REVIEW" },
  { value: "READY", label: "onboarding.status.READY" },
  { value: "DELIVERED", label: "onboarding.status.DELIVERED" },
  { value: "CANCELLED", label: "onboarding.status.CANCELLED" },
];

/** The list of owner onboarding cases. */
export function OnboardingListView() {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<OnboardingStatus | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OnboardingCasePage | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<MessageKey | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Active list, or the cases removed from it (kept for history; restorable). */
  const [archived, setArchived] = useState(false);
  const [reload, setReload] = useState(0);
  const [removing, setRemoving] = useState<OnboardingCaseSummary | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    listOnboardingCases({ search: debounced, status, page, archived })
      .then((result) => {
        if (cancelled) return;
        // The last row of a later page was removed: show the new last page instead of an empty one.
        if (result.items.length === 0 && result.page > 1 && result.total > 0) {
          setPage(Math.max(1, Math.ceil(result.total / result.pageSize)));
          return;
        }
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(transportErrorKey(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, status, page, archived, reload]);

  /** Re-reads the current page from the server (never trusts the rows already shown). */
  const refresh = () => setReload((value) => value + 1);

  function removed(item: OnboardingCaseSummary) {
    setRemoving(null);
    setActionError(null);
    setNotice(item.removal.allowed && item.removal.action === "ARCHIVE" ? "onboarding.remove.doneArchived" : "onboarding.remove.done");
    // Drop the row at once so it never lingers, then reload the page and the totals from the server.
    setData((current) => current && { ...current, items: current.items.filter((row) => row.id !== item.id), total: Math.max(0, current.total - 1) });
    refresh();
  }

  async function restore(item: OnboardingCaseSummary) {
    if (restoringId) return;
    setRestoringId(item.id);
    setActionError(null);
    setNotice(null);
    try {
      await restoreOnboardingCase(item.id, item.revision);
      setNotice("onboarding.remove.restored");
      setData((current) => current && { ...current, items: current.items.filter((row) => row.id !== item.id), total: Math.max(0, current.total - 1) });
    } catch (caught) {
      setActionError(caught instanceof ApiError && (caught.status === 404 || caught.status === 409) ? "onboarding.remove.error.changed" : transportErrorKey(caught));
    } finally {
      setRestoringId(null);
      refresh();
    }
  }

  async function startNew() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await createOnboardingCase();
      router.push(`/onboarding/${created.id}`);
    } catch (caught) {
      setActionError(transportErrorKey(caught));
      setBusy(false);
    }
  }

  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <>
      <PageHeader
        title={t("onboarding.title")}
        description={t("onboarding.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setPickerOpen((open) => !open)} aria-expanded={pickerOpen} aria-controls="lead-picker">
              {t("onboarding.fromLead")}
            </Button>
            <Button type="button" variant="primary" onClick={() => void startNew()} disabled={busy}>
              <IconPlus width={18} height={18} />
              {busy ? t("onboarding.creating") : t("onboarding.new")}
            </Button>
          </div>
        }
      />

      {actionError ? (
        <Alert tone="danger" className="mb-4">
          {t(actionError)}
        </Alert>
      ) : null}
      <div role="status" aria-live="polite">
        {notice ? (
          <Alert tone="success" className="mb-4">
            {t(notice)}
          </Alert>
        ) : null}
      </div>

      {pickerOpen ? <LeadPicker onClose={() => setPickerOpen(false)} /> : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative w-full min-w-0 sm:max-w-sm sm:flex-1">
            <IconSearch
              width={16}
              height={16}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("onboarding.searchPlaceholder")}
              aria-label={t("common.search")}
              className="ps-9"
              maxLength={100}
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("onboarding.filter")}>
            {FILTERS.map((filter) => (
              <button
                key={filter.value || "all"}
                type="button"
                aria-pressed={status === filter.value}
                onClick={() => {
                  if (status === filter.value && page === 1) return;
                  setStatus(filter.value);
                  setPage(1);
                  setData(null);
                }}
                className={cn(
                  "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
                  status === filter.value
                    ? "border-primary bg-primary-soft text-primary-text"
                    : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {t(filter.label)}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={archived}
            onClick={() => {
              setArchived((value) => !value);
              setPage(1);
              setData(null);
              setNotice(null);
            }}
            className={cn(
              "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors sm:ms-auto",
              archived
                ? "border-primary bg-primary-soft text-primary-text"
                : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {t("onboarding.remove.showRemoved")}
          </button>
        </div>
        {archived ? <p className="border-b border-border px-4 py-2.5 text-[13px] text-muted-foreground">{t("onboarding.remove.removedHint")}</p> : null}

        {error ? (
          <div className="p-4">
            <Alert tone="danger">{t(error)}</Alert>
          </div>
        ) : data === null ? (
          <div className="space-y-3 p-4" aria-busy="true">
            <span className="sr-only">{t("common.loading")}</span>
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState title={t(archived ? "onboarding.remove.emptyRemoved" : debounced || status ? "onboarding.emptyFiltered" : "onboarding.empty")}>
            {archived ? null : t("onboarding.emptyHint")}
          </EmptyState>
        ) : (
          <>
            {/* Small screens: one card per case, no horizontal scrolling. */}
            <ul className="divide-y divide-border md:hidden">
              {data.items.map((item) => (
                <li key={item.id}>
                  <CaseCard item={item} action={<RowAction item={item} archived={archived} restoring={restoringId === item.id}
                    onRemove={() => { setNotice(null); setRemoving(item); }} onRestore={() => void restore(item)} />} />
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <TableWrap>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>{t("onboarding.col.restaurant")}</Th>
                      <Th>{t("onboarding.col.status")}</Th>
                      <Th>{t("onboarding.col.mode")}</Th>
                      <Th>{t("onboarding.col.progress")}</Th>
                      <Th>{t("onboarding.col.operator")}</Th>
                      <Th>{t("onboarding.col.updated")}</Th>
                      <Th className="text-end"><span className="sr-only">{t("onboarding.col.actions")}</span></Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-surface-2/60">
                        <td className="px-4 py-3">
                          <Link href={`/onboarding/${item.id}`} className="group block min-w-[180px]">
                            <span className="flex items-center gap-2 font-medium text-foreground group-hover:text-primary-text">
                              <bdi>{item.restaurantName ?? t(item.mode === "DEMO" ? "onboarding.demo.unnamed" : "onboarding.unnamed")}</bdi>
                              {item.leadId ? <Badge tone="primary">{t("onboarding.fromLeadBadge")}</Badge> : null}
                            </span>
                            {item.ownerEmail ? (
                              <span className="block max-w-[260px] truncate text-xs text-muted-foreground">
                                <bdi dir="ltr">{item.ownerEmail}</bdi>
                              </span>
                            ) : null}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <OnboardingStatusBadge status={item.status} t={t} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.mode ? t(`onboarding.mode.${item.mode}`) : "—"}</td>
                        <td className="tabular px-4 py-3 text-muted-foreground">
                          <Progress item={item} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <bdi>{item.updatedBy?.displayName ?? "—"}</bdi>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmt.dateTime(item.updatedAt)}</td>
                        <td className="px-4 py-3 text-end">
                          <RowAction item={item} archived={archived} restoring={restoringId === item.id}
                            onRemove={() => { setNotice(null); setRemoving(item); }} onRestore={() => void restore(item)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </>
        )}

        {data && data.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="tabular text-[13px] text-muted-foreground">
              {t("common.showing", { from: fmt.number(from), to: fmt.number(to), total: fmt.number(data.total) })}
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                {t("common.previous")}
              </Button>
              <Button size="sm" disabled={page >= lastPage} onClick={() => setPage((current) => current + 1)}>
                {t("common.next")}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {removing ? (
        <RemoveCaseDialog
          item={removing}
          onClose={() => setRemoving(null)}
          onRemoved={removed}
          onStale={(message) => {
            setRemoving(null);
            setActionError(message);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}

function Progress({ item }: { item: OnboardingCaseSummary }) {
  const { t, fmt } = useI18n();
  const { done, total } = stepProgress(item.mode, item.completedSteps);
  return <>{t("onboarding.progressShort", { done: fmt.number(done), total: fmt.number(total) })}</>;
}

/** Remove (active list) or Restore (removed list), reachable without opening the case. */
function RowAction({ item, archived, restoring, onRemove, onRestore }: {
  item: OnboardingCaseSummary;
  archived: boolean;
  restoring: boolean;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const { t } = useI18n();
  const name = item.restaurantName ?? t(item.mode === "DEMO" ? "onboarding.demo.unnamed" : "onboarding.unnamed");
  if (archived) {
    return (
      <Button size="sm" disabled={restoring} aria-label={t("onboarding.remove.restoreNamed", { name })} onClick={onRestore} className="min-h-11 sm:min-h-8">
        {restoring ? t("common.saving") : t("onboarding.remove.restore")}
      </Button>
    );
  }
  return (
    <Button size="sm" variant="ghost" aria-label={t("onboarding.remove.actionNamed", { name })} onClick={onRemove}
      className="min-h-11 text-danger hover:bg-danger-soft sm:min-h-8">
      {t("onboarding.remove.action")}
    </Button>
  );
}

function CaseCard({ item, action }: { item: OnboardingCaseSummary; action: ReactNode }) {
  const { t, fmt } = useI18n();
  return (
    <div className="flex items-start gap-2 pe-3 hover:bg-surface-2/60">
    <Link href={`/onboarding/${item.id}`} className="block min-w-0 flex-1 space-y-2 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-words font-medium text-foreground">
          <bdi>{item.restaurantName ?? t(item.mode === "DEMO" ? "onboarding.demo.unnamed" : "onboarding.unnamed")}</bdi>
        </span>
        <OnboardingStatusBadge status={item.status} t={t} />
        {item.leadId ? <Badge tone="primary">{t("onboarding.fromLeadBadge")}</Badge> : null}
      </div>
      {item.ownerEmail ? (
        <p className="truncate text-xs text-muted-foreground">
          <bdi dir="ltr">{item.ownerEmail}</bdi>
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {item.mode ? t(`onboarding.mode.${item.mode}`) : t("onboarding.noMode")} · <Progress item={item} /> ·{" "}
        <bdi>{item.updatedBy?.displayName ?? "—"}</bdi> · {fmt.dateTime(item.updatedAt)}
      </p>
    </Link>
    <div className="shrink-0 pt-2.5">{action}</div>
    </div>
  );
}

/** Pick an open landing-page request and open (or create) its onboarding case. */
function LeadPicker({ onClose }: { onClose: () => void }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [leads, setLeads] = useState<SignupLead[] | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listLeads("open")
      .then((loaded) => {
        if (!cancelled) setLeads(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(transportErrorKey(caught));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!leads) return [];
    if (!needle) return leads;
    return leads.filter((lead) =>
      [lead.name, lead.email, lead.phone, lead.restaurantName ?? ""].some((field) => field.toLowerCase().includes(needle)),
    );
  }, [leads, query]);

  async function start(lead: SignupLead) {
    if (busyId) return;
    setBusyId(lead.id);
    setError(null);
    try {
      const caseId = await openOnboardingForLead(lead.id);
      router.push(`/onboarding/${caseId}`);
    } catch (caught) {
      setError(transportErrorKey(caught));
      setBusyId(null);
    }
  }

  return (
    <Card id="lead-picker" className="mb-4">
      <CardHeader
        title={t("onboarding.leadPicker.title")}
        description={t("onboarding.leadPicker.hint")}
        action={
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("onboarding.leadPicker.search")}
          aria-label={t("onboarding.leadPicker.search")}
          maxLength={100}
        />
        {error ? <Alert tone="danger">{t(error)}</Alert> : null}
        {leads === null && !error ? (
          <Skeleton className="h-24 w-full" />
        ) : shown.length === 0 && !error ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("onboarding.leadPicker.empty")}</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {shown.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    <bdi>{lead.name}</bdi>
                    {lead.restaurantName ? (
                      <span className="text-muted-foreground">
                        {" · "}
                        <bdi>{lead.restaurantName}</bdi>
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <bdi dir="ltr">{lead.email}</bdi> · {t(`leads.kind.${lead.kind}`)} · {fmt.date(lead.createdAt)}
                  </p>
                </div>
                <Button size="sm" variant="primary" disabled={busyId !== null} onClick={() => void start(lead)}>
                  {busyId === lead.id ? t("onboarding.opening") : t("onboarding.startFromLead")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
