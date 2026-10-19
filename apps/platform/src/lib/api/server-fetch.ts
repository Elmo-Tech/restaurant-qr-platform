import { headers } from "next/headers";
import { PLATFORM_API } from "./config";

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
    response = await fetch(`${PLATFORM_API}${path}`, {
      method: "GET",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: null };
  }
  if (!response.ok) return { ok: false, status: response.status };
  const body = (await response.json().catch(() => null)) as { data: T } | null;
  return body ? { ok: true, data: body.data } : { ok: false, status: null };
}
