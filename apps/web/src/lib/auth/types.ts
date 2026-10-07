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
}

export interface AuthContextBranch {
  id: string;
  name: string;
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
