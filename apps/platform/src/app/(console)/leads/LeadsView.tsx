"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Input, Label, PageHeader, Skeleton } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import { listLeads, updateLead, type LeadStatus, type SignupLead } from "@/lib/api/leads";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<LeadStatus, "primary" | "warning" | "success" | "neutral"> = {
  NEW: "primary",
  CONTACTED: "warning",
  DONE: "success",
  DISMISSED: "neutral",
};

/** The next steps offered for each status (the labels are shared with the restaurant requests inbox). */
const ACTIONS: Record<LeadStatus, { status: LeadStatus; label: "requests.act.contacted" | "requests.act.done" | "requests.act.dismiss" | "requests.act.reopen"; primary?: boolean }[]> = {
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

/** The WhatsApp link for a phone number as typed: digits only, with the international prefix. */
const whatsappLink = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;

/** The inbox of subscription and free-trial requests from the public landing page (DEC-053). */
export function LeadsView() {
  const { t, fmt } = useI18n();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [items, setItems] = useState<SignupLead[] | null>(null);
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
    listLeads(filter)
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

  async function act(lead: SignupLead, status: LeadStatus) {
    if (busyId) return;
    setBusyId(lead.id);
    setError(null);
    try {
      const note = notes[lead.id];
      const saved = await updateLead(lead.id, { status, ...(note !== undefined ? { note } : {}) });
      setItems((current) => {
        if (!current) return current;
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
      <PageHeader title={t("leads.title")} description={t("leads.subtitle")} />

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
          <EmptyState title={t(filter === "open" ? "leads.emptyOpen" : "leads.empty")}>{t("leads.emptyHint")}</EmptyState>
        </Card>
      ) : (
        <ul className="space-y-4">
          {items?.map((lead) => (
            <li key={lead.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-foreground">
                    <bdi>{lead.name}</bdi>
                  </span>
                  <Badge tone={STATUS_TONE[lead.status]} dot>
                    {t(`requests.status.${lead.status}`)}
                  </Badge>
                  <Badge tone={lead.kind === "TRIAL" ? "success" : "primary"}>{t(`leads.kind.${lead.kind}`)}</Badge>
                  {lead.packageName ? <Badge>{lead.packageName}</Badge> : null}
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">{t("leads.phone")}</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <bdi dir="ltr">{lead.phone}</bdi>
                      <a href={whatsappLink(lead.phone)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-text hover:underline">
                        {t("leads.whatsapp")}
                      </a>
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">{t("leads.email")}</dt>
                    <dd>
                      <a href={`mailto:${lead.email}`} className="text-primary-text hover:underline">
                        <bdi dir="ltr">{lead.email}</bdi>
                      </a>
                    </dd>
                  </div>
                  {lead.restaurantName ? (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">{t("leads.restaurant")}</dt>
                      <dd>
                        <bdi>{lead.restaurantName}</bdi>
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">{t("leads.received")}</dt>
                    <dd>{fmt.dateTime(lead.createdAt)}</dd>
                  </div>
                </dl>

                {lead.message ? (
                  <p className="mt-3 whitespace-pre-line rounded-lg bg-surface-2 px-4 py-3 text-sm text-foreground">{lead.message}</p>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <Label htmlFor={`lead-note-${lead.id}`}>{t("requests.note")}</Label>
                    <Input
                      id={`lead-note-${lead.id}`}
                      value={notes[lead.id] ?? lead.note ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [lead.id]: event.target.value }))}
                      placeholder={t("requests.notePlaceholder")}
                      maxLength={500}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ACTIONS[lead.status].map((action) => (
                      <Button
                        key={action.status}
                        variant={action.primary ? "primary" : "secondary"}
                        size="sm"
                        disabled={busyId !== null}
                        onClick={() => void act(lead, action.status)}
                      >
                        {t(action.label)}
                      </Button>
                    ))}
                  </div>
                </div>
                {lead.handledByEmail && lead.handledAt ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t("requests.handledBy")} <bdi dir="ltr">{lead.handledByEmail}</bdi> · {fmt.dateTime(lead.handledAt)}
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
