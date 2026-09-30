'use client';

import { useStaffI18n } from '../../lib/i18n/client';

export interface LoadingStateProps {
  label?: string;
}

/** Staff-only spinner; the default label follows the Staff UI language. */
export function LoadingState({ label }: LoadingStateProps) {
  const { t } = useStaffI18n();
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary"
      />
      {label ?? t('common.loading')}
    </div>
  );
}
