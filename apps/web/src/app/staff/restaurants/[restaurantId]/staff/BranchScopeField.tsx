'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import { localizedName } from '../../../../../lib/i18n/localized-name';
import type { BranchItem } from '../../../../../lib/branches/types';
import type { BranchScopeInput } from '../../../../../lib/staff/types';

export interface BranchScopeFieldProps {
  idPrefix: string;
  branches: BranchItem[];
  /** Only a Membership with Restaurant-wide scope may grant "all branches" (the Backend enforces this too). */
  canGrantAll: boolean;
  value: BranchScopeInput;
  onChange: (next: BranchScopeInput) => void;
  error?: string;
  disabled: boolean;
}

/**
 * The shared Branch-access picker for Invite and Edit access: "All
 * branches" or a hand-picked set. Mirrors the Backend contract exactly --
 * `allBranches: true` carries an empty `branchIds`; `allBranches: false`
 * needs at least one. UX only; `StaffService` validates every grant.
 */
export function BranchScopeField({
  idPrefix,
  branches,
  canGrantAll,
  value,
  onChange,
  error,
  disabled,
}: BranchScopeFieldProps) {
  const { t, locale } = useStaffI18n();

  function toggleBranch(branchId: string) {
    const next = value.branchIds.includes(branchId)
      ? value.branchIds.filter((id) => id !== branchId)
      : [...value.branchIds, branchId];
    onChange({ allBranches: false, branchIds: next });
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={error ? `${idPrefix}-scope-error` : undefined}>
      <legend className="mb-1 text-sm font-medium text-secondary-foreground">{t('staff.scope.label')}</legend>

      {canGrantAll ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
          <input
            type="radio"
            name={`${idPrefix}-scope`}
            className="mt-1 h-4 w-4 accent-primary"
            checked={value.allBranches}
            disabled={disabled}
            onChange={() => onChange({ allBranches: true, branchIds: [] })}
          />
          <span className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{t('staff.scope.all')}</span>
            <span className="text-xs text-muted-foreground">{t('staff.scope.allHint')}</span>
          </span>
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">{t('staff.scope.limited')}</p>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/40">
        <input
          type="radio"
          name={`${idPrefix}-scope`}
          className="mt-1 h-4 w-4 accent-primary"
          checked={!value.allBranches}
          disabled={disabled}
          onChange={() => onChange({ allBranches: false, branchIds: value.branchIds })}
        />
        <span className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{t('staff.scope.selected')}</span>
          <span className="text-xs text-muted-foreground">{t('staff.scope.selectedHint')}</span>
        </span>
      </label>

      {!value.allBranches ? (
        branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('staff.scope.noBranches')}</p>
        ) : (
          <ul className="flex flex-col gap-1 ps-7">
            {branches.map((branch) => (
              <li key={branch.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={value.branchIds.includes(branch.id)}
                    disabled={disabled}
                    onChange={() => toggleBranch(branch.id)}
                  />
                  <span dir="auto" className="min-w-0 truncate text-foreground">
                    {branch.status === 'ACTIVE'
                      ? localizedName(branch, locale)
                      : t('staff.branchAccess.inactiveSuffix', { name: localizedName(branch, locale) })}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {error ? (
        <p id={`${idPrefix}-scope-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
