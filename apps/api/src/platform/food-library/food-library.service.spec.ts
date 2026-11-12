import { FoodLibraryService } from './food-library.service';
import type { PrismaService } from '../../database/prisma.service';
import type { ImageStorageService } from '../../storage/image-storage.service';
import type { UploadedImageFile } from '../../storage/uploaded-image-file';

function setup() {
  const findMany = jest.fn();
  const updateMany = jest.fn(
    async (_input: unknown): Promise<{ count: number }> => ({ count: 1 }),
  );
  const prisma = {
    foodImageAsset: {
      findUnique: jest.fn(),
      findMany,
      updateMany,
      create: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    foodTag: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        foodImageAsset: { findMany, updateMany },
        foodImageTag: { deleteMany: jest.fn(), createMany: jest.fn() },
      }),
    ),
  };
  const storage = { saveImage: jest.fn(), deleteImageBestEffort: jest.fn() };
  return {
    service: new FoodLibraryService(
      prisma as unknown as PrismaService,
      storage as unknown as ImageStorageService,
    ),
    prisma,
    storage,
  };
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
    await expect(service.publish([record().id])).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.foodImageAsset.updateMany).not.toHaveBeenCalled();
  });

  it('refuses publishing a raw/sector mismatch as missing verified state', async () => {
    const { service, prisma } = setup();
    prisma.foodImageAsset.findMany.mockResolvedValue([
      record({
        reviewedAt: new Date(),
        presentation: 'UNSPECIFIED',
      }),
    ]);
    await expect(service.publish([record().id])).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.foodImageAsset.updateMany).not.toHaveBeenCalled();
  });

  it('publishes only a complete manually reviewed batch', async () => {
    const { service, prisma } = setup();
    prisma.foodImageAsset.findMany.mockResolvedValue([
      record({ reviewedAt: new Date() }),
    ]);
    prisma.foodImageAsset.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.publish([record().id])).resolves.toEqual({
      published: 1,
    });
    expect(prisma.foodImageAsset.updateMany).toHaveBeenCalledTimes(1);
    const calledWith = (prisma.foodImageAsset.updateMany as jest.Mock).mock
      .calls[0]?.[0] as {
      where: { id: { in: string[] } };
      data: { status: string; publishedAt: Date };
    };
    expect(calledWith.where.id.in).toEqual([record().id]);
    expect(calledWith.data.status).toBe('PUBLISHED');
    expect(calledWith.data.publishedAt).toBeInstanceOf(Date);
  });

  it('never writes files for missing or invalid image uploads', async () => {
    const { service, storage } = setup();
    await expect(service.upload(undefined)).rejects.toMatchObject({
      status: 400,
    });
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('rejects identical binary photos before saving a second file', async () => {
    const { service, prisma, storage } = setup();
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
    buffer.write('IHDR', 12, 'latin1');
    buffer.writeUInt32BE(1, 16);
    buffer.writeUInt32BE(1, 20);
    const file = {
      originalname: 'beef.png',
      mimetype: 'image/png',
      buffer,
      size: buffer.length,
    } satisfies UploadedImageFile;
    prisma.foodImageAsset.findUnique.mockResolvedValue({ id: record().id });
    await expect(service.upload(file)).rejects.toMatchObject({ status: 409 });
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('refuses a review with unknown global tag IDs', async () => {
    const { service, prisma } = setup();
    prisma.foodImageAsset.findUnique.mockResolvedValue(record());
    prisma.foodTag.count.mockResolvedValue(0);
    await expect(
      service.review(
        record().id,
        {
          name: 'Beef cut',
          presentation: 'RAW',
          sectors: ['BUTCHER'],
          tagIds: ['22222222-2222-4222-8222-222222222222'],
        },
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps image file on archive, including previously published images', async () => {
    const { service, prisma, storage } = setup();
    prisma.foodImageAsset.findUnique.mockResolvedValue({ id: record().id });
    prisma.foodImageAsset.updateMany.mockResolvedValue({ count: 1 });
    // Archive uses update (rather than unlink); simulate the DB method.
    prisma.foodImageAsset.update.mockResolvedValue({});
    await expect(service.archive(record().id)).resolves.toEqual({
      id: record().id,
      status: 'ARCHIVED',
    });
    expect(storage.deleteImageBestEffort).not.toHaveBeenCalled();
  });
});
