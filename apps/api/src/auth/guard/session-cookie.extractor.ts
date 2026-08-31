/**
 * Extracts one named cookie's value from a raw `Cookie` request header,
 * without a general-purpose RFC 6265 cookie-parsing dependency.
 *
 * This is deliberately narrow, not a general cookie parser: it only needs to
 * recover a value that this same application generated. The staff session
 * cookie always carries a raw opaque token from SessionTokenService --
 * exactly 43 characters from the base64url alphabet (`A-Z a-z 0-9 - _`,
 * AUTH_TENANCY_SPEC.md #21A). That alphabet contains none of the characters
 * (`;`, `,`, `"`, `=`, whitespace) that make general cookie-value parsing
 * non-trivial, and Express's own cookie serializer leaves it untouched
 * (those characters are all in `encodeURIComponent`'s unreserved set), so no
 * decoding step is needed here either. `AuthSessionService.resolveSession`
 * still independently re-validates the extracted value's shape before using
 * it -- this function only recovers the substring, it does not authenticate.
 *
 * Fail-closed on duplicates: the authentication boundary must not resolve
 * ambiguous duplicate session credentials based on header ordering, so this
 * deliberately does not pick a first-wins or last-wins value.
 *
 * - 0 pairs with a matching name -> `undefined` (no credential supplied).
 * - Exactly 1 pair with a matching name -> that pair's value.
 * - 2 or more pairs with a matching name -> `undefined` (ambiguous; the
 *   caller must treat this identically to "no credential supplied", not
 *   attempt to resolve any of the candidate values).
 */
export function extractSessionCookie(
  cookieHeader: string | undefined,
  cookieName: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const matches: string[] = [];

  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const name = pair.slice(0, separatorIndex).trim();
    if (name === cookieName) {
      matches.push(pair.slice(separatorIndex + 1).trim());
    }
  }

  return matches.length === 1 ? matches[0] : undefined;
}
