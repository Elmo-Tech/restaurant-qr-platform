import { apiFetch, apiFetchFormData } from '../api/client';
import type {
  ApproveResult,
  ImportDraft,
  ImportJob,
  ImportLanguageHint,
} from './types';

/** Thin request layer for `/restaurants/{id}/menu-imports` (MENU_IMPORT_SPEC.md #20). */
const base = (restaurantId: string) => `/restaurants/${restaurantId}/menu-imports`;

export async function startImport(
  restaurantId: string,
  input: { files: File[]; targetMenuId: string; languageHint: ImportLanguageHint },
): Promise<{ publicId: string; status: ImportJob['status'] }> {
  const form = new FormData();
  form.append('targetMenuId', input.targetMenuId);
  form.append('languageHint', input.languageHint);
  // One `file` part per file, in the order the user picked them (the Backend keeps that order).
  for (const file of input.files) form.append('file', file);
  const body = await apiFetchFormData<{ data: { publicId: string; status: ImportJob['status'] } }>(
    base(restaurantId),
    form,
  );
  return body.data;
}

export async function listImports(restaurantId: string): Promise<ImportJob[]> {
  const body = await apiFetch<{ data: ImportJob[] }>(base(restaurantId));
  return body.data;
}

export async function getImport(restaurantId: string, publicId: string): Promise<ImportJob> {
  const body = await apiFetch<{ data: ImportJob }>(`${base(restaurantId)}/${publicId}`);
  return body.data;
}

export async function getDraft(restaurantId: string, publicId: string): Promise<ImportDraft> {
  const body = await apiFetch<{ data: ImportDraft }>(`${base(restaurantId)}/${publicId}/draft`);
  return body.data;
}

export async function updateDraftCategory(
  restaurantId: string,
  publicId: string,
  draftCategoryId: string,
  input: { included?: boolean; useExisting?: boolean; names?: Record<string, string | null> },
): Promise<void> {
  await apiFetch(`${base(restaurantId)}/${publicId}/categories/${draftCategoryId}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function updateDraftProduct(
  restaurantId: string,
  publicId: string,
  draftProductId: string,
  input: {
    included?: boolean;
    price?: string | null;
    names?: Record<string, string | null>;
    descriptions?: Record<string, string | null>;
  },
): Promise<void> {
  await apiFetch(`${base(restaurantId)}/${publicId}/products/${draftProductId}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function approveImport(
  restaurantId: string,
  publicId: string,
  productStatus: 'ACTIVE' | 'INACTIVE',
): Promise<ApproveResult> {
  const body = await apiFetch<{ data: ApproveResult }>(`${base(restaurantId)}/${publicId}/approve`, {
    method: 'POST',
    body: { productStatus },
  });
  return body.data;
}

export async function discardImport(restaurantId: string, publicId: string): Promise<void> {
  await apiFetch(`${base(restaurantId)}/${publicId}/discard`, { method: 'POST', body: {} });
}
