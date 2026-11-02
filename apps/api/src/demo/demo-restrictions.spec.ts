import { matchRestriction } from './demo-restrictions';

const ID = '15244e8c-b09f-416c-b479-304f38a8ef5d';
const OTHER = 'a0309969-6c35-4f1e-bd1d-ea7900ed6cab';

describe('demo restrictions', () => {
  it.each([
    ['POST', '/auth/change-password', null, 'password'],
    ['POST', `/restaurants/${ID}/invitations`, ID, 'staff'],
    ['DELETE', `/restaurants/${ID}/invitations/${OTHER}`, ID, 'staff'],
    ['PATCH', `/restaurants/${ID}/memberships/${OTHER}`, ID, 'staff'],
    ['POST', `/restaurants/${ID}/roles`, ID, 'staff'],
    ['POST', `/restaurants/${ID}/subscription/requests`, ID, 'subscription'],
    ['POST', `/restaurants/${ID}/products/${OTHER}/image`, ID, 'image'],
    ['DELETE', `/restaurants/${ID}/categories/${OTHER}/image`, ID, 'image'],
    ['POST', `/restaurants/${ID}/logo`, ID, 'image'],
    ['DELETE', `/restaurants/${ID}/cover`, ID, 'image'],
    ['POST', `/restaurants/${ID}/ember-template/hero-image`, ID, 'image'],
    ['POST', `/restaurants/${ID}/brew-template/promo-image`, ID, 'image'],
    ['POST', `/restaurants/${ID}/menu-imports`, ID, 'import'],
    ['POST', `/restaurants/${ID}/menu-imports/${OTHER}/approve`, ID, 'import'],
  ])('blocks %s %s', (method, path, restaurantId, reason) => {
    const match = matchRestriction(method, path);
    expect(match?.restaurantId).toBe(restaurantId);
    expect(match?.route.reason).toBe(reason);
  });

  it.each([
    ['GET', `/restaurants/${ID}/invitations`],
    ['GET', `/restaurants/${ID}/menu-imports`],
    ['GET', `/restaurants/${ID}/memberships`],
    ['PATCH', `/restaurants/${ID}/contact`],
    ['PATCH', `/restaurants/${ID}/ordering-options`],
    ['PATCH', `/restaurants/${ID}/menu-template`],
    ['PATCH', `/restaurants/${ID}/products/${OTHER}`],
    ['POST', `/restaurants/${ID}/products`],
    ['POST', `/restaurants/${ID}/orders/${OTHER}/accept`],
    ['PATCH', `/restaurants/${ID}/ember-template/draft`],
    ['POST', `/restaurants/${ID}/ember-template/publish`],
    ['POST', '/auth/login'],
    ['POST', '/auth/logout'],
    ['GET', '/auth/me'],
  ])(
    'lets %s %s through: a demo is for using the dashboard',
    (method, path) => {
      expect(matchRestriction(method, path)).toBeNull();
    },
  );

  it('does not match a look-alike path with extra segments in front or a bad restaurant id', () => {
    expect(matchRestriction('POST', `/x/restaurants/${ID}/logo`)).toBeNull();
    expect(matchRestriction('POST', '/restaurants/not-a-uuid/logo')).toBeNull();
    expect(
      matchRestriction('POST', '/platform/auth/change-password'),
    ).toBeNull();
  });
});
