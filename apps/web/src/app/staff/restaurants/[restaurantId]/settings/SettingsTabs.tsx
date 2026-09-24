import Link from 'next/link';

export type SettingsSection = 'languages' | 'delivery';

const TABS: { key: SettingsSection; label: string; path: string }[] = [
  { key: 'languages', label: 'Languages', path: 'languages' },
  { key: 'delivery', label: 'Delivery', path: 'delivery' },
];

const PLACEHOLDERS = ['General', 'Branding'];

/**
 * Small Restaurant Settings local navigation (LOC-3, Section 19; FT-8 adds
 * Delivery). Real tabs are `<Link>`s to routes that exist; General and
 * Branding remain visibly disabled placeholders with no `href`, never a link
 * to a route that does not exist (mirrors `RestaurantSidebar`'s own "Soon"
 * convention exactly). Kept as a single small component rather than a
 * generic tab framework.
 */
export function SettingsTabs({
  restaurantId,
  active,
}: {
  restaurantId: string;
  active: SettingsSection;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[#E5DED6]">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`/staff/restaurants/${restaurantId}/settings/${tab.path}`}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-[#7A5138] text-[#7A5138]'
                : 'border-transparent text-[#655D56] hover:text-[#302C29]'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
      {PLACEHOLDERS.map((label) => (
        <span
          key={label}
          aria-disabled="true"
          className="flex flex-shrink-0 cursor-not-allowed items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-[#AFA397]"
        >
          {label}
          <span className="rounded-full bg-[#F1ECE6] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#8A8177]">
            Soon
          </span>
        </span>
      ))}
    </div>
  );
}
