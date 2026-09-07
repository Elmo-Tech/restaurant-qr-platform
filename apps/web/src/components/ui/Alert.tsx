import type { ReactNode } from 'react';

type AlertVariant = 'error' | 'info';

export interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'border-[#B3261E]/30 bg-[#B3261E]/5 text-[#B3261E]',
  info: 'border-[#2563EB]/30 bg-[#2563EB]/5 text-[#2563EB]',
};

/** CLAUDE.md #63/#89: never renders raw stack traces, only the message passed in. */
export function Alert({ variant = 'info', children }: AlertProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-4 py-3 text-sm ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </div>
  );
}
