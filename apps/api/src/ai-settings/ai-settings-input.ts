/** Validation of what the Platform team types in the AI settings screen (DEC-059). Pure: no I/O. */

/** The model name goes into a request body, so it is kept to a plain identifier (for example `gemini-3.8-flash`). */
export const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/;
export const MAX_LABEL_CHARS = 60;
export const MIN_API_KEY_CHARS = 20;
export const MAX_API_KEY_CHARS = 256;
/** A sanity cap on how many keys the pool holds. */
export const MAX_KEYS = 20;

export function normalizeModelName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return MODEL_NAME_PATTERN.test(text) ? text : null;
}

/** A short name shown next to the key (it may be Arabic); control characters and long text are refused. */
export function normalizeLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length >= 1 && text.length <= MAX_LABEL_CHARS ? text : null;
}

/** An API key is visible ASCII with no spaces: what is pasted from the provider, minus stray whitespace around it. */
export function normalizeApiKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length < MIN_API_KEY_CHARS || text.length > MAX_API_KEY_CHARS) {
    return null;
  }
  return /^[\x21-\x7e]+$/.test(text) ? text : null;
}
