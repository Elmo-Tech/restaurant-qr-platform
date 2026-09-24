import { GuestMenuLinkService } from './guest-menu-link.service';

function build(row: { publicCode: string } | null) {
  const findFirst = jest.fn().mockResolvedValue(row);
  const service = new GuestMenuLinkService({ qrCode: { findFirst } } as never);
  return { service, findFirst };
}

describe('GuestMenuLinkService', () => {
  it('returns the publicCode of the Restaurant’s ACTIVE GENERIC QR, scoped to the authorized Restaurant', async () => {
    const { service, findFirst } = build({ publicCode: 'abc123' });

    await expect(service.getGuestMenuLink('restaurant-1')).resolves.toEqual({
      publicCode: 'abc123',
    });
    expect(findFirst.mock.calls[0][0].where).toEqual({
      restaurantId: 'restaurant-1',
      type: 'GENERIC',
      status: 'ACTIVE',
    });
  });

  it('returns null (and creates nothing) when there is no ACTIVE GENERIC QR', async () => {
    const { service } = build(null);

    await expect(service.getGuestMenuLink('restaurant-1')).resolves.toEqual({
      publicCode: null,
    });
  });
});
