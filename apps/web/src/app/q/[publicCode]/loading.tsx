/**
 * FT-3/FT-3B, Section 16/20: shown by Next.js while the Server Component in
 * `page.tsx` is still fetching (e.g. during a client-side `?lang=`
 * navigation) -- a plain skeleton matching the real page's container width
 * and two-column desktop card grid, never a raw blank screen or
 * spinner-only state.
 */
export default function PublicMenuLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-[#F8F5F1]">
      <div className="border-b border-[#E5DED6] bg-[#FCFBF9]">
        <div className="mx-auto max-w-[1100px] px-4 pt-5 pb-3 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <div className="h-7 w-40 rounded bg-[#E5DED6]" />
            <div className="h-8 w-24 rounded-full bg-[#E5DED6]" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-8 w-20 shrink-0 rounded-full bg-[#E5DED6]" />
            <div className="h-8 w-24 shrink-0 rounded-full bg-[#E5DED6]" />
            <div className="h-8 w-16 shrink-0 rounded-full bg-[#E5DED6]" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-4 pt-6 pb-16 sm:px-6 lg:px-10">
        <div className="mb-8 border-b border-[#E5DED6] pb-6">
          <div className="h-6 w-48 rounded bg-[#E5DED6]" />
          <div className="mt-2 h-4 w-72 max-w-full rounded bg-[#F1ECE6]" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex gap-4 rounded-xl border border-[#E5DED6] bg-white p-3.5">
              <div className="h-24 w-24 flex-shrink-0 rounded-lg bg-[#F1ECE6]" />
              <div className="flex flex-1 flex-col justify-center gap-2">
                <div className="h-4 w-2/3 rounded bg-[#E5DED6]" />
                <div className="h-3 w-full rounded bg-[#F1ECE6]" />
                <div className="h-3 w-1/3 rounded bg-[#E5DED6]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
