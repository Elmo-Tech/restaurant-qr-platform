import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { ImageStorageService } from '../storage/image-storage.service';
import { DEFAULT_VERDE_SETTINGS, normalizeVerdeSettings } from './verde-menu-config';
import { VerdeMenuConfigService } from './verde-menu-config.service';

const restaurantId = '0e2c28f2-73d7-4755-b130-61b5e4cc3e31';
const ownCategory = '41b84aaa-7abf-4f06-a494-2c8dca0a3cea';
const foreignCategory = '9d5b7f10-5c60-4a0e-9a1b-0f9a4a0b1c11';
const oldHero = '/media/1a63c31c-830c-4e40-a501-a82f427cc419.jpg';
const newHero = '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.webp';

function setup(row: unknown) {
  const findUnique = jest.fn().mockResolvedValue(row);
  const update = jest.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({
      draftSettings: args.data.draftSettings ?? (row as { draftSettings: unknown }).draftSettings,
      publishedSettings: args.data.publishedSettings ?? (row as { publishedSettings: unknown }).publishedSettings,
    }),
  );
  const findMany = jest.fn().mockResolvedValue([{ id: ownCategory }]);
  const saveImage = jest.fn().mockResolvedValue({ assetPath: newHero });
  const deleteImageBestEffort = jest.fn();
  const prisma = {
    restaurantExclusiveDesign: { findUnique, update },
    category: { findMany },
  } as unknown as PrismaService;
  const images = { saveImage, deleteImageBestEffort } as unknown as ImageStorageService;
  return { service: new VerdeMenuConfigService(prisma, images), findUnique, update, findMany, saveImage, deleteImageBestEffort };
}

const verdeRow = (draft: object = {}, published: object = {}) => ({
  rendererKey: 'VERDE_NAPOLI_V1',
  draftSettings: draft,
  publishedSettings: published,
});

