/**
 * FT-3/FT-3B, QR_SPEC.md #48/#49: the two guest-safe terminal states for
 * the public Menu -- never a raw API error code/JSON, never a Staff-styled
 * error component. Deliberately minimal: an unknown/inactive QR must not
 * confirm or deny anything about the underlying Restaurant, so this never
 * shows Restaurant branding or a navigation option.
 *
 * `dir`/`lang` come from the caller's own best-effort guess (the raw
 * `?lang=` the Guest's URL already carried, if any) -- the Backend never
 * resolves or returns a real locale for either outcome here (an unknown/
 * inactive QR has no Restaurant context to resolve one from at all), so
 * this deliberately does not wait on or invent Backend locale data; it
 * only mirrors the direction of whatever locale the interface copy itself
 * ended up in.
 */
export function GuestStatusPage({
  title,
  message,
  dir,
}: {
  title: string;
  message: string;
  dir: 'ltr' | 'rtl';
}) {
  return (
    <div
      dir={dir}
      className="flex min-h-screen items-center justify-center bg-[#F8F5F1] px-6 text-center"
    >
      <div className="flex max-w-sm flex-col items-center gap-2">
        <h1 className="text-lg font-semibold text-[#1D1A18]">{title}</h1>
        <p className="text-sm text-[#655D56]">{message}</p>
      </div>
    </div>
  );
}
