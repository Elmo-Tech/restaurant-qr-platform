import { Prisma } from '../generated/prisma/client';
import { GenericQrService } from './generic-qr.service';

function build() {
  const findFirst = jest.fn().mockResolvedValue(null);
  const create = jest.fn().mockImplementation(({ data }) =>
    Promise.resolve({ publicCode: data.publicCode, status: data.status }),
  );
  const update = jest.fn().mockImplementation(({ data }) =>
    Promise.resolve({ publicCode: 'code', status: data.status }),
  );
  const service = new GenericQrService({ qrCode: { findFirst, create, update } } as never);
  return { service, findFirst, create, update };
}

describe('GenericQrService', () => {
  it('reads only the authorized Restaurant’s GENERIC QR (tenant isolation)', async () => {
    const m = build();

    await m.service.getGenericQr('restaurant-1');

    expect(m.findFirst.mock.calls[0][0].where).toEqual({
      restaurantId: 'restaurant-1',
      type: 'GENERIC',
    });
  });

  it('creates an ACTIVE GENERIC QR with no Branch/Table and a random public code', async () => {
    const m = build();

    const result = await m.service.createGenericQr('restaurant-1');

    expect(result.outcome).toBe('created');
    const data = m.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      restaurantId: 'restaurant-1',
      branchId: null,
      tableId: null,
      type: 'GENERIC',
      status: 'ACTIVE',
    });
    expect(data.publicCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never creates a second Generic QR when one already exists', async () => {
    const m = build();
    m.findFirst.mockResolvedValue({ publicCode: 'existing', status: 'INACTIVE' });

    const result = await m.service.createGenericQr('restaurant-1');

    expect(result).toEqual({ outcome: 'alreadyExists' });
    expect(m.create).not.toHaveBeenCalled();
  });

  it('a concurrent double-create that loses to the one-per-Restaurant index reports alreadyExists', async () => {
    const m = build();
    const conflict = Object.create(Prisma.PrismaClientKnownRequestError.prototype) as Error & {
      code: string;
      meta: unknown;
    };
    conflict.code = 'P2002';
    conflict.meta = {
      driverAdapterError: {
        cause: { constraint: { index: 'qr_codes_one_generic_qr_per_restaurant' } },
      },
    };
    m.create.mockRejectedValue(conflict);

    await expect(m.service.createGenericQr('restaurant-1')).resolves.toEqual({
      outcome: 'alreadyExists',
    });
  });

  it('rethrows an unrelated unique violation', async () => {
    const m = build();
    const other = Object.create(Prisma.PrismaClientKnownRequestError.prototype) as Error & {
      code: string;
      meta: unknown;
    };
    other.code = 'P2002';
    other.meta = { driverAdapterError: { cause: { constraint: { index: 'qr_codes_public_code_key' } } } };
    m.create.mockRejectedValue(other);

    await expect(m.service.createGenericQr('restaurant-1')).rejects.toBe(other);
  });

  it('toggles status of the authorized Restaurant’s own Generic QR (deactivate / activate)', async () => {
    const m = build();
    m.findFirst.mockResolvedValue({ id: 'qr-1' });

    const off = await m.service.updateStatus('restaurant-1', 'INACTIVE');
    const on = await m.service.updateStatus('restaurant-1', 'ACTIVE');

    expect(off).toMatchObject({ outcome: 'updated', data: { status: 'INACTIVE' } });
    expect(on).toMatchObject({ outcome: 'updated', data: { status: 'ACTIVE' } });
    expect(m.findFirst.mock.calls[0][0].where).toEqual({
      restaurantId: 'restaurant-1',
      type: 'GENERIC',
    });
    expect(m.update.mock.calls[0][0].where).toEqual({ id: 'qr-1' });
  });

  it('status update converges on notFound when the Restaurant has no Generic QR (a foreign one is never reachable)', async () => {
    const m = build();

    const result = await m.service.updateStatus('restaurant-2', 'INACTIVE');

    expect(result).toEqual({ outcome: 'notFound' });
    expect(m.update).not.toHaveBeenCalled();
  });
});
