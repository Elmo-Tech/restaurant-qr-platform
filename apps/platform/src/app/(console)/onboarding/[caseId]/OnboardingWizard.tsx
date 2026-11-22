"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconCheck } from "@/components/icons";
import { Alert, Badge, Button, Card, CardHeader, PageHeader, Skeleton } from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import {
  cancelOnboardingCase,
  getOnboardingCase,
  ONBOARDING_STEPS,
  submitOnboardingForReview,
  updateOnboardingCase,
  type AcquisitionDraft,
  type CustomerProblem,
  type ModeConfig,
  type OnboardingCase,
  type OnboardingDetails,
  type OnboardingMode,
  type OnboardingPatch,
  type OnboardingStep,
  type OwnerDraft,
  type RestaurantDraft,
} from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { formConfigAfterModeChange, pendingConfigAfterModeChange } from "@/lib/onboarding-package-choice";
import { cn } from "@/lib/utils";
import { OnboardingStatusBadge, transportErrorKey } from "../shared";
import { CustomerStep, type CustomerField } from "./CustomerStep";
import { DuplicatesPanel } from "./DuplicatesPanel";
import { ModeStep } from "./ModeStep";

const AUTOSAVE_DELAY_MS = 1500;
/** Menu (3) and handoff (5) belong to later milestones and are locked; review (4) only marks the case for review. */
const LOCKED_STEPS: readonly OnboardingStep[] = ["menu", "handoff"];

/** Edits not yet sent to the server; sent as one PATCH. */
interface Pending {
  restaurant: Partial<RestaurantDraft>;
  owner: Partial<OwnerDraft>;
  acquisition?: AcquisitionDraft | null;
  mode?: OnboardingMode | null;
  modeConfig: Partial<ModeConfig>;
}
const emptyPending = (): Pending => ({ restaurant: {}, owner: {}, modeConfig: {} });
const hasPending = (p: Pending) =>
  Object.keys(p.restaurant).length > 0 ||
  Object.keys(p.owner).length > 0 ||
  p.acquisition !== undefined ||
  p.mode !== undefined ||
  Object.keys(p.modeConfig).length > 0;
/** `later` wins over `earlier` (a failed save is put back under the edits made meanwhile). */
const mergePending = (earlier: Pending, later: Pending): Pending => ({
  restaurant: { ...earlier.restaurant, ...later.restaurant },
  owner: { ...earlier.owner, ...later.owner },
  acquisition: later.acquisition !== undefined ? later.acquisition : earlier.acquisition,
  mode: later.mode !== undefined ? later.mode : earlier.mode,
  modeConfig: { ...earlier.modeConfig, ...later.modeConfig },
});

