import { PLATFORM_API } from "./config";
import { ApiError } from "./errors";

export type ApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Browser-side transport for the platform API. `credentials: "include"` sends and receives the
 * HttpOnly platform session cookie across the API origin. Returns the parsed body as-is (`{ data }` for
 * most routes, `undefined` for a 204) and throws `ApiError` for any non-2xx response.
 */
export async function platformFetch<TBody = unknown>(
  path: string,
  options: { method?: ApiMethod; body?: unknown } = {},
): Promise<TBody> {
  const { body } = options;
  const multipart = body instanceof FormData;
  const json = body !== undefined && !multipart;
  const response = await fetch(`${PLATFORM_API}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    // The browser supplies the boundary for multipart uploads.
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: multipart ? body : json ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return undefined as TBody;
  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, parsed);
  return parsed as TBody;
}
