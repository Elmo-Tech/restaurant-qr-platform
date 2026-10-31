import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type RestaurantSetup } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { resolveFeatures, type FeatureMap } from '../entitlements/features';
import { PERMISSIONS, type Permission } from '../auth/permission/permission';
import type { RestaurantAccessContext } from '../auth/context/restaurant-access.service';

const KEYS = ['BRANDING', 'CONTACT', 'LANGUAGES', 'MENU', 'PRODUCTS', 'ORDERING', 'OPERATIONS', 'PREVIEW'] as const;
export type SetupStepKey = (typeof KEYS)[number];
export type SetupStatusKey = 'DONE' | 'NEEDS_ACTION' | 'NEEDS_REVIEW' | 'INTENTIONALLY_SKIPPED' | 'NOT_APPLICABLE' | 'UNAVAILABLE';
type Group = 'identity' | 'menu' | 'orders';
export interface RestaurantSetupStep {
  key: SetupStepKey;
  group: Group;
  status: SetupStatusKey;
  href: string | null;
}
export interface RestaurantSetupStatus {
  enrolled: boolean;
  hidden: boolean;
  completed: boolean;
  owner: boolean;
  canReview: boolean;
  steps: RestaurantSetupStep[];
}

const NO_SETUP: Pick<RestaurantSetupStatus, 'enrolled' | 'hidden' | 'completed' | 'steps'> = {
  enrolled: false, hidden: false, completed: false, steps: [],
};

interface SetupSnapshot {
  restaurant: {
    logoAssetPath: string | null;
    coverAssetPath: string | null;
    contactPhone: string | null;
    whatsappNumber: string | null;
    hotlineNumber: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    websiteUrl: string | null;
    defaultLocale: string;
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
    tableOrderingEnabled: boolean;
    whatsappOrderingEnabled: boolean;
  };
  activeLocales: string[];
  features: FeatureMap;
  activeMenuCount: number;
  liveProductCount: number;
  activeBranchCount: number;
  activeZoneCount: number;
  activeTableCount: number;
}

function effectiveChannels(s: SetupSnapshot) {
  const r = s.restaurant, f = s.features;
  const canPickupDelivery = f.DASHBOARD_ORDERING || (f.WHATSAPP_ORDERING && r.whatsappOrderingEnabled);
  return {
    pickup: canPickupDelivery && r.pickupEnabled,
    delivery: canPickupDelivery && r.deliveryEnabled,
    table: f.TABLE_ORDERING && r.tableOrderingEnabled,
    whatsapp: f.WHATSAPP_ORDERING && r.whatsappOrderingEnabled,
  };
}

function currentSignatures(s: SetupSnapshot) {
  const channels = effectiveChannels(s);
  const locales = [...s.activeLocales].sort();
  return {
    languages: JSON.stringify({ default: s.restaurant.defaultLocale, enabled: locales }),
    ordering: JSON.stringify({
      channels,
      raw: {
        pickup: s.restaurant.pickupEnabled,
        delivery: s.restaurant.deliveryEnabled,
        table: s.restaurant.tableOrderingEnabled,
        whatsapp: s.restaurant.whatsappOrderingEnabled,
      },
    }),
    operations: JSON.stringify({
      channels,
      activeBranches: s.activeBranchCount,
      activeZones: s.activeZoneCount,
      activeTables: s.activeTableCount,
    }),
  };
}

/** Canonical facts, not previously ticked boxes or client-supplied progress. */
export function deriveSetupStatuses(s: SetupSnapshot, state: Pick<RestaurantSetup,
  'languagesSignature' | 'orderingSignature' | 'operationsSignature' |
  'previewConfirmedAt' | 'brandingSkippedAt'>): Record<SetupStepKey, SetupStatusKey> {
  const channels = effectiveChannels(s);
  const signs = currentSignatures(s);
  const hasContact = [
    s.restaurant.contactPhone, s.restaurant.whatsappNumber,
    s.restaurant.hotlineNumber, s.restaurant.facebookUrl,
    s.restaurant.instagramUrl, s.restaurant.websiteUrl,
  ].some(value => Boolean(value?.trim()));
  const usableContact = hasContact && (!channels.whatsapp || Boolean(s.restaurant.whatsappNumber?.trim()));
  const hasOperations = channels.pickup || channels.delivery || channels.table;
  const branchesReady = s.activeBranchCount > 0 &&
    (!channels.delivery || s.activeZoneCount > 0) &&
    (!channels.table || s.activeTableCount > 0);
  const branding = s.restaurant.logoAssetPath && s.restaurant.coverAssetPath
    ? 'DONE' : state.brandingSkippedAt ? 'INTENTIONALLY_SKIPPED' : 'NEEDS_ACTION';
  return {
    BRANDING: branding,
    CONTACT: usableContact ? 'DONE' : 'NEEDS_ACTION',
    LANGUAGES: s.activeLocales.includes(s.restaurant.defaultLocale)
      && state.languagesSignature === signs.languages ? 'DONE' : 'NEEDS_REVIEW',
    MENU: s.activeMenuCount > 0 ? 'DONE' : 'NEEDS_ACTION',
    PRODUCTS: s.liveProductCount > 0 ? 'DONE' : 'NEEDS_ACTION',
    ORDERING: state.orderingSignature === signs.ordering ? 'DONE' : 'NEEDS_REVIEW',
    OPERATIONS: !hasOperations ? 'NOT_APPLICABLE'
      : branchesReady && state.operationsSignature === signs.operations ? 'DONE'
      : branchesReady ? 'NEEDS_REVIEW' : 'NEEDS_ACTION',
    PREVIEW: state.previewConfirmedAt && s.liveProductCount > 0 ? 'DONE' : 'NEEDS_REVIEW',
  };
}

