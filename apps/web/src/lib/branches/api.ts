import { apiFetch } from '../api/client';
import type { BranchFormValues, BranchItem } from './types';

/** Thin Branch Management request layer over the existing `apiFetch`. No delete route exists or is exposed -- Branches are only ever activated/deactivated. */

function branchesPath(restaurantId: string): string {
  return `/restaurants/${restaurantId}/branches`;
}

export async function listBranches(restaurantId: string): Promise<BranchItem[]> {
  const body = await apiFetch<{ data: BranchItem[] }>(branchesPath(restaurantId));
  return body.data;
}

export async function createBranch(restaurantId: string, values: BranchFormValues): Promise<BranchItem> {
  const body = await apiFetch<{ data: BranchItem }>(branchesPath(restaurantId), {
    method: 'POST',
    body: {
      name: values.name,
      ...(values.translations ? { translations: values.translations } : {}),
      timezone: values.timezone,
      phone: values.phone,
      address: values.address,
    },
  });
  return body.data;
}

export async function updateBranch(
  restaurantId: string,
  branchId: string,
  values: BranchFormValues,
): Promise<BranchItem> {
  const body = await apiFetch<{ data: BranchItem }>(`${branchesPath(restaurantId)}/${branchId}`, {
    method: 'PATCH',
    body: {
      name: values.name,
      ...(values.translations ? { translations: values.translations } : {}),
      timezone: values.timezone,
      phone: values.phone,
      address: values.address,
    },
  });
  return body.data;
}

export async function setBranchActive(
  restaurantId: string,
  branchId: string,
  active: boolean,
): Promise<void> {
  await apiFetch<unknown>(`${branchesPath(restaurantId)}/${branchId}/${active ? 'activate' : 'deactivate'}`, {
    method: 'POST',
  });
}
