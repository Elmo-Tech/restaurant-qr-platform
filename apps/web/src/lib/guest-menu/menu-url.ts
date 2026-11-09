/** Human-readable restaurant links may use a subdomain; opaque QR codes always keep /q/. */
export function menuUrl(
  webOrigin: string,
  segment: string,
  subdomainOrigin?: string,
): string {
  if (
    subdomainOrigin &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment) &&
    segment.length >= 3 &&
    segment.length <= 40
  ) {
    const url = new URL(subdomainOrigin);
    url.hostname = `${segment}.${url.hostname}`;
    return url.origin;
  }
  return `${webOrigin.replace(/\/+$/, "")}/q/${encodeURIComponent(segment)}`;
}
