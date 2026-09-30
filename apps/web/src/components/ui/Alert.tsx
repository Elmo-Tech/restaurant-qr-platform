import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type AlertVariant = 'error' | 'info' | 'success' | 'warning';

export interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'border-destructive/25 bg-destructive-soft text-destructive',
  info: 'border-info/25 bg-info-soft text-info',
  success: 'border-success/25 bg-success-soft text-success',
  warning: 'border-warning/25 bg-warning-soft text-warning',
};

/** CLAUDE.md #63/#89: never renders raw stack traces, only the message passed in. Tokens guarantee text always has enough contrast against its own tinted background, regardless of what surface the Alert is dropped onto. */
export function Alert({ variant = 'info', children, className }: AlertProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-4 py-3 text-sm leading-relaxed', VARIANT_CLASSES[variant], className)}
    >
      {children}
    </div>
  );
}
