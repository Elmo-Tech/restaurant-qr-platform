import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import {
  DEMO_KINDS,
  DEMO_MAX_HOURS,
  DEMO_MIN_HOURS,
} from '../../demo/demo-constants';
import { normalizePlatformLocale } from '../../restaurants/platform-locales';
import { PlatformAuditService } from '../platform-audit.service';
import type { PlatformAdminPrincipal } from '../platform-auth.service';
import { PlatformTrialSettingsService } from '../platform-trial-settings.service';
import {
  computeCompletedSteps,
  emptyDetails,
  emptyModeConfig,
  isUuid,
  modeConfigForPatch,
  readDetails,
  readModeConfig,
  sanitizeDetailsPatch,
  sanitizeModeConfigPatch,
  suppliesPackageId,
  validateCustomerStep,
  validateModeStep,
  type CustomerProblem,
  type ModeConfig,
  type ModeProblem,
  type OnboardingDetails,
  type OnboardingModeKey,
  type OnboardingStep,
} from './onboarding-details';
import {
  EDITABLE_STATUSES,
  TERMINAL_STATUSES,
  canTransition,
  decideSubmit,
  isEditable,
  statusAfterEdit,
  type OnboardingStatusKey,
} from './onboarding-transitions';
import { menuProblemsForCase, readCaseMenu } from './onboarding-menu-state';
import {
  sanitizeOnboardingMenuDraft,
  type OnboardingMenuDraft,
} from './onboarding-menu';

export interface AdminRef {
  id: string;
  displayName: string;
  email: string;
}

export interface OnboardingCaseSummary {
  id: string;
  status: OnboardingStatusKey;
  mode: OnboardingModeKey | null;
  revision: number;
  restaurantName: string | null;
  ownerEmail: string | null;
  leadId: string | null;
  completedSteps: string[];
  updatedBy: AdminRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingCaseView {
  id: string;
  status: OnboardingStatusKey;
  mode: OnboardingModeKey | null;
  revision: number;
  details: OnboardingDetails;
  modeConfig: ModeConfig;
  /** Recomputed on every read (package status and trial settings can change after a save). */
  completedSteps: OnboardingStep[];
  problems: {
    customer: CustomerProblem[];
    mode: ModeProblem[];
    menu: string[];
  };
  menuDraft: OnboardingMenuDraft | null;
  importExpiresAt: string | null;
  importReviewed: boolean;
  importAttempts: number;
  restaurantId?: string;
  provisioningKey: string | null;
  lastErrorCode: string | null;
  ownerPasswordRequired: boolean;
  lead: {
    id: string;
    name: string;
    email: string;
    phone: string;
    kind: 'SUBSCRIBE' | 'TRIAL';
    status: 'NEW' | 'CONTACTED' | 'DONE' | 'DISMISSED';
    packageName: string | null;
    createdAt: string;
  } | null;
  package: {
    id: string;
    name: string;
    nameEn: string;
    status: 'ACTIVE' | 'ARCHIVED';
  } | null;
  trialSettings: {
    enabled: boolean;
    defaultDays: number;
    defaultPackageId: string | null;
  };
  demoLimits: { minHours: number; maxHours: number; kinds: string[] };
  createdBy: AdminRef | null;
  updatedBy: AdminRef | null;
  assignedTo: AdminRef | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

export interface OnboardingDuplicates {
  /** A User with the owner e-mail exists: provisioning would refuse it (never attached). */
  ownerEmailInUse: boolean;
  /** Restaurants that e-mail OWNS (names the console already shows; no other user data). */
  ownerRestaurants: { id: string; name: string; status: string }[];
  similarRestaurants: { id: string; name: string; status: string }[];
  otherOpenCases: {
    id: string;
    restaurantName: string | null;
    status: OnboardingStatusKey;
    updatedAt: string;
  }[];
  matchingLeads: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
  }[];
}

export type CaseOutcome<T> =
  | { outcome: 'ok'; data: T }
  | { outcome: 'notFound' }
  | { outcome: 'revisionConflict'; currentRevision: number }
  | { outcome: 'notEditable'; status: OnboardingStatusKey }
  | { outcome: 'invalidInput'; problems: string[] }
  | { outcome: 'invalidTransition'; status: OnboardingStatusKey }
  | {
      outcome: 'incomplete';
      problems: {
        customer: CustomerProblem[];
        mode: ModeProblem[];
        menu?: string[];
      };
    };

export type CreateOutcome =
  | { outcome: 'created'; data: OnboardingCaseView }
  | { outcome: 'leadNotFound' }
  | { outcome: 'leadInProgress'; caseId: string };

export interface CasePatch {
  revision: number;
  details?: unknown;
  modeConfig?: unknown;
  menuDraft?: unknown;
  mode?: OnboardingModeKey | null;
}

const MAX_PAGE_SIZE = 50;
const DUPLICATE_LIMIT = 5;

const adminSelect = {
  select: { id: true, displayName: true, email: true },
} as const;

const viewInclude = {
  lead: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      kind: true,
      status: true,
      packageName: true,
      createdAt: true,
    },
  },
  createdBy: adminSelect,
  updatedBy: adminSelect,
  assignedTo: adminSelect,
} satisfies Prisma.OnboardingCaseInclude;

