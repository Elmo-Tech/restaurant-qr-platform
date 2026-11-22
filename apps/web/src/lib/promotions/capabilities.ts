import type { AuthContextMembership } from '../auth/types';

export function usesPromotions(membership: AuthContextMembership): boolean {
  return membership.restaurant.features?.PROMOTIONS === true;
}

export function canViewPromotions(membership: AuthContextMembership): boolean {
  return membership.permissions.includes('promotions.view');
}

export function canOpenPromotions(membership: AuthContextMembership): boolean {
  return usesPromotions(membership) && canViewPromotions(membership);
}

export function canManagePromotions(membership: AuthContextMembership): boolean {
  return canOpenPromotions(membership) && membership.allBranches === true && membership.permissions.includes('promotions.manage');
}
