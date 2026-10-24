import type { PrismaService } from '../database/prisma.service';
import type { ImageStorageService } from '../storage/image-storage.service';
import { DEFAULT_EMBER_SETTINGS } from './ember-template-config';
import { EmberTemplateConfigService } from './ember-template-config.service';

const restaurantId = '0e2c28f2-73d7-4755-b130-61b5e4cc3e31';
const original = '/media/1a63c31c-830c-4e40-a501-a82f427cc419.jpg';
const replacement = '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.webp';

function setup() {
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const saveImage = jest.fn();
  const deleteImageBestEffort = jest.fn();
  const prisma = { restaurantTemplateConfig: { findUnique, upsert } } as unknown as PrismaService;
  const images = { saveImage, deleteImageBestEffort } as unknown as ImageStorageService;
  const service = new EmberTemplateConfigService(prisma, images);
  return { service, findUnique, upsert, saveImage, deleteImageBestEffort };
}

describe('EMBER template draft photo isolation', () => {
  it('never trusts a raw path supplied with the text settings; keeps the server upload', async () => {
    const h = setup();
    const savedDraft = {
      ...DEFAULT_EMBER_SETTINGS, heroImageMode: 'CUSTOM', heroImageAssetPath: original,
    };
    h.findUnique.mockResolvedValue({ draftSettings: savedDraft });
    h.upsert.mockImplementation(async (args: { update: { draftSettings: object } }) => ({
      draftSettings: args.update.draftSettings,
      publishedSettings: DEFAULT_EMBER_SETTINGS,
    }));
    const result = await h.service.saveDraft(restaurantId, {
      ...DEFAULT_EMBER_SETTINGS,
      headlineAr: 'عنوان مخصص',
      heroImageMode: 'CUSTOM',
      heroImageAssetPath: 'https://attacker.example/image.svg',
    });
    expect(result.draft.headlineAr).toBe('عنوان مخصص');
    expect(result.draft.heroImageAssetPath).toBe(original);
    expect(result.draft.heroImageMode).toBe('CUSTOM');
    expect(result.published.heroImageMode).toBe('AUTO');
    expect(h.deleteImageBestEffort).not.toHaveBeenCalled();
  });

  it('upload modifies the draft but never switches the live image until publish', async () => {
    const h = setup();
    h.saveImage.mockResolvedValue({ assetPath: replacement });
    h.findUnique.mockResolvedValue({
      draftSettings: { ...DEFAULT_EMBER_SETTINGS, heroImageMode: 'CUSTOM', heroImageAssetPath: original },
      publishedSettings: DEFAULT_EMBER_SETTINGS,
    });
    h.upsert.mockImplementation(async (args: { update: { draftSettings: object } }) => ({
      draftSettings: args.update.draftSettings,
      publishedSettings: DEFAULT_EMBER_SETTINGS,
    }));
    const result = await h.service.setDraftImage(restaurantId, Buffer.from('image'), 'image/webp');
    expect(result.draft.heroImageAssetPath).toBe(replacement);
    expect(result.draft.heroImageMode).toBe('CUSTOM');
    expect(result.published.heroImageAssetPath).toBeNull();
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(original);
  });

  it('publishes the saved draft and removes the replaced published photo afterward', async () => {
    const h = setup();
    const newDraft = { ...DEFAULT_EMBER_SETTINGS, heroImageMode: 'CUSTOM', heroImageAssetPath: replacement };
    h.findUnique.mockResolvedValue({
      draftSettings: newDraft,
      publishedSettings: { ...DEFAULT_EMBER_SETTINGS, heroImageMode: 'CUSTOM', heroImageAssetPath: original },
    });
    h.upsert.mockResolvedValue({ draftSettings: newDraft, publishedSettings: newDraft });
    const result = await h.service.publish(restaurantId);
    expect(result.published.heroImageAssetPath).toBe(replacement);
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(original);
  });

  it('can reset the photo in an unpublished draft without changing the live photo', async () => {
    const h = setup();
    const draft = { ...DEFAULT_EMBER_SETTINGS, heroImageMode: 'CUSTOM', heroImageAssetPath: replacement };
    const published = { ...DEFAULT_EMBER_SETTINGS, heroImageMode: 'CUSTOM', heroImageAssetPath: original };
    h.findUnique.mockResolvedValue({ draftSettings: draft, publishedSettings: published });
    h.upsert.mockImplementation(async (args: { update: { draftSettings: object } }) => ({
      draftSettings: args.update.draftSettings, publishedSettings: published,
    }));
    const result = await h.service.resetDraftImage(restaurantId);
    expect(result.draft.heroImageMode).toBe('AUTO');
    expect(result.draft.heroImageAssetPath).toBeNull();
    expect(result.published.heroImageAssetPath).toBe(original);
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(replacement);
    expect(h.deleteImageBestEffort).not.toHaveBeenCalledWith(original);
  });

  it('preserves a published photo when resetting a draft that still points to it', async () => {
    const h = setup();
    const current = { ...DEFAULT_EMBER_SETTINGS, heroImageMode: 'CUSTOM', heroImageAssetPath: original };
    h.findUnique.mockResolvedValue({ draftSettings: current, publishedSettings: current });
    h.upsert.mockImplementation(async (args: { update: { draftSettings: object } }) => ({
      draftSettings: args.update.draftSettings, publishedSettings: current,
    }));
    await h.service.resetDraftImage(restaurantId);
    expect(h.deleteImageBestEffort).not.toHaveBeenCalled();
  });

  it('returns a stable API error when media storage fails', async () => {
    const h = setup();
    h.saveImage.mockRejectedValue(new Error('simulated disk failure'));
    await expect(h.service.setDraftImage(restaurantId, Buffer.from('image'), 'image/jpeg'))
      .rejects.toMatchObject({
        status: 500,
        response: {
          error: { code: 'EMBER_IMAGE_STORAGE_FAILED' },
        },
      });
    expect(h.upsert).not.toHaveBeenCalled();
  });

});
