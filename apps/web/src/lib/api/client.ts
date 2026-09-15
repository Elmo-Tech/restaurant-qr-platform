import { API_BASE_URL } from './config';
import { ApiError } from './errors';

const HTTP_NO_CONTENT = 204;

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiFetchOptions {
  method?: ApiMethod;
  body?: unknown;
}

/**
 * Browser-only API transport (Batch G foundation). Every unsafe (mutating)
 * request must be issued as a genuine `fetch` from the browser itself, never
 * proxied through a Next.js Server Action/Route Handler -- only a real
 * browser request carries the non-spoofable `Origin` header the Backend's
 * `CsrfGuard` actually checks (AUTH_TENANCY_SPEC.md #105). `credentials:
 * 'include'` sends/receives the HttpOnly session cookie across the
 * dev-time cross-origin boundary (Web :3000, API :4000), matching the
 * Backend's explicit `CORS_ORIGIN` + `credentials: true` configuration.
 *
 * Returns the parsed response body as-is (e.g. `{ data: ... }` for success
 * responses, `undefined` for a `204 No Content`) -- callers destructure the
 * shape they expect. Throws `ApiError` for any non-2xx response.
 */
async function readApiResponse<TBody>(response: Response): Promise<TBody> {
  if (response.status === HTTP_NO_CONTENT) {
    return undefined as TBody;
  }

  const parsedBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, parsedBody);
  }

  return parsedBody as TBody;
}

export async function apiFetch<TBody = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<TBody> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers:
      options.body !== undefined
        ? { 'Content-Type': 'application/json' }
        : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  return readApiResponse<TBody>(response);
}

/**
 * FT-2: the one multipart/form-data transport, used only for Product/
 * Category image upload -- never the JSON path above. The browser sets its
 * own `Content-Type: multipart/form-data; boundary=...` header for a
 * `FormData` body, so this deliberately omits any explicit `Content-Type`
 * (setting one manually would drop the required boundary and break the
 * upload). Same `credentials: 'include'`/error-envelope handling as
 * `apiFetch`.
 */
export async function apiFetchFormData<TBody = unknown>(
  path: string,
  formData: FormData,
  method: 'POST' | 'PUT' = 'POST',
): Promise<TBody> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    body: formData,
  });

  return readApiResponse<TBody>(response);
}
