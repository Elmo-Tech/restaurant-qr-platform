import { apiFetch } from '../api/client';

/**
 * FT-12 Account / Password Recovery request layer. One function per Backend
 * route (`POST /auth/change-password`, `/auth/forgot-password`,
 * `/auth/reset-password`), using the existing `apiFetch` transport. Neither
 * password is ever logged or stored here.
 */

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await apiFetch<undefined>('/auth/change-password', { method: 'POST', body: input });
}

/**
 * Production always answers `204` (no body, never reveals whether the email
 * exists). Outside production the Backend answers `200 { data: { resetToken } }`
 * only when a token was actually issued -- the explicitly permitted
 * development-only recovery mechanism (no mail provider exists before FT-13).
 * Returns that token when present, otherwise `null`.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const body = await apiFetch<{ data?: { resetToken?: string } } | undefined>(
    '/auth/forgot-password',
    { method: 'POST', body: { email } },
  );
  return body?.data?.resetToken ?? null;
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  await apiFetch<undefined>('/auth/reset-password', { method: 'POST', body: input });
}
