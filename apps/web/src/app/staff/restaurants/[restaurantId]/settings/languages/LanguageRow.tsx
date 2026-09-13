import type { RestaurantLocaleRow } from '../../../../../../lib/settings/types';
import { localeLabel } from '../../../../../../lib/settings/locale-labels';
import { Button } from '../../../../../../components/ui/Button';

/**
 * Default/Active badges, matching the exact `StatusBadge` visual convention
 * already established in `menu/StatusBadges.tsx` (same color tokens) --
 * kept local to this route rather than a cross-feature import, mirroring
 * how each feature folder already owns its own small display badges.
 */
function DefaultBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-[#7A5138]/10 px-2 py-0.5 text-xs font-medium text-[#7A5138]">
      Default
    </span>
  );
}

function ActiveStateBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? 'bg-[#2F6B4F]/10 text-[#2F6B4F]'
          : 'bg-[#8A8177]/10 text-[#8A8177]'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export interface LanguageRowProps {
  row: RestaurantLocaleRow;
  /** `restaurant.manage` AND `allBranches === true` -- whether this User can toggle a non-default locale at all (LOC-3, Section 6). */
  canManage: boolean;
  /** This row's own toggle request is currently in flight -- disables the control and prevents a duplicate call (Section 16). */
  isPending: boolean;
  onToggle: (locale: string, nextIsActive: boolean) => void;
}

/**
 * One Platform-supported locale row (LOC-3, Section 8-10). The default
 * locale never renders a working disable control -- not even a disabled
 * one -- since the Backend has no endpoint to change the default locale at
 * all (Section 9); a non-default locale renders an Enable/Disable `Button`
 * only when the current User can actually manage Languages, otherwise the
 * control is simply absent (Section 7) and a single shared explanatory note
 * is shown once by the parent workspace, not repeated per row.
 */
export function LanguageRow({
  row,
  canManage,
  isPending,
  onToggle,
}: LanguageRowProps) {
  const label = localeLabel(row.locale);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5DED6] bg-white px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[#1D1A18]">{label}</span>
          <span className="text-xs uppercase tracking-wide text-[#AFA397]">
            {row.locale}
          </span>
          {row.isDefault ? <DefaultBadge /> : null}
          <ActiveStateBadge active={row.isActive} />
        </div>
        <p className="mt-1 text-xs text-[#655D56]">
          {row.isDefault
            ? "The default language is always active and cannot be disabled."
            : row.isActive
              ? 'Staff can add translations in this language.'
              : 'Not available for editing until re-enabled.'}
        </p>
      </div>

      {!row.isDefault && canManage ? (
        <Button
          type="button"
          variant={row.isActive ? 'secondary' : 'primary'}
          disabled={isPending}
          onClick={() => onToggle(row.locale, !row.isActive)}
          aria-label={`${row.isActive ? 'Disable' : 'Enable'} ${label}`}
          className="flex-shrink-0"
        >
          {isPending ? 'Working…' : row.isActive ? 'Disable' : 'Enable'}
        </Button>
      ) : null}
    </div>
  );
}