function groupFor(key: SetupStepKey): Group {
  return ['BRANDING', 'CONTACT', 'LANGUAGES'].includes(key) ? 'identity'
    : ['MENU', 'PRODUCTS'].includes(key) ? 'menu' : 'orders';
}
function setupRows(
  restaurantId: string, snapshot: SetupSnapshot, state: RestaurantSetup,
  permissions: readonly Permission[],
): RestaurantSetupStep[] {
  const values = deriveSetupStatuses(snapshot, state);
  const base = '/staff/restaurants/' + encodeURIComponent(restaurantId);
  const menuAccess = permissions.includes(PERMISSIONS.MENU_VIEW);
  const branchesAccess = permissions.includes(PERMISSIONS.BRANCHES_VIEW);
  return KEYS.map(key => {
    const menu = key === 'MENU' || key === 'PRODUCTS' || key === 'PREVIEW';
    const branch = key === 'OPERATIONS';
    const allowed = menu ? menuAccess : branch ? branchesAccess : true;
    const href = !allowed ? null
      : key === 'BRANDING' ? base + '/settings/profile'
      : key === 'CONTACT' ? base + '/settings/profile#contact-settings'
      : key === 'LANGUAGES' ? base + '/settings/languages'
      : key === 'MENU' || key === 'PRODUCTS' ? base + '/menu'
      : key === 'ORDERING' ? base + '/settings/ordering'
      : key === 'OPERATIONS' ? base + '/settings/branches'
      : base + '/menu/overview';
    return {
      key, group: groupFor(key), href,
      status: !allowed && values[key] !== 'NOT_APPLICABLE'
        && values[key] !== 'INTENTIONALLY_SKIPPED' ? 'UNAVAILABLE' : values[key],
    };
  });
}

function canFinish(rows: readonly RestaurantSetupStep[]) {
  return rows.length > 0 && rows.every(row =>
    row.status === 'DONE' || row.status === 'NOT_APPLICABLE' || row.status === 'INTENTIONALLY_SKIPPED');
}

function error(code: string, message: string): ConflictException {
  return new ConflictException({ error: { code, message } });
}

type SetupDb = Prisma.TransactionClient;

/**
 * All setup reads are tenant-guarded by the Controller (restaurant-access +
 * restaurant.view + allBranches). Direct use of this service is internal only.
 * The API never trusts caller-provided percentages or step completion flags.
 */
@Injectable()
export class RestaurantSetupService {
  constructor(private readonly prisma: PrismaService) {}

