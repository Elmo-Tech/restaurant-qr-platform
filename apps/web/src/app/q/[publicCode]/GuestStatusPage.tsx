import { GuestIconInfo } from '../../../components/guest/icons';

/**
 * The two guest-safe terminal states for the public Menu (QR_SPEC.md #48/#49):
 * an unknown/inactive QR, and a menu that is temporarily unavailable. Never raw
 * API text or a Staff-styled error. Deliberately free of Restaurant branding or
 * navigation -- an unknown/inactive QR must not confirm or deny anything about
 * the underlying Restaurant.
 *
 * `dir` comes from the caller's own best-effort guess (the raw `?lang=` the
 * Guest's URL already carried, if any) -- the Backend never resolves a real
 * locale for either outcome, so this only mirrors the direction of whatever
 * locale the interface copy itself ended up in.
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
      className="guest-root flex min-h-dvh items-center justify-center bg-guest-paper px-6 py-12 text-center"
    >
      <div className="flex max-w-sm flex-col items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-full bg-guest-pine-soft text-guest-pine">
          <GuestIconInfo className="size-8" />
        </span>
        <h1 className="font-guest-display text-2xl font-extrabold leading-tight text-guest-ink">
          {title}
        </h1>
        <p className="text-base leading-relaxed text-guest-muted">{message}</p>
      </div>
    </div>
  );
}
