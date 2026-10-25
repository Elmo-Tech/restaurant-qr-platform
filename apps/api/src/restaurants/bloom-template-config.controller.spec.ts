/* Regression: exercise the real multipart HTTP interceptor, not only mock service methods. */
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../auth/guard/auth.guard';
import { CsrfGuard } from '../auth/csrf/csrf.guard';
import { RestaurantAccessGuard } from '../auth/guard/restaurant-access.guard';
import { PermissionGuard } from '../auth/guard/permission.guard';
import { AllBranchesRequiredGuard } from '../auth/guard/all-branches-required.guard';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DEFAULT_BLOOM_SETTINGS } from './bloom-template-config';
import { BloomTemplateConfigController } from './bloom-template-config.controller';
import { BloomTemplateConfigService } from './bloom-template-config.service';

const restaurantId = '41b84aaa-7abf-4f06-a494-2c8dca0a3cea';
const config = { draft: DEFAULT_BLOOM_SETTINGS, published: DEFAULT_BLOOM_SETTINGS };

describe('BLOOM hero image HTTP endpoints', () => {
  let app: INestApplication;
  const setDraftImage = jest.fn().mockResolvedValue(config);
  const resetDraftImage = jest.fn().mockResolvedValue(config);

  beforeAll(async () => {
    const attachRestaurantIdentity = {
      canActivate: (context: ExecutionContext): boolean => {
        const httpRequest = context.switchToHttp().getRequest() as {
          restaurantAccess?: { restaurantId: string };
        };
        httpRequest.restaurantAccess = { restaurantId };
        return true;
      },
    };
    const allow = { canActivate: () => true };
    const module = await Test.createTestingModule({
      controllers: [BloomTemplateConfigController],
      providers: [
        { provide: BloomTemplateConfigService, useValue: { setDraftImage, resetDraftImage } },
        { provide: EntitlementsService, useValue: { templatesFor: jest.fn().mockResolvedValue(['BLOOM']) } },
      ],
    })
      .overrideGuard(AuthGuard).useValue(attachRestaurantIdentity)
      .overrideGuard(RestaurantAccessGuard).useValue(allow)
      .overrideGuard(PermissionGuard).useValue(allow)
      .overrideGuard(AllBranchesRequiredGuard).useValue(allow)
      .overrideGuard(CsrfGuard).useValue(allow)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => { setDraftImage.mockClear(); resetDraftImage.mockClear(); });

  afterAll(async () => { await app?.close(); });

  it('accepts a real multipart image file and passes its validated buffer to the service', async () => {
    // Enough JPEG magic bytes for the same image signature validator used by the API.
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    await request(app.getHttpServer())
      .post(`/restaurants/${restaurantId}/bloom-template/hero-image`)
      .attach('image', photo, { filename: 'menu-photo.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(setDraftImage).toHaveBeenCalledTimes(1);
    expect(setDraftImage).toHaveBeenCalledWith(restaurantId, photo, 'image/jpeg');
  });

  it('rejects a file with a spoofed PNG MIME type before calling storage', async () => {
    await request(app.getHttpServer())
      .post(`/restaurants/${restaurantId}/bloom-template/hero-image`)
      .attach('image', Buffer.from('not a real png'), {
        filename: 'invalid.png', contentType: 'image/png',
      })
      .expect(400);
    expect(setDraftImage).not.toHaveBeenCalled();
  });

  it('resets a draft image without touching the published content', async () => {
    await request(app.getHttpServer())
      .delete(`/restaurants/${restaurantId}/bloom-template/hero-image`)
      .expect(200);
    expect(resetDraftImage).toHaveBeenCalledWith(restaurantId);
  });
});
