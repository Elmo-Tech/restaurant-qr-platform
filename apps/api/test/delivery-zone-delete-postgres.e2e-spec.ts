import {
  assertSandboxIdentity,
  assertSandboxUrl,
  SANDBOX_URL,
} from './support/sandbox-guard';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './../src/generated/prisma/client';
import { DeliveryZonesController } from './../src/delivery/delivery-zones.controller';
import { DeliveryZonesService } from './../src/delivery/delivery-zones.service';
import type { RestaurantAuthorizedRequest } from './../src/auth/guard/restaurant-authorized-request';

/**
 * Delivery Zone deletion policy (Product Owner correction B-2, 2026-11-22) on REAL PostgreSQL: a zone targeted by a
 * promotion (`promotion_delivery_zones`, ON DELETE RESTRICT, migration `20261128100000_unified_promotions`) is refused
 * with its own stable code instead of being reported as "has orders". Four cases: Orders only, promotions only, both
 * (Orders take precedence), no reference (deleted). The race path (reference created between the check and the
 * delete) is exercised against the real foreign keys to pin the P2003 constraint-name shape the service relies on.
 *
 * Isolation: see `support/sandbox-guard.ts` (sandbox-only, identity-checked, skipped without
 * TABLE_SESSION_IT_DATABASE_URL). The rows this suite creates are removed again in `afterAll`.
 */

const describeSandbox = SANDBOX_URL ? describe : describe.skip;

