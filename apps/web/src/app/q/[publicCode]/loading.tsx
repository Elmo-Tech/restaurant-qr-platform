/**
 * Shown by Next.js while the Server Component in `page.tsx` is still fetching
 * (a first load, or a client-side `?lang=` navigation). The skeleton mirrors
 * the real page -- brand block, ticket, category strip, a list of product rows
 * on phones and a card grid from `sm` up -- so nothing jumps when content
 * arrives. Shimmer is CSS-only and switches off under reduced motion.
 */
function Bone({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden bg-guest-line/70 ${className}`}>
      <div className="guest-shimmer absolute inset-0" />
    </div>
  );
}

export default function PublicMenuLoading() {
  return (
    <div className="guest-root min-h-dvh bg-guest-paper" aria-busy="true">
      <div className="px-4 pt-4 pb-5 sm:px-6 sm:pt-7 sm:pb-7 lg:px-10">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 sm:gap-5">
              <Bone className="size-14 rounded-2xl sm:size-[72px]" />
              <div className="flex flex-col gap-2">
                <Bone className="h-7 w-44 rounded-lg sm:h-10 sm:w-72" />
                <Bone className="h-4 w-24 rounded-md" />
              </div>
            </div>
            <Bone className="h-11 w-24 rounded-full" />
          </div>
          <div className="flex md:justify-end">
            <Bone className="h-[72px] w-full max-w-sm rounded-2xl md:w-[280px]" />
          </div>
        </div>
      </div>

      <div className="border-y border-guest-line">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-2 px-4 sm:px-6 lg:px-10">
          <Bone className="size-11 shrink-0 rounded-full" />
          <Bone className="h-10 w-24 shrink-0 rounded-full" />
          <Bone className="h-10 w-28 shrink-0 rounded-full" />
          <Bone className="h-10 w-20 shrink-0 rounded-full" />
          <Bone className="hidden h-10 w-28 shrink-0 rounded-full sm:block" />
        </div>
      </div>

      <div className="px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-10">
        <div className="mx-auto max-w-[1180px]">
          <Bone className="mb-4 h-8 w-44 rounded-lg" />
          <div className="divide-y divide-guest-line rounded-2xl border border-guest-line bg-guest-surface sm:grid sm:grid-cols-2 sm:gap-5 sm:divide-y-0 sm:rounded-none sm:border-0 sm:bg-transparent lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((card) => (
              <div
                key={card}
                className="flex gap-3.5 p-3.5 sm:flex-col sm:gap-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-guest-line sm:bg-guest-surface sm:p-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:order-2 sm:p-4">
                  <Bone className="h-5 w-2/3 rounded-md" />
                  <Bone className="h-3.5 w-full rounded-md" />
                  <Bone className="h-3.5 w-1/2 rounded-md" />
                  <Bone className="mt-2 h-5 w-20 rounded-md" />
                </div>
                <Bone className="size-[104px] shrink-0 rounded-2xl sm:order-1 sm:aspect-[4/3] sm:size-auto sm:w-full sm:rounded-none" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
