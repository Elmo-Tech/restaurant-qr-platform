"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconCheck } from "@/components/icons";
import { Alert, Badge, Button, Card, CardHeader, PageHeader, Skeleton } from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import {
  cancelOnboardingCase,
  deliverOnboardingCase,
  discardOnboardingImport,
  finishOnboardingCase,
  getOnboardingCase,
  importOnboardingMenu,
  reviewOnboardingMenu,
  submitOnboardingForReview,
  updateOnboardingCase,
  type AcquisitionDraft,
  type CustomerProblem,
  type ModeConfig,
  type OnboardingCase,
  type OnboardingDetails,
  type OnboardingMenuDraft,
  type OnboardingMode,
  type OnboardingPatch,
  type OnboardingStep,
  type OwnerDraft,
  type RestaurantDraft,
} from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { demoAccessStatus, handoffUrl, isHandoffStepOpen } from "@/lib/onboarding-handoff";
import { onboardingActionFailure, onboardingLoadFailure, provisioningRequest } from "@/lib/onboarding-menu";
import { formConfigAfterModeChange, pendingConfigAfterModeChange } from "@/lib/onboarding-package-choice";
import {
  canSubmitForReview,
  firstOpenStep as firstOpenStepOf,
  nextStep,
  previousStep,
  stepsForMode,
  visibleStep,
} from "@/lib/onboarding-steps";
import { cn } from "@/lib/utils";
import { OnboardingStatusBadge } from "../shared";
import { CustomerStep, type CustomerField } from "./CustomerStep";
import { DuplicatesPanel } from "./DuplicatesPanel";
import { FinalProvisioning } from "./FinalProvisioning";
import { HandoffStep } from "./HandoffStep";
import { MenuProblems, MenuStep } from "./MenuStep";
import { ModeStep } from "./ModeStep";
import { ReviewSummary } from "./ReviewSummary";

const AUTOSAVE_DELAY_MS = 1500;

/** Edits not yet sent to the server; sent as one PATCH. */
interface Pending {
  restaurant: Partial<RestaurantDraft>;
  owner: Partial<OwnerDraft>;
  acquisition?: AcquisitionDraft | null;
  mode?: OnboardingMode | null;
  modeConfig: Partial<ModeConfig>;
  menuDraft?: OnboardingMenuDraft;
}
const emptyPending = (): Pending => ({ restaurant: {}, owner: {}, modeConfig: {} });
const hasPending = (p: Pending) =>
  Object.keys(p.restaurant).length > 0 ||
  Object.keys(p.owner).length > 0 ||
  p.acquisition !== undefined ||
  p.mode !== undefined ||
  p.menuDraft !== undefined ||
  Object.keys(p.modeConfig).length > 0;
