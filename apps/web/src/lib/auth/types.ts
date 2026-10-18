import type { RestaurantContact } from '../contact/types';
import type { MenuTemplateApi } from '../public-menu/templates';

/** The features the platform may allow a Restaurant (DEC-043). Mirrors `apps/api/src/entitlements/features.ts`. */
export type FeatureKey =
  | 'WHATSAPP_ORDERING'
  | 'ORDER_TRACKING'
  | 'SMART_SUGGESTIONS'
  | 'MENU_TEMPLATES'
  | 'DASHBOARD_ORDERING'
  | 'TABLE_ORDERING';

export type FeatureMap = Record<FeatureKey, boolean>;
/**
 * Types mirroring the Backend's `GET /auth/me` response shape
 * (`apps/api/src/auth/context/auth-context.service.ts`) exactly -- typing
 * only, no authorization logic. The Backend remains the sole authority on
 * what a User may access; these types just describe the JSON it returns.
 */

export type RestaurantMembershipRole =
  | 'OWNER'
  | 'MANAGER'
  | 'CASHIER'
  | 'KITCHEN'
  | 'WAITER'
  /** A Restaurant-defined Role (its name and permissions live on the Role itself). */
  | 'CUSTOM';

export type RestaurantStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type BranchStatus = 'ACTIVE' | 'INACTIVE';

export interface AuthContextUser {
  id: string;
  email: string;
  preferredLocale: string | null;
}

export interface AuthContextRestaurant {
  id: string;
  name: string;
  status: RestaurantStatus;
  currencyCode: string;
  defaultLocale: string;
  /** Backend-relative asset path (resolve with `resolveAssetUrl`), or `null` when no logo is set. */
  logoAssetPath: string | null;
  /** Backend-relative asset path of the Guest Menu cover image, or `null` when none is set. */
  coverAssetPath: string | null;
  /** Restaurant QR order types (Settings -> Restaurant QR): `false` stops that type of order. */
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  /** Table (dine-in) channel; false = the table QR shows a view-only menu. */
  tableOrderingEnabled: boolean;
  /** WhatsApp ordering (DEC-042): the Guest menu hands orders to WhatsApp. */
  whatsappOrderingEnabled: boolean;
  /** Guest menu layout (DEC-044). */
  menuTemplate: MenuTemplateApi;
  /** What the platform allows this Restaurant (DEC-043); the dashboard locks controls for what is off. */
  features: FeatureMap;
  /** Guest Menu contact details (Settings -> Profile). */
  contact: RestaurantContact;
  /** QR appearance (Settings -> Restaurant QR): applied to the Restaurant QR and the table QR panels. */
  qrStyle: {
    foregroundColor: string;
    backgroundColor: string;
    showLogo: boolean;
    showName: boolean;
  };
}

export interface AuthContextBranch {
  id: string;
  /** The Restaurant default-locale name (also the legacy single-language value). */
  name: string;
  /** Per-locale display names; resolve with `localizedName`, falling back to `name`. */
  translations: { locale: string; name: string }[];
  status: BranchStatus;
}

/**
 * `permissions` (Batch G0) is advisory frontend context only, for
 * hiding/disabling inappropriate UI controls -- it is not a security
 * boundary. The Backend re-checks current database state on every real
 * request and remains the sole authorization authority regardless of what
 * this list says. `string[]` is intentional here (not a tighter Permission
 * union): the Backend does not export a shared permission-string type to
 * this frontend package, and introducing one is out of scope for this small
 * type-sync batch.
 */
export interface AuthContextMembership {
  id: string;
  /** The Role's immutable kind label. */
  role: RestaurantMembershipRole;
  roleId: string;
  /** The Restaurant Role's display name. */
  roleName: string;
  allBranches: boolean;
  permissions: string[];
  restaurant: AuthContextRestaurant;
  branches: AuthContextBranch[];
}

export interface AuthContext {
  user: AuthContextUser;
  memberships: AuthContextMembership[];
}
