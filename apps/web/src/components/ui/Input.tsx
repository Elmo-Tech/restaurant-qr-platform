import type { InputHTMLAttributes, Ref } from 'react';
import { cn } from '../../lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
};

/** React 19 accepts `ref` as a normal prop on function components -- no `forwardRef` needed. */
export function Input({ className, ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
        className,
      )}
    />
  );
}
