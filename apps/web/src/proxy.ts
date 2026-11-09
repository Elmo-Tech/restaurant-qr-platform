import { NextResponse, type NextRequest } from "next/server";
import { restaurantSlugFromHost } from "./lib/guest-menu/subdomain-host";

/** Hostnames only select a public generic QR; the Backend still resolves and validates it. */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  // Next may normalize nextUrl.hostname to the listening host; use the routed Host header.
  const slug = restaurantSlugFromHost(request.headers.get("host") ?? "");
  if (!slug) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/q/${slug}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: "/" };