describeSandbox(
  'Delivery zone deletion vs orders and promotions (real PostgreSQL)',
  () => {
    let prisma: PrismaClient;
    let service: DeliveryZonesService;
    let controller: DeliveryZonesController;
    const restaurantId = randomUUID();
    const branchId = randomUUID();
    const qrCodeId = randomUUID();

    beforeAll(async () => {
      assertSandboxUrl(SANDBOX_URL as string);
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: SANDBOX_URL as string }),
      });
      await prisma.$connect();
      try {
        await assertSandboxIdentity(prisma);
      } catch (error) {
        await prisma.$disconnect();
        throw error;
      }
      service = new DeliveryZonesService(prisma as never);
      controller = new DeliveryZonesController(service);

      await prisma.$executeRaw`INSERT INTO restaurants (id, public_id, name, status, default_locale, currency_code, updated_at)
      VALUES (${restaurantId}::uuid, ${`it-zone-${randomUUID()}`}, 'IT zone delete', 'ACTIVE', 'en', 'EGP', now())`;
      await prisma.$executeRaw`INSERT INTO branches (id, public_id, restaurant_id, name, status, timezone, updated_at)
      VALUES (${branchId}::uuid, ${`it-zone-br-${randomUUID()}`}, ${restaurantId}::uuid, 'Main', 'ACTIVE', 'Africa/Cairo', now())`;
      await prisma.$executeRaw`INSERT INTO qr_codes (id, public_code, restaurant_id, type, status, updated_at)
      VALUES (${qrCodeId}::uuid, ${`it-zone-qr-${randomUUID()}`}, ${restaurantId}::uuid, 'GENERIC', 'ACTIVE', now())`;
    });

    afterAll(async () => {
      if (!prisma) return;
      await prisma.$executeRaw`DELETE FROM promotion_delivery_zones WHERE restaurant_id = ${restaurantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM promotions WHERE restaurant_id = ${restaurantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM orders WHERE restaurant_id = ${restaurantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM delivery_zones WHERE restaurant_id = ${restaurantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM qr_codes WHERE restaurant_id = ${restaurantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM branches WHERE restaurant_id = ${restaurantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM restaurants WHERE id = ${restaurantId}::uuid`;
      await prisma.$disconnect();
    });

    async function seedZone(): Promise<string> {
      const zone = await service.createZone({
        restaurantId,
        branchId,
        name: `Zone ${randomUUID().slice(0, 8)}`,
        deliveryFee: '30.00',
        minimumOrder: '0.00',
        status: 'ACTIVE',
      });
      if (zone.outcome !== 'created')
        throw new Error(`zone not created: ${zone.outcome}`);
      return zone.data.id;
    }

    async function addOrder(zoneId: string): Promise<void> {
      await prisma.$executeRaw`INSERT INTO orders (id, restaurant_id, branch_id, qr_code_id, client_request_id, status, type,
        currency_code, total_amount, subtotal_amount, delivery_fee_amount, delivery_zone_id, updated_at)
      VALUES (${randomUUID()}::uuid, ${restaurantId}::uuid, ${branchId}::uuid, ${qrCodeId}::uuid, ${randomUUID()}::uuid,
        'PENDING', 'DELIVERY', 'EGP', 130, 100, 30, ${zoneId}::uuid, now())`;
    }

    async function addPromotionTarget(zoneId: string): Promise<void> {
      const promotionId = randomUUID();
      await prisma.$executeRaw`INSERT INTO promotions (id, restaurant_id, internal_name, scope, discount_type, value, status, updated_at)
      VALUES (${promotionId}::uuid, ${restaurantId}::uuid, 'IT free delivery', 'DELIVERY', 'PERCENTAGE', 100, 'ACTIVE', now())`;
      await prisma.$executeRaw`INSERT INTO promotion_delivery_zones (promotion_id, delivery_zone_id, restaurant_id)
      VALUES (${promotionId}::uuid, ${zoneId}::uuid, ${restaurantId}::uuid)`;
    }

    async function zoneExists(zoneId: string): Promise<boolean> {
      return (await prisma.deliveryZone.count({ where: { id: zoneId } })) === 1;
    }

    async function canDelete(zoneId: string): Promise<boolean | undefined> {
      const branches = await service.listDeliveryBranches({
        restaurantId,
        membershipId: randomUUID(),
        allBranches: true,
      });
      return branches
        .flatMap((branch) => branch.zones)
        .find((zone) => zone.id === zoneId)?.canDelete;
    }

    async function conflictCodeOf(zoneId: string): Promise<string | undefined> {
      const request = {
        restaurantAccess: { restaurantId },
      } as unknown as RestaurantAuthorizedRequest;
      try {
        await controller.deleteZone(zoneId, request);
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        return (
          (error as ConflictException).getResponse() as {
            error: { code: string };
          }
        ).error.code;
      }
      return undefined;
    }

    it('a zone referenced by Orders is refused with DELIVERY_ZONE_HAS_ORDERS and kept', async () => {
      const zoneId = await seedZone();
      await addOrder(zoneId);

      expect(await canDelete(zoneId)).toBe(false);
      expect(await service.deleteZone({ restaurantId, zoneId })).toEqual({
        outcome: 'hasOrders',
      });
      expect(await conflictCodeOf(zoneId)).toBe('DELIVERY_ZONE_HAS_ORDERS');
      expect(await zoneExists(zoneId)).toBe(true);
    });

    it('a zone targeted by a promotion is refused with DELIVERY_ZONE_USED_BY_PROMOTIONS (never "has orders") and kept', async () => {
      const zoneId = await seedZone();
      await addPromotionTarget(zoneId);

      expect(await canDelete(zoneId)).toBe(false);
      expect(await service.deleteZone({ restaurantId, zoneId })).toEqual({
        outcome: 'usedByPromotions',
      });
      expect(await conflictCodeOf(zoneId)).toBe(
        'DELIVERY_ZONE_USED_BY_PROMOTIONS',
      );
      expect(await zoneExists(zoneId)).toBe(true);
      expect(
        await prisma.promotionDeliveryZone.count({
          where: { deliveryZoneId: zoneId },
        }),
      ).toBe(1);
    });

    it('a zone with both Orders and promotion targets is refused with DELIVERY_ZONE_HAS_ORDERS (Orders take precedence)', async () => {
      const zoneId = await seedZone();
      await addOrder(zoneId);
      await addPromotionTarget(zoneId);

      expect(await canDelete(zoneId)).toBe(false);
      expect(await service.deleteZone({ restaurantId, zoneId })).toEqual({
        outcome: 'hasOrders',
      });
      expect(await conflictCodeOf(zoneId)).toBe('DELIVERY_ZONE_HAS_ORDERS');
      expect(await zoneExists(zoneId)).toBe(true);
    });

    it('a zone with no reference is deleted (with its translations)', async () => {
      const zoneId = await seedZone();

      expect(await canDelete(zoneId)).toBe(true);
      expect(await conflictCodeOf(zoneId)).toBeUndefined();
      expect(await zoneExists(zoneId)).toBe(false);
      expect(
        await prisma.deliveryZoneTranslation.count({
          where: { deliveryZoneId: zoneId },
        }),
      ).toBe(0);
    });

    it('the real foreign-key refusals carry the constraint name the service maps (race path)', async () => {
      const promotionZone = await seedZone();
      await addPromotionTarget(promotionZone);
      const orderZone = await seedZone();
      await addOrder(orderZone);

      for (const [zoneId, constraint] of [
        [promotionZone, 'promotion_delivery_zones_zone_scope_fkey'],
        [orderZone, 'orders_delivery_zone_id_fkey'],
      ] as const) {
        const error = await prisma.deliveryZone
          .delete({ where: { id: zoneId } })
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
        const known = error as Prisma.PrismaClientKnownRequestError;
        expect(known.code).toBe('P2003');
        expect(
          (
            known.meta as {
              driverAdapterError?: {
                cause?: { constraint?: { index?: string } };
              };
            }
          )?.driverAdapterError?.cause?.constraint?.index,
        ).toBe(constraint);
      }

      // A service whose pre-check saw no reference (the reference appeared just after it) still maps the database
      // refusal to the right outcome.
      const racing = (zoneId: string) =>
        new DeliveryZonesService({
          deliveryZone: {
            findFirst: () =>
              Promise.resolve({
                id: zoneId,
                _count: { orders: 0, promotionLinks: 0 },
              }),
            delete: (args: Prisma.DeliveryZoneDeleteArgs) =>
              prisma.deliveryZone.delete(args),
          },
        } as never);
      expect(
        await racing(promotionZone).deleteZone({
          restaurantId,
          zoneId: promotionZone,
        }),
      ).toEqual({
        outcome: 'usedByPromotions',
      });
      expect(
        await racing(orderZone).deleteZone({ restaurantId, zoneId: orderZone }),
      ).toEqual({ outcome: 'hasOrders' });
      expect(await zoneExists(promotionZone)).toBe(true);
      expect(await zoneExists(orderZone)).toBe(true);
    });
  },
);
