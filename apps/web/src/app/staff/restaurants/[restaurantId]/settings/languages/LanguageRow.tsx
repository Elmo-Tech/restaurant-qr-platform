'use client';

import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { RestaurantLocaleRow } from '../../../../../../lib/settings/types';
import { localeLabel } from '../../../../../../lib/settings/locale-labels';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';

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
  const { t } = useStaffI18n();
  const label = localeLabel(row.locale);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span lang={row.locale} className="text-sm font-semibold text-foreground">
            {label}
          </span>
          <span dir="ltr" className="text-xs uppercase tracking-wide text-muted-foreground">
            {row.locale}
          </span>
          {row.isDefault ? <Badge variant="primary">{t('settings.languages.default')}</Badge> : null}
          <Badge variant={row.isActive ? 'success' : 'neutral'} dot>
            {row.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.isDefault
            ? t('settings.languages.defaultNote')
            : row.isActive
              ? t('settings.languages.activeNote')
              : t('settings.languages.inactiveNote')}
        </p>
      </div>

      {!row.isDefault && canManage ? (
        <Button
          type="button"
          variant={row.isActive ? 'secondary' : 'primary'}
          disabled={isPending}
          onClick={() => onToggle(row.locale, !row.isActive)}
          aria-label={t(
            row.isActive ? 'settings.languages.disableAria' : 'settings.languages.enableAria',
            { language: label },
          )}
          className="flex-shrink-0"
        >
          {isPending
            ? t('settings.languages.working')
            : row.isActive
              ? t('settings.languages.disable')
              : t('settings.languages.enable')}
        </Button>
      ) : null}
    </div>
  );
}
