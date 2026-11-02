"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input, Label, PageHeader, Select, Skeleton, TableWrap, Th } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import { createDemo, extendDemo, listDemos, newDemoLink, removeDemo, type DemoSummary } from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Translate } from "@/lib/i18n/translate";

const DURATIONS = [1, 4, 24, 72, 168] as const;
const ERROR_KEYS: Record<string, MessageKey> = {
  DEMO_LIMIT_REACHED: "demos.err.limit",
  DEMO_INVALID: "demos.err.invalid",
  DEMO_NOT_FOUND: "demos.err.notFound",
};

/** A message is kept as a key (or a transport kind) so a language switch re-translates it. */
type Feedback = { tone: "success" | "danger"; key: MessageKey | "network" | "session" | "other" } | null;
/** The link of a demo, shown only after it was made. */
interface FreshLink {
  label: string;
  link: string;
  expiresAt: string;
}

function feedbackFor(caught: unknown): NonNullable<Feedback> {
  if (caught instanceof ApiError) {
    if (caught.code && ERROR_KEYS[caught.code]) return { tone: "danger", key: ERROR_KEYS[caught.code] };
    return { tone: "danger", key: caught.status === 401 ? "session" : "other" };
  }
  return { tone: "danger", key: isNetworkFailure(caught) ? "network" : "other" };
}

/** "2 d 3 h", "5 h 10 min", "40 min": how long is left. */
function timeLeft(expiresAt: string, now: number, t: Translate): string {
  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return t("demos.time.dh", { d, h });
  if (h > 0) return t("demos.time.hm", { h, m });
  return t("demos.time.m", { m });
}

