"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Input, Label, PageHeader, Skeleton } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import { listRequests, updateRequest, type RequestStatus, type SubscriptionRequest } from "@/lib/api/requests";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<RequestStatus, "primary" | "warning" | "success" | "neutral"> = {
  NEW: "primary",
  CONTACTED: "warning",
  DONE: "success",
  DISMISSED: "neutral",
};

/** The next steps offered for each status. */
const ACTIONS: Record<RequestStatus, { status: RequestStatus; label: "requests.act.contacted" | "requests.act.done" | "requests.act.dismiss" | "requests.act.reopen"; primary?: boolean }[]> = {
  NEW: [
    { status: "CONTACTED", label: "requests.act.contacted", primary: true },
    { status: "DONE", label: "requests.act.done" },
    { status: "DISMISSED", label: "requests.act.dismiss" },
  ],
  CONTACTED: [
    { status: "DONE", label: "requests.act.done", primary: true },
    { status: "DISMISSED", label: "requests.act.dismiss" },
  ],
  DONE: [{ status: "NEW", label: "requests.act.reopen" }],
  DISMISSED: [{ status: "NEW", label: "requests.act.reopen" }],
};

/** The inbox of upgrade and renewal requests that restaurants send from "My subscription" (DEC-050). */
export function RequestsView() {
  const { t, fmt } = useI18n();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [items, setItems] = useState<SubscriptionRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const describe = useCallback(
    (caught: unknown) =>
      isNetworkFailure(caught)
        ? t("common.unreachable")
        : caught instanceof ApiError && caught.status === 401
          ? t("common.sessionExpired")
          : t("common.error"),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    listRequests(filter)
      .then((loaded) => {
        if (cancelled) return;
        setItems(loaded);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(describe(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [filter, describe]);

  async function act(request: SubscriptionRequest, status: RequestStatus) {
    if (busyId) return;
    setBusyId(request.id);
    setError(null);
    try {
      const note = notes[request.id];
      const saved = await updateRequest(request.id, { status, ...(note !== undefined ? { note } : {}) });
      setItems((current) => {
        if (!current) return current;
        // in the "open" view a finished request leaves the list
        if (filter === "open" && (saved.status === "DONE" || saved.status === "DISMISSED")) {
          return current.filter((item) => item.id !== saved.id);
        }
        return current.map((item) => (item.id === saved.id ? saved : item));
      });
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title={t("requests.title")} description={t("requests.subtitle")} />

      <div className="mb-4 inline-flex rounded-lg border border-border bg-surface-2 p-0.5" role="group" aria-label={t("requests.filter")}>
        {(["open", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => {
              setItems(null);
              setFilter(value);
            }}
            className={cn(
              "h-8 rounded-md px-3 text-[13px] font-medium transition-colors",
              filter === value ? "bg-surface text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(value === "open" ? "requests.filter.open" : "requests.filter.all")}
          </button>
        ))}
      </div>

      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}

      {items === null && !error ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : items && items.length === 0 ? (
        <Card>
          <EmptyState title={t(filter === "open" ? "requests.emptyOpen" : "requests.empty")}>
            {t("requests.emptyHint")}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-4">
          {items?.map((request) => (
            <li key={request.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/restaurants/${request.restaurant.id}`} className="text-[15px] font-semibold text-primary-text hover:underline">
                        <bdi>{request.restaurant.name}</bdi>
                      </Link>
                      <Badge tone={STATUS_TONE[request.status]} dot>
                        {t(`requests.status.${request.status}`)}
                      </Badge>
                      <Badge>{t(`requests.kind.${request.kind}`)}</Badge>
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {request.kind === "UPGRADE" && request.packageName ? (
                        <>
                          <bdi>{request.restaurant.packageName ?? t("requests.noPackage")}</bdi>
                          <span aria-hidden="true" className="mx-1.5 inline-block rtl:rotate-180">→</span>
                          <bdi className="font-medium text-foreground">{request.packageName}</bdi>
                          {" · "}
                        </>
                      ) : null}
                      <bdi dir="ltr">{request.requestedByEmail}</bdi> · {fmt.dateTime(request.createdAt)}
                    </p>
                  </div>
                </div>

                {request.message ? (
                  <p className="mt-3 whitespace-pre-line rounded-lg bg-surface-2 px-4 py-3 text-sm text-foreground">{request.message}</p>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <Label htmlFor={`note-${request.id}`}>{t("requests.note")}</Label>
                    <Input
                      id={`note-${request.id}`}
                      value={notes[request.id] ?? request.note ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                      placeholder={t("requests.notePlaceholder")}
                      maxLength={500}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ACTIONS[request.status].map((action) => (
                      <Button
                        key={action.status}
                        variant={action.primary ? "primary" : "secondary"}
                        size="sm"
                        disabled={busyId !== null}
                        onClick={() => void act(request, action.status)}
                      >
                        {t(action.label)}
                      </Button>
                    ))}
                  </div>
                </div>
                {request.handledByEmail && request.handledAt ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("requests.handledBy")} <bdi dir="ltr">{request.handledByEmail}</bdi> · {fmt.dateTime(request.handledAt)}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
