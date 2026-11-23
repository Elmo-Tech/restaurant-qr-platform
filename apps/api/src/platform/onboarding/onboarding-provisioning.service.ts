import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PasswordHasherService } from '../../auth/password/password-hasher.service';
import { resolveFeatures } from '../../entitlements/features';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, type OnboardingCase } from '../../generated/prisma/client';
import {
  provisionRestaurant,
  type ProvisioningTx,
} from '../../provisioning/provision-restaurant';
import { PublicMenuService } from '../../public/public-menu.service';
import {
  normalizePhone,
  normalizeUrl,
} from '../../restaurants/restaurant-contact';
import { PlatformBillingService } from '../billing/platform-billing.service';
import { SubscriptionSyncService } from '../billing/subscription-sync.service';
import { PlatformAuditService } from '../platform-audit.service';
import type { PlatformAdminPrincipal } from '../platform-auth.service';
import { validateAcquisitionInput } from '../restaurant-acquisition';
import { validateOwnerContact } from '../restaurant-owner-contact';
import {
  OnboardingCasesService,
  type CaseOutcome,
  type OnboardingCaseView,
} from './onboarding-cases.service';
import {
  isUuid,
  readDetails,
  readModeConfig,
  validateCustomerStep,
  validateModeStep,
} from './onboarding-details';
import {
  menuProblemsForCase,
  onboardingLocales,
} from './onboarding-menu-state';
import { OnboardingMenuWriterService } from './onboarding-menu-writer.service';
import { canTransition } from './onboarding-transitions';

interface ProvisionRequest {
  revision: number;
  provisioningKey: string;
  ownerPassword?: string;
}

class StepFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function onboardingError(
  status: number,
  code: string,
  message: string,
): never {
  throw new HttpException({ error: { code, message } }, status);
}

async function lockCase(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM onboarding_cases WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.onboardingCase.findUnique({ where: { id } });
}

async function lockActivePackage(
  tx: Prisma.TransactionClient,
  id: string | null,
) {
  if (!isUuid(id)) return null;
  const [pkg] = await tx.$queryRaw<{ id: string; status: 'ACTIVE' }[]>`
    SELECT id, status FROM packages WHERE id = ${id}::uuid AND status = 'ACTIVE' FOR SHARE
  `;
  return pkg ?? null;
}

async function trialsEnabled(tx: Prisma.TransactionClient) {
  const [settings] = await tx.$queryRaw<{ enabled: boolean }[]>`
    SELECT enabled FROM platform_trial_settings WHERE id = 'trial' FOR SHARE
  `;
  return settings?.enabled ?? true;
}

