import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * Design-system-v2: the one small status/semantic pill, used for every
 * Active/Inactive, Available/Sold out, Primary/Featured, and Default marker
 * across the Staff app. Colour is never the only signal -- the optional
 * `dot` and the text itself always carry the meaning too, so nothing here
 * relies on distinguishing color alone (WCAG 1.4.1).
 */
export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        primary: 'bg-accent text-accent-foreground',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        destructive: 'bg-destructive-soft text-destructive',
        info: 'bg-info-soft text-info',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

const DOT_CLASSES: Record<string, string> = {
  neutral: 'bg-muted-foreground/60',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
};

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: ReactNode;
  /** Adds a small solid dot before the label (e.g. Active/Inactive state). */
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
}

export function Badge({ variant, dot = false, icon, children, className }: BadgeProps) {
  const tone = variant ?? 'neutral';
  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      {dot ? <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASSES[tone])} /> : null}
      {icon}
      {children}
    </span>
  );
}
