/**
 * Section 20: shown by Next.js while the Server Component in `page.tsx` is
 * still fetching (e.g. during a client-side `?lang=` navigation) -- a
 * plain skeleton, never a raw blank screen or spinner-only state.
 */
export default function PublicMenuLoading() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl animate-pulse bg-[#FCFBF9] px-4 pb-16 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="h-6 w-40 rounded bg-[#E5DED6]" />
        <div className="h-8 w-24 rounded-full bg-[#E5DED6]" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-8 w-20 shrink-0 rounded-full bg-[#E5DED6]" />
        <div className="h-8 w-24 shrink-0 rounded-full bg-[#E5DED6]" />
        <div className="h-8 w-16 shrink-0 rounded-full bg-[#E5DED6]" />
      </div>
      <div className="mt-8 flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex gap-3 rounded-lg border border-[#E5DED6] bg-white p-3">
            <div className="h-20 w-20 flex-shrink-0 rounded-md bg-[#F1ECE6]" />
            <div className="flex flex-1 flex-col justify-center gap-2">
              <div className="h-4 w-2/3 rounded bg-[#E5DED6]" />
              <div className="h-3 w-full rounded bg-[#F1ECE6]" />
              <div className="h-3 w-1/3 rounded bg-[#E5DED6]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
