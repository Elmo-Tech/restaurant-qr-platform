"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input, Label, PageHeader, Skeleton, TableWrap, Th } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import {
  changeOwnPassword,
  createAdmin,
  getMe,
  listAdmins,
  resetAdminPassword,
  setAdminStatus,
  type AdminSummary,
} from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

const ERROR_KEYS: Record<string, MessageKey> = {
  ADMIN_EMAIL_TAKEN: "team.err.emailTaken",
  PASSWORD_INVALID: "team.err.passwordInvalid",
  CURRENT_PASSWORD_WRONG: "team.err.currentWrong",
  CANNOT_DISABLE_SELF: "team.err.self",
  LAST_ACTIVE_ADMIN: "team.err.last",
};

/** A message is kept as a key (or a transport kind) so a language switch re-translates it. */
type Feedback = { tone: "success" | "danger"; key: MessageKey | "network" | "session" | "other" } | null;

function feedbackFor(caught: unknown): NonNullable<Feedback> {
  if (caught instanceof ApiError) {
    if (caught.code && ERROR_KEYS[caught.code]) return { tone: "danger", key: ERROR_KEYS[caught.code] };
    return { tone: "danger", key: caught.status === 401 ? "session" : "other" };
  }
  return { tone: "danger", key: isNetworkFailure(caught) ? "network" : "other" };
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  hint,
  autoComplete = "new-password",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  autoComplete?: string;
}) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={shown ? "text" : "password"}
        dir="ltr"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="text-start"
      />
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{hint}</p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={shown} onChange={(event) => setShown(event.target.checked)} className="accent-primary" />
          {t("team.showPassword")}
        </label>
      </div>
    </div>
  );
}