/** Checkpoints are committed with their side effects, and every step locks the case before doing work. */
@Injectable()
export class OnboardingProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: OnboardingCasesService,
    private readonly audit: PlatformAuditService,
    private readonly hasher: PasswordHasherService,
    private readonly writer: OnboardingMenuWriterService,
    private readonly billing: PlatformBillingService,
    private readonly sync: SubscriptionSyncService,
    private readonly guestMenu: PublicMenuService,
  ) {}

  async run(
    admin: PlatformAdminPrincipal,
    id: string,
    input: ProvisionRequest,
    retry: boolean,
  ): Promise<CaseOutcome<OnboardingCaseView>> {
    if (!isUuid(id)) return { outcome: 'notFound' };
    const key = input.provisioningKey.toLowerCase();
    const claim = await this.claim(admin, id, input, key, retry);
    if (claim.outcome !== 'run') {
      return claim.outcome === 'replay' ? this.cases.get(id) : claim;
    }

    let expectedRevision = claim.row.revision;
    let stepError = 'ONBOARDING_PROVISIONING_FAILED';
    try {
      const restaurant = await this.provision(
        admin,
        id,
        key,
        input.ownerPassword,
      );
      if (!restaurant) return this.cases.get(id);
      expectedRevision = restaurant.revision;
      stepError = 'ONBOARDING_MENU_PUBLISH_FAILED';
      const menu = await this.writer.publish(admin, {
        caseId: id,
        provisioningKey: key,
      });
      if (menu.outcome === 'refused') throw new StepFailure(menu.code);
      const checkpoint = await this.prisma.onboardingCase.findUnique({
        where: { id },
      });
      if (!checkpoint || checkpoint.status !== 'MENU_SETUP')
        return this.cases.get(id);
      expectedRevision = checkpoint.revision;
      stepError = 'ONBOARDING_TRIAL_FAILED';
      if (checkpoint.mode === 'TRIAL') {
        const trial = await this.ensureTrial(admin, id, key);
        if (!trial) return this.cases.get(id);
        expectedRevision = trial.revision;
      }
      // Re-running this read-only check is safe after an interruption, including after trial commit.
      stepError = 'ONBOARDING_GUEST_MENU_NOT_READY';
      await this.markReady(admin, id, key);
    } catch (error) {
      const code = error instanceof StepFailure ? error.code : stepError;
      await this.recordFailure(admin, id, key, expectedRevision, code);
    }
    return this.cases.get(id);
  }

  private async claim(
    admin: PlatformAdminPrincipal,
    id: string,
    input: ProvisionRequest,
    key: string,
    retry: boolean,
  ): Promise<
    | CaseOutcome<never>
    | { outcome: 'replay' }
    | { outcome: 'run'; row: OnboardingCase }
  > {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await lockCase(tx, id);
        if (!row) return { outcome: 'notFound' };
        if (row.provisioningKey && row.provisioningKey !== key) {
          onboardingError(
            HttpStatus.CONFLICT,
            'ONBOARDING_PROVISIONING_KEY_CONFLICT',
            'Use the existing provisioning attempt.',
          );
        }
        if (row.status === 'READY' || (row.status === 'FAILED' && !retry))
          return { outcome: 'replay' };
        if (row.status === 'PROVISIONING' || row.status === 'MENU_SETUP') {
          this.requirePassword(row, input.ownerPassword);
          return { outcome: 'run', row };
        }
        if (
          row.status !== (retry ? 'FAILED' : 'READY_FOR_REVIEW') ||
          (row.mode !== 'REAL' && row.mode !== 'TRIAL')
        ) {
          return { outcome: 'invalidTransition', status: row.status };
        }
        if (row.revision !== input.revision)
          return { outcome: 'revisionConflict', currentRevision: row.revision };
        const details = readDetails(row.details);
        const config = readModeConfig(row.modeConfig);
        const pkg =
          row.packageId === config.packageId
            ? await lockActivePackage(tx, config.packageId)
            : null;
        const customer = validateCustomerStep(details);
        const mode = validateModeStep(row.mode, config, {
          pkg,
          trialsEnabled:
            row.mode !== 'TRIAL' ||
            !!row.trialSubscriptionId ||
            (await trialsEnabled(tx)),
        });
        const menu = menuProblemsForCase(row, details);
        if (pkg && row.importExpiresAt && !row.menuPublishedAt) {
          const features = await tx.packageFeature.findMany({
            where: { packageId: pkg.id },
            select: { feature: true },
          });
          if (
            !resolveFeatures(
              [],
              features.map((item) => item.feature),
            ).MENU_IMPORT
          )
            menu.push('FEATURE_NOT_AVAILABLE');
        }
        if (customer.length || mode.length || menu.length)
          return { outcome: 'incomplete', problems: { customer, mode, menu } };
        this.requirePassword(row, input.ownerPassword);
        const status =
          row.restaurantProvisionedAt || row.restaurantId
            ? 'MENU_SETUP'
            : 'PROVISIONING';
        if (!canTransition(row.status, status))
          return { outcome: 'invalidTransition', status: row.status };
        const updated = await tx.onboardingCase.update({
          where: { id },
          data: {
            status,
            provisioningKey: key,
            lastErrorCode: null,
            updatedByAdminId: admin.adminId,
            revision: { increment: 1 },
          },
        });
        await this.audit.record(
          {
            admin,
            action: 'onboarding.provisioning_started',
            details: { caseId: id, retry, mode: row.mode },
          },
          tx,
        );
        return { outcome: 'run', row: updated };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        onboardingError(
          HttpStatus.CONFLICT,
          'ONBOARDING_PROVISIONING_KEY_CONFLICT',
          'Use a different key for this case.',
        );
      }
      throw error;
    }
  }

  private requirePassword(row: OnboardingCase, password: string | undefined) {
    if (!row.restaurantProvisionedAt && !row.restaurantId && !password) {
      onboardingError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'OWNER_PASSWORD_REQUIRED',
        'Enter the owner password to provision the account.',
      );
    }
  }

  private async provision(
    admin: PlatformAdminPrincipal,
    id: string,
    key: string,
    password?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await lockCase(tx, id);
      if (!row || row.provisioningKey !== key) return null;
      if (row.status === 'MENU_SETUP') {
        if (!row.restaurantId)
          throw new StepFailure('ONBOARDING_RESTAURANT_NOT_ELIGIBLE');
        return row;
      }
      if (row.status !== 'PROVISIONING') return null;
      if (row.restaurantProvisionedAt || row.restaurantId)
        throw new StepFailure('ONBOARDING_RESTAURANT_NOT_ELIGIBLE');
      if (!password) throw new StepFailure('OWNER_PASSWORD_REQUIRED');
      const config = readModeConfig(row.modeConfig);
      // Lock again: an archive may have committed since the durable PROVISIONING checkpoint.
      const pkg =
        row.packageId === config.packageId
          ? await lockActivePackage(tx, config.packageId)
          : null;
      if (!pkg) throw new StepFailure('PACKAGE_NOT_AVAILABLE');
      if (row.mode === 'TRIAL' && !(await trialsEnabled(tx)))
        throw new StepFailure('TRIAL_DISABLED');
      const details = readDetails(row.details);
      const { restaurant, owner, acquisition } = details;
      const contact = validateOwnerContact({
        fullName: owner.fullName,
        phone: owner.phone,
        facebookUrl: owner.facebookUrl,
      });
      const attribution = validateAcquisitionInput(acquisition);
      if (!contact.ok || !attribution.ok)
        throw new StepFailure('ONBOARDING_PROVISIONING_FAILED');
      // Run the existing provisioning routine in this transaction so a crash cannot leave a tenant
      // behind without its case checkpoint. Never adopt the routine's legacy same-owner/name no-op.
      const provisioned = await provisionRestaurant(
        { $transaction: (work) => work(tx as unknown as ProvisioningTx) },
        this.hasher,
        {
          restaurantName: restaurant.name ?? '',
          ownerEmail: owner.email ?? '',
          ownerPassword: password,
          branchName: restaurant.branchName ?? '',
          defaultLocale: restaurant.defaultLocale ?? '',
          currencyCode: restaurant.currencyCode ?? '',
          timezone: restaurant.timezone ?? '',
          acquisition: attribution.value,
          ownerContact: contact.value,
          recordedByAdminId: admin.adminId,
        },
      );
      if (
        provisioned.outcome === 'alreadyProvisioned' ||
        provisioned.outcome === 'conflict'
      ) {
        throw new StepFailure('ONBOARDING_OWNER_EMAIL_IN_USE');
      }
      if (provisioned.outcome !== 'provisioned')
        throw new StepFailure('ONBOARDING_PROVISIONING_FAILED');
      const target = await tx.restaurant.update({
        where: { publicId: provisioned.restaurantPublicId },
        data: {
          packageId: pkg.id,
          countryCode: restaurant.countryCode?.toUpperCase(),
          contactPhone: normalizePhone('phone', restaurant.phone ?? ''),
          whatsappNumber: normalizePhone('whatsapp', restaurant.whatsapp ?? ''),
          facebookUrl: normalizeUrl(
            'facebookUrl',
            restaurant.facebookUrl ?? '',
          ),
          instagramUrl: normalizeUrl(
            'instagramUrl',
            restaurant.instagramUrl ?? '',
          ),
          websiteUrl: normalizeUrl('websiteUrl', restaurant.websiteUrl ?? ''),
        },
        select: { id: true, name: true },
      });
      await tx.restaurantLocale.updateMany({
        where: {
          restaurantId: target.id,
          locale: { notIn: onboardingLocales(details).activeLocales },
        },
        data: { isActive: false },
      });
      await tx.branch.updateMany({
        where: { restaurantId: target.id },
        data: { address: restaurant.address },
      });
      const updated = await tx.onboardingCase.update({
        where: { id },
        data: {
          restaurantId: target.id,
          restaurantProvisionedAt: new Date(),
          status: 'MENU_SETUP',
          revision: { increment: 1 },
        },
      });
      await this.audit.record(
        {
          admin,
          action: 'onboarding.restaurant_provisioned',
          restaurant: target,
          details: { caseId: id, packageId: pkg.id },
        },
        tx,
      );
      return updated;
    });
  }

  private async ensureTrial(
    admin: PlatformAdminPrincipal,
    id: string,
    key: string,
  ) {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await lockCase(tx, id);
      if (
        !current ||
        current.provisioningKey !== key ||
        current.status !== 'MENU_SETUP'
      )
        return null;
      if (
        !current.restaurantId ||
        !current.menuPublishedAt ||
        current.mode !== 'TRIAL'
      )
        throw new StepFailure('ONBOARDING_TRIAL_FAILED');
      if (current.trialSubscriptionId) {
        const trial = await tx.subscription.findFirst({
          where: {
            id: current.trialSubscriptionId,
            restaurantId: current.restaurantId,
            kind: 'TRIAL',
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (!trial) throw new StepFailure('ONBOARDING_TRIAL_FAILED');
        return current;
      }
      const config = readModeConfig(current.modeConfig);
      const pkg =
        current.packageId === config.packageId
          ? await lockActivePackage(tx, config.packageId)
          : null;
      if (!pkg) throw new StepFailure('PACKAGE_NOT_AVAILABLE');
      if (!(await trialsEnabled(tx))) throw new StepFailure('TRIAL_DISABLED');
      const created = await this.billing.createTrial(
        admin,
        current.restaurantId,
        {
          packageId: pkg.id,
          durationDays: config.trialDays ?? 0,
          startsAt: null,
          notes: null,
        },
        tx,
      );
      if (created.outcome !== 'ok')
        throw new StepFailure('ONBOARDING_TRIAL_FAILED');
      return tx.onboardingCase.update({
        where: { id },
        data: {
          trialSubscriptionId: created.data.id,
          revision: { increment: 1 },
        },
      });
    });
    if (row?.restaurantId) {
      try {
        await this.sync.syncRestaurant(row.restaurantId);
      } catch {
        // Persist the failure against the trial checkpoint, not the revision before trial creation.
        await this.recordFailure(
          admin,
          id,
          key,
          row.revision,
          'ONBOARDING_TRIAL_FAILED',
        );
        return null;
      }
    }
    return row;
  }

  private async markReady(
    admin: PlatformAdminPrincipal,
    id: string,
    key: string,
  ) {
    // The public reader uses the pool itself. Do not hold a transaction connection while rendering the menu.
    const checked = await this.prisma.onboardingCase.findUnique({
      where: { id },
    });
    if (
      !checked ||
      checked.provisioningKey !== key ||
      checked.status !== 'MENU_SETUP'
    )
      return;
    if (
      !checked.restaurantId ||
      !checked.menuPublishedAt ||
      (checked.mode === 'TRIAL' && !checked.trialSubscriptionId)
    ) {
      throw new StepFailure('ONBOARDING_GUEST_MENU_NOT_READY');
    }
    const qr = await this.prisma.qrCode.findFirst({
      where: {
        restaurantId: checked.restaurantId,
        type: 'GENERIC',
        status: 'ACTIVE',
        branchId: null,
        tableId: null,
      },
      select: { publicCode: true },
    });
    if (!qr) throw new StepFailure('ONBOARDING_GUEST_MENU_NOT_READY');
    const slug = await this.prisma.restaurantSlug.findFirst({
      where: { restaurantId: checked.restaurantId, isCurrent: true },
      select: { slug: true },
    });
    if (!slug) throw new StepFailure('ONBOARDING_GUEST_MENU_NOT_READY');
    const rendered = await this.guestMenu.getPublicMenu({
      publicCode: slug.slug,
      explicitLang: null,
      acceptLanguageHeader: null,
    });
    if (
      rendered.outcome !== 'found' ||
      rendered.data.context.entry.publicCode !== qr.publicCode ||
      !rendered.data.menu.categories.some((category) =>
        category.products.some(
          (product) => product.availability === 'AVAILABLE',
        ),
      )
    ) {
      throw new StepFailure('ONBOARDING_GUEST_MENU_NOT_READY');
    }
    await this.prisma.$transaction(async (tx) => {
      const row = await lockCase(tx, id);
      if (
        !row ||
        row.provisioningKey !== key ||
        row.status !== 'MENU_SETUP' ||
        row.revision !== checked.revision
      )
        return;
      if (!row.restaurantId)
        throw new StepFailure('ONBOARDING_GUEST_MENU_NOT_READY');
      const target = await tx.restaurant.findUnique({
        where: { id: row.restaurantId },
        select: {
          id: true,
          name: true,
          status: true,
          packageId: true,
          isDemo: true,
        },
      });
      const pkg = await lockActivePackage(tx, row.packageId);
      if (!pkg) throw new StepFailure('PACKAGE_NOT_AVAILABLE');
      if (
        !target ||
        target.status !== 'ACTIVE' ||
        target.isDemo ||
        target.packageId !== pkg.id
      )
        throw new StepFailure('ONBOARDING_RESTAURANT_NOT_ELIGIBLE');
      const activeEntry = await tx.qrCode.findFirst({
        where: {
          restaurantId: target.id,
          publicCode: qr.publicCode,
          status: 'ACTIVE',
          type: 'GENERIC',
          restaurant: { slugs: { some: { slug: slug.slug, isCurrent: true } } },
        },
        select: { id: true },
      });
      if (!activeEntry)
        throw new StepFailure('ONBOARDING_GUEST_MENU_NOT_READY');
      await tx.onboardingCase.update({
        where: { id },
        data: {
          status: 'READY',
          lastErrorCode: null,
          revision: { increment: 1 },
          updatedByAdminId: admin.adminId,
        },
      });
      await this.audit.record(
        {
          admin,
          action: 'onboarding.ready',
          restaurant: target,
          details: { caseId: id },
        },
        tx,
      );
    });
  }

  private async recordFailure(
    admin: PlatformAdminPrincipal,
    id: string,
    key: string,
    revision: number,
    code: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      // A slower request must not overwrite a concurrent successful checkpoint.
      const result = await tx.onboardingCase.updateMany({
        where: {
          id,
          provisioningKey: key,
          revision,
          status: { in: ['PROVISIONING', 'MENU_SETUP'] },
        },
        data: {
          status: 'FAILED',
          lastErrorCode: code,
          updatedByAdminId: admin.adminId,
          revision: { increment: 1 },
        },
      });
      if (result.count === 1)
        await this.audit.record(
          { admin, action: 'onboarding.failed', details: { caseId: id, code } },
          tx,
        );
    });
  }
}
