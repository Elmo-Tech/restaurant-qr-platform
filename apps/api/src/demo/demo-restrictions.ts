/**
 * What a demo user may NOT do (DEC-060), decided in the Backend and kept in this one list so it can be read and tested
 * as a whole. Everything else works normally: the point of a demo is to use the dashboard for real.
 *
 * Blocked, for a demo restaurant:
 * - identity: changing the password (a demo owner has no password anyone knows);
 * - people: inviting staff, creating or changing staff members and roles;
 * - money: asking the Platform team for a subscription change;
 * - storage and cost: uploading or removing an image (logo, cover, product, category, template pictures) and the
 *   whole Menu Import (it spends model quota and the demo already has a complete menu).
 */

export interface RestrictedRoute {
  /** `restaurant`: the path carries the restaurant id. `user`: the signed-in user decides (no restaurant in the path). */
  scope: 'restaurant' | 'user';
  methods: readonly string[];
  /** Matches the path after the API prefix, e.g. `/restaurants/<id>/products/<id>/image`. */
  pattern: RegExp;
  reason: string;
}

const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const UUID = '[0-9a-fA-F-]{36}';
const R = `^/restaurants/(${UUID})`;

export const RESTRICTED_ROUTES: readonly RestrictedRoute[] = [
  {
    scope: 'user',
    methods: ['POST'],
    pattern: /^\/auth\/change-password\/?$/,
    reason: 'password',
  },
  {
    scope: 'restaurant',
    methods: MUTATING,
    pattern: new RegExp(`${R}/(invitations|memberships|roles)(/|$)`),
    reason: 'staff',
  },
  {
    scope: 'restaurant',
    methods: ['POST'],
    pattern: new RegExp(`${R}/subscription/requests/?$`),
    reason: 'subscription',
  },
  {
    scope: 'restaurant',
    methods: MUTATING,
    pattern: new RegExp(`${R}/(products|categories)/${UUID}/image/?$`),
    reason: 'image',
  },
  {
    scope: 'restaurant',
    methods: MUTATING,
    pattern: new RegExp(`${R}/(logo|cover)/?$`),
    reason: 'image',
  },
  {
    scope: 'restaurant',
    methods: MUTATING,
    pattern: new RegExp(
      `${R}/(ember|bloom|brew|editorial)-template/(hero-image|promo-image)/?$`,
    ),
    reason: 'image',
  },
  {
    scope: 'restaurant',
    methods: MUTATING,
    pattern: new RegExp(`${R}/menu-imports(/|$)`),
    reason: 'import',
  },
];

export interface RestrictionMatch {
  route: RestrictedRoute;
  restaurantId: string | null;
}

/** `path` is the URL path without the API prefix and without the query string. */
export function matchRestriction(
  method: string,
  path: string,
): RestrictionMatch | null {
  const verb = method.toUpperCase();
  for (const route of RESTRICTED_ROUTES) {
    if (!route.methods.includes(verb)) continue;
    const match = route.pattern.exec(path);
    if (match) {
      return {
        route,
        restaurantId: route.scope === 'restaurant' ? match[1] : null,
      };
    }
  }
  return null;
}
