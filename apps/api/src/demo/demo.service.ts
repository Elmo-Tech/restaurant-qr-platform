import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordHasherService } from '../auth/password/password-hasher.service';
import { AuthSessionService } from '../auth/session/auth-session.service';
import { createBranchPublicId } from '../branches/branch-public-id';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import { resolveFeatures } from '../entitlements/features';
import {
  allowedTemplates,
  type MenuTemplateKey,
} from '../entitlements/templates';
import { Prisma } from '../generated/prisma/client';
import type { MenuTemplate } from '../generated/prisma/client';
import { createProductPublicId } from '../menu/product-public-id';
import {
  provisionRestaurant,
  type ProvisioningPrisma,
} from '../provisioning/provision-restaurant';
import { createQrPublicCode } from '../qr/qr-public-code';
import { resolveUploadDir } from '../storage/upload-dir';
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_MAX_HOURS,
  DEMO_MIN_HOURS,
} from './demo-constants';
import { NotADemoError, purgeDemoRestaurant } from './demo-purge';
import {
  installTemplateImages,
  loadDemoTemplate,
  type DemoTemplate,
} from './demo-template';

export interface DemoView {
  id: string;
  publicId: string;
  label: string;
  status: 'ACTIVE' | 'LOCKED';
  createdAt: string;
  expiresAt: string;
  /** When the demo is removed for good (the expiry plus the grace period). */
  removedAt: string;
  opened: boolean;
  lastOpenedAt: string | null;
  openCount: number;
  /** The Package the demo shows the features of; null = every feature. */
  package: { id: string; name: string; nameEn: string } | null;
}

export type CreateDemoResult =
  | { outcome: 'created'; demo: DemoView; link: string }
  | { outcome: 'invalidInput'; problems: string[] }
  | { outcome: 'limitReached'; max: number };

export type DemoActionResult<T = DemoView> =
  | { outcome: 'ok'; demo: T }
  | { outcome: 'notFound' }
  | { outcome: 'invalidInput'; problems: string[] };

