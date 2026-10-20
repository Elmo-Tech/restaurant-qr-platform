/**
 * The brand intro on the landing page. Set `INTRO_ENABLED` to `false` to switch it off everywhere and get the
 * hero exactly as it was before the intro existed. For a single look at either behaviour, the URL decides:
 * `/?intro=1` always plays it, `/?intro=0` never does.
 */
export const INTRO_ENABLED = true;

/** A session cookie (gone when the browser closes): the visitor has already seen the intro. */
export const INTRO_COOKIE = 'landing_intro';

/** How long the animation runs (it is about 3.5 seconds), plus a breath, before the intro fades out. */
export const INTRO_DURATION_MS = 4000;

/** Whether the server should render the intro: enabled, and either forced by `?intro=1` or not yet seen. */
export function shouldShowIntro(input: { seenCookie: string | undefined; param: string | undefined }): boolean {
  if (!INTRO_ENABLED) return false;
  if (input.param === '0') return false;
  if (input.param === '1') return true;
  return input.seenCookie !== '1';
}
