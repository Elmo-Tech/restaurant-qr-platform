"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input, Label, Skeleton } from "@/components/ui";
import { aiErrorKey } from "@/lib/api/ai-errors";
import {
  AI_MAX_KEYS,
  addAiKey,
  deleteAiKey,
  getAiSettings,
  testAiKey,
  updateAiKey,
  updateAiSettings,
  type AiEngine,
  type AiKeyTestResult,
  type PlatformAiKey,
  type PlatformAiSettings,
} from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const ENGINES: readonly AiEngine[] = ["N8N", "DIRECT"];
const TEST_TONE: Record<AiKeyTestResult, "success" | "warning" | "danger"> = {
  OK: "success",
  LIMITED: "warning",
  REJECTED: "danger",
  UNAVAILABLE: "warning",
  REQUEST_REFUSED: "danger",
};

type Feedback = { tone: "success" | "danger"; text: string };

/**
 * AI menu import (DEC-059): which engine reads the menu files, the model, and the Gemini keys. A key is typed
 * once, here, and is never shown again: the list only has its label and last four characters.
 */
export function AiSettingsSection() {
  const { t, fmt } = useI18n();
  const [settings, setSettings] = useState<PlatformAiSettings | null>(null);
  const [keys, setKeys] = useState<PlatformAiKey[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [engine, setEngine] = useState<AiEngine>("N8N");
  const [model, setModel] = useState("");
  const [fallbackModel, setFallbackModel] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const [newLabel, setNewLabel] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [adding, setAdding] = useState(false);

  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, { result: AiKeyTestResult; model: string; httpStatus: number | null } | "running">>({});

  const apply = useCallback((loaded: PlatformAiSettings) => {
    setSettings(loaded);
    setEngine(loaded.engine);
    setModel(loaded.model);
    setFallbackModel(loaded.fallbackModel ?? "");
  }, []);

  /** The active-key count lives on the settings, so a key change reloads both. */
  const reload = useCallback(async () => {
    const overview = await getAiSettings();
    apply(overview.settings);
    setKeys(overview.keys);
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    getAiSettings()
      .then((overview) => {
        if (cancelled) return;
        apply(overview.settings);
        setKeys(overview.keys);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setLoadFailed(true);
        setFeedback({ tone: "danger", text: t(aiErrorKey(caught)) });
      });
    return () => {
      cancelled = true;
    };
  }, [apply, t]);

  const fail = (caught: unknown) => setFeedback({ tone: "danger", text: t(aiErrorKey(caught)) });

  const settingsChanged =
    settings !== null &&
    (engine !== settings.engine ||
      model.trim() !== settings.model ||
      fallbackModel.trim() !== (settings.fallbackModel ?? ""));

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (savingSettings || !settings) return;
    setSavingSettings(true);
    setFeedback(null);
    try {
      const saved = await updateAiSettings({
        engine,
        model: model.trim(),
        fallbackModel: fallbackModel.trim() === "" ? null : fallbackModel.trim(),
      });
      apply(saved);
      setFeedback({ tone: "success", text: t("ai.saved") });
    } catch (caught) {
      fail(caught);
    } finally {
      setSavingSettings(false);
    }
  }

  async function addKey(event: FormEvent) {
    event.preventDefault();
    if (adding) return;
    setAdding(true);
    setFeedback(null);
    try {
      await addAiKey({ label: newLabel.trim(), secret: newSecret.trim() });
      // The secret leaves the page the moment it is saved.
      setNewSecret("");
      setNewLabel("");
      await reload();
      setFeedback({ tone: "success", text: t("ai.keys.added") });
    } catch (caught) {
      fail(caught);
    } finally {
      setAdding(false);
    }
  }

  async function changeKey(key: PlatformAiKey, patch: { label?: string; status?: "ACTIVE" | "DISABLED" }, done: string) {
    if (busyKey) return;
    setBusyKey(key.id);
    setFeedback(null);
    try {
      await updateAiKey(key.id, patch);
      await reload();
      setRenaming(null);
      setFeedback({ tone: "success", text: done });
    } catch (caught) {
      fail(caught);
    } finally {
      setBusyKey(null);
    }
  }

  async function removeKey(key: PlatformAiKey) {
    if (busyKey) return;
    if (!window.confirm(t("ai.keys.deleteConfirm", { label: key.label }))) return;
    setBusyKey(key.id);
    setFeedback(null);
    try {
      await deleteAiKey(key.id);
      await reload();
      setFeedback({ tone: "success", text: t("ai.keys.deleted") });
    } catch (caught) {
      fail(caught);
    } finally {
      setBusyKey(null);
    }
  }

  async function runTest(key: PlatformAiKey) {
    if (tests[key.id] === "running") return;
    setTests((current) => ({ ...current, [key.id]: "running" }));
    try {
      const outcome = await testAiKey(key.id);
      setTests((current) => ({ ...current, [key.id]: outcome }));
    } catch (caught) {
      setTests((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== key.id)));
      fail(caught);
    }
  }

  const encryptionMissing = settings !== null && !settings.encryptionConfigured;
  const atLimit = keys.length >= AI_MAX_KEYS;

  return (
    <>
      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

      <Card>
        <CardHeader title={t("ai.engine.title")} description={t("ai.engine.description")} />
        {settings ? (
          <form onSubmit={(event) => void saveSettings(event)} className="space-y-4 p-5" noValidate>
            {encryptionMissing ? (
              <Alert tone="warning">
                {t("ai.encryption.missing")} <bdi dir="ltr" className="font-mono text-[13px]">AI_KEYS_ENCRYPTION_KEY</bdi>
              </Alert>
            ) : null}

            <fieldset className="space-y-2">
              <legend className="sr-only">{t("ai.engine.title")}</legend>
              {ENGINES.map((value) => {
                const selected = engine === value;
                const blocked = value === "DIRECT" && encryptionMissing;
                return (
                  <label
                    key={value}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-4 transition-colors",
                      selected ? "border-primary bg-primary-soft/50" : "border-border bg-surface-2/60",
                      blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-border-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name="ai-engine"
                      value={value}
                      checked={selected}
                      disabled={blocked}
                      onChange={() => setEngine(value)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{t(`ai.engine.${value}`)}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{t(`ai.engine.${value}.hint`)}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {engine === "DIRECT" && settings.activeKeyCount === 0 ? (
              <Alert tone="warning">{t("ai.engine.needsKey")}</Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="ai-model">{t("ai.model.label")}</Label>
                <Input
                  id="ai-model"
                  dir="ltr"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  maxLength={100}
                  autoComplete="off"
                  spellCheck={false}
                  className="text-start"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">{t("ai.model.hint")}</p>
              </div>
              <div>
                <Label htmlFor="ai-fallback">{t("ai.fallback.label")}</Label>
                <Input
                  id="ai-fallback"
                  dir="ltr"
                  value={fallbackModel}
                  onChange={(event) => setFallbackModel(event.target.value)}
                  maxLength={100}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("ai.fallback.none")}
                  className="text-start"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">{t("ai.fallback.hint")}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("ai.engine.n8nNote")}</p>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={savingSettings || !settingsChanged || model.trim() === ""}>
                {savingSettings ? t("common.saving") : t("common.save")}
              </Button>
              <span className="text-xs text-muted-foreground">{t("settings.updatedAt", { date: fmt.date(settings.updatedAt) })}</span>
            </div>
          </form>
        ) : loadFailed ? null : (
          <div className="space-y-3 p-5"><Skeleton className="h-16 w-full" /><Skeleton className="h-10 w-full" /></div>
        )}
      </Card>

      <Card>
        <CardHeader
          title={t("ai.keys.title")}
          description={t("ai.keys.description", { count: keys.length, max: AI_MAX_KEYS })}
        />
        {settings ? (
          <>
            {keys.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("ai.keys.empty")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {keys.map((key) => {
                  const test = tests[key.id];
                  const isRenaming = renaming?.id === key.id;
                  const busy = busyKey === key.id;
                  return (
                    <li key={key.id} className="space-y-2 px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1">
                          {isRenaming ? (
                            <form
                              className="flex flex-wrap items-center gap-2"
                              onSubmit={(event) => {
                                event.preventDefault();
                                void changeKey(key, { label: renaming.label.trim() }, t("ai.keys.updated"));
                              }}
                            >
                              <Input
                                aria-label={t("ai.keys.label")}
                                value={renaming.label}
                                onChange={(event) => setRenaming({ id: key.id, label: event.target.value })}
                                maxLength={200}
                                autoFocus
                                className="h-8 max-w-xs"
                              />
                              <Button type="submit" size="sm" variant="primary" disabled={busy || renaming.label.trim() === ""}>
                                {t("common.save")}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                                {t("common.cancel")}
                              </Button>
                            </form>
                          ) : (
                            <p className="text-sm font-medium text-foreground">
                              <bdi>{key.label}</bdi>
                              <bdi dir="ltr" className="mx-2 font-mono text-xs font-normal text-muted-foreground">
                                ····{key.last4}
                              </bdi>
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("ai.keys.addedOn", { date: fmt.date(key.createdAt) })}
                          </p>
                        </div>
                        <Badge tone={key.status === "ACTIVE" ? "success" : "neutral"} dot>
                          {t(`ai.keys.status.${key.status}`)}
                        </Badge>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button size="sm" disabled={test === "running" || busy} onClick={() => void runTest(key)}>
                            {test === "running" ? t("ai.keys.testing") : t("ai.keys.test")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void changeKey(
                                key,
                                { status: key.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
                                t("ai.keys.updated"),
                              )
                            }
                          >
                            {key.status === "ACTIVE" ? t("ai.keys.disable") : t("ai.keys.enable")}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRenaming({ id: key.id, label: key.label })}>
                            {t("ai.keys.rename")}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeKey(key)} className="text-danger">
                            {t("ai.keys.delete")}
                          </Button>
                        </div>
                      </div>
                      {test && test !== "running" ? (
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
                          <Badge tone={TEST_TONE[test.result]}>{t(`ai.test.${test.result}`)}</Badge>
                          <span>{t(`ai.test.${test.result}.hint`)}</span>
                          <bdi dir="ltr" className="font-mono">
                            {test.model}
                            {test.httpStatus ? ` · HTTP ${test.httpStatus}` : ""}
                          </bdi>
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <form onSubmit={(event) => void addKey(event)} className="space-y-4 border-t border-border p-5" noValidate>
              <h3 className="text-sm font-semibold text-foreground">{t("ai.keys.addTitle")}</h3>
              {encryptionMissing ? (
                <Alert tone="warning">
                  {t("ai.encryption.missing")} <bdi dir="ltr" className="font-mono text-[13px]">AI_KEYS_ENCRYPTION_KEY</bdi>
                </Alert>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ai-key-label">{t("ai.keys.label")}</Label>
                  <Input
                    id="ai-key-label"
                    value={newLabel}
                    onChange={(event) => setNewLabel(event.target.value)}
                    maxLength={200}
                    autoComplete="off"
                    placeholder={t("ai.keys.labelPlaceholder")}
                    disabled={encryptionMissing || atLimit}
                  />
                </div>
                <div>
                  <Label htmlFor="ai-key-secret">{t("ai.keys.secret")}</Label>
                  <Input
                    id="ai-key-secret"
                    type="password"
                    dir="ltr"
                    value={newSecret}
                    onChange={(event) => setNewSecret(event.target.value)}
                    maxLength={600}
                    autoComplete="new-password"
                    spellCheck={false}
                    disabled={encryptionMissing || atLimit}
                    className="text-start"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{atLimit ? t("ai.err.keyLimit") : t("ai.keys.secretHint")}</p>
              <Button
                type="submit"
                variant="primary"
                disabled={adding || encryptionMissing || atLimit || newLabel.trim() === "" || newSecret.trim() === ""}
              >
                {adding ? t("ai.keys.adding") : t("ai.keys.add")}
              </Button>
            </form>
          </>
        ) : loadFailed ? null : (
          <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        )}
      </Card>
    </>
  );
}
