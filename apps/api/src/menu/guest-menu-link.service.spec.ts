import { GuestMenuLinkService } from './guest-menu-link.service';

function build(row: { publicCode: string } | null, slug: string | null = null) {
  const findFirst = jest.fn().mockResolvedValue(row);
  const slugFindFirst = jest.fn().mockResolvedValue(slug ? { slug } : null);
  const service = new GuestMenuLinkService({
    qrCode: { findFirst },
    restaurantSlug: { findFirst: slugFindFirst },
  } as never);
  return { service, findFirst, slugFindFirst };
}

describe('GuestMenuLinkService', () => {
  it('returns the publicCode of the Restaurant’s ACTIVE GENERIC QR, scoped to the authorized Restaurant', async () => {
    const { service, findFirst } = build({ publicCode: 'abc123' });

    await expect(service.getGuestMenuLink('restaurant-1')).resolves.toEqual({
      publicCode: 'abc123',
      slug: null,
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
      slug: null,
    });
  });

  it('returns the Restaurant’s own readable slug (DEC-066), looked up by the authorized Restaurant only', async () => {
    const { service, slugFindFirst } = build({ publicCode: 'abc123' }, 'elmo-bistro');

    await expect(service.getGuestMenuLink('restaurant-1')).resolves.toEqual({
      publicCode: 'abc123',
      slug: 'elmo-bistro',
    });
    expect(slugFindFirst.mock.calls[0][0].where).toEqual({
      restaurantId: 'restaurant-1',
      isCurrent: true,
    });
  });
});
