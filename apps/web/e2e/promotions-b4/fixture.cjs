/* eslint-disable @typescript-eslint/no-require-imports -- The isolated runner loads compiled Nest/Prisma from a verified build directory. */
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { PrismaPg } = require('@prisma/adapter-pg');

const token = process.env.B4_DB_TOKEN;
const dbPort = Number(process.env.B4_PG_PORT);
const dbUrl = process.env.B4_DB_URL;
if (!/^[0-9a-f]{36}$/.test(token ?? '') || !Number.isInteger(dbPort) || dbPort < 1024 || dbPort > 65535 ||
    dbUrl !== `postgresql://b4_runner:${token}@127.0.0.1:${dbPort}/promotions_b4` || !process.env.B4_API_BUILD) {
  throw new Error('Refusing fixture access without the isolated B4 runner identity.');
}
const { PrismaClient } = require(path.join(process.env.B4_API_BUILD, 'generated/prisma/client.js'));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });

async function assertDisposableDatabase() {
  const [identity] = await prisma.$queryRaw`
    SELECT current_database() AS db, current_user AS owner,
           current_setting('server_version_num')::integer AS version,
           shobj_description(oid, 'pg_database') AS marker
    FROM pg_database WHERE datname = current_database()`;
  if (identity.db !== 'promotions_b4' || identity.owner !== 'b4_runner' || identity.marker !== `b4:${token}` ||
      identity.version < 180000 || identity.version >= 190000) {
    throw new Error('Fixture access refused: database identity does not match this B4 PostgreSQL 18 run.');
  }
}

const translated = (field, en, ar) => [{ locale: 'en', [field]: en }, { locale: 'ar', [field]: ar }];

async function seedWorld({ secondPrice = '100.00', minimumOrder = '0.00', promotions = true, whatsapp = false, brew = false, defaultLocale = 'en' } = {}) {
  const unique = randomUUID();
  const { id: restaurantId } = await prisma.restaurant.create({
    data: {
      publicId: `it-b4-${unique}`, name: 'B4 Nile Kitchen', status: 'ACTIVE',
      defaultLocale, currencyCode: 'EGP', countryCode: 'EG',
      whatsappOrderingEnabled: whatsapp, whatsappNumber: whatsapp ? '+201012345678' : null,
      ...(brew ? { exclusiveDesign: { create: { baseTemplate: 'BREW', status: 'ACTIVE_BASE' } } } : {}),
      locales: { create: ['en', 'ar'].map(locale => ({ locale, isActive: true })) },
      features: { create: [
        { feature: 'PROMOTIONS', enabled: promotions },
        { feature: 'OFFERS', enabled: true },
      ] },
    },
  });
  const { id: branchId } = await prisma.branch.create({
    data: { restaurantId, publicId: `it-b4-branch-${unique}`, name: 'Nile Branch', status: 'ACTIVE', timezone: 'Africa/Cairo' },
  });
  const { id: tableId } = await prisma.table.create({ data: { restaurantId, branchId, tableNumber: '1', status: 'ACTIVE' } });
  const genericQr = `it-b4-generic-${unique}`;
  const tableQr = `it-b4-table-${unique}`;
  await prisma.qrCode.createMany({ data: [
    { restaurantId, publicCode: genericQr, type: 'GENERIC', status: 'ACTIVE' },
    { restaurantId, branchId, tableId, publicCode: tableQr, type: 'TABLE', status: 'ACTIVE' },
  ] });
  const { id: zoneId } = await prisma.deliveryZone.create({
    data: { restaurantId, branchId, name: 'Nile Zone', status: 'ACTIVE', displayOrder: 0, deliveryFee: '30.00', minimumOrder },
  });
  const { id: menuId } = await prisma.menu.create({
    data: {
      restaurantId, nameInternal: 'Nile Menu', status: 'ACTIVE', displayOrder: 0, isPrimary: true,
      translations: { create: translated('name', 'Nile Menu', 'قائمة النيل') },
    },
  });
  const products = [];
  for (const [index, { name, nameAr, category, categoryAr, basePrice }] of [
    { name: 'B4 Kofta', nameAr: 'كفتة B4', category: 'Grill', categoryAr: 'مشويات', basePrice: '100.00' },
    { name: 'B4 Rice', nameAr: 'أرز B4', category: 'Sides', categoryAr: 'أطباق جانبية', basePrice: secondPrice },
  ].entries()) {
    const { id: categoryId } = await prisma.category.create({
      data: {
        restaurantId, menuId, status: 'ACTIVE', displayOrder: index,
        translations: { create: translated('name', category, categoryAr) },
      },
    });
    const { id } = await prisma.product.create({
      data: {
        publicId: `it-b4-product-${index}-${unique}`, restaurantId, categoryId, status: 'ACTIVE',
        availability: 'AVAILABLE', basePrice, displayOrder: index, allowCustomerNotes: false, featured: false,
        discountType: 'PERCENTAGE', discountValue: '20.00', discountEnabled: true,
        translations: { create: translated('name', name, nameAr) },
      },
    });
    products.push({ id, categoryId, name, nameAr });
  }
  return { restaurantId, branchId, tableId, genericQr, tableQr, zoneId, menuId, products, unique };
}