  private async snapshot(db: SetupDb, restaurantId: string): Promise<SetupSnapshot> {
    const [restaurant, menus, products, branches, zones, tables] = await Promise.all([
      db.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: {
          logoAssetPath: true, coverAssetPath: true, contactPhone: true,
          whatsappNumber: true, hotlineNumber: true, facebookUrl: true,
          instagramUrl: true, websiteUrl: true, defaultLocale: true,
          pickupEnabled: true, deliveryEnabled: true, tableOrderingEnabled: true,
          whatsappOrderingEnabled: true,
          locales: { where: { isActive: true }, select: { locale: true } },
          features: { select: { feature: true, enabled: true } },
          package: { select: { features: { select: { feature: true } } } },
        },
      }),
      db.menu.count({ where: { restaurantId, status: 'ACTIVE' } }),
      db.product.count({ where: {
        restaurantId, status: 'ACTIVE',
        category: { status: 'ACTIVE', menu: { status: 'ACTIVE', restaurantId } },
      } }),
      db.branch.count({ where: { restaurantId, status: 'ACTIVE' } }),
      db.deliveryZone.count({ where: {
        restaurantId, status: 'ACTIVE', branch: { status: 'ACTIVE' },
      } }),
      db.table.count({ where: {
        restaurantId, status: 'ACTIVE', branch: { status: 'ACTIVE' },
      } }),
    ]);
    return {
      restaurant: {
        logoAssetPath: restaurant.logoAssetPath,
        coverAssetPath: restaurant.coverAssetPath,
        contactPhone: restaurant.contactPhone,
        whatsappNumber: restaurant.whatsappNumber,
        hotlineNumber: restaurant.hotlineNumber,
        facebookUrl: restaurant.facebookUrl,
        instagramUrl: restaurant.instagramUrl,
        websiteUrl: restaurant.websiteUrl,
        defaultLocale: restaurant.defaultLocale,
        pickupEnabled: restaurant.pickupEnabled,
        deliveryEnabled: restaurant.deliveryEnabled,
        tableOrderingEnabled: restaurant.tableOrderingEnabled,
        whatsappOrderingEnabled: restaurant.whatsappOrderingEnabled,
      },
      activeLocales: restaurant.locales.map(v => v.locale),
      features: resolveFeatures(restaurant.features, restaurant.package?.features.map(v => v.feature)),
      activeMenuCount: menus, liveProductCount: products, activeBranchCount: branches,
      activeZoneCount: zones, activeTableCount: tables,
    };
  }

  async getStatus(access: RestaurantAccessContext, userId: string): Promise<RestaurantSetupStatus> {
    const owner = access.role === 'OWNER';
    const canReview = access.permissions.includes(PERMISSIONS.RESTAURANT_MANAGE);
    const setup = await this.prisma.restaurantSetup.findUnique({ where: { restaurantId: access.restaurantId } });
    if (!setup) return { ...NO_SETUP, owner, canReview };
    const visibility = await this.prisma.restaurantSetupVisibility.findUnique({
      where: { restaurantId_userId: { restaurantId: access.restaurantId, userId } },
    });
    const snap = await this.snapshot(this.prisma, access.restaurantId);
    return {
      enrolled: true,
      hidden: Boolean(visibility?.hiddenAt),
      completed: Boolean(setup.completedAt),
      owner,
      canReview,
      steps: setupRows(access.restaurantId, snap, setup, access.permissions),
    };
  }

  async enroll(restaurantId: string): Promise<void> {
    // Only OWNER via structural guards; idempotent, with no legacy backfill.
    await this.prisma.restaurantSetup.upsert({
      where: { restaurantId },
      update: {},
      create: { restaurantId },
    });
  }

  async setHidden(restaurantId: string, userId: string, hidden: boolean): Promise<void> {
    const existing = await this.prisma.restaurantSetup.findUnique({ where: { restaurantId } });
    if (!existing) throw error('SETUP_NOT_ENROLLED', 'Start the setup guide first.');
    await this.prisma.restaurantSetupVisibility.upsert({
      where: { restaurantId_userId: { restaurantId, userId } },
      update: { hiddenAt: hidden ? new Date() : null },
      create: { restaurantId, userId, hiddenAt: hidden ? new Date() : null },
    });
  }

  async review(restaurantId: string, key: 'LANGUAGES' | 'ORDERING' | 'OPERATIONS' | 'PREVIEW' | 'BRANDING_SKIP'): Promise<void> {
    const state = await this.prisma.restaurantSetup.findUnique({ where: { restaurantId } });
    if (!state) throw error('SETUP_NOT_ENROLLED', 'Start the setup guide first.');
    if (state.completedAt) throw error('SETUP_ALREADY_COMPLETED', 'This setup was already completed.');
    const snap = await this.snapshot(this.prisma, restaurantId);
    const signs = currentSignatures(snap);
    const states = deriveSetupStatuses(snap, state);
    if (key === 'LANGUAGES' && !snap.activeLocales.includes(snap.restaurant.defaultLocale)) {
      throw error('SETUP_LANGUAGE_INCOMPLETE', 'Enable your default menu language first.');
    }
    if (key === 'OPERATIONS' && states.OPERATIONS === 'NEEDS_ACTION') {
      throw error('SETUP_OPERATIONS_INCOMPLETE', 'Complete the enabled branch, delivery or table requirements first.');
    }
    if (key === 'PREVIEW' && snap.liveProductCount === 0) {
      throw error('SETUP_MENU_EMPTY', 'Publish at least one visible product before confirming preview.');
    }
    const data = key === 'LANGUAGES' ? { languagesSignature: signs.languages }
      : key === 'ORDERING' ? { orderingSignature: signs.ordering }
      : key === 'OPERATIONS' ? { operationsSignature: signs.operations }
      : key === 'PREVIEW' ? { previewConfirmedAt: new Date() }
      : { brandingSkippedAt: new Date() };
    await this.prisma.restaurantSetup.update({ where: { restaurantId }, data });
  }

  async complete(access: RestaurantAccessContext, userId: string): Promise<void> {
    // The caller is OWNER, required by Controller; repeat live reads in a
    // serializable transaction to guard against stale client readiness.
    await this.prisma.$transaction(async tx => {
      const state = await tx.restaurantSetup.findUnique({ where: { restaurantId: access.restaurantId } });
      if (!state) throw error('SETUP_NOT_ENROLLED', 'Start the setup guide first.');
      if (state.completedAt) return; // safe retry, never changes the original confirmer
      const snap = await this.snapshot(tx, access.restaurantId);
      const rows = setupRows(access.restaurantId, snap, state, access.permissions);
      if (!canFinish(rows)) throw error('SETUP_NOT_READY', 'Review all applicable setup steps before completing.');
      await tx.restaurantSetup.update({
        where: { restaurantId: access.restaurantId },
        data: { completedAt: new Date(), completedByUserId: userId },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
