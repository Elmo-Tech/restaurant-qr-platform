import { PublicRestaurantHostGuard } from './public-restaurant-host.guard';

const context = (host: string, publicCode: string) => ({
  switchToHttp: () => ({ getRequest: () => ({
    headers: { host }, params: { publicCode },
  }) }),
});

function setup(domain: string | undefined = 'waytaapp.com') {
  const db = {
    restaurantSlug: {
      findUnique: jest.fn().mockResolvedValue({ restaurantId: 'restaurant-a' }),
      findFirst: jest.fn().mockResolvedValue({ slug: 'pizza-house' }),
    },
    qrCode: { findUnique: jest.fn().mockResolvedValue({ restaurantId: 'restaurant-a' }) },
  };
  const config = { get: jest.fn().mockReturnValue(domain) };
  return { guard: new PublicRestaurantHostGuard(db as never, config as never), db };
}

describe('PublicRestaurantHostGuard', () => {
  it('does not change the apex or legacy host paths', async () => {
    const { guard, db } = setup();
    await expect(guard.canActivate(context('waytaapp.com', 'any') as never)).resolves.toBe(true);
    await expect(guard.canActivate(context('wayta.elmotechsoft.online', 'any') as never)).resolves.toBe(true);
    expect(db.qrCode.findUnique).not.toHaveBeenCalled();
  });

  it('requires a matching current restaurant for generic readable slugs', async () => {
    const { guard, db } = setup();
    await expect(guard.canActivate(context('pizza-house.waytaapp.com', 'pizza-house') as never)).resolves.toBe(true);
    expect(db.restaurantSlug.findUnique).toHaveBeenCalledWith({
      where: { slug: 'pizza-house' }, select: { restaurantId: true },
    });
    expect(db.restaurantSlug.findFirst).toHaveBeenCalledWith({
      where: { restaurantId: 'restaurant-a', isCurrent: true }, select: { slug: true },
    });
  });

  it('accepts a matching 43-character table QR without changing the table authority', async () => {
    const { guard, db } = setup();
    await expect(guard.canActivate(context('pizza-house.waytaapp.com', 'A'.repeat(43)) as never)).resolves.toBe(true);
    expect(db.qrCode.findUnique).toHaveBeenCalled();
  });

  it('rejects a foreign code before order creation or tracking', async () => {
    const { guard } = setup();
    await expect(guard.canActivate(context('restaurant-b.waytaapp.com', 'A'.repeat(43)) as never))
      .rejects.toMatchObject({ response: { error: { code: 'QR_NOT_FOUND' } } });
  });

  it('rejects nested/reserved subdomains and unknown codes', async () => {
    const { guard } = setup();
    await expect(guard.canActivate(context('a.b.waytaapp.com', 'pizza-house') as never)).rejects.toMatchObject({
      response: { error: { code: 'QR_NOT_FOUND' } },
    });
    await expect(guard.canActivate(context('control.waytaapp.com', 'pizza-house') as never)).rejects.toMatchObject({
      response: { error: { code: 'QR_NOT_FOUND' } },
    });
    const unknown = setup();
    unknown.db.qrCode.findUnique.mockResolvedValue(null);
    await expect(unknown.guard.canActivate(context('pizza-house.waytaapp.com', 'X'.repeat(43)) as never))
      .rejects.toMatchObject({ response: { error: { code: 'QR_NOT_FOUND' } } });
  });

  it('is disabled until the deployment has explicitly opted in', async () => {
    const { guard, db } = setup(undefined);
    await expect(guard.canActivate(context('other.waytaapp.com', 'code') as never)).resolves.toBe(true);
    expect(db.restaurantSlug.findFirst).not.toHaveBeenCalled();
  });
});
