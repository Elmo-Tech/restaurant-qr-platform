import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Design-system-v2: a titled section inside a workspace -- a small icon
 * medallion, a title, an optional one-line description, and an action slot
 * at the header's logical end. Used for the Menu bar, the Categories rail,
 * and the Products panel so every "block" on the Menu Management screen
 * reads with the same visual grammar.
 */
export function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card text-card-foreground shadow-sm', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground [&>svg]:h-[18px] [&>svg]:w-[18px]">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className={cn('p-5', bodyClassName)}>{children}</div> : null}
    </section>
  );
}