async function addPromotion(w, { scope, discountType = 'FIXED_AMOUNT', value, title, titleAr, priority, minimumSubtotal }) {
  const { restaurantId } = w;
  const row = await prisma.promotion.create({ data: {
    restaurantId, scope, discountType, value, priority, status: 'ACTIVE', internalName: `Internal ${title}`,
    minimumSubtotal, translations: { create: translated('title', title, titleAr ?? title) },
  } });
  if (scope === 'CATEGORY') {
    await prisma.promotionCategory.create({ data: { promotionId: row.id, restaurantId, categoryId: w.products[0].categoryId } });
  } else if (scope === 'DELIVERY') {
    await prisma.promotionDeliveryZone.create({ data: { promotionId: row.id, restaurantId, deliveryZoneId: w.zoneId } });
  } else if (scope === 'MENU') {
    await prisma.promotionMenu.create({ data: { promotionId: row.id, restaurantId, menuId: w.menuId } });
  }
  return row;
}

async function addOffer(w) {
  const { restaurantId } = w;
  return prisma.offer.create({ data: {
    restaurantId, status: 'ACTIVE', price: '120.00',
    translations: { create: translated('name', 'B4 Bundle', 'وجبة B4') },
    slots: { create: {
      restaurantId, kind: 'FIXED', requiredCount: 0,
      translations: { create: translated('title', 'Included', 'يشمل') },
      options: { create: { restaurantId, productId: w.products[1].id } },
    } },
  } });
}

async function createOwner(w) {
  const { PasswordHasherService } = require(path.join(process.env.B4_API_BUILD, 'auth/password/password-hasher.service.js'));
  const { starterRoleData } = require(path.join(process.env.B4_API_BUILD, 'auth/permission/starter-roles.js'));
  const email = `it-b4-${w.unique}@example.test`;
  const password = randomUUID();
  const { id: userId } = await prisma.user.create({ data: {
    email, emailNormalized: email, status: 'ACTIVE', passwordHash: await new PasswordHasherService().hashPassword(password),
  } });
  const { id: roleId } = await prisma.restaurantRole.create({ data: { restaurantId: w.restaurantId, ...starterRoleData('OWNER') } });
  await prisma.restaurantMembership.create({ data: {
    restaurantId: w.restaurantId, userId, roleId, role: 'OWNER', status: 'ACTIVE', allBranches: true,
  } });
  return { email, password };
}

const orderCount = w => prisma.order.count({ where: { restaurantId: w.restaurantId } });
const storedOrder = (w, id) => prisma.order.findFirstOrThrow({
  where: { restaurantId: w.restaurantId, id },
  include: { items: true, promotions: { include: { allocations: true } } },
});

module.exports = { prisma, assertDisposableDatabase, seedWorld, addPromotion, addOffer, createOwner, orderCount, storedOrder };
