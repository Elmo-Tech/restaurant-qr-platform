import { extractSessionCookie } from './session-cookie.extractor';

const COOKIE_NAME = 'restaurant_session';
const TOKEN = 'A'.repeat(43);

describe('extractSessionCookie', () => {
  it('returns undefined when the header is undefined', () => {
    expect(extractSessionCookie(undefined, COOKIE_NAME)).toBeUndefined();
  });

  it('returns undefined when the header is empty', () => {
    expect(extractSessionCookie('', COOKIE_NAME)).toBeUndefined();
  });

  it('extracts the value for a single matching cookie', () => {
    expect(extractSessionCookie(`${COOKIE_NAME}=${TOKEN}`, COOKIE_NAME)).toBe(
      TOKEN,
    );
  });

  it('extracts the value among several unrelated cookies', () => {
    const header = `theme=dark; ${COOKIE_NAME}=${TOKEN}; lang=en`;
    expect(extractSessionCookie(header, COOKIE_NAME)).toBe(TOKEN);
  });

  it('does not authenticate via an unrelated cookie of the same-ish name', () => {
    const header = `restaurant_session_other=${TOKEN}; theme=dark`;
    expect(extractSessionCookie(header, COOKIE_NAME)).toBeUndefined();
  });

  it('returns undefined when the configured cookie is entirely absent', () => {
    expect(
      extractSessionCookie('theme=dark; lang=en', COOKIE_NAME),
    ).toBeUndefined();
  });

  it('fails closed (returns undefined) when the configured cookie name repeats twice', () => {
    const header = `${COOKIE_NAME}=first-value; ${COOKIE_NAME}=${TOKEN}`;
    expect(extractSessionCookie(header, COOKIE_NAME)).toBeUndefined();
  });

  it('fails closed when the configured cookie name repeats three or more times', () => {
    const header = `${COOKIE_NAME}=a; ${COOKIE_NAME}=b; ${COOKIE_NAME}=c`;
    expect(extractSessionCookie(header, COOKIE_NAME)).toBeUndefined();
  });

  it('fails closed even when every duplicate carries the identical value', () => {
    const header = `${COOKIE_NAME}=${TOKEN}; ${COOKIE_NAME}=${TOKEN}`;
    expect(extractSessionCookie(header, COOKIE_NAME)).toBeUndefined();
  });

  it('duplicate UNRELATED cookies do not affect extraction of the configured cookie', () => {
    const header = `theme=dark; theme=light; ${COOKIE_NAME}=${TOKEN}`;
    expect(extractSessionCookie(header, COOKIE_NAME)).toBe(TOKEN);
  });

  it('trims surrounding whitespace around name and value', () => {
    const header = `  ${COOKIE_NAME}  =  ${TOKEN}  ;theme=dark`;
    expect(extractSessionCookie(header, COOKIE_NAME)).toBe(TOKEN);
  });

  it('returns an empty string for a present-but-empty cookie value', () => {
    expect(extractSessionCookie(`${COOKIE_NAME}=`, COOKIE_NAME)).toBe('');
  });

  it('ignores a malformed pair without an "=" separator', () => {
    const header = `malformed-pair; ${COOKIE_NAME}=${TOKEN}`;
    expect(extractSessionCookie(header, COOKIE_NAME)).toBe(TOKEN);
  });
});
