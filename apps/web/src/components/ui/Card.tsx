import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface CardProps {
  children: ReactNode;
  className?: string;
}

/** Design-system-v2: the shared surface -- token-based background/border/text, so a Card never silently goes back to the browser default (white-on-white) if it ends up nested somewhere unexpected. */
export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground p-6 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}
