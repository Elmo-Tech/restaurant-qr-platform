import { apiFetch } from '../api/client';
import type {
  CreateRoleInput,
  CreateStaffUserInput,
  CreateStaffUserResult,
  StaffMember,
  StaffRole,
  UpdateMembershipInput,
  UpdateRoleInput,
} from './types';

/** Thin Staff & Access request layer: one function per documented Backend route, over the existing `apiFetch`. */

function restaurantPath(restaurantId: string): string {
  return `/restaurants/${restaurantId}`;
}

export async function listStaffMembers(restaurantId: string): Promise<StaffMember[]> {
  const body = await apiFetch<{ data: StaffMember[] }>(`${restaurantPath(restaurantId)}/memberships`);
  return body.data;
}

export async function listStaffRoles(restaurantId: string): Promise<StaffRole[]> {
  const body = await apiFetch<{ data: StaffRole[] }>(`${restaurantPath(restaurantId)}/roles`);
  return body.data;
}

/** Direct user creation. The password is sent once for a new account; the Backend ignores it for an existing one and never returns it. */
export async function createStaffUser(
  restaurantId: string,
  input: CreateStaffUserInput,
): Promise<CreateStaffUserResult> {
  const body = await apiFetch<{ data: CreateStaffUserResult }>(`${restaurantPath(restaurantId)}/memberships`, {
    method: 'POST',
    body: input,
  });
  return body.data;
}

export async function updateStaffMembership(
  restaurantId: string,
  membershipId: string,
  input: UpdateMembershipInput,
): Promise<StaffMember> {
  const body = await apiFetch<{ data: StaffMember }>(
    `${restaurantPath(restaurantId)}/memberships/${membershipId}`,
    { method: 'PATCH', body: input },
  );
  return body.data;
}

export async function setStaffMembershipEnabled(
  restaurantId: string,
  membershipId: string,
  enabled: boolean,
): Promise<StaffMember> {
  const body = await apiFetch<{ data: StaffMember }>(
    `${restaurantPath(restaurantId)}/memberships/${membershipId}/${enabled ? 'enable' : 'disable'}`,
    { method: 'POST' },
  );
  return body.data;
}

export async function createStaffRole(restaurantId: string, input: CreateRoleInput): Promise<StaffRole> {
  const body = await apiFetch<{ data: StaffRole }>(`${restaurantPath(restaurantId)}/roles`, {
    method: 'POST',
    body: input,
  });
  return body.data;
}

export async function updateStaffRole(
  restaurantId: string,
  roleId: string,
  input: UpdateRoleInput,
): Promise<StaffRole> {
  const body = await apiFetch<{ data: StaffRole }>(`${restaurantPath(restaurantId)}/roles/${roleId}`, {
    method: 'PATCH',
    body: input,
  });
  return body.data;
}

/** Fails with `ROLE_IN_USE` (details.memberCount) while any user still holds the Role; nothing is ever cascaded. */
export async function deleteStaffRole(restaurantId: string, roleId: string): Promise<void> {
  await apiFetch<undefined>(`${restaurantPath(restaurantId)}/roles/${roleId}`, { method: 'DELETE' });
}
