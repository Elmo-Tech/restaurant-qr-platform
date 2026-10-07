import { ALL_PERMISSIONS } from './permission';
import {
  ROLE_PERMISSIONS,
  STARTER_ROLE_NAMES,
  type StarterRoleKind,
} from './role-permissions';

export interface StarterRoleData {
  name: string;
  nameNormalized: string;
  kind: StarterRoleKind;
  permissions: string[];
}

/**
 * The row to seed for one starter Role of a new Restaurant (FT-12C). The
 * OWNER Role stores every Permission (it is also always evaluated as holding
 * all of them); the others store their template. The SQL backfill migration
 * (`20261008090100_restaurant_roles`) seeds the same data for existing
 * Restaurants -- a spec keeps the two from drifting apart.
 */
export function starterRoleData(kind: StarterRoleKind): StarterRoleData {
  const name = STARTER_ROLE_NAMES[kind];
  return {
    name,
    nameNormalized: name.toLowerCase(),
    kind,
    permissions: kind === 'OWNER' ? [...ALL_PERMISSIONS] : [...ROLE_PERMISSIONS[kind]],
  };
}