/** Which field each step-1 problem belongs to. */
const CUSTOMER_FIELD: Record<CustomerProblem, CustomerField> = {
  RESTAURANT_NAME_INVALID: "restaurant.name",
  BUSINESS_TYPE_REQUIRED: "restaurant.businessType",
  BRANCH_NAME_INVALID: "restaurant.branchName",
  COUNTRY_INVALID: "restaurant.countryCode",
  CURRENCY_INVALID: "restaurant.currencyCode",
  TIMEZONE_INVALID: "restaurant.timezone",
  DEFAULT_LOCALE_INVALID: "restaurant.defaultLocale",
  ADDITIONAL_LOCALES_INVALID: "restaurant.additionalLocales",
  RESTAURANT_PHONE_INVALID: "restaurant.phone",
  RESTAURANT_WHATSAPP_INVALID: "restaurant.whatsapp",
  ADDRESS_TOO_LONG: "restaurant.address",
  RESTAURANT_FACEBOOK_URL_INVALID: "restaurant.facebookUrl",
  RESTAURANT_INSTAGRAM_URL_INVALID: "restaurant.instagramUrl",
  RESTAURANT_WEBSITE_URL_INVALID: "restaurant.websiteUrl",
  OWNER_NAME_INVALID: "owner.fullName",
  OWNER_PHONE_INVALID: "owner.phone",
  OWNER_EMAIL_INVALID: "owner.email",
  OWNER_FACEBOOK_URL_INVALID: "owner.facebookUrl",
  OWNER_ADDITIONAL_CONTACT_TOO_LONG: "owner.additionalContact",
  ACQUISITION_REQUIRED: "acquisition",
  ACQUISITION_INVALID: "acquisition",
  AD_REFERENCE_TOO_LONG: "acquisition",
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface Form {
  details: OnboardingDetails;
  mode: OnboardingMode | null;
  modeConfig: ModeConfig;
}
const formOf = (data: OnboardingCase): Form => ({ details: data.details, mode: data.mode, modeConfig: data.modeConfig });

function firstOpenStep(data: OnboardingCase): OnboardingStep {
  if (!data.completedSteps.includes("customer")) return "customer";
  if (!data.completedSteps.includes("mode")) return "mode";
  return "review";
}

/** The owner onboarding wizard (PROPOSED, milestones A1 + A2): steps 1 and 2 are live, 3-5 are later milestones. */
export function OnboardingWizard({ caseId }: { caseId: string }) {
  const { t, fmt } = useI18n();
  const [data, setData] = useState<OnboardingCase | null>(null);
  const [loadError, setLoadError] = useState<MessageKey | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [step, setStep] = useState<OnboardingStep>("customer");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<MessageKey | null>(null);
  const [conflict, setConflict] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState<ReadonlySet<OnboardingStep>>(new Set());
  const [pendingFields, setPendingFields] = useState<ReadonlySet<string>>(new Set());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<MessageKey | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const pendingRef = useRef<Pending>(emptyPending());
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const conflictRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const movedRef = useRef(false);

  const adopt = useCallback((loaded: OnboardingCase, resetForm: boolean) => {
    revisionRef.current = loaded.revision;
    setData(loaded);
    if (resetForm) setForm(formOf(loaded));
  }, []);

  // ---------------------------------------------------------------- load / reload

  const load = useCallback(
    async (initial: boolean) => {
      try {
        const loaded = await getOnboardingCase(caseId);
        pendingRef.current = emptyPending();
        conflictRef.current = false;
        setConflict(false);
        setPendingFields(new Set());
        setSaveState("idle");
        setSaveError(null);
        adopt(loaded, true);
        if (initial) setStep(firstOpenStep(loaded));
        setLoadError(null);
      } catch (caught) {
        setLoadError(caught instanceof ApiError && caught.status === 404 ? "onboarding.notFound" : transportErrorKey(caught));
      }
    },
    [caseId, adopt],
  );

  useEffect(() => {
    // Fetch on mount; `load` only sets state after the response arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(true);
  }, [load]);

  // ---------------------------------------------------------------- autosave

  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (conflictRef.current) return false;
    if (savingRef.current) {
      queuedRef.current = true;
      return false;
    }
    // One PATCH at a time; edits made while it runs are sent right after it (never in parallel).
    let ok = true;
    do {
      queuedRef.current = false;
      ok = await saveOnce();
    } while (ok && queuedRef.current && hasPending(pendingRef.current) && !conflictRef.current);
    return ok;

    async function saveOnce(): Promise<boolean> {
      const patch = pendingRef.current;
      if (!hasPending(patch)) return true;
      pendingRef.current = emptyPending();
      savingRef.current = true;
      setSaveState("saving");
      const body: OnboardingPatch = { revision: revisionRef.current };
      const details: NonNullable<OnboardingPatch["details"]> = {};
      if (Object.keys(patch.restaurant).length > 0) details.restaurant = patch.restaurant;
      if (Object.keys(patch.owner).length > 0) details.owner = patch.owner;
      if (patch.acquisition !== undefined) details.acquisition = patch.acquisition;
      if (Object.keys(details).length > 0) body.details = details;
      if (patch.mode !== undefined) body.mode = patch.mode;
      if (Object.keys(patch.modeConfig).length > 0) body.modeConfig = patch.modeConfig;
      let ok = false;
      try {
        const saved = await updateOnboardingCase(caseId, body);
        ok = true;
        const nothingNew = !hasPending(pendingRef.current);
        adopt(saved, false);
        // The server may fill the trial default length (never the package); take its mode values when the operator
        // has not typed meanwhile.
        if (nothingNew) {
          setForm((current) => (current ? { ...current, mode: saved.mode, modeConfig: saved.modeConfig } : current));
          setPendingFields(new Set());
          setSaveState("saved");
        } else {
          setSaveState("dirty");
        }
        setSavedAt(saved.updatedAt);
        setSaveError(null);
      } catch (caught) {
        pendingRef.current = mergePending(patch, pendingRef.current);
        setSaveState("error");
        if (caught instanceof ApiError && caught.code === "ONBOARDING_REVISION_CONFLICT") {
          conflictRef.current = true;
          setConflict(true);
          setSaveError("onboarding.save.conflict");
        } else if (caught instanceof ApiError && caught.code === "ONBOARDING_NOT_EDITABLE") {
          setSaveError("onboarding.save.notEditable");
        } else if (caught instanceof ApiError && caught.code === "ONBOARDING_INPUT_INVALID") {
          setSaveError("onboarding.save.invalid");
        } else {
          setSaveError(transportErrorKey(caught));
        }
      } finally {
        savingRef.current = false;
      }
      return ok;
    }
  }, [caseId, adopt]);

  const schedule = useCallback(() => {
    setSaveState("dirty");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [flush]);

  // Warn before leaving with unsaved edits; send what is left when the page is left inside the app.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasPending(pendingRef.current) || savingRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
  }, [flush]);

  // Move focus to the step heading when the step changes (not on first load).
  useEffect(() => {
    if (!movedRef.current) return;
    headingRef.current?.focus();
  }, [step]);

  // ---------------------------------------------------------------- editing

  const markPending = (field: string) => setPendingFields((current) => (current.has(field) ? current : new Set(current).add(field)));

  const onRestaurant = <K extends keyof RestaurantDraft>(key: K, value: RestaurantDraft[K]) => {
    setForm((current) =>
      current ? { ...current, details: { ...current.details, restaurant: { ...current.details.restaurant, [key]: value } } } : current,
    );
    pendingRef.current = { ...pendingRef.current, restaurant: { ...pendingRef.current.restaurant, [key]: value } };
    markPending(`restaurant.${key}`);
    schedule();
  };
  const onOwner = <K extends keyof OwnerDraft>(key: K, value: OwnerDraft[K]) => {
    setForm((current) =>
      current ? { ...current, details: { ...current.details, owner: { ...current.details.owner, [key]: value } } } : current,
    );
    pendingRef.current = { ...pendingRef.current, owner: { ...pendingRef.current.owner, [key]: value } };
    markPending(`owner.${key}`);
    schedule();
  };
  const onAcquisition = (value: AcquisitionDraft | null) => {
    setForm((current) => (current ? { ...current, details: { ...current.details, acquisition: value } } : current));
    pendingRef.current = { ...pendingRef.current, acquisition: value };
    markPending("acquisition");
    schedule();
  };
  const onMode = (mode: OnboardingMode) => {
    // A mode change clears the package (PO decision 2026-11-22): the server does the same unless the PATCH
    // supplies one, so a package picked for the previous mode is dropped from the unsaved edits too.
    setForm((current) => (current ? { ...current, mode, modeConfig: formConfigAfterModeChange(current.modeConfig) } : current));
    pendingRef.current = { ...pendingRef.current, mode, modeConfig: pendingConfigAfterModeChange(pendingRef.current.modeConfig) };
    markPending("mode");
    schedule();
  };
  const onConfig = <K extends keyof ModeConfig>(key: K, value: ModeConfig[K]) => {
    setForm((current) => (current ? { ...current, modeConfig: { ...current.modeConfig, [key]: value } } : current));
    pendingRef.current = { ...pendingRef.current, modeConfig: { ...pendingRef.current.modeConfig, [key]: value } };
    markPending("mode");
    schedule();
  };
  const onTouch = (field: string) => setTouched((current) => (current.has(field) ? current : new Set(current).add(field)));

  // ---------------------------------------------------------------- navigation and actions

  function goTo(next: OnboardingStep) {
    void flush();
    movedRef.current = true;
    setStep(next);
  }

  async function continueFrom(current: OnboardingStep) {
    const index = ONBOARDING_STEPS.indexOf(current);
    const next = ONBOARDING_STEPS[index + 1];
    if (current === "customer" || current === "mode") {
      const saved = await flush();
      const problems = current === "customer" ? data?.problems.customer : data?.problems.mode;
      // `data` may be one render behind right after a save: re-read the step state from the server answer.
      const fresh = saved ? await getOnboardingCase(caseId).catch(() => null) : null;
      if (fresh) adopt(fresh, false);
      const stepProblems = fresh ? (current === "customer" ? fresh.problems.customer : fresh.problems.mode) : problems;
      if (stepProblems && stepProblems.length > 0) {
        setShowAll((s) => new Set(s).add(current));
        summaryRef.current?.focus();
        return;
      }
    }
    if (next) goTo(next);
  }

  async function submit() {
    if (!data || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    const saved = await flush();
    if (!saved) {
      setActionBusy(false);
      return;
    }
    try {
      adopt(await submitOnboardingForReview(caseId, revisionRef.current), true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "ONBOARDING_INCOMPLETE") {
        setShowAll(new Set<OnboardingStep>(["customer", "mode"]));
        setActionError("onboarding.review.incomplete");
      } else if (caught instanceof ApiError && caught.code === "ONBOARDING_REVISION_CONFLICT") {
        conflictRef.current = true;
        setConflict(true);
      } else {
        setActionError(transportErrorKey(caught));
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelCase() {
    if (!data || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await flush();
      adopt(await cancelOnboardingCase(caseId, revisionRef.current), true);
      setConfirmCancel(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "ONBOARDING_REVISION_CONFLICT") {
        conflictRef.current = true;
        setConflict(true);
      } else {
        setActionError(transportErrorKey(caught));
      }
    } finally {
      setActionBusy(false);
    }
  }

  // ---------------------------------------------------------------- render

  if (loadError) {
    return (
      <>
        <BackLink />
        <Alert tone="danger">{t(loadError)}</Alert>
      </>
    );
  }
  if (!data || !form) {
    return (
      <div className="space-y-4" aria-busy="true">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const editable = data.status === "DRAFT" || data.status === "READY_FOR_REVIEW";
  const locked = !editable || conflict;
  const visible = (field: string, step: OnboardingStep) => (touched.has(field) || showAll.has(step)) && !pendingFields.has(field);
  const customerError = (field: CustomerField): string | null => {
    if (!visible(field, "customer")) return null;
    const code = data.problems.customer.find((problem) => CUSTOMER_FIELD[problem] === field);
    return code ? t(`onboarding.problem.${code}`) : null;
  };
  const modeProblems = (touched.has("mode") || showAll.has("mode")) && !pendingFields.has("mode") ? data.problems.mode : [];
  const stepState = (s: OnboardingStep): "complete" | "incomplete" | "locked" => {
    if (LOCKED_STEPS.includes(s)) return "locked";
    if (s === "review") return data.status === "READY_FOR_REVIEW" ? "complete" : "incomplete";
    return data.completedSteps.includes(s) ? "complete" : "incomplete";
  };
  const completedCount = data.completedSteps.length;
  const canSubmit = data.status === "DRAFT" && data.completedSteps.includes("customer") && data.completedSteps.includes("mode");
  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  const currentProblems: string[] =
    showAll.has(step) && step === "customer" ? data.problems.customer : showAll.has(step) && step === "mode" ? data.problems.mode : [];

  return (
    <>
      <BackLink />
      <PageHeader
        title={form.details.restaurant.name?.trim() || t("onboarding.unnamed")}
        description={t("onboarding.wizard.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <OnboardingStatusBadge status={data.status} t={t} />
            {data.lead ? <Badge tone="primary">{t("onboarding.fromLeadBadge")}</Badge> : null}
            <SaveIndicator state={saveState} savedAt={savedAt} error={saveError} onRetry={() => void flush()} />
          </div>
        }
      />

      {conflict ? (
        <Alert tone="warning" className="mb-4">
          <p>{t("onboarding.save.conflict")}</p>
          <Button size="sm" variant="primary" className="mt-2" onClick={() => void load(false)}>
            {t("onboarding.reload")}
          </Button>
        </Alert>
      ) : null}
      {data.status === "READY_FOR_REVIEW" ? (
        <Alert tone="success" className="mb-4">
          {t("onboarding.readyBanner")}
        </Alert>
      ) : null}
      {data.status === "CANCELLED" ? (
        <Alert tone="info" className="mb-4">
          {t("onboarding.cancelledBanner", { when: data.cancelledAt ? fmt.dateTime(data.cancelledAt) : "" })}
        </Alert>
      ) : null}
      {actionError ? (
        <Alert tone="danger" className="mb-4">
          {t(actionError)}
        </Alert>
      ) : null}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label={t("onboarding.stepsLabel")} className="min-w-0">
          <div className="mb-3">
            <p className="text-[13px] font-medium text-muted-foreground">
              {t("onboarding.progress", { done: fmt.number(completedCount), total: fmt.number(ONBOARDING_STEPS.length) })}
            </p>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={ONBOARDING_STEPS.length}
              aria-valuenow={completedCount}
              aria-label={t("onboarding.progressLabel")}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${(completedCount / ONBOARDING_STEPS.length) * 100}%` }} />
            </div>
          </div>
          <ol className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
            {ONBOARDING_STEPS.map((s, index) => {
              const state = stepState(s);
              const current = s === step;
              return (
                <li key={s} className="shrink-0 xl:shrink">
                  <button
                    type="button"
                    onClick={() => goTo(s)}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "flex w-full min-w-[9.5rem] items-center gap-3 rounded-lg border px-3 py-2.5 text-start text-sm transition-colors xl:min-w-0",
                      current ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-2",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        state === "complete"
                          ? "bg-success text-white"
                          : state === "locked"
                            ? "bg-surface-2 text-muted-foreground"
                            : "border border-border-strong text-foreground",
                      )}
                    >
                      {state === "complete" ? <IconCheck width={14} height={14} /> : fmt.number(index + 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{t(`onboarding.step.${s}`)}</span>
                      <span className="block text-xs text-muted-foreground">{t(`onboarding.stepState.${state}`)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section aria-labelledby="onboarding-step-heading" className="min-w-0 space-y-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("onboarding.stepOf", { n: fmt.number(stepIndex + 1), total: fmt.number(ONBOARDING_STEPS.length) })}
            </p>
            <h2 id="onboarding-step-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
              {t(`onboarding.step.${step}`)}
            </h2>
          </div>

          <div ref={summaryRef} tabIndex={-1} className="outline-none">
            {currentProblems.length > 0 ? (
              <Alert tone="danger">
                <p className="font-medium">{t("onboarding.fixProblems")}</p>
                <ul className="mt-1 list-disc ps-5">
                  {currentProblems.map((code) => (
                    <li key={code}>{t(`onboarding.problem.${code}` as MessageKey)}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
          </div>

          {step === "customer" ? (
            <>
              <DuplicatesPanel caseId={caseId} revision={data.revision} />
              <CustomerStep
                details={form.details}
                disabled={locked}
                errorFor={customerError}
                onTouch={onTouch}
                onRestaurant={onRestaurant}
                onOwner={onOwner}
                onAcquisition={onAcquisition}
              />
            </>
          ) : null}
          {step === "mode" ? (
            <ModeStep
              data={data}
              mode={form.mode}
              config={form.modeConfig}
              disabled={locked}
              problems={modeProblems}
              onMode={(mode) => {
                onTouch("mode");
                onMode(mode);
              }}
              onConfig={(key, value) => {
                onTouch("mode");
                onConfig(key, value);
              }}
            />
          ) : null}
          {step === "menu" ? <NextMilestone body="onboarding.s3.body" /> : null}
          {step === "review" ? (
            <Card>
              <CardHeader title={t("onboarding.review.title")} description={t("onboarding.review.hint")} />
              <div className="space-y-4 p-5">
                <ul className="space-y-2 text-sm">
                  {(["customer", "mode"] as const).map((s) => (
                    <li key={s} className="flex flex-wrap items-center gap-2">
                      <Badge tone={data.completedSteps.includes(s) ? "success" : "warning"} dot>
                        {t(data.completedSteps.includes(s) ? "onboarding.stepState.complete" : "onboarding.stepState.incomplete")}
                      </Badge>
                      <button type="button" className="text-primary-text hover:underline" onClick={() => goTo(s)}>
                        {t(`onboarding.step.${s}`)}
                      </button>
                    </li>
                  ))}
                </ul>
                <Alert tone="info">{t("onboarding.review.nothingCreated")}</Alert>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" disabled={!canSubmit || actionBusy || locked} onClick={() => void submit()}>
                    {actionBusy ? t("common.saving") : t("onboarding.review.submit")}
                  </Button>
                  {data.status === "READY_FOR_REVIEW" ? (
                    <span className="text-[13px] text-muted-foreground">{t("onboarding.review.already")}</span>
                  ) : null}
                </div>
              </div>
            </Card>
          ) : null}
          {step === "handoff" ? <NextMilestone body="onboarding.s5.body" /> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              <Button disabled={stepIndex === 0} onClick={() => goTo(ONBOARDING_STEPS[stepIndex - 1])}>
                {t("common.previous")}
              </Button>
              {stepIndex < ONBOARDING_STEPS.length - 1 ? (
                <Button variant="primary" onClick={() => void continueFrom(step)}>
                  {t("onboarding.continue")}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {editable && !conflict ? (
                <Button onClick={() => void flush()} disabled={saveState === "saving"}>
                  {t("onboarding.saveDraft")}
                </Button>
              ) : null}
              {editable && !confirmCancel ? (
                <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                  {t("onboarding.cancelCase")}
                </Button>
              ) : null}
            </div>
          </div>
          {confirmCancel ? (
            <Alert tone="warning">
              <p>{t("onboarding.cancelConfirm")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="danger" disabled={actionBusy} onClick={() => void cancelCase()}>
                  {t("onboarding.cancelYes")}
                </Button>
                <Button size="sm" onClick={() => setConfirmCancel(false)}>
                  {t("common.back")}
                </Button>
              </div>
            </Alert>
          ) : null}
        </section>
      </div>
    </>
  );
}

function BackLink() {
  const { t } = useI18n();
  return (
    <Link href="/onboarding" className="mb-4 inline-flex items-center gap-2 text-sm text-primary-text hover:underline">
      <IconArrowLeft className="rtl:rotate-180" width={16} height={16} />
      {t("onboarding.back")}
    </Link>
  );
}

/** Steps that belong to later milestones: said plainly, with no pretend success. */
function NextMilestone({ body }: { body: MessageKey }) {
  const { t } = useI18n();
  return (
    <Card>
      <div className="flex flex-col gap-2 p-6">
        <Badge tone="warning" className="self-start">
          {t("onboarding.notYet")}
        </Badge>
        <p className="text-sm text-foreground">{t(body)}</p>
        <p className="text-[13px] text-muted-foreground">{t("onboarding.notYetHint")}</p>
      </div>
    </Card>
  );
}

function SaveIndicator({
  state,
  savedAt,
  error,
  onRetry,
}: {
  state: SaveState;
  savedAt: string | null;
  error: MessageKey | null;
  onRetry: () => void;
}) {
  const { t, locale } = useI18n();
  const time = savedAt
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(
        new Date(savedAt),
      )
    : null;
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-[13px]">
      {state === "saving" ? <span className="text-muted-foreground">{t("onboarding.save.saving")}</span> : null}
      {state === "dirty" ? <span className="text-muted-foreground">{t("onboarding.save.dirty")}</span> : null}
      {state === "saved" && time ? <span className="text-success">{t("onboarding.save.saved", { time })}</span> : null}
      {state === "error" ? (
        <>
          {/* The conflict is explained in the banner below the header; here it stays short. */}
          <span className="text-danger">{error && error !== "onboarding.save.conflict" ? t(error) : t("onboarding.save.failed")}</span>
          {error !== "onboarding.save.conflict" ? (
            <Button size="sm" onClick={onRetry}>
              {t("common.retry")}
            </Button>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