type CaseRow = Prisma.OnboardingCaseGetPayload<{ include: typeof viewInclude }>;

const capped = (
  value: string | null | undefined,
  max: number,
): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed.slice(0, max);
};

/** The searchable copies of a case's details. */
function searchColumns(details: OnboardingDetails) {
  const email = details.owner.email?.trim().toLowerCase() ?? '';
  return {
    restaurantName: capped(details.restaurant.name, 100),
    ownerEmail: email === '' ? null : email.slice(0, 254),
  };
}

const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Platform onboarding drafts, A1/A2 review and revision-guarded lifecycle actions.
 * Final provisioning is owned by the separate onboarding saga.
 *
 * Concurrency: every write is an `updateMany` guarded by the revision the client read, and bumps it.
 */
@Injectable()
export class OnboardingCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly trialSettings: PlatformTrialSettingsService,
  ) {}

  async list(input: {
    search?: string;
    status?: OnboardingStatusKey;
    page: number;
    pageSize: number;
  }): Promise<{
    items: OnboardingCaseSummary[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const pageSize = Math.min(Math.max(input.pageSize, 1), MAX_PAGE_SIZE);
    const page = Math.max(input.page, 1);
    const search = input.search?.trim() ?? '';
    const where: Prisma.OnboardingCaseWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(search
        ? {
            OR: [
              { restaurantName: { contains: search, mode: 'insensitive' } },
              { ownerEmail: { contains: search.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.onboardingCase.findMany({
        where,
        include: { updatedBy: adminSelect },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.onboardingCase.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        mode: row.mode,
        revision: row.revision,
        restaurantName: row.restaurantName,
        ownerEmail: row.ownerEmail,
        leadId: row.leadId,
        completedSteps: row.completedSteps,
        updatedBy: row.updatedBy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async create(
    admin: PlatformAdminPrincipal,
    input: { leadId?: string | null },
  ): Promise<CreateOutcome> {
    const leadId = input.leadId ?? null;
    const details = emptyDetails();
    // The same starting values as the New Restaurant form; the operator changes them in step 1.
    details.restaurant.countryCode = 'EG';
    details.restaurant.currencyCode = 'EGP';
    details.restaurant.timezone = 'Africa/Cairo';
    details.restaurant.defaultLocale = 'ar';

    if (leadId !== null) {
      if (!isUuid(leadId)) return { outcome: 'leadNotFound' };
      const lead = await this.prisma.signupLead.findUnique({
        where: { id: leadId },
        select: {
          name: true,
          email: true,
          phone: true,
          restaurantName: true,
          locale: true,
        },
      });
      if (!lead) return { outcome: 'leadNotFound' };
      const open = await this.openCaseForLead(leadId);
      if (open) return { outcome: 'leadInProgress', caseId: open };
      // Prefill only what the visitor typed; the acquisition source is NOT invented.
      details.owner.fullName = capped(lead.name, 200);
      details.owner.email = capped(lead.email, 320);
      details.owner.phone = capped(lead.phone, 40);
      details.restaurant.name = capped(lead.restaurantName, 200);
      details.restaurant.defaultLocale =
        normalizePlatformLocale(lead.locale) ?? 'ar';
    }

    const modeConfig = emptyModeConfig();
    const evaluation = await this.evaluate(null, modeConfig, details);
    let id: string;
    try {
      const row = await this.prisma.onboardingCase.create({
        data: {
          status: 'DRAFT',
          details: json(details),
          modeConfig: json(modeConfig),
          completedSteps: evaluation.completedSteps,
          ...searchColumns(details),
          leadId,
          createdByAdminId: admin.adminId,
          updatedByAdminId: admin.adminId,
          assignedAdminId: admin.adminId,
        },
        select: { id: true },
      });
      id = row.id;
    } catch (error) {
      // Two operators opening the same lead at once: the partial unique index lets only one case in.
      if (
        leadId !== null &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const open = await this.openCaseForLead(leadId);
        if (open) return { outcome: 'leadInProgress', caseId: open };
      }
      throw error;
    }

    await this.audit.record({
      admin,
      action: 'onboarding.created',
      details: { caseId: id, leadId },
    });
    const view = await this.get(id);
    if (view.outcome !== 'ok')
      throw new Error('Onboarding case vanished after create');
    return { outcome: 'created', data: view.data };
  }

  async get(id: string): Promise<CaseOutcome<OnboardingCaseView>> {
    const row = await this.find(id);
    if (!row) return { outcome: 'notFound' };
    return { outcome: 'ok', data: await this.toView(row) };
  }

  async update(
    admin: PlatformAdminPrincipal,
    id: string,
    patch: CasePatch,
  ): Promise<CaseOutcome<OnboardingCaseView>> {
    const row = await this.find(id);
    if (!row) return { outcome: 'notFound' };
    if (row.revision !== patch.revision) {
      return { outcome: 'revisionConflict', currentRevision: row.revision };
    }
    if (!isEditable(row.status))
      return { outcome: 'notEditable', status: row.status };

    let details = readDetails(row.details);
    let modeConfig = readModeConfig(row.modeConfig);
    let menuDraft = row.menuDraft;
    const menuEdited = patch.menuDraft !== undefined;
    const problems: string[] = [];
    if (patch.details !== undefined) {
      const result = sanitizeDetailsPatch(patch.details, details);
      if (result.ok) details = result.value;
      else problems.push(...result.problems);
    }
    if (patch.modeConfig !== undefined) {
      const result = sanitizeModeConfigPatch(patch.modeConfig, modeConfig);
      if (result.ok) modeConfig = result.value;
      else problems.push(...result.problems);
    }
    if (menuEdited) {
      if (row.importExpiresAt && row.importExpiresAt <= new Date()) {
        return {
          outcome: 'incomplete',
          problems: {
            customer: [],
            mode: [],
            menu: ['ONBOARDING_IMPORT_EXPIRED'],
          },
        };
      }
      const result = sanitizeOnboardingMenuDraft(patch.menuDraft);
      if (result.ok) menuDraft = result.value;
      else problems.push(...result.problems);
    }
    if (problems.length > 0) return { outcome: 'invalidInput', problems };

    const mode = patch.mode === undefined ? row.mode : patch.mode;
    // Choosing a trial prefills the global default length (DEC-056). The default package is only shown as a
    // recommendation and a mode change clears the package unless this PATCH supplies one (PO 2026-11-22).
    const switchingToTrial = mode === 'TRIAL' && row.mode !== 'TRIAL';
    modeConfig = modeConfigForPatch({
      previousMode: row.mode,
      nextMode: mode,
      config: modeConfig,
      packageSupplied: suppliesPackageId(patch.modeConfig),
      trialDefaultDays: switchingToTrial
        ? (await this.trialSettings.get()).defaultDays
        : null,
    });

    const evaluation = await this.evaluate(mode, modeConfig, details);
    const prior = readDetails(row.details).restaurant;
    const reviewInvalidated =
      menuEdited ||
      details.restaurant.defaultLocale !== prior.defaultLocale ||
      details.restaurant.additionalLocales.join(',') !==
        prior.additionalLocales.join(',');
    const menu = menuProblemsForCase(
      {
        ...row,
        mode,
        menuDraft,
        importReviewed: row.importReviewed && !reviewInvalidated,
      },
      details,
    );
    const written = await this.prisma.onboardingCase.updateMany({
      where: {
        id,
        revision: patch.revision,
        status: { in: [...EDITABLE_STATUSES] },
      },
      data: {
        details: json(details),
        modeConfig: json(modeConfig),
        mode,
        status: statusAfterEdit(row.status),
        completedSteps:
          mode !== 'DEMO' && menu.length === 0
            ? [...evaluation.completedSteps, 'menu']
            : evaluation.completedSteps,
        ...(menuEdited ? { menuDraft: menuDraft ?? Prisma.DbNull } : {}),
        ...(reviewInvalidated ? { importReviewed: false } : {}),
        ...searchColumns(details),
        packageId: evaluation.pkg?.id ?? null,
        updatedByAdminId: admin.adminId,
        revision: { increment: 1 },
      },
    });
    if (written.count !== 1) return this.writeRefused(id, patch.revision);
    return this.get(id);
  }

  async submitForReview(
    admin: PlatformAdminPrincipal,
    id: string,
    revision: number,
  ): Promise<CaseOutcome<OnboardingCaseView>> {
    const row = await this.find(id);
    if (!row) return { outcome: 'notFound' };
    if (row.revision !== revision) {
      return { outcome: 'revisionConflict', currentRevision: row.revision };
    }
    const details = readDetails(row.details);
    const evaluation = await this.evaluate(
      row.mode,
      readModeConfig(row.modeConfig),
      details,
    );
    const decision = decideSubmit(row.status, evaluation.completedSteps);
    if (!decision.ok) {
      return decision.refusal === 'INVALID_TRANSITION'
        ? { outcome: 'invalidTransition', status: row.status }
        : {
            outcome: 'incomplete',
            problems: { customer: evaluation.customer, mode: evaluation.mode },
          };
    }
    // The package was ACTIVE when evaluated; the guarded write re-checks it in the same statement, so a package
    // archived between the evaluation and this write cannot slip through (A-D3, PO 2026-11-22).
    const pkg = evaluation.pkg;
    const written = await this.prisma.onboardingCase.updateMany({
      where: {
        id,
        revision,
        status: 'DRAFT',
        ...(pkg ? { package: { is: { id: pkg.id, status: 'ACTIVE' } } } : {}),
      },
      data: {
        status: 'READY_FOR_REVIEW',
        completedSteps:
          row.mode !== 'DEMO' && menuProblemsForCase(row, details).length === 0
            ? [...evaluation.completedSteps, 'menu']
            : evaluation.completedSteps,
        updatedByAdminId: admin.adminId,
        revision: { increment: 1 },
      },
    });
    if (written.count !== 1) return this.submitRefused(id, revision);
    await this.audit.record({
      admin,
      action: 'onboarding.submitted_for_review',
      details: { caseId: id, mode: row.mode, revision: revision + 1 },
    });
    return this.get(id);
  }

  async cancel(
    admin: PlatformAdminPrincipal,
    id: string,
    revision: number,
  ): Promise<CaseOutcome<OnboardingCaseView>> {
    const row = await this.find(id);
    if (!row) return { outcome: 'notFound' };
    if (row.revision !== revision) {
      return { outcome: 'revisionConflict', currentRevision: row.revision };
    }
    if (!canTransition(row.status, 'CANCELLED')) {
      return { outcome: 'invalidTransition', status: row.status };
    }
    const written = await this.prisma.onboardingCase.updateMany({
      where: { id, revision, status: { in: [...EDITABLE_STATUSES, 'FAILED'] } },
      data: {
        status: 'CANCELLED',
        menuDraft: Prisma.DbNull,
        importExpiresAt: null,
        importLeaseUntil: null,
        importReviewed: false,
        cancelledAt: new Date(),
        updatedByAdminId: admin.adminId,
        revision: { increment: 1 },
      },
    });
    if (written.count !== 1) return this.writeRefused(id, revision);
    await this.audit.record({
      admin,
      action: 'onboarding.cancelled',
      details: { caseId: id, from: row.status, leadId: row.leadId },
    });
    return this.get(id);
  }

  /** Warnings only: nothing is attached, merged or refused because of them. */
  async duplicates(id: string): Promise<CaseOutcome<OnboardingDuplicates>> {
    const row = await this.find(id);
    if (!row) return { outcome: 'notFound' };
    const details = readDetails(row.details);
    const email = details.owner.email?.trim().toLowerCase() ?? '';
    const phone = details.owner.phone?.trim() ?? '';
    const name = details.restaurant.name?.trim() ?? '';

    const [user, similar, cases, leads] = await Promise.all([
      email
        ? this.prisma.user.findUnique({
            where: { emailNormalized: email },
            select: {
              memberships: {
                where: { role: 'OWNER' },
                select: {
                  restaurant: {
                    select: { id: true, name: true, status: true },
                  },
                },
                take: DUPLICATE_LIMIT,
              },
            },
          })
        : null,
      name.length >= 2
        ? this.prisma.restaurant.findMany({
            where: {
              isDemo: false,
              name: { contains: name, mode: 'insensitive' },
            },
            select: { id: true, name: true, status: true },
            orderBy: { name: 'asc' },
            take: DUPLICATE_LIMIT,
          })
        : [],
      email || row.leadId
        ? this.prisma.onboardingCase.findMany({
            where: {
              id: { not: id },
              status: { notIn: [...TERMINAL_STATUSES] },
              OR: [
                ...(email ? [{ ownerEmail: email }] : []),
                ...(row.leadId ? [{ leadId: row.leadId }] : []),
              ],
            },
            select: {
              id: true,
              restaurantName: true,
              status: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: DUPLICATE_LIMIT,
          })
        : [],
      email || phone
        ? this.prisma.signupLead.findMany({
            where: {
              ...(row.leadId ? { id: { not: row.leadId } } : {}),
              OR: [
                ...(email
                  ? [{ email: { equals: email, mode: 'insensitive' as const } }]
                  : []),
                ...(phone ? [{ phone }] : []),
              ],
            },
            select: { id: true, name: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: DUPLICATE_LIMIT,
          })
        : [],
    ]);

    return {
      outcome: 'ok',
      data: {
        ownerEmailInUse: user !== null,
        ownerRestaurants: (user?.memberships ?? []).map((m) => m.restaurant),
        similarRestaurants: similar,
        otherOpenCases: cases.map((c) => ({
          ...c,
          updatedAt: c.updatedAt.toISOString(),
        })),
        matchingLeads: leads.map((lead) => ({
          ...lead,
          createdAt: lead.createdAt.toISOString(),
        })),
      },
    };
  }

  // ---------------------------------------------------------------- internals

  private find(id: string): Promise<CaseRow | null> {
    if (!isUuid(id)) return Promise.resolve(null);
    return this.prisma.onboardingCase.findUnique({
      where: { id },
      include: viewInclude,
    });
  }

  private async openCaseForLead(leadId: string): Promise<string | null> {
    const open = await this.prisma.onboardingCase.findFirst({
      where: { leadId, status: { notIn: [...TERMINAL_STATUSES] } },
      select: { id: true },
    });
    return open?.id ?? null;
  }

  /** Why a guarded write matched no row: gone, someone else wrote first, or no longer editable. */
  private async writeRefused(
    id: string,
    revision: number,
  ): Promise<CaseOutcome<never>> {
    const now = await this.prisma.onboardingCase.findUnique({
      where: { id },
      select: { revision: true, status: true },
    });
    if (!now) return { outcome: 'notFound' };
    if (now.revision !== revision) {
      return { outcome: 'revisionConflict', currentRevision: now.revision };
    }
    return { outcome: 'invalidTransition', status: now.status };
  }

  /**
   * Why a guarded submit matched no row. Same revision and still DRAFT means only the package check refused
   * it (archived after the evaluation): answer with the problems as they are now.
   */
  private async submitRefused(
    id: string,
    revision: number,
  ): Promise<CaseOutcome<never>> {
    const row = await this.find(id);
    if (row && row.revision === revision && row.status === 'DRAFT') {
      const evaluation = await this.evaluate(
        row.mode,
        readModeConfig(row.modeConfig),
        readDetails(row.details),
      );
      if (evaluation.customer.length > 0 || evaluation.mode.length > 0) {
        return {
          outcome: 'incomplete',
          problems: { customer: evaluation.customer, mode: evaluation.mode },
        };
      }
    }
    return this.writeRefused(id, revision);
  }

  private async evaluate(
    mode: OnboardingModeKey | null,
    config: ModeConfig,
    details: OnboardingDetails,
  ) {
    const [pkg, settings] = await Promise.all([
      isUuid(config.packageId)
        ? this.prisma.package.findUnique({
            where: { id: config.packageId },
            select: { id: true, name: true, nameEn: true, status: true },
          })
        : Promise.resolve(null),
      this.trialSettings.get(),
    ]);
    const customer = validateCustomerStep(details);
    const modeProblems = validateModeStep(mode, config, {
      pkg,
      trialsEnabled: settings.enabled,
    });
    return {
      customer,
      mode: modeProblems,
      completedSteps: computeCompletedSteps({ customer, mode: modeProblems }),
      pkg,
      settings,
    };
  }

  private async toView(row: CaseRow): Promise<OnboardingCaseView> {
    const details = readDetails(row.details);
    const modeConfig = readModeConfig(row.modeConfig);
    const evaluation = await this.evaluate(row.mode, modeConfig, details);
    const menu = menuProblemsForCase(row, details);
    return {
      id: row.id,
      status: row.status,
      mode: row.mode,
      revision: row.revision,
      details,
      modeConfig,
      completedSteps: [
        ...evaluation.completedSteps,
        ...(row.mode && row.mode !== 'DEMO' && menu.length === 0
          ? ['menu' as const]
          : []),
        ...(row.status === 'READY' ? ['review' as const] : []),
      ],
      problems: { customer: evaluation.customer, mode: evaluation.mode, menu },
      menuDraft: readCaseMenu(row),
      importExpiresAt: row.importExpiresAt?.toISOString() ?? null,
      importReviewed:
        !!row.importReviewed &&
        !!row.importExpiresAt &&
        row.importExpiresAt > new Date(),
      importAttempts: row.importAttempts,
      ...(row.restaurantId ? { restaurantId: row.restaurantId } : {}),
      provisioningKey: row.provisioningKey,
      lastErrorCode: row.lastErrorCode,
      ownerPasswordRequired: !row.restaurantId && !row.restaurantProvisionedAt,
      lead: row.lead
        ? { ...row.lead, createdAt: row.lead.createdAt.toISOString() }
        : null,
      package: evaluation.pkg,
      trialSettings: {
        enabled: evaluation.settings.enabled,
        defaultDays: evaluation.settings.defaultDays,
        defaultPackageId: evaluation.settings.defaultPackage?.id ?? null,
      },
      demoLimits: {
        minHours: DEMO_MIN_HOURS,
        maxHours: DEMO_MAX_HOURS,
        kinds: [...DEMO_KINDS],
      },
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      assignedTo: row.assignedTo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    };
  }
}
