import Link from 'next/link';

/**
 * Small Restaurant Settings local navigation (LOC-3, Section 19). Only
 * Languages links anywhere -- General and Branding are visibly disabled
 * placeholders with no `href`, never a link to a route that does not exist
 * (mirrors `RestaurantSidebar`'s own "Soon" convention exactly). Kept as a
 * single small component rather than a generic tab framework; adding a real
 * General/Branding page later means adding one more real tab here, not
 * redesigning this component.
 */
export function SettingsTabs({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E5DED6]">
      <Link
        href={`/staff/restaurants/${restaurantId}/settings/languages`}
        aria-current="page"
        className="flex-shrink-0 whitespace-nowrap border-b-2 border-[#7A5138] px-3 py-2.5 text-sm font-medium text-[#7A5138]"
      >
        Languages
      </Link>
      <span
        aria-disabled="true"
        className="flex flex-shrink-0 cursor-not-allowed items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-[#AFA397]"
      >
        General
        <span className="rounded-full bg-[#F1ECE6] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8A8177]">
          Soon
        </span>
      </span>
      <span
        aria-disabled="true"
        className="flex flex-shrink-0 cursor-not-allowed items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-[#AFA397]"
      >
        Branding
        <span className="rounded-full bg-[#F1ECE6] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8A8177]">
          Soon
        </span>
      </span>
    </div>
  );
}