/** `later` wins over `earlier` (a failed save is put back under the edits made meanwhile). */
const mergePending = (earlier: Pending, later: Pending): Pending => ({
  restaurant: { ...earlier.restaurant, ...later.restaurant },
  owner: { ...earlier.owner, ...later.owner },
  acquisition: later.acquisition !== undefined ? later.acquisition : earlier.acquisition,
  mode: later.mode !== undefined ? later.mode : earlier.mode,
  modeConfig: { ...earlier.modeConfig, ...later.modeConfig },
  menuDraft: later.menuDraft ?? earlier.menuDraft,
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
  menuDraft: OnboardingMenuDraft | null;
}
const formOf = (data: OnboardingCase): Form => ({
  details: data.details, mode: data.mode, modeConfig: data.modeConfig, menuDraft: data.menuDraft,
});

/** The first incomplete step of the case's own path (mode first; a DEMO has no customer or menu step). */
const firstOpenStep = (data: OnboardingCase): OnboardingStep =>
  firstOpenStepOf({ status: data.status, mode: data.mode, completedSteps: data.completedSteps, handoffOpen: isHandoffStepOpen(data) });

export function OnboardingWizard({ caseId }: { caseId: string }) {
  const { t, fmt } = useI18n();
  const [data, setData] = useState<OnboardingCase | null>(null);
  const [loadError, setLoadError] = useState<MessageKey | null>(null);
  const [loadBusy, setLoadBusy] = useState(true);
  const [demoLink, setDemoLink] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [step, setStep] = useState<OnboardingStep>("mode");
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
  const [expiredAt, setExpiredAt] = useState<string | null>(null);
  /** A mode switch dropped a package picked for the previous mode: say so instead of clearing it silently. */
  const [packageCleared, setPackageCleared] = useState(false);

  const pendingRef = useRef<Pending>(emptyPending());
  const actionRef = useRef(false);
  const provisioningKeyRef = useRef<string | null>(null);
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
    if (loaded.provisioningKey) provisioningKeyRef.current = loaded.provisioningKey;
    setData(loaded);
    if (resetForm) setForm(formOf(loaded));
    if (loaded.mode !== "DEMO" || loaded.status !== "READY" || demoAccessStatus(loaded, Date.now()) !== "active") {
      setDemoLink(null);
    }
  }, []);

  // ---------------------------------------------------------------- load / reload

  const load = useCallback(
    async (initial: boolean) => {
      setLoadBusy(true);
      try {
        const loaded = await getOnboardingCase(caseId);
        pendingRef.current = emptyPending();
        conflictRef.current = false;
        setConflict(false);
        setPendingFields(new Set());
        setSaveState("idle");
        setSaveError(null);
        setActionError(null);
        adopt(loaded, true);
        if (initial || isHandoffStepOpen(loaded)) setStep(firstOpenStep(loaded));
        setLoadError(null);
      } catch (caught) {
        setDemoLink(null);
        setLoadError(onboardingLoadFailure(caught).key);
      } finally {
        setLoadBusy(false);
      }
    },
    [caseId, adopt],
  );

  useEffect(() => {
    // Fetch on mount; `load` only sets state after the response arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(true);
  }, [load]);

  const expiresAt = data?.importExpiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(() => setExpiredAt(expiresAt), Math.max(0, Date.parse(expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  const demoExpiresAt = data?.demoExpiresAt;
  useEffect(() => {
    if (!demoLink || !demoExpiresAt || !Number.isFinite(Date.parse(demoExpiresAt))) return;
    const timer = window.setTimeout(() => setDemoLink(null), Math.max(0, Date.parse(demoExpiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [demoLink, demoExpiresAt]);

  // A document restored from the browser's back/forward cache is also a new visit for demo-link purposes.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setDemoLink(null);
        void load(false);
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
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
      if (patch.menuDraft !== undefined) body.menuDraft = patch.menuDraft;
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
        } else if (caught instanceof ApiError && caught.problems.includes("ONBOARDING_IMPORT_EXPIRED")) {
          setSaveError("onboarding.menu.error.expired");
        } else if (caught instanceof ApiError && caught.code === "ONBOARDING_INPUT_INVALID") {
          setSaveError("onboarding.save.invalid");
        } else {
          setSaveError(onboardingActionFailure(caught).key);
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
    // Every other draft value (customer details, menu, trial length, demo kind / hours / label) is kept.
    if (form && form.mode !== mode && form.modeConfig.packageId !== null) setPackageCleared(true);
    setForm((current) => (current ? { ...current, mode, modeConfig: formConfigAfterModeChange(current.modeConfig) } : current));
    pendingRef.current = { ...pendingRef.current, mode, modeConfig: pendingConfigAfterModeChange(pendingRef.current.modeConfig) };
    markPending("mode");
    schedule();
  };
  const onConfig = <K extends keyof ModeConfig>(key: K, value: ModeConfig[K]) => {
    if (key === "packageId") setPackageCleared(false);
    setForm((current) => (current ? { ...current, modeConfig: { ...current.modeConfig, [key]: value } } : current));
    pendingRef.current = { ...pendingRef.current, modeConfig: { ...pendingRef.current.modeConfig, [key]: value } };
    markPending("mode");
    schedule();
  };
  const onMenu = (menuDraft: OnboardingMenuDraft) => {
    setForm((current) => current ? { ...current, menuDraft } : current);
    pendingRef.current = { ...pendingRef.current, menuDraft };
    markPending("menu");
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
    const next = nextStep(form?.mode ?? null, current);
    if (current === "customer" || current === "mode") {
      const saved = await flush();
      const problems = current === "customer" ? data?.problems.customer : data?.problems.mode;
      // `data` may be one render behind right after a save: re-read the step state from the server answer.
      const revision = revisionRef.current;
      const fresh = saved ? await getOnboardingCase(caseId).catch(() => null) : null;
      if (actionRef.current || savingRef.current || hasPending(pendingRef.current) || revision !== revisionRef.current) return;
      if (fresh) adopt(fresh, fresh.revision !== revision);
      const stepProblems = fresh ? (current === "customer" ? fresh.problems.customer : fresh.problems.mode) : problems;
      if (stepProblems && stepProblems.length > 0) {
        setShowAll((s) => new Set(s).add(current));
        summaryRef.current?.focus();
        return;
      }
    }
    if (next) goTo(next);
  }

  /** Actions consume the revision only after any queued edits have been saved. */
  async function runAction(
    request: (revision: number) => Promise<OnboardingCase>,
    kind: "submit" | "cancel" | "menu" | "final" | "deliver",
    discardPendingMenu = false,
  ): Promise<boolean> {
    if (!data || loadBusy || actionRef.current || conflictRef.current) return false;
    actionRef.current = true;
    setActionBusy(true);
    setActionError(null);
    let requestRevision = revisionRef.current;
    let heldMenu: OnboardingMenuDraft | undefined;
    const restoreHeldMenu = () => {
      if (heldMenu === undefined) return;
      pendingRef.current = { ...pendingRef.current, menuDraft: pendingRef.current.menuDraft ?? heldMenu };
      setPendingFields((fields) => new Set(fields).add("menu"));
      setSaveState("dirty");
      heldMenu = undefined;
    };
    try {
      if (discardPendingMenu && pendingRef.current.menuDraft !== undefined) {
        // An expired draft cannot be PATCHed. Keep it locally until replacement or discard actually succeeds.
        heldMenu = pendingRef.current.menuDraft;
        pendingRef.current = { ...pendingRef.current, menuDraft: undefined };
        setPendingFields((fields) => { const next = new Set(fields); next.delete("menu"); return next; });
        if (!hasPending(pendingRef.current)) setSaveState("idle");
      }
      const saved = await flush();
      if (!saved && (kind !== "cancel" || conflictRef.current || savingRef.current)) return false;
      requestRevision = revisionRef.current;
      const updated = await request(requestRevision);
      heldMenu = undefined;
      adopt(updated, true);
      if ((kind === "final" || kind === "deliver") && isHandoffStepOpen(updated)) {
        movedRef.current = true;
        setStep("handoff");
      }
      if (kind === "cancel") {
        pendingRef.current = emptyPending();
        setPendingFields(new Set());
        setSaveState("idle");
      }
      setSaveError(null);
      setConfirmCancel(false);
      return true;
    } catch (caught) {
      restoreHeldMenu();
      // Only a case that no longer exists leaves the wizard. Every other failure (a package without Menu import,
      // an expired session, a refused Origin) is shown inline, so the step and any unsaved edits stay on screen.
      const failure = onboardingActionFailure(caught);
      if (failure.scope === "case") {
        setDemoLink(null);
        setLoadError(failure.key);
        return false;
      }
      const code = caught instanceof ApiError ? caught.code : null;
      if (kind === "deliver" && code === "ONBOARDING_DEMO_EXPIRED") {
        setDemoLink(null);
        setData((current) => current ? { ...current, demoState: "EXPIRED" } : current);
      }
      if (kind === "deliver" && code === "ONBOARDING_HANDOFF_UNAVAILABLE") {
        setData((current) => current ? { ...current, handoff: null } : current);
      }
      if (code === "ONBOARDING_REVISION_CONFLICT") {
        conflictRef.current = true;
        setConflict(true);
        return false;
      }
      if (code === "ONBOARDING_INCOMPLETE" && kind === "submit") {
        setShowAll(new Set<OnboardingStep>(["mode", "customer"]));
        setActionError("onboarding.review.incomplete");
      } else if (code === "ONBOARDING_INCOMPLETE" && kind === "menu") {
        setActionError(caught instanceof ApiError && caught.problems.includes("ONBOARDING_IMPORT_EXPIRED")
          ? "onboarding.menu.error.expired" : "onboarding.menu.error.review");
      } else {
        setActionError(kind === "deliver" && code === "ONBOARDING_INVALID_TRANSITION"
          ? "onboarding.handoff.deliveryChanged" : failure.key);
      }
      if (kind === "menu" || kind === "final" || kind === "deliver" || code === "ONBOARDING_INCOMPLETE") {
        // A lost response can still have committed; reconciliations only read the case, never replay a mutation.
        try {
          const fresh = await getOnboardingCase(caseId);
          // Edits can arrive while the action or this read is in flight. Never replace those edits with the server copy.
          if (hasPending(pendingRef.current) || savingRef.current) {
            if (fresh.revision !== revisionRef.current) {
              conflictRef.current = true;
              setConflict(true);
            }
            return false;
          }
          adopt(fresh, true);
          if ((kind === "final" || kind === "deliver") && isHandoffStepOpen(fresh)) {
            movedRef.current = true;
            setStep("handoff");
          }
          if (kind === "final" && (isHandoffStepOpen(fresh) || (fresh.status === "FAILED" && fresh.revision !== requestRevision))) setActionError(null);
          if (kind === "deliver" && fresh.status === "DELIVERED") setActionError(null);
        } catch (freshError) {
          const freshFailure = onboardingActionFailure(freshError);
          if (freshFailure.scope === "case") {
            setDemoLink(null);
            setLoadError(freshFailure.key);
          }
        }
      }
      return false;
    } finally {
      restoreHeldMenu();
      actionRef.current = false;
      setActionBusy(false);
    }
  }

  function finish(route: "provision" | "retry", ownerPassword: string | undefined) {
    if (!data) return;
    void runAction(async (revision) => {
      const body = provisioningRequest(revision, data, provisioningKeyRef.current, ownerPassword, () => crypto.randomUUID());
      provisioningKeyRef.current = body.provisioningKey;
      const { demoLink: receivedLink, ...updated } = await finishOnboardingCase(caseId, route, body);
      // The one-time receipt is not adopted into the case or stored anywhere outside this wizard's memory.
      if (updated.mode === "DEMO" && updated.status === "READY" && demoAccessStatus(updated, Date.now()) === "active") {
        const link = handoffUrl(receivedLink);
        if (link) setDemoLink(link);
      }
      return updated;
    }, "final");
  }

  // ---------------------------------------------------------------- render

  if (loadError && !loadBusy) {
    return (
      <>
        <BackLink />
        <Alert tone="danger">{t(loadError)}</Alert>
        {loadError !== "onboarding.notFound" ? <Button className="mt-3" onClick={() => void load(true)}>{t("common.retry")}</Button> : null}
      </>
    );
  }
  if (loadBusy || !data || !form) {
    return (
      <div className="space-y-4" aria-busy="true">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const editable = data.status === "DRAFT" || data.status === "READY_FOR_REVIEW";
  const purgedUndeliveredDemo = data.status === "READY" && data.mode === "DEMO" &&
    data.demoState === "PURGED" && data.demoHistory?.purged === true &&
    Boolean(data.demoHistory.removedAt) && data.deliveredAt === null;
  const canCancel = (editable || data.status === "FAILED" || purgedUndeliveredDemo) && !conflict;
  const locked = !editable || conflict || actionBusy;
  const unsaved = saveState === "dirty" || saveState === "saving" || saveState === "error";
  const importExpired = Boolean(expiresAt && expiredAt === expiresAt) ||
    data.problems.menu.includes("ONBOARDING_IMPORT_EXPIRED") || saveError === "onboarding.menu.error.expired";
  const visible = (field: string, step: OnboardingStep) => (touched.has(field) || showAll.has(step)) && !pendingFields.has(field);
  const customerError = (field: CustomerField): string | null => {
    if (!visible(field, "customer")) return null;
    const code = data.problems.customer.find((problem) => CUSTOMER_FIELD[problem] === field);
    return code ? t(`onboarding.problem.${code}`) : null;
  };
  const modeProblems = (touched.has("mode") || showAll.has("mode")) && !pendingFields.has("mode") ? data.problems.mode : [];
  const demoLabelError =
    (touched.has("restaurant.name") || showAll.has("mode")) && !pendingFields.has("restaurant.name") &&
    data.problems.mode.includes("DEMO_LABEL_INVALID") ? t("onboarding.problem.DEMO_LABEL_INVALID") : null;
  // The path follows the mode being edited: mode → customer → menu → review → handoff, or mode → review → handoff.
  const path = stepsForMode(form.mode);
  const current = visibleStep(form.mode, step);
  const stepState = (s: OnboardingStep): "complete" | "incomplete" | "locked" => {
    if (s === "handoff" && !isHandoffStepOpen(data)) return "locked";
    if (s === "menu" && (pendingFields.has("menu") || importExpired)) return "incomplete";
    // Until the edited mode is saved, the server's completion belongs to the previous mode.
    if (s === "mode" && pendingFields.has("mode")) return "incomplete";
    return data.completedSteps.includes(s) ? "complete" : "incomplete";
  };
  const completedCount = path.filter((s) => stepState(s) === "complete").length;
  const requiredSteps = path.length;
  const canSubmit = data.mode === form.mode && canSubmitForReview(data);
  const stepIndex = path.indexOf(current);
  const previous = previousStep(form.mode, current);
  const next = nextStep(form.mode, current);
  const currentProblems: string[] =
    showAll.has(current) && current === "customer" ? data.problems.customer : showAll.has(current) && current === "mode" ? data.problems.mode : [];

  return (
    <>
      <BackLink />
      <PageHeader
        title={form.details.restaurant.name?.trim() || t(form.mode === "DEMO" ? "onboarding.demo.unnamed" : "onboarding.unnamed")}
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
              {t("onboarding.progress", { done: fmt.number(completedCount), total: fmt.number(requiredSteps) })}
            </p>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={requiredSteps}
              aria-valuenow={completedCount}
              aria-label={t("onboarding.progressLabel")}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${(completedCount / requiredSteps) * 100}%` }} />
            </div>
          </div>
          <ol className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
            {path.map((s, index) => {
              const state = stepState(s);
              const isCurrent = s === current;
              return (
                <li key={s} className="shrink-0 xl:shrink">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => goTo(s)}
                    aria-current={isCurrent ? "step" : undefined}
                    className={cn(
                      "flex w-full min-w-[9.5rem] items-center gap-3 rounded-lg border px-3 py-2.5 text-start text-sm transition-colors xl:min-w-0",
                      isCurrent ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-2",
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
              {t("onboarding.stepOf", { n: fmt.number(stepIndex + 1), total: fmt.number(path.length) })}
            </p>
            <h2 id="onboarding-step-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
              {t(`onboarding.step.${current}`)}
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

          {current === "customer" ? (
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
          {current === "mode" ? (
            <ModeStep
              data={data}
              mode={form.mode}
              config={form.modeConfig}
              demoLabel={form.details.restaurant.name}
              demoLabelError={demoLabelError}
              packageCleared={packageCleared}
              disabled={locked}
              problems={modeProblems}
              onDemoLabel={(value) => onRestaurant("name", value)}
              onDemoLabelBlur={() => onTouch("restaurant.name")}
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
          {current === "menu" ? (
            <MenuStep data={data} restaurant={form.details.restaurant} draft={form.menuDraft} disabled={!editable || conflict}
              dirty={pendingFields.has("menu")} busy={actionBusy} saving={saveState === "saving"} expired={importExpired} onChange={onMenu}
              onImport={(files) => runAction((revision) => importOnboardingMenu(caseId, revision, files), "menu", importExpired)}
              onReview={() => void runAction((revision) => reviewOnboardingMenu(caseId, revision), "menu")}
              onDiscard={() => runAction((revision) => discardOnboardingImport(caseId, revision), "menu", importExpired)}
              onOpenModeStep={() => goTo("mode")} />
          ) : null}
          {current === "review" ? (
            <div className="space-y-4">
              <Card>
                <CardHeader title={t("onboarding.review.title")} description={t(form.mode === "DEMO" ? "onboarding.review.demoHint" : "onboarding.review.hint")} />
                <div className="space-y-4 p-5">
                  <ReviewSummary data={data} />
                  <ul className="space-y-2 text-sm">
                    {path.filter((s) => s !== "review" && s !== "handoff").map((s) => (
                      <li key={s} className="flex flex-wrap items-center gap-2">
                        <Badge tone={stepState(s) === "complete" ? "success" : "warning"} dot>
                          {t(`onboarding.stepState.${stepState(s)}`)}
                        </Badge>
                        <button type="button" disabled={actionBusy} className="text-primary-text hover:underline" onClick={() => goTo(s)}>
                          {t(`onboarding.step.${s}`)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {editable ? <Alert tone="info">{t("onboarding.review.nothingCreated")}</Alert> : null}
                  {editable && form.mode !== "DEMO" && data.menuDraft && !pendingFields.has("menu") ? <MenuProblems problems={data.problems.menu} /> : null}
                  <div className="flex flex-wrap items-center gap-3">
                    {data.status === "DRAFT" ? <Button variant="primary" disabled={!canSubmit || locked || saveState === "saving"}
                      onClick={() => void runAction((revision) => submitOnboardingForReview(caseId, revision), "submit")}>
                      {actionBusy ? t("common.saving") : t("onboarding.review.submit")}
                    </Button> : null}
                    {data.status === "READY_FOR_REVIEW" ? (
                      <span className="text-[13px] text-muted-foreground">{t("onboarding.review.already")}</span>
                    ) : null}
                  </div>
                </div>
              </Card>
              <FinalProvisioning data={data} disabled={conflict} busy={actionBusy} dirty={unsaved} expired={importExpired}
                onFinish={finish} onReload={() => void load(false)} />
            </div>
          ) : null}
          {current === "handoff" ? (
            <HandoffStep data={data} demoLink={demoLink} busy={actionBusy} disabled={actionBusy || conflict}
              onDeliver={() => void runAction((revision) => deliverOnboardingCase(caseId, revision), "deliver")}
              onReload={() => void load(false)} onReview={() => goTo("review")} />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              <Button disabled={previous === null || actionBusy} onClick={() => { if (previous) goTo(previous); }}>
                {t("common.previous")}
              </Button>
              {next !== null ? (
                <Button variant="primary" disabled={actionBusy} onClick={() => void continueFrom(current)}>
                  {t("onboarding.continue")}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {editable && !conflict ? (
                <Button onClick={() => void flush()} disabled={saveState === "saving" || actionBusy}>
                  {t("onboarding.saveDraft")}
                </Button>
              ) : null}
              {canCancel && !confirmCancel ? (
                <Button variant="ghost" disabled={actionBusy} onClick={() => setConfirmCancel(true)}>
                  {t("onboarding.cancelCase")}
                </Button>
              ) : null}
            </div>
          </div>
          {confirmCancel && canCancel ? (
            <Alert tone="warning">
              <p>{t(purgedUndeliveredDemo ? "onboarding.demo.cancelPurgedConfirm" : data.restaurantId ? "onboarding.final.cancelPartial" : "onboarding.cancelConfirm")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="danger" disabled={actionBusy} onClick={() => void runAction((revision) => cancelOnboardingCase(caseId, revision, purgedUndeliveredDemo), "cancel")}>
                  {t(purgedUndeliveredDemo ? "onboarding.demo.cancelPurgedYes" : "onboarding.cancelYes")}
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
