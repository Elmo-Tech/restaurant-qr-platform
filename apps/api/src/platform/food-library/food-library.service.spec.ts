import { FoodLibraryService } from './food-library.service';
import type { PrismaService } from '../../database/prisma.service';
import type { ImageStorageService } from '../../storage/image-storage.service';
import type { UploadedImageFile } from '../../storage/uploaded-image-file';

function setup() {
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    foodImageAsset: {
      findMany: prisma.foodImageAsset.findMany,
      updateMany: prisma.foodImageAsset.updateMany,
    },
    foodImageTag: { deleteMany: jest.fn(), createMany: jest.fn() },
  }));
  const prisma = {
    foodImageAsset: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    foodTag: { findMany: jest.fn(), count: jest.fn() },
    $transaction: transaction,
  };
  const storage = { saveImage: jest.fn(), deleteImageBestEffort: jest.fn() };
  return { service: new FoodLibraryService(prisma as unknown as PrismaService, storage as unknown as ImageStorageService),
    prisma, storage };
}

const record = (patch: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Beef',
  status: 'DRAFT',
  presentation: 'RAW',
  sectors: ['BUTCHER'],
  tags: [{ tagId: '22222222-2222-4222-8222-222222222222' }],
  reviewedAt: null,
  ...patch,
});

describe('FoodLibraryService platform publishing safety', () => {
  it('refuses publishing an unreviewed photo despite correct tags/sector', async () => {
    const { service, prisma } = setup();
    prisma.foodImageAsset.findMany.mockResolvedValue([record()]);
    await expect(service.publish([record().id])).rejects.toMatchObject({ status: 409 });
    expect(prisma.foodImageAsset.updateMany).not.toHaveBeenCalled();
  });

  it('refuses publishing a raw/sector mismatch as missing verified state', async () => {
    const { service, prisma } = setup();
    prisma.foodImageAsset.findMany.mockResolvedValue([record({
      reviewedAt: new Date(), presentation: 'UNSPECIFIED',
    })]);
    await expect(service.publish([record().id])).rejects.toMatchObject({ status: 409 });
    expect(prisma.foodImageAsset.updateMany).not.toHaveBeenCalled();
  });

  it('publishes only a complete manually reviewed batch', async () => {
    const { service, prisma } = setup();
    prisma.foodImageAsset.findMany.mockResolvedValue([record({ reviewedAt: new Date() })]);
    prisma.foodImageAsset.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.publish([record().id])).resolves.toEqual({ published: 1 });
    expect(prisma.foodImageAsset.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [record().id] } },
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    });
  });

  it('never writes files for missing or invalid image uploads', async () => {
    const { service, storage } = setup();
    await expect(service.upload(undefined)).rejects.toMatchObject({ status: 400 });
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('rejects identical binary photos before saving a second file', async () => {
    const { service, prisma, storage } = setup();
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
    buffer.write('IHDR', 12, 'latin1');
    buffer.writeUInt32BE(1, 16);
    buffer.writeUInt32BE(1, 20);
    const file = { originalname: 'beef.png', mimetype: 'image/png', buffer, size: buffer.length } satisfies UploadedImageFile;
    prisma.foodImageAsset.findUnique.mockResolvedValue({ id: record().id });
    await expect(service.upload(file)).rejects.toMatchObject({ status: 409 });
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('refuses a review with unknown global tag IDs', async () => {
    const { service, prisma } = setup();
    prisma.foodImageAsset.findUnique.mockResolvedValue(record());
    prisma.foodTag.count.mockResolvedValue(0);
    await expect(service.review(record().id, {
      name: 'Beef cut', presentation: 'RAW', sectors: ['BUTCHER'],
      tagIds: ['22222222-2222-4222-8222-222222222222'],
    }, '33333333-3333-4333-8333-333333333333')).rejects.toMatchObject({ status: 400 });
  });

  it('keeps image file on archive, including previously published images', async () => {
    const { service, prisma, storage } = setup();
    prisma.foodImageAsset.findUnique.mockResolvedValue({ id: record().id });
    prisma.foodImageAsset.updateMany.mockResolvedValue({ count: 1 });
    // Archive uses update (rather than unlink); simulate the DB method.
    (prisma.foodImageAsset as unknown as { update: jest.Mock }).update = jest.fn().mockResolvedValue({});
    await expect(service.archive(record().id)).resolves.toEqual({ id: record().id, status: 'ARCHIVED' });
    expect(storage.deleteImageBestEffort).not.toHaveBeenCalled();
  });
});
