import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Design-system-v2: an intentional "nothing here yet" state -- an icon
 * medallion, a plain-language title, one helpful sentence and (optionally)
 * the next action. Used wherever a list can legitimately be empty, so it
 * never reads as a broken or forgotten screen.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/40 text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {icon ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground [&>svg]:h-6 [&>svg]:w-6">
          {icon}
        </span>
      ) : null}
      <p className="text-base font-semibold text-secondary-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