export type EnterDemoResult =
  | {
      outcome: 'entered';
      sessionToken: string;
      sessionExpiresAt: Date;
      restaurantId: string;
    }
  | { outcome: 'invalid' };

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const HOUR_MS = 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasherService,
    private readonly sessions: AuthSessionService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private graceMs(): number {
    return (
      this.config.get('DEMO_PURGE_GRACE_MINUTES', { infer: true }) * 60 * 1000
    );
  }

  private view(row: {
    id: string;
    publicId: string;
    demoLabel: string | null;
    status: string;
    createdAt: Date;
    demoExpiresAt: Date | null;
    demoAccessLinks: { lastUsedAt: Date | null; useCount: number }[];
    package: { id: string; name: string; nameEn: string } | null;
  }): DemoView {
    const expires = row.demoExpiresAt as Date;
    const opens = row.demoAccessLinks.reduce((n, l) => n + l.useCount, 0);
    const last = row.demoAccessLinks
      .map((l) => l.lastUsedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      id: row.id,
      publicId: row.publicId,
      label: row.demoLabel ?? '',
      status: row.status === 'ACTIVE' ? 'ACTIVE' : 'LOCKED',
      createdAt: row.createdAt.toISOString(),
      expiresAt: expires.toISOString(),
      removedAt: new Date(expires.getTime() + this.graceMs()).toISOString(),
      opened: opens > 0,
      lastOpenedAt: last ? last.toISOString() : null,
      openCount: opens,
      package: row.package,
    };
  }

  private readonly select = {
    id: true,
    publicId: true,
    demoLabel: true,
    status: true,
    createdAt: true,
    demoExpiresAt: true,
    demoAccessLinks: { select: { lastUsedAt: true, useCount: true } },
    package: { select: { id: true, name: true, nameEn: true } },
  } as const;

  async list(): Promise<DemoView[]> {
    const rows = await this.prisma.restaurant.findMany({
      where: { isDemo: true },
      orderBy: { createdAt: 'desc' },
      select: this.select,
    });
    return rows.map((row) => this.view(row));
  }

  /** The link a prospect opens. Shown once: only a hash of the secret is stored. */
  private async issueLink(restaurantId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.demoAccessLink.deleteMany({ where: { restaurantId } }),
      this.prisma.demoAccessLink.create({
        data: { restaurantId, tokenHash: sha256(token) },
      }),
    ]);
    const base = this.config
      .get('CORS_ORIGIN', { infer: true })
      .replace(/\/+$/, '');
    return `${base}/demo/${token}`;
  }

  /**
   * The Package a demo shows, with the menu designs it allows. The demo follows the platform's own rules
   * (DEC-043, DEC-046, DEC-051): a feature the Package does not include is hidden, a design it does not allow is locked.
   */
  private async loadPackage(
    packageId: string,
  ): Promise<
    | { ok: true; id: string; templates: MenuTemplateKey[] }
    | { ok: false; problem: string }
  > {
    if (!UUID.test(packageId))
      return { ok: false, problem: 'the package was not found' };
    const pkg = await this.prisma.package.findUnique({
      where: { id: packageId },
      select: {
        id: true,
        status: true,
        allTemplates: true,
        allStandardTemplates: true,
        features: { select: { feature: true } },
        templates: { select: { template: true } },
      },
    });
    if (!pkg) return { ok: false, problem: 'the package was not found' };
    if (pkg.status === 'ARCHIVED')
      return { ok: false, problem: 'the package is archived' };
    const features = resolveFeatures(
      [],
      pkg.features.map((f) => f.feature),
    );
    return {
      ok: true,
      id: pkg.id,
      templates: allowedTemplates({
        featureEnabled: features.MENU_TEMPLATES,
        rule: {
          includesFeature: features.MENU_TEMPLATES,
          all: pkg.allTemplates,
          allStandard: pkg.allStandardTemplates,
          selected: pkg.templates.map((t) => t.template),
        },
      }),
    };
  }

  async create(input: {
    label: string;
    hours: number;
    packageId?: string | null;
  }): Promise<CreateDemoResult> {
    const label = input.label.replace(/\s+/g, ' ').trim();
    const problems: string[] = [];
    if (label.length < 1 || label.length > 80)
      problems.push('label must be 1 to 80 characters');
    if (
      !Number.isInteger(input.hours) ||
      input.hours < DEMO_MIN_HOURS ||
      input.hours > DEMO_MAX_HOURS
    )
      problems.push(
        `hours must be a whole number from ${DEMO_MIN_HOURS} to ${DEMO_MAX_HOURS}`,
      );
    let pkg: { id: string; templates: MenuTemplateKey[] } | null = null;
    if (input.packageId) {
      const loaded = await this.loadPackage(input.packageId);
      if (loaded.ok) pkg = loaded;
      else problems.push(loaded.problem);
    }
    if (problems.length > 0) return { outcome: 'invalidInput', problems };

    const max = this.config.get('DEMO_MAX_ACTIVE', { infer: true });
    if (
      (await this.prisma.restaurant.count({ where: { isDemo: true } })) >= max
    ) {
      return { outcome: 'limitReached', max };
    }

    const template = await loadDemoTemplate();
    const uploadDir = resolveUploadDir(
      this.config.get('UPLOAD_LOCAL_DIR', { infer: true }),
    );
    const assets = await installTemplateImages(template, uploadDir);

    // The owner of a demo is a throw-away identity: an address that can never receive mail and a password nobody knows.
    const provisioned = await provisionRestaurant(
      this.prisma as unknown as ProvisioningPrisma,
      this.hasher,
      {
        restaurantName: template.restaurant.name,
        ownerEmail: `demo-${randomUUID()}@${DEMO_EMAIL_DOMAIN}`,
        ownerPassword: randomBytes(24).toString('base64url'),
        branchName: template.branches[0].names.ar,
        defaultLocale: template.restaurant.defaultLocale,
        currencyCode: template.restaurant.currencyCode,
        timezone: template.branches[0].timezone,
      },
    );
    if (provisioned.outcome !== 'provisioned') {
      return {
        outcome: 'invalidInput',
        problems: ['could not create the demo restaurant'],
      };
    }
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { publicId: provisioned.restaurantPublicId },
      select: { id: true },
    });

    try {
      const expiresAt = new Date(Date.now() + input.hours * HOUR_MS);
      await this.prisma.$transaction(
        (tx) =>
          this.fillFromTemplate(tx, restaurant.id, template, assets, {
            label,
            expiresAt,
            packageId: pkg?.id ?? null,
            // The template's design when the Package allows it, otherwise the one design every Package has.
            menuTemplate:
              !pkg ||
              pkg.templates.includes(
                template.restaurant.menuTemplate as MenuTemplateKey,
              )
                ? (template.restaurant.menuTemplate as MenuTemplate)
                : 'CLASSIC',
          }),
        { timeout: 60_000, maxWait: 10_000 },
      );
    } catch (error) {
      // Never leave a half-built demo behind.
      this.logger.error(`Demo creation failed, removing it: ${String(error)}`);
      await this.purge(restaurant.id).catch((purgeError) =>
        this.logger.error(
          `Cleanup of a failed demo also failed: ${String(purgeError)}`,
        ),
      );
      throw error;
    }

    const link = await this.issueLink(restaurant.id);
    const row = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurant.id },
      select: this.select,
    });
    return { outcome: 'created', demo: this.view(row), link };
  }

  /** Everything a demo shows: settings, two branches with tables and delivery zones, the bilingual menu, extras. */
  private async fillFromTemplate(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    template: DemoTemplate,
    assets: Map<string, string>,
    demo: {
      label: string;
      expiresAt: Date;
      packageId: string | null;
      menuTemplate: MenuTemplate;
    },
  ): Promise<void> {
    const r = template.restaurant;
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        isDemo: true,
        demoExpiresAt: demo.expiresAt,
        demoLabel: demo.label,
        packageId: demo.packageId,
        logoAssetPath: assets.get(r.logo) ?? null,
        coverAssetPath: assets.get(r.cover) ?? null,
        countryCode: r.countryCode,
        menuTemplate: demo.menuTemplate,
        suggestionsMode: r.suggestionsMode,
        pickupEnabled: r.pickupEnabled,
        deliveryEnabled: r.deliveryEnabled,
        tableOrderingEnabled: r.tableOrderingEnabled,
        whatsappOrderingEnabled: r.whatsappOrderingEnabled,
      },
    });
    // A demo starts fully set up: the optional setup guide is for real new accounts.
    await tx.restaurantSetup.deleteMany({ where: { restaurantId } });

    // ---- branches, tables, delivery zones
    const firstBranch = await tx.branch.findFirstOrThrow({
      where: { restaurantId },
      select: { id: true },
    });
    for (const [index, b] of template.branches.entries()) {
      const data = {
        name: b.names.ar,
        phone: b.phone,
        address: b.address.ar,
        hoursMode: 'ALWAYS_OPEN' as const,
      };
      const branch =
        index === 0
          ? await tx.branch.update({
              where: { id: firstBranch.id },
              data,
              select: { id: true },
            })
          : await tx.branch.create({
              data: {
                ...data,
                publicId: createBranchPublicId(),
                restaurantId,
                status: 'ACTIVE',
                timezone: b.timezone,
              },
              select: { id: true },
            });
      await tx.branchTranslation.createMany({
        data: (['ar', 'en'] as const).map((locale) => ({
          branchId: branch.id,
          locale,
          name: b.names[locale],
        })),
      });
      for (let number = 1; number <= b.tables; number += 1) {
        const table = await tx.table.create({
          data: {
            restaurantId,
            branchId: branch.id,
            tableNumber: String(number),
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        await tx.qrCode.create({
          data: {
            publicCode: createQrPublicCode(),
            restaurantId,
            branchId: branch.id,
            tableId: table.id,
            type: 'TABLE',
            status: 'ACTIVE',
          },
        });
      }
      for (const [order, zone] of b.zones.entries()) {
        await tx.deliveryZone.create({
          data: {
            restaurantId,
            branchId: branch.id,
            name: zone.names.ar,
            deliveryFee: new Prisma.Decimal(zone.fee),
            minimumOrder: new Prisma.Decimal(zone.minimum),
            status: 'ACTIVE',
            displayOrder: order,
            translations: {
              create: (['ar', 'en'] as const).map((locale) => ({
                locale,
                name: zone.names[locale],
              })),
            },
          },
        });
      }
    }

    // ---- the menu
    const menu = await tx.menu.create({
      data: {
        restaurantId,
        nameInternal: template.menu.nameInternal,
        status: 'ACTIVE',
        displayOrder: 0,
        isPrimary: true,
        translations: {
          create: (['ar', 'en'] as const).map((locale) => ({
            locale,
            name: template.menu.names[locale],
          })),
        },
      },
      select: { id: true },
    });
    const productIds = new Map<string, string>();
    for (const [
      categoryOrder,
      category,
    ] of template.menu.categories.entries()) {
      const createdCategory = await tx.category.create({
        data: {
          restaurantId,
          menuId: menu.id,
          status: 'ACTIVE',
          displayOrder: categoryOrder,
          imageAssetPath: assets.get(category.image) ?? null,
          translations: {
            create: (['ar', 'en'] as const).map((locale) => ({
              locale,
              name: category.names[locale],
            })),
          },
        },
        select: { id: true },
      });
      for (const [productOrder, p] of category.products.entries()) {
        const prices = [
          new Prisma.Decimal(p.price),
          ...(p.variants ?? []).map((v) => new Prisma.Decimal(v.price)),
        ];
        const basePrice = p.variants?.length
          ? Prisma.Decimal.min(
              ...(p.variants ?? []).map((v) => new Prisma.Decimal(v.price)),
            )
          : prices[0];
        const product = await tx.product.create({
          data: {
            publicId: createProductPublicId(),
            restaurantId,
            categoryId: createdCategory.id,
            status: 'ACTIVE',
            availability: 'AVAILABLE',
            basePrice,
            primaryImageAssetPath: assets.get(p.image) ?? null,
            displayOrder: productOrder,
            allowCustomerNotes: true,
            featured: p.featured === true,
            ...(p.discount
              ? {
                  discountEnabled: true,
                  discountType: p.discount.type,
                  discountValue: new Prisma.Decimal(p.discount.value),
                }
              : {}),
            translations: {
              create: (['ar', 'en'] as const).map((locale) => ({
                locale,
                name: p.names[locale],
                description: p.descriptions[locale],
              })),
            },
          },
          select: { id: true },
        });
        productIds.set(p.key, product.id);
        for (const [variantOrder, v] of (p.variants ?? []).entries()) {
          await tx.productVariant.create({
            data: {
              restaurantId,
              productId: product.id,
              status: 'ACTIVE',
              price: new Prisma.Decimal(v.price),
              displayOrder: variantOrder,
              isDefault: v.default,
              translations: {
                create: (['ar', 'en'] as const).map((locale) => ({
                  locale,
                  name: v.names[locale],
                })),
              },
            },
          });
        }
        for (const [groupOrder, g] of (p.modifierGroups ?? []).entries()) {
          const group = await tx.modifierGroup.create({
            data: {
              restaurantId,
              productId: product.id,
              status: 'ACTIVE',
              minimumSelections: g.min,
              maximumSelections: g.max,
              displayOrder: groupOrder,
              translations: {
                create: (['ar', 'en'] as const).map((locale) => ({
                  locale,
                  name: g.names[locale],
                  helperText: g.helper[locale],
                })),
              },
            },
            select: { id: true },
          });
          for (const [optionOrder, o] of g.options.entries()) {
            await tx.modifierOption.create({
              data: {
                restaurantId,
                modifierGroupId: group.id,
                status: 'ACTIVE',
                priceAdjustment: new Prisma.Decimal(o.price),
                displayOrder: optionOrder,
                priceIsOverridden: false,
                translations: {
                  create: (['ar', 'en'] as const).map((locale) => ({
                    locale,
                    name: o.names[locale],
                  })),
                },
              },
            });
          }
        }
      }
    }

    // ---- announcements and "goes well with" suggestions
    for (const a of template.announcements) {
      await tx.restaurantAnnouncement.create({
        data: {
          restaurantId,
          status: 'ACTIVE',
          style: a.style,
          translations: {
            create: (['ar', 'en'] as const).map((locale) => ({
              locale,
              text: a.texts[locale],
            })),
          },
        },
      });
    }
    for (const s of template.suggestions) {
      for (const [position, key] of s.suggested.entries()) {
        await tx.productSuggestion.create({
          data: {
            restaurantId,
            productId: productIds.get(s.product) as string,
            suggestedProductId: productIds.get(key) as string,
            position,
          },
        });
      }
    }
  }

  /** The prospect opens the secret link: a session for the demo's owner, valid until the demo ends. */
  async enter(token: string): Promise<EnterDemoResult> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { outcome: 'invalid' };
    const link = await this.prisma.demoAccessLink.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        id: true,
        restaurant: {
          select: { id: true, isDemo: true, status: true, demoExpiresAt: true },
        },
      },
    });
    const restaurant = link?.restaurant;
    if (
      !link ||
      !restaurant?.isDemo ||
      restaurant.status !== 'ACTIVE' ||
      !restaurant.demoExpiresAt ||
      restaurant.demoExpiresAt.getTime() <= Date.now()
    ) {
      return { outcome: 'invalid' };
    }
    const owner = await this.prisma.restaurantMembership.findFirst({
      where: { restaurantId: restaurant.id, role: 'OWNER', status: 'ACTIVE' },
      select: { userId: true },
    });
    if (!owner) return { outcome: 'invalid' };

    const created = await this.sessions.createSession(owner.userId);
    // The session never outlives the demo.
    const expiresAt = new Date(
      Math.min(created.expiresAt.getTime(), restaurant.demoExpiresAt.getTime()),
    );
    await this.prisma.authSession.update({
      where: { id: created.sessionId },
      data: { expiresAt },
    });
    await this.prisma.demoAccessLink.update({
      where: { id: link.id },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    });
    return {
      outcome: 'entered',
      sessionToken: created.token,
      sessionExpiresAt: expiresAt,
      restaurantId: restaurant.id,
    };
  }

  async extend(id: string, hours: number): Promise<DemoActionResult> {
    if (
      !Number.isInteger(hours) ||
      hours < DEMO_MIN_HOURS ||
      hours > DEMO_MAX_HOURS
    ) {
      return { outcome: 'invalidInput', problems: ['hours out of range'] };
    }
    const demo = await this.demoRow(id);
    if (!demo) return { outcome: 'notFound' };
    const base = Math.max(demo.demoExpiresAt?.getTime() ?? 0, Date.now());
    const row = await this.prisma.restaurant.update({
      where: { id },
      // A locked demo (expired, not yet removed) opens again.
      data: {
        demoExpiresAt: new Date(base + hours * HOUR_MS),
        status: 'ACTIVE',
      },
      select: this.select,
    });
    return { outcome: 'ok', demo: this.view(row) };
  }

  async newLink(
    id: string,
  ): Promise<DemoActionResult<{ demo: DemoView; link: string }>> {
    const demo = await this.demoRow(id);
    if (!demo) return { outcome: 'notFound' };
    const link = await this.issueLink(id);
    const row = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id },
      select: this.select,
    });
    return { outcome: 'ok', demo: { demo: this.view(row), link } };
  }

  /** Locks the demo (no sign-in, no guest menu) and ends every session of its users. */
  async lock(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.restaurant.updateMany({
        where: { id, isDemo: true },
        data: { status: 'SUSPENDED' },
      }),
      this.prisma.authSession.deleteMany({
        where: {
          user: {
            memberships: { some: { restaurantId: id } },
            emailNormalized: { endsWith: `@${DEMO_EMAIL_DOMAIN}` },
          },
        },
      }),
    ]);
  }

  async remove(id: string): Promise<DemoActionResult<{ removed: true }>> {
    const demo = await this.demoRow(id);
    if (!demo) return { outcome: 'notFound' };
    await this.purge(id);
    return { outcome: 'ok', demo: { removed: true } };
  }

  /** The only way a demo is deleted: one transaction, refused for anything that is not a demo. */
  async purge(id: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        // One purge at a time even with several API instances.
        const [{ locked }] = await tx.$queryRawUnsafe<{ locked: boolean }[]>(
          `SELECT pg_try_advisory_xact_lock(hashtext('demo-purge')) AS locked`,
        );
        if (!locked) return;
        try {
          const result = await purgeDemoRestaurant(tx, id);
          this.logger.log(
            `Removed demo ${id}: ${result.rowsDeleted} rows in ${result.tablesTouched} tables`,
          );
        } catch (error) {
          if (error instanceof NotADemoError)
            this.logger.error(`Refused to purge ${id}: not a demo`);
          throw error;
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  private demoRow(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve(null);
    return this.prisma.restaurant.findFirst({
      where: { id, isDemo: true },
      select: { id: true, demoExpiresAt: true },
    });
  }

  /** One pass of the expiry job: lock what has ended, remove what is past its grace period. */
  async sweep(now = new Date()): Promise<{ locked: number; removed: number }> {
    const grace = this.graceMs();
    const ended = await this.prisma.restaurant.findMany({
      where: { isDemo: true, demoExpiresAt: { lte: now } },
      select: { id: true, status: true, demoExpiresAt: true },
    });
    let locked = 0;
    let removed = 0;
    for (const demo of ended) {
      const expires = (demo.demoExpiresAt as Date).getTime();
      if (expires + grace <= now.getTime()) {
        await this.purge(demo.id);
        removed += 1;
      } else if (demo.status === 'ACTIVE') {
        await this.lock(demo.id);
        locked += 1;
      }
    }
    return { locked, removed };
  }
}