export function DemosView() {
  const { t, fmt } = useI18n();
  const [demos, setDemos] = useState<DemoSummary[] | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState<number>(24);
  const [fresh, setFresh] = useState<FreshLink | null>(null);
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setDemos(await listDemos());
    } catch (caught) {
      setFeedback(feedbackFor(caught));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listDemos()
      .then((loaded) => {
        if (!cancelled) setDemos(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setFeedback(feedbackFor(caught));
      });
    // the countdown and the list follow the clock: a demo that ended shows as ended without a reload
    const tick = setInterval(() => {
      setNow(Date.now());
      void load();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(tick);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, [load]);

  function text(feedbackValue: NonNullable<Feedback>): string {
    if (feedbackValue.key === "network") return t("common.unreachable");
    if (feedbackValue.key === "session") return t("common.sessionExpired");
    if (feedbackValue.key === "other") return t("common.error");
    return t(feedbackValue.key);
  }

  async function run(action: () => Promise<MessageKey>) {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const successKey = await action();
      setFeedback({ tone: "success", key: successKey });
      await load();
    } catch (caught) {
      setFeedback(feedbackFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (label.trim() === "") {
      setFeedback({ tone: "danger", key: "demos.err.invalid" });
      return;
    }
    await run(async () => {
      const result = await createDemo({ label: label.trim(), hours });
      setFresh({ label: result.demo.label, link: result.link, expiresAt: result.demo.expiresAt });
      setLabel("");
      return "demos.created";
    });
  }

  async function copy(kind: "link" | "message") {
    if (!fresh) return;
    const value =
      kind === "link" ? fresh.link : t("demos.message", { date: fmt.dateTime(fresh.expiresAt), link: fresh.link });
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2500);
    } catch {
      setFeedback({ tone: "danger", key: "other" });
    }
  }

  return (
    <>
      <PageHeader title={t("demos.title")} description={t("demos.description")} />
      {feedback ? (
        <Alert tone={feedback.tone} className="mb-4">
          {text(feedback)}
        </Alert>
      ) : null}

      <div className="max-w-4xl space-y-4">
        <Card>
          <CardHeader title={t("demos.new.title")} description={t("demos.new.description")} />
          <form onSubmit={(event) => void create(event)} className="grid gap-4 p-5 sm:grid-cols-[1fr_200px_auto] sm:items-start" noValidate autoComplete="off">
            <div>
              <Label htmlFor="demo-label">{t("demos.label")}</Label>
              <Input id="demo-label" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} />
              <p className="mt-1.5 text-xs text-muted-foreground">{t("demos.labelHint")}</p>
            </div>
            <div>
              <Label htmlFor="demo-hours">{t("demos.duration")}</Label>
              <Select id="demo-hours" value={String(hours)} onChange={(event) => setHours(Number(event.target.value))}>
                {DURATIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`demos.duration.${value}` as MessageKey)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:pt-[26px]">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? t("demos.creating") : t("demos.create")}
              </Button>
            </div>
          </form>
        </Card>

        {fresh ? (
          <Card className="border-primary/40">
            <CardHeader
              title={t("demos.link.title", { label: fresh.label })}
              description={t("demos.link.hint")}
              action={
                <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>
                  {t("demos.link.dismiss")}
                </Button>
              }
            />
            <div className="space-y-3 p-5">
              <Input readOnly dir="ltr" value={fresh.link} onFocus={(event) => event.currentTarget.select()} className="text-start font-mono text-[13px]" aria-label={t("demos.link.copy")} />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" onClick={() => void copy("link")}>
                  {t("demos.link.copy")}
                </Button>
                <Button onClick={() => void copy("message")}>{t("demos.link.copyMessage")}</Button>
                <span role="status" className="text-xs text-muted-foreground">
                  {copied ? t("demos.link.copied") : ""}
                </span>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={t("demos.list.title")} />
          {demos === null ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : demos.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("demos.list.empty")}</p>
          ) : (
            <TableWrap>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>{t("demos.col.label")}</Th>
                    <Th>{t("demos.col.status")}</Th>
                    <Th>{t("demos.col.ends")}</Th>
                    <Th>{t("demos.col.opened")}</Th>
                    {/* No visible words: the label is an attribute (a sr-only element would escape the scrolling wrapper on a phone). */}
                    <Th aria-label={t("demos.col.actions")} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {demos.map((demo) => {
                    const ended = demo.status === "LOCKED" || new Date(demo.expiresAt).getTime() <= now;
                    return (
                      <tr key={demo.id} className="align-top">
                        <td className="px-4 py-3 font-medium">
                          <bdi>{demo.label}</bdi>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={ended ? "warning" : "success"} dot>
                            {t(ended ? "demos.status.LOCKED" : "demos.status.ACTIVE")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div className="whitespace-nowrap">{fmt.dateTime(demo.expiresAt)}</div>
                          <div className="text-xs">
                            {ended
                              ? t("demos.endedRemoved", { date: fmt.dateTime(demo.removedAt) })
                              : t("demos.endsIn", { time: timeLeft(demo.expiresAt, now, t) })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {demo.opened && demo.lastOpenedAt
                            ? t("demos.opened.some", { count: demo.openCount, date: fmt.dateTime(demo.lastOpenedAt) })
                            : t("demos.opened.never")}
                        </td>
                        <td className="px-4 py-3">
                          {confirming === demo.id ? (
                            <div className="min-w-[240px] space-y-2">
                              <Alert tone="warning">{t("demos.removeConfirm", { label: demo.label })}</Alert>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await removeDemo(demo.id);
                                      setConfirming(null);
                                      return "demos.removed";
                                    })
                                  }
                                >
                                  {t("demos.remove")}
                                </Button>
                                <Button size="sm" disabled={busy} onClick={() => setConfirming(null)}>
                                  {t("common.cancel")}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    await extendDemo(demo.id, 1);
                                    return "demos.extended";
                                  })
                                }
                              >
                                {t("demos.extend1h")}
                              </Button>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    await extendDemo(demo.id, 24);
                                    return "demos.extended";
                                  })
                                }
                              >
                                {t("demos.extend1d")}
                              </Button>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    const result = await newDemoLink(demo.id);
                                    setFresh({ label: result.demo.label, link: result.link, expiresAt: result.demo.expiresAt });
                                    return "demos.linkRenewed";
                                  })
                                }
                              >
                                {t("demos.newLink")}
                              </Button>
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(demo.id)} className="text-danger">
                                {t("demos.remove")}
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  );
}
