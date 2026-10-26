import type { PrismaService } from '../database/prisma.service';
import type { ImageStorageService } from '../storage/image-storage.service';
import { DEFAULT_FOLIO_SETTINGS } from './folio-template-config';
import { FolioTemplateConfigService } from './folio-template-config.service';

const restaurantId = '0e2c28f2-73d7-4755-b130-61b5e4cc3e31';
const original = '/media/1a63c31c-830c-4e40-a501-a82f427cc419.jpg';
const replacement = '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.webp';
const attached = (path: string) => ({
  ...DEFAULT_FOLIO_SETTINGS, artworkMode: 'CUSTOM', artworkAssetPath: path,
});

function setup() {
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const saveImage = jest.fn();
  const deleteImageBestEffort = jest.fn();
  const findFirst = jest.fn();
  const prisma = { restaurantTemplateConfig: { findUnique, upsert }, category: { findFirst } } as unknown as PrismaService;
  const images = { saveImage, deleteImageBestEffort } as unknown as ImageStorageService;
  const service = new FolioTemplateConfigService(prisma, images);
  return { service, findUnique, findFirst, upsert, saveImage, deleteImageBestEffort };
}

describe('FOLIO premium draft and publication safety', () => {
  it('does not permit overriding server-managed image paths through PATCH', async () => {
    const h = setup();
    h.findUnique.mockResolvedValue({ draftSettings: attached(original) });
    h.upsert.mockImplementation(async (args: { update: { draftSettings: object } }) => ({
      draftSettings: args.update.draftSettings,
      publishedSettings: DEFAULT_FOLIO_SETTINGS,
    }));
    const result = await h.service.saveDraft(restaurantId, {
      ...DEFAULT_FOLIO_SETTINGS, palette: 'BURGUNDY', artworkMode: 'CUSTOM',
      artworkAssetPath: 'https://attacker.example/inject.svg',
    });
    expect(result.draft).toMatchObject({
      palette: 'BURGUNDY', artworkMode: 'CUSTOM', artworkAssetPath: original,
    });
    expect(result.published).toEqual(DEFAULT_FOLIO_SETTINGS);
  });

  it('upload only updates the draft; a guest still receives the published art', async () => {
    const h = setup();
    h.saveImage.mockResolvedValue({ assetPath: replacement });
    h.findUnique.mockResolvedValue({
      draftSettings: attached(original), publishedSettings: DEFAULT_FOLIO_SETTINGS,
    });
    h.upsert.mockImplementation(async (args: { update: { draftSettings: object } }) => ({
      draftSettings: args.update.draftSettings, publishedSettings: DEFAULT_FOLIO_SETTINGS,
    }));
    const result = await h.service.setDraftArtwork(restaurantId, Buffer.from('image'), 'image/webp');
    expect(result.draft.artworkAssetPath).toBe(replacement);
    expect(result.published.artworkAssetPath).toBeNull();
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(original);
  });

  it('keeps a published image when a draft is reset to the original plate', async () => {
    const h = setup();
    h.findUnique.mockResolvedValue({
      draftSettings: attached(replacement), publishedSettings: attached(original),
    });
    h.upsert.mockImplementation(async (args: {update: {draftSettings: object}}) => ({
      draftSettings: args.update.draftSettings, publishedSettings: attached(original),
    }));
    const result = await h.service.resetDraftArtwork(restaurantId);
    expect(result.draft.artworkMode).toBe('ILLUSTRATION');
    expect(result.published.artworkAssetPath).toBe(original);
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(replacement);
    expect(h.deleteImageBestEffort).not.toHaveBeenCalledWith(original);
  });

  it('publishes only the saved draft, replacing the older published artwork', async () => {
    const h = setup();
    h.findUnique.mockResolvedValue({
      draftSettings: attached(replacement), publishedSettings: attached(original),
    });
    h.upsert.mockResolvedValue({
      draftSettings: attached(replacement), publishedSettings: attached(replacement),
    });
    const result = await h.service.publish(restaurantId);
    expect(result.published.artworkAssetPath).toBe(replacement);
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(original);
  });

  it('preserves the published image if a reset draft still references the same asset', async () => {
    const h = setup();
    h.findUnique.mockResolvedValue({
      draftSettings: attached(original), publishedSettings: attached(original),
    });
    h.upsert.mockImplementation(async (args: {update: {draftSettings: object}}) => ({
      draftSettings: args.update.draftSettings, publishedSettings: attached(original),
    }));
    await h.service.resetDraftArtwork(restaurantId);
    expect(h.deleteImageBestEffort).not.toHaveBeenCalled();
  });

  it('allows an owned category to upload its own draft illustration without changing others', async () => {
    const h = setup();
    const categoryId = 'a0b1c2d3-1111-4222-8333-ffeeddccbbaa';
    h.findFirst.mockResolvedValue({ id: categoryId });
    h.saveImage.mockResolvedValue({ assetPath: replacement });
    h.findUnique.mockResolvedValue({ draftSettings: DEFAULT_FOLIO_SETTINGS, publishedSettings: DEFAULT_FOLIO_SETTINGS });
    h.upsert.mockImplementation(async (args: {update: {draftSettings: object}}) => ({
      draftSettings: args.update.draftSettings, publishedSettings: DEFAULT_FOLIO_SETTINGS,
    }));
    const next = await h.service.setDraftCategoryArtwork(restaurantId, categoryId, Buffer.from('photo'), 'image/webp');
    expect(next.draft.categoryArtwork[categoryId]).toBe(replacement);
    expect(next.published.categoryArtwork).toEqual({});
    expect(h.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {id: categoryId, restaurantId, status: 'ACTIVE'},
    }));
  });

  it('rejects an unknown or foreign category before storing a file', async () => {
    const h = setup();
    h.findFirst.mockResolvedValue(null);
    await expect(h.service.setDraftCategoryArtwork(restaurantId,
      'a0b1c2d3-1111-4222-8333-ffeeddccbbaa', Buffer.from('photo'),'image/webp'))
      .rejects.toMatchObject({status: 404});
    expect(h.saveImage).not.toHaveBeenCalled();
  });

  it('does not trust category artwork paths from a PATCH body', async () => {
    const h = setup();
    h.findUnique.mockResolvedValue({ draftSettings: {
      ...DEFAULT_FOLIO_SETTINGS,
      categoryArtwork: {'a0b1c2d3-1111-4222-8333-ffeeddccbbaa': original},
    }});
    h.upsert.mockImplementation(async (args:{update:{draftSettings:object}})=>({
      draftSettings: args.update.draftSettings,publishedSettings: DEFAULT_FOLIO_SETTINGS,
    }));
    const result = await h.service.saveDraft(restaurantId,{
      ...DEFAULT_FOLIO_SETTINGS,
      categoryArtwork: {'a0b1c2d3-1111-4222-8333-ffeeddccbbaa': replacement},
    });
    expect(result.draft.categoryArtwork['a0b1c2d3-1111-4222-8333-ffeeddccbbaa']).toBe(original);
  });

  it('returns an error on image storage failure without writing a draft', async () => {
    const h = setup();
    h.saveImage.mockRejectedValue(new Error('simulated upload failure'));
    await expect(h.service.setDraftArtwork(restaurantId, Buffer.from('image'), 'image/jpeg'))
      .rejects.toMatchObject({status: 500});
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
