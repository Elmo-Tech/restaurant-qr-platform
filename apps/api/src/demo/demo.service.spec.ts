import { createHash } from 'node:crypto';
import { provisionRestaurant } from '../provisioning/provision-restaurant';
import { DemoService, type DemoView } from './demo.service';
import { installTemplateImages, loadDemoTemplate } from './demo-template';

jest.mock('../provisioning/provision-restaurant');
jest.mock('./demo-template');

const names = { en: 'Sample', ar: 'تجريبي' };
const input = { label: ' Sample  demo ', kind: 'cafe', hours: 2 };
const provision = jest.mocked(provisionRestaurant);

describe('DemoService creation', () => {
  function setup() {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      restaurant: {
        count: jest.fn().mockResolvedValue(0),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({ id: 'demo-id' })
          .mockResolvedValueOnce({
            id: 'demo-id',
            publicId: 'demo-public-id',
            status: 'ACTIVE',
            demoLabel: 'Sample demo',
            demoKind: 'cafe',
            createdAt: new Date('2026-11-22T14:00:00Z'),
            demoExpiresAt: new Date('2026-11-22T16:00:00Z'),
            demoAccessLinks: [{ lastUsedAt: null, useCount: 0 }],
            package: null,
          }),
        update: jest.fn(),
      },
      restaurantSetup: { deleteMany: jest.fn() },
      branch: {
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'branch-id' }),
        update: jest.fn().mockResolvedValue({ id: 'branch-id' }),
      },
      branchTranslation: { createMany: jest.fn() },
      menu: { create: jest.fn().mockResolvedValue({ id: 'menu-id' }) },
      category: { create: jest.fn().mockResolvedValue({ id: 'category-id' }) },
      product: { create: jest.fn().mockResolvedValue({ id: 'product-id' }) },
      demoAccessLink: { create: jest.fn() },
    };
    const transaction = jest.fn((work: (db: typeof tx) => Promise<unknown>) =>
      work(tx),
    );
    const config = {
      DEMO_MAX_ACTIVE: 1,
      DEMO_PURGE_GRACE_MINUTES: 60,
      UPLOAD_LOCAL_DIR: '/unused',
      CORS_ORIGIN: 'https://guest.example.test/',
    };
    const service = new DemoService(
      { $transaction: transaction } as never,
      {} as never,
      {} as never,
      { get: (key: keyof typeof config) => config[key] } as never,
    );
    return { service, tx, transaction };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    provision.mockImplementation(async (prisma) =>
      prisma.$transaction(() =>
        Promise.resolve({
          outcome: 'provisioned',
          restaurantPublicId: 'demo-public-id',
          branchName: names.ar,
          ownerEmail: 'demo@example.test',
          genericQrPublicCode: 'qr-code',
          menuSlug: 'sample',
        }),
      ),
    );
    jest.mocked(installTemplateImages).mockResolvedValue(new Map());
    jest.mocked(loadDemoTemplate).mockResolvedValue({
      version: 1,
      restaurant: {
        name: 'Sample Cafe',
        defaultLocale: 'ar',
        currencyCode: 'EGP',
        countryCode: 'EG',
        menuTemplate: 'CLASSIC',
        suggestionsMode: 'OFF',
        pickupEnabled: false,
        deliveryEnabled: false,
        tableOrderingEnabled: true,
        whatsappOrderingEnabled: false,
        logo: 'logo.jpg',
        cover: 'cover.jpg',
      },
      branches: [
        {
          key: 'main',
          names,
          phone: '',
          address: names,
          timezone: 'Africa/Cairo',
          tables: 0,
          zones: [],
        },
      ],
      menu: {
        nameInternal: 'Demo menu',
        names,
        categories: [
          {
            key: 'drinks',
            names,
            image: 'drinks.jpg',
            products: [
              {
                key: 'tea',
                names,
                descriptions: names,
                image: 'tea.jpg',
                price: '10.00',
              },
            ],
          },
        ],
      },
      announcements: [],
      suggestions: [],
    });
  });

  it('skips an already checkpointed case before counting quota or creating a link', async () => {
    const { service, tx } = setup();
    const checkpoint = jest.fn();
    const beforeCreate = jest.fn().mockResolvedValue(false);
    await expect(
      service.create(input, { beforeCreate, checkpoint }),
    ).resolves.toEqual({
      outcome: 'skipped',
    });
    expect(beforeCreate).toHaveBeenCalledWith(tx);
    expect(tx.restaurant.count).not.toHaveBeenCalled();
    expect(provision).not.toHaveBeenCalled();
    expect(tx.demoAccessLink.create).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
  });

  it('uses the existing all-stored-demos quota for the legacy route', async () => {
    const { service, tx } = setup();
    tx.restaurant.count.mockResolvedValue(1);
    await expect(service.create(input)).resolves.toEqual({
      outcome: 'limitReached',
      max: 1,
    });
    expect(tx.restaurant.count).toHaveBeenCalledWith({
      where: { isDemo: true },
    });
    expect(loadDemoTemplate).not.toHaveBeenCalled();
    expect(provision).not.toHaveBeenCalled();
  });

  it('creates the template and hashed link before the non-secret checkpoint in one transaction', async () => {
    const { service, tx, transaction } = setup();
    const checkpoint = jest.fn((_db: unknown, demo: DemoView) => {
      expect(tx.product.create.mock.calls).toMatchObject([
        [{ data: { status: 'ACTIVE', availability: 'AVAILABLE' } }],
      ]);
      expect(tx.demoAccessLink.create).toHaveBeenCalledTimes(1);
      expect(demo).toMatchObject({
        id: 'demo-id',
        label: 'Sample demo',
        kind: 'cafe',
      });
      expect(demo).not.toHaveProperty('link');
      return Promise.resolve();
    });
    const result = await service.create(input, {
      beforeCreate: () => Promise.resolve(true),
      checkpoint,
    });
    expect(result.outcome).toBe('created');
    if (result.outcome !== 'created') throw new Error('expected demo creation');
    const token = new URL(result.link).pathname.split('/').at(-1) ?? '';
    expect(result.link).toMatch(
      /^https:\/\/guest\.example\.test\/demo\/[\w-]{43}$/,
    );
    expect(tx.demoAccessLink.create).toHaveBeenCalledWith({
      data: {
        restaurantId: 'demo-id',
        tokenHash: createHash('sha256').update(token).digest('hex'),
      },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(checkpoint).toHaveBeenCalledWith(tx, result.demo);
    expect(JSON.stringify(checkpoint.mock.calls[0][1])).not.toContain(token);
  });

  it('does not return a link if the checkpoint rejects', async () => {
    const { service, tx, transaction } = setup();
    const failure = new Error('checkpoint failed');
    const checkpoint = jest.fn().mockRejectedValue(failure);
    await expect(service.create(input, { checkpoint })).rejects.toBe(failure);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(tx.demoAccessLink.create).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
