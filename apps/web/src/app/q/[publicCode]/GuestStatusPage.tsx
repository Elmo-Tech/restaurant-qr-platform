import { GuestIconInfo } from '../../../components/guest/icons';

/**
 * The two guest-safe terminal states for the public Menu (QR_SPEC.md #48/#49): an unknown or
 * inactive QR, and a menu that is temporarily unavailable. Never raw API text or a Staff-styled
 * error. Deliberately free of Restaurant branding or navigation -- an unknown/inactive QR must
 * not confirm or deny anything about the underlying Restaurant. Styled with the Guest tokens
 * (the theme comes from the /q layout), so it matches the menu in dark and light.
 *
 * `dir` comes from the caller's own best-effort guess (the raw `?lang=` the Guest's URL already
 * carried, if any) -- the Backend never resolves a real locale for either outcome, so this only
 * mirrors the direction of whatever locale the interface copy itself ended up in.
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
      className="g-body flex min-h-dvh items-center justify-center px-6 py-12 text-center"
    >
      <div className="flex max-w-sm flex-col items-center gap-4">
        <span className="g-fallback flex size-[72px] items-center justify-center rounded-full text-g-accent">
          <GuestIconInfo className="size-9" />
        </span>
        <h1 className="g-display text-[30px] leading-[1.2] text-g-text">{title}</h1>
        <p className="text-[15px] leading-[1.7] text-g-text-2">{message}</p>
      </div>
    </div>
  );
}
