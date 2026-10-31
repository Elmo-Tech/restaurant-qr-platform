/**
 * Presentation-only setup model. No restaurant readiness or review is inferred here.
 * A future authorized Backend endpoint supplies canonical per-step states; this
 * module merely displays them and handles local demo scenarios for visual QA.
 */
export const SETUP_STEP_KEYS = [
  'BRANDING', 'CONTACT', 'LANGUAGES', 'MENU',
  'PRODUCTS', 'ORDERING', 'OPERATIONS', 'PREVIEW',
] as const;

export type SetupStepKey = (typeof SETUP_STEP_KEYS)[number];
export type SetupStepGroup = 'identity' | 'menu' | 'orders';
export type SetupStepStatus =
  | 'DONE'
  | 'NEEDS_ACTION'
  | 'NEEDS_REVIEW'
  | 'NOT_APPLICABLE'
  | 'INTENTIONALLY_SKIPPED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export interface SetupStepView {
  key: SetupStepKey;
  group: SetupStepGroup;
  status: SetupStepStatus;
  /** Only authorized, pre-existing Staff routes may be passed to a clickable row. */
  href: string | null;
}

export interface SetupProgressSummary {
  done: number;
  total: number;
  percentage: number | null;
  readyForOwnerReview: boolean;
  nextAction: SetupStepView | null;
  hasUnknown: boolean;
}

/**
 * A skipped optional task is explicitly excluded from BOTH numerator and
 * denominator. "Not applicable" also stays out. Unknown/unavailable data must
 * never yield a confident percentage or silently be counted as completed.
 */
export function summarizeSetupSteps(steps: readonly SetupStepView[]): SetupProgressSummary {
  const applicable = steps.filter(
    step => step.status !== 'NOT_APPLICABLE' && step.status !== 'INTENTIONALLY_SKIPPED',
  );
  const hasUnknown = applicable.some(
    step => step.status === 'UNKNOWN' || step.status === 'UNAVAILABLE',
  );
  const done = applicable.filter(step => step.status === 'DONE').length;
  const total = applicable.length;
  const nextAction = applicable.find(
    step => step.href && (step.status === 'NEEDS_ACTION' || step.status === 'NEEDS_REVIEW'),
  ) ?? null;
  return {
    done,
    total,
    hasUnknown,
    percentage: hasUnknown ? null : total > 0 ? Math.round(done / total * 100) : null,
    readyForOwnerReview: !hasUnknown && total > 0 && done === total,
    nextAction,
  };
}

/** Preview fixtures are NOT attached to real restaurants and MUST NOT be used as setup truth. */
export type SetupPreviewScenario = 'new' | 'partial' | 'whatsapp' | 'ready';

export interface SetupPreviewAccess {
  canViewMenu: boolean;
  canViewBranches: boolean;
  canViewSettings: boolean;
}

const GROUPS: Record<SetupStepKey, SetupStepGroup> = {
  BRANDING: 'identity',
  CONTACT: 'identity',
  LANGUAGES: 'identity',
  MENU: 'menu',
  PRODUCTS: 'menu',
  ORDERING: 'orders',
  OPERATIONS: 'orders',
  PREVIEW: 'orders',
};

const PREVIEW_STATES: Record<SetupPreviewScenario, Record<SetupStepKey, SetupStepStatus>> = {
  new: {
    BRANDING: 'NEEDS_ACTION',
    CONTACT: 'NEEDS_ACTION',
    LANGUAGES: 'NEEDS_REVIEW',
    MENU: 'NEEDS_ACTION',
    PRODUCTS: 'NEEDS_ACTION',
    ORDERING: 'NEEDS_REVIEW',
    OPERATIONS: 'NEEDS_ACTION',
    PREVIEW: 'NEEDS_REVIEW',
  },
  partial: {
    BRANDING: 'DONE',
    CONTACT: 'DONE',
    LANGUAGES: 'DONE',
    MENU: 'NEEDS_ACTION',
    PRODUCTS: 'NEEDS_ACTION',
    ORDERING: 'NEEDS_REVIEW',
    OPERATIONS: 'NEEDS_ACTION',
    PREVIEW: 'NEEDS_REVIEW',
  },
  whatsapp: {
    BRANDING: 'INTENTIONALLY_SKIPPED',
    CONTACT: 'DONE',
    LANGUAGES: 'DONE',
    MENU: 'DONE',
    PRODUCTS: 'DONE',
    ORDERING: 'NEEDS_REVIEW',
    OPERATIONS: 'NOT_APPLICABLE',
    PREVIEW: 'NEEDS_REVIEW',
  },
  ready: Object.fromEntries(SETUP_STEP_KEYS.map(key => [key, 'DONE'])) as Record<SetupStepKey, SetupStepStatus>,
};

/** Static route map for design review. A Backend status endpoint will replace these fixtures. */
export function buildSetupPreviewSteps(
  restaurantId: string,
  scenario: SetupPreviewScenario,
  access: SetupPreviewAccess,
): SetupStepView[] {
  const root = '/staff/restaurants/' + encodeURIComponent(restaurantId);
  const hrefs: Record<SetupStepKey, string | null> = {
    BRANDING: access.canViewSettings ? root + '/settings/profile' : null,
    CONTACT: access.canViewSettings ? root + '/settings/profile#contact-settings' : null,
    LANGUAGES: access.canViewSettings ? root + '/settings/languages' : null,
    MENU: access.canViewMenu ? root + '/menu' : null,
    PRODUCTS: access.canViewMenu ? root + '/menu' : null,
    ORDERING: access.canViewSettings ? root + '/settings/ordering' : null,
    OPERATIONS: access.canViewBranches ? root + '/settings/branches' : null,
    PREVIEW: access.canViewMenu || access.canViewSettings ? root + '/menu/overview' : null,
  };

  return SETUP_STEP_KEYS.map(key => {
    const status = PREVIEW_STATES[scenario][key];
    const href = hrefs[key];
    return {
      key,
      group: GROUPS[key],
      status: !href && status !== 'NOT_APPLICABLE' && status !== 'INTENTIONALLY_SKIPPED'
        && status !== 'DONE' ? 'UNAVAILABLE' : status,
      href,
    };
  });
}
