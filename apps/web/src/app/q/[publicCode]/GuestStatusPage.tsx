/**
 * FT-3, QR_SPEC.md #48/#49: the two guest-safe terminal states for the
 * public Menu -- never a raw API error code/JSON, never a Staff-styled
 * error component. Deliberately minimal: an unknown/inactive QR must not
 * confirm or deny anything about the underlying Restaurant, so this never
 * shows Restaurant branding or a navigation option.
 */
export function GuestStatusPage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FCFBF9] px-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-2">
        <h1 className="text-lg font-semibold text-[#1D1A18]">{title}</h1>
        <p className="text-sm text-[#655D56]">{message}</p>
      </div>
    </div>
  );
}
