/**
 * FT-5 critical fix: the Backend's `clientRequestId` field is `@IsUUID()`
 * -- a non-UUID value (e.g. the previous `Date.now()-Math.random()`
 * fallback) is rejected outright, which is worse than merely "not random
 * enough": it breaks idempotency validation entirely. `crypto.randomUUID()`
 * is the preferred source; a browser new enough to run this app but
 * missing that one method still very likely has `crypto.getRandomValues`,
 * so the fallback constructs a real RFC 4122 version-4 UUID from raw random
 * bytes rather than faking the shape with `Math/Date`.
 */
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // RFC 4122 §4.4: set version (4) and variant (10) bits.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // No usable random source at all -- an environment this broken cannot
  // safely submit a Guest Order anyway (Section: never fake a UUID with
  // Math.random/Date).
  throw new Error('No secure random source available to generate a clientRequestId.');
}

/** RFC 4122 version-4 UUID shape, case-insensitive -- used only to self-check `generateUuid`'s own output, never to validate Backend responses. */
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}