export function TeamView() {
  const { t, fmt } = useI18n();
  const [admins, setAdmins] = useState<AdminSummary[] | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  // add form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  // own password
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  // one row at a time: confirming a disable, or typing a new password
  const [confirming, setConfirming] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const load = useCallback(async () => {
    try {
      setAdmins(await listAdmins());
    } catch (caught) {
      setFeedback(feedbackFor(caught));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listAdmins()
      .then((loaded) => {
        if (!cancelled) setAdmins(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setFeedback(feedbackFor(caught));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // who I am: you cannot disable yourself or reset your own password from the list
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setSelfId(me.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: () => Promise<void>, successKey: MessageKey) {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ tone: "success", key: successKey });
    } catch (caught) {
      setFeedback(feedbackFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (newName.trim() === "" || !EMAIL.test(newEmail.trim()) || newPassword.length < MIN_PASSWORD) {
      setFeedback({ tone: "danger", key: "team.err.fields" });
      return;
    }
    await run(async () => {
      await createAdmin({ email: newEmail.trim(), displayName: newName.trim(), password: newPassword });
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      await load();
    }, "team.added");
  }

  async function changeMine(event: FormEvent) {
    event.preventDefault();
    if (next.length < MIN_PASSWORD) {
      setFeedback({ tone: "danger", key: "team.err.password" });
      return;
    }
    await run(async () => {
      await changeOwnPassword(current, next);
      setCurrent("");
      setNext("");
    }, "team.changed");
  }

  async function toggle(admin: AdminSummary) {
    await run(async () => {
      await setAdminStatus(admin.id, admin.status === "ACTIVE" ? "DISABLED" : "ACTIVE");
      setConfirming(null);
      await load();
    }, "team.statusDone");
  }

  async function saveReset(admin: AdminSummary) {
    if (resetPassword.length < MIN_PASSWORD) {
      setFeedback({ tone: "danger", key: "team.err.password" });
      return;
    }
    await run(async () => {
      await resetAdminPassword(admin.id, resetPassword);
      setResetting(null);
      setResetPassword("");
    }, "team.resetDone");
  }

  const feedbackText =
    feedback === null
      ? null
      : feedback.key === "network"
        ? t("common.unreachable")
        : feedback.key === "session"
          ? t("common.sessionExpired")
          : feedback.key === "other"
            ? t("common.error")
            : t(feedback.key);

  return (
    <>
      <PageHeader title={t("team.title")} description={t("team.subtitle")} />
      {feedbackText && feedback ? (
        <Alert tone={feedback.tone} className="mb-4">
          {feedbackText}
        </Alert>
      ) : null}

      <Card className="mb-6">
        {admins === null ? (
          <div className="space-y-3 p-4" aria-busy="true">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>{t("team.col.name")}</Th>
                  <Th>{t("team.col.email")}</Th>
                  <Th>{t("team.col.status")}</Th>
                  <Th>{t("team.col.lastLogin")}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {admins.map((admin) => {
                  const isSelf = admin.id === selfId;
                  return (
                    <tr key={admin.id} className="align-top">
                      <td className="px-4 py-3 font-medium">
                        <bdi>{admin.displayName}</bdi> {isSelf ? <Badge tone="primary">{t("team.you")}</Badge> : null}
                      </td>
                      <td className="px-4 py-3">
                        <bdi dir="ltr">{admin.email}</bdi>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={admin.status === "ACTIVE" ? "success" : "neutral"} dot>
                          {t(`team.status.${admin.status}`)}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {admin.lastLoginAt ? fmt.dateTime(admin.lastLoginAt) : t("team.never")}
                      </td>
                      <td className="px-4 py-3">
                        {resetting === admin.id ? (
                          <div className="min-w-[260px] space-y-2">
                            <PasswordField
                              id={`reset-${admin.id}`}
                              label={t("team.resetFor", { name: admin.displayName })}
                              value={resetPassword}
                              onChange={setResetPassword}
                              hint={t("team.resetHint")}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" variant="primary" disabled={busy} onClick={() => void saveReset(admin)}>
                                {t("team.resetSubmit")}
                              </Button>
                              <Button size="sm" disabled={busy} onClick={() => setResetting(null)}>
                                {t("common.cancel")}
                              </Button>
                            </div>
                          </div>
                        ) : confirming === admin.id ? (
                          <div className="min-w-[260px] space-y-2">
                            <Alert tone="warning">{t("team.disableConfirm", { name: admin.displayName })}</Alert>
                            <div className="flex gap-2">
                              <Button size="sm" variant="danger" disabled={busy} onClick={() => void toggle(admin)}>
                                {t("detail.confirm")}
                              </Button>
                              <Button size="sm" disabled={busy} onClick={() => setConfirming(null)}>
                                {t("common.cancel")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-2">
                            {!isSelf ? (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  setResetPassword("");
                                  setResetting(admin.id);
                                }}
                              >
                                {t("team.resetPassword")}
                              </Button>
                            ) : null}
                            {!isSelf ? (
                              <Button
                                size="sm"
                                variant={admin.status === "ACTIVE" ? "secondary" : "primary"}
                                disabled={busy}
                                onClick={() => (admin.status === "ACTIVE" ? setConfirming(admin.id) : void toggle(admin))}
                              >
                                {admin.status === "ACTIVE" ? t("team.disable") : t("team.enable")}
                              </Button>
                            ) : null}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("team.add")} description={t("team.addHint")} />
          <form onSubmit={(event) => void add(event)} className="space-y-4 p-5" noValidate autoComplete="off">
            <div>
              <Label htmlFor="a-name">{t("team.name")}</Label>
              <Input id="a-name" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} />
            </div>
            <div>
              <Label htmlFor="a-email">{t("team.email")}</Label>
              <Input
                id="a-email"
                type="email"
                dir="ltr"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                autoComplete="off"
                className="text-start"
              />
            </div>
            <PasswordField id="a-password" label={t("team.password")} value={newPassword} onChange={setNewPassword} hint={t("team.passwordHint")} />
            <Button type="submit" variant="primary" disabled={busy}>
              {t("team.addSubmit")}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title={t("team.mine")} description={t("team.mineHint")} />
          <form onSubmit={(event) => void changeMine(event)} className="space-y-4 p-5" noValidate>
            <PasswordField id="m-current" label={t("team.current")} value={current} onChange={setCurrent} autoComplete="current-password" />
            <PasswordField id="m-new" label={t("team.new")} value={next} onChange={setNext} hint={t("team.passwordHint")} />
            <Button type="submit" variant="primary" disabled={busy || current === ""}>
              {t("team.changeSubmit")}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
