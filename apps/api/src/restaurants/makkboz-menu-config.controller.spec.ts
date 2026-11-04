import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../auth/guard/auth.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { DEFAULT_MAKKBOZ_SETTINGS } from './makkboz-menu-config';
import { MakkbozMenuConfigController } from './makkboz-menu-config.controller';
import { MakkbozMenuConfigService } from './makkboz-menu-config.service';

const restaurantId = '41b84aaa-7abf-4f06-a494-2c8dca0a3cea';
const category = '9d5b7f10-5c60-4a0e-9a1b-0f9a4a0b1c11';
const view = { draft: DEFAULT_MAKKBOZ_SETTINGS, published: DEFAULT_MAKKBOZ_SETTINGS };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe('Makkboz menu HTTP endpoints', () => {
  let app: INestApplication;
  const service = {
    get: jest.fn().mockResolvedValue(view),
    saveDraft: jest.fn().mockResolvedValue(view),
    setDraftImage: jest.fn().mockResolvedValue(view),
    resetDraftImage: jest.fn().mockResolvedValue(view),
    setCategoryImage: jest.fn().mockResolvedValue(view),
    resetCategoryImage: jest.fn().mockResolvedValue(view),
    publish: jest.fn().mockResolvedValue(view),
  };

  beforeAll(async () => {
    // The tenant is the AUTHORIZED restaurant (set by the access guard), whatever the URL says.
    const attachIdentity = {
      canActivate: (context: ExecutionContext): boolean => {
        context.switchToHttp().getRequest<{ restaurantAccess?: { restaurantId: string } }>().restaurantAccess = {
          restaurantId,
        };
        return true;
      },
    };
    const allow = { canActivate: () => true };
    const module = await Test.createTestingModule({
      controllers: [MakkbozMenuConfigController],
      providers: [{ provide: MakkbozMenuConfigService, useValue: service }],
    })
      .overrideGuard(AuthGuard).useValue(attachIdentity)
      .overrideGuard(RestaurantAccessGuard).useValue(allow)
      .overrideGuard(PermissionGuard).useValue(allow)
      .overrideGuard(AllBranchesRequiredGuard).useValue(allow)
      .overrideGuard(CsrfGuard).useValue(allow)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  beforeEach(() => Object.values(service).forEach((fn) => fn.mockClear()));
  afterAll(async () => { await app?.close(); });

  const base = `/restaurants/${restaurantId}/makkboz-menu`;
  const settings = {
    theme: 'SYSTEM', allowThemeSwitch: false, motion: 'OFF', defaultView: 'LIST', showAnnouncement: true, showValues: true, showStory: true, heroTitleEn: 'Great mood',
  };

  it('uses the authorized restaurant for every call, ignoring the URL value', async () => {
    await request(app.getHttpServer()).get('/restaurants/00000000-0000-4000-8000-000000000000/makkboz-menu').expect(200);
    expect(service.get).toHaveBeenCalledWith(restaurantId);
    await request(app.getHttpServer()).post(`${base}/publish`).expect(200);
    expect(service.publish).toHaveBeenCalledWith(restaurantId);
  });

  it('accepts a valid draft and strips unknown fields, including raw image paths', async () => {
    await request(app.getHttpServer())
      .patch(`${base}/draft`)
      .send({ ...settings, heroImageAssetPath: 'https://evil.example/x.png', extra: 1 })
      .expect(200);
    const sent = (service.saveDraft.mock.calls as [string, Record<string, unknown>][])[0][1];
    expect(sent.heroTitleEn).toBe('Great mood');
    expect(sent).not.toHaveProperty('heroImageAssetPath');
    expect(sent).not.toHaveProperty('extra');
  });

  it('rejects invalid enums and over-long copy', async () => {
    await request(app.getHttpServer()).patch(`${base}/draft`).send({ ...settings, motion: 'WILD' }).expect(400);
    await request(app.getHttpServer())
      .patch(`${base}/draft`)
      .send({ ...settings, ctaPrimaryEn: 'x'.repeat(31) })
      .expect(400);
    expect(service.saveDraft).not.toHaveBeenCalled();
  });

  it('accepts a real multipart image for a known slot and rejects an unknown slot', async () => {
    await request(app.getHttpServer())
      .post(`${base}/images/hero`)
      .attach('image', jpeg, { filename: 'pizza.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(service.setDraftImage).toHaveBeenCalledWith(restaurantId, 'hero', expect.any(Buffer), 'image/jpeg');
    await request(app.getHttpServer())
      .post(`${base}/images/logo`)
      .attach('image', jpeg, { filename: 'pizza.jpg', contentType: 'image/jpeg' })
      .expect(400);
    await request(app.getHttpServer()).delete(`${base}/images/heroSmall`).expect(200);
    expect(service.resetDraftImage).toHaveBeenCalledWith(restaurantId, 'heroSmall');
  });

  it('rejects a non-image upload and a malformed category id', async () => {
    await request(app.getHttpServer())
      .post(`${base}/images/hero`)
      .attach('image', Buffer.from('<svg onload=alert(1)>'), { filename: 'a.svg', contentType: 'image/svg+xml' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/category-images/not-a-uuid`)
      .attach('image', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`${base}/category-images/${category}`)
      .attach('image', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(service.setCategoryImage).toHaveBeenCalledWith(restaurantId, category, expect.any(Buffer), 'image/jpeg');
    expect(service.setDraftImage).not.toHaveBeenCalled();
  });
});
