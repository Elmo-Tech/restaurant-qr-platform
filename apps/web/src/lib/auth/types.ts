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
  | 'WAITER';

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
}

export interface AuthContextBranch {
  id: string;
  name: string;
  status: BranchStatus;
}

export interface AuthContextMembership {
  id: string;
  role: RestaurantMembershipRole;
  allBranches: boolean;
  restaurant: AuthContextRestaurant;
  branches: AuthContextBranch[];
}

export interface AuthContext {
  user: AuthContextUser;
  memberships: AuthContextMembership[];
}
