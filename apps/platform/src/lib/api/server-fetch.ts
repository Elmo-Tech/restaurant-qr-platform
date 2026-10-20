import { headers } from "next/headers";
import { SERVER_PLATFORM_API } from "./config";

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null };

/**
 * Server Component read: forwards the browser's Cookie header to the API (GET only, so there is no
 * CSRF concern; writes always come from the browser). `status: null` = the API could not be reached,
 * which must never be mistaken for "signed out".
 */
export async function platformServerGet<T>(path: string): Promise<ServerResult<T>> {
  const incoming = await headers();
  const cookie = incoming.get("cookie");
  let response: Response;
  try {
    // The visitor's address chain goes along, so the API's per-IP rate limit sees the visitor, not this server.
    const forwardedFor = incoming.get("x-forwarded-for");
    response = await fetch(`${SERVER_PLATFORM_API}${path}`, {
      method: "GET",
      headers: { ...(cookie ? { cookie } : {}), ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}) },
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: null };
  }
  if (!response.ok) return { ok: false, status: response.status };
  const body = (await response.json().catch(() => null)) as { data: T } | null;
  return body ? { ok: true, data: body.data } : { ok: false, status: null };
}
