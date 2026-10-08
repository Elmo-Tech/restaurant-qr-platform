/**
 * Shown by Next.js while the Server Component in `page.tsx` is still fetching (a first load,
 * or a client-side `?lang=` navigation). The skeleton mirrors the new layout -- the hero block,
 * the floating control bar, the chip row and three product cards (horizontal on a phone, a
 * grid from 768px) -- so nothing jumps when content arrives. The shimmer is CSS-only, reads on
 * both themes (it tints with `--g-text`) and switches off under reduced motion. The theme
 * itself comes from the /q layout, so the skeleton already has the Guest's colours.
 */
function Bone({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden bg-g-surface-2 ${className}`}>
      <div className="guest-shimmer absolute inset-0" />
    </div>
  );
}

export default function PublicMenuLoading() {
  return (
    <div className="g-body" aria-busy="true">
      <div className="relative h-[330px] overflow-hidden bg-g-surface lg:h-[400px]">
        <div className="mx-auto flex h-full max-w-[1280px] flex-col justify-between px-4 pb-[52px] pt-4 lg:px-8 lg:pb-16 lg:pt-6">
          <div className="flex items-center justify-between">
            <Bone className="h-11 w-28 rounded-full" />
            <Bone className="size-11 rounded-full" />
          </div>
          <div className="flex items-end gap-3.5 lg:gap-[22px]">
            <Bone className="size-[72px] shrink-0 rounded-[20px] lg:size-[112px] lg:rounded-[30px]" />
            <div className="flex flex-col gap-2.5 pb-1">
              <Bone className="h-9 w-44 rounded-lg lg:h-16 lg:w-80" />
              <Bone className="h-4 w-32 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-8">
        <div className="mx-auto max-w-[1280px]">
          <Bone className="-mt-7 h-[62px] rounded-[30px] border border-g-line lg:h-[68px]" />
          <Bone className="mt-5 h-[50px] rounded-2xl lg:hidden" />
          <div className="mt-3.5 flex gap-2.5 py-3">
            <Bone className="h-11 w-28 shrink-0 rounded-full" />
            <Bone className="h-11 w-24 shrink-0 rounded-full" />
            <Bone className="h-11 w-24 shrink-0 rounded-full" />
            <Bone className="hidden h-11 w-28 shrink-0 rounded-full sm:block" />
          </div>
        </div>
      </div>

      <div className="px-4 pb-16 pt-5 lg:px-8 lg:pt-7">
        <div className="mx-auto max-w-[1280px]">
          <Bone className="mb-3.5 h-8 w-44 rounded-lg" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] md:gap-5">
            {[0, 1, 2].map((card) => (
              <div
                key={card}
                className="flex gap-3.5 rounded-[22px] border border-g-line bg-g-surface p-3 md:flex-col md:gap-0 md:overflow-hidden md:rounded-[24px] md:p-0"
              >
                <Bone className="size-[118px] shrink-0 rounded-2xl md:size-auto md:h-[200px] md:w-full md:rounded-none" />
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1 md:px-[18px] md:pb-[18px] md:pt-4">
                  <Bone className="h-5 w-2/3 rounded-md" />
                  <Bone className="h-3.5 w-full rounded-md" />
                  <Bone className="h-3.5 w-1/2 rounded-md" />
                  <Bone className="mt-auto h-6 w-20 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