describe('VerdeMenuConfigService tenant isolation', () => {
  it.each([null, { rendererKey: null, draftSettings: {}, publishedSettings: {} }, { rendererKey: 'OTHER', draftSettings: {}, publishedSettings: {} }])(
    'refuses every operation for a Restaurant without its own VERDE assignment (%j)',
    async (row) => {
      const h = setup(row);
      await expect(h.service.get(restaurantId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(h.service.saveDraft(restaurantId, {})).rejects.toBeInstanceOf(NotFoundException);
      await expect(h.service.publish(restaurantId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        h.service.setDraftImage(restaurantId, 'hero', Buffer.from('x'), 'image/png'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(h.update).not.toHaveBeenCalled();
      expect(h.saveImage).not.toHaveBeenCalled();
    },
  );

  it('always keys reads and writes by the authorized Restaurant ID', async () => {
    const h = setup(verdeRow());
    await h.service.saveDraft(restaurantId, { theme: 'LIGHT' });
    expect(h.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId } }));
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId } }));
    expect(h.findMany).toHaveBeenCalledWith({ where: { restaurantId }, select: { id: true } });
  });

  it('drops category IDs the Restaurant does not own (foreign tenant data cannot be referenced)', async () => {
    const h = setup(verdeRow());
    const result = await h.service.saveDraft(restaurantId, {
      chapter1CategoryId: foreignCategory,
      chapter2CategoryId: ownCategory,
      categoryExtras: {
        [foreignCategory]: { introEn: 'steal' },
        [ownCategory]: { introEn: 'mine' },
      },
    });
    expect(result.draft.chapter1CategoryId).toBeNull();
    expect(result.draft.chapter2CategoryId).toBe(ownCategory);
    expect(Object.keys(result.draft.categoryExtras)).toEqual([ownCategory]);
    expect(result.draft.categoryExtras[ownCategory].introEn).toBe('mine');
  });

  it('rejects category photo operations for a foreign category without writing anything', async () => {
    const h = setup(verdeRow());
    await expect(
      h.service.setCategoryImage(restaurantId, foreignCategory, Buffer.from('x'), 'image/png'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.service.resetCategoryImage(restaurantId, foreignCategory)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.saveImage).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe('VerdeMenuConfigService draft / publish', () => {
  it('saving a draft never changes the published settings', async () => {
    const h = setup(verdeRow({}, { headlineLineEn: 'Live copy' }));
    const result = await h.service.saveDraft(restaurantId, { headlineLineEn: 'Next copy' });
    expect(result.draft.headlineLineEn).toBe('Next copy');
    expect(result.published.headlineLineEn).toBe('Live copy');
    const written = (h.update.mock.calls as [{ data: Record<string, unknown> }][])[0][0].data;
    expect(written).not.toHaveProperty('publishedSettings');
  });

  it('ignores raw image paths in the payload and keeps the stored server uploads', async () => {
    const h = setup(verdeRow({ heroImageAssetPath: oldHero, categoryExtras: { [ownCategory]: { imageAssetPath: oldHero } } }));
    const result = await h.service.saveDraft(restaurantId, {
      theme: 'SIGNATURE',
      heroImageAssetPath: 'https://attacker.example/x.png',
      categoryExtras: { [ownCategory]: { introEn: 'Hi', imageAssetPath: 'https://attacker.example/y.png' } },
    });
    expect(result.draft.heroImageAssetPath).toBe(oldHero);
    expect(result.draft.categoryExtras[ownCategory].imageAssetPath).toBe(oldHero);
  });

  it('publish copies the saved draft; a replaced upload is deleted only after nothing references it', async () => {
    const h = setup(verdeRow({ heroImageAssetPath: newHero }, { heroImageAssetPath: oldHero }));
    const result = await h.service.publish(restaurantId);
    expect(result.published.heroImageAssetPath).toBe(newHero);
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(oldHero);
  });

  it('an upload changes only the draft and keeps the published photo until publish', async () => {
    const h = setup(verdeRow({}, { heroImageAssetPath: oldHero }));
    const result = await h.service.setDraftImage(restaurantId, 'hero', Buffer.from('image'), 'image/webp');
    expect(result.draft.heroImageAssetPath).toBe(newHero);
    expect(result.published.heroImageAssetPath).toBe(oldHero);
    expect(h.deleteImageBestEffort).not.toHaveBeenCalled();
  });

  it('resetting restores the default art in the draft without deleting a still-published photo', async () => {
    const h = setup(verdeRow({ bannerImageAssetPath: oldHero }, { bannerImageAssetPath: oldHero }));
    const result = await h.service.resetDraftImage(restaurantId, 'banner');
    expect(result.draft.bannerImageAssetPath).toBeNull();
    expect(result.published.bannerImageAssetPath).toBe(oldHero);
    expect(h.deleteImageBestEffort).not.toHaveBeenCalled();
  });

  it('removes an unpublished upload when it is reset', async () => {
    const h = setup(verdeRow({ chapter1ImageAssetPath: newHero }));
    await h.service.resetDraftImage(restaurantId, 'chapter1');
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(newHero);
  });

  it('stores a category photo inside that category override only', async () => {
    const h = setup(verdeRow({ categoryExtras: { [ownCategory]: { introEn: 'Keep me' } } }));
    const result = await h.service.setCategoryImage(restaurantId, ownCategory.toUpperCase(), Buffer.from('i'), 'image/webp');
    expect(result.draft.categoryExtras[ownCategory]).toMatchObject({ introEn: 'Keep me', imageAssetPath: newHero });
  });

  it('cleans up the stored file when the draft write fails', async () => {
    const h = setup(verdeRow());
    h.update.mockRejectedValueOnce(new Error('db down'));
    await expect(h.service.setDraftImage(restaurantId, 'hero', Buffer.from('i'), 'image/webp')).rejects.toBeDefined();
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(newHero);
  });

  it('exposes normalized defaults for an assignment that was never edited', async () => {
    const h = setup(verdeRow());
    const view = await h.service.get(restaurantId);
    expect(view.draft).toEqual(DEFAULT_VERDE_SETTINGS);
    expect(view.published).toEqual(normalizeVerdeSettings({}));
  });
});
