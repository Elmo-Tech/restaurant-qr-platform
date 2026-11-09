/** Recognize only one Restaurant label on the configured public domain or local dev host. */
export function restaurantSlugFromHost(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();
  const match = hostname.match(
    /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(waytaapp\.com|localhost)$/,
  );
  if (
    !match ||
    match[1].length < 3 ||
    match[1].length > 40 ||
    [
      "www",
      "menu",
      "platform",
      "control",
      "admin",
      "app",
      "api",
      "staff",
      "dashboard",
    ].includes(match[1])
  )
    return null;
  return match[1];
}

/** Sharing from a restaurant host keeps the current canonical restaurant subdomain. */
export function shareMenuUrl(currentOrigin: string, segment: string): string {
  const url = new URL(currentOrigin);
  const currentSlug = restaurantSlugFromHost(url.host);
  if (
    currentSlug &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment) &&
    segment.length >= 3 &&
    segment.length <= 40
  ) {
    url.hostname = `${segment}.${url.hostname.slice(currentSlug.length + 1)}`;
    return url.origin;
  }
  return `${url.origin}/q/${encodeURIComponent(segment)}`;
}
