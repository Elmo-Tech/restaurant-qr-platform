import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '../../lib/utils';

/**
 * Design-system-v2: the one Staff button, built the shadcn/ui way (a CVA
 * variant map over a single element) so every screen shares the exact same
 * states instead of each page hand-rolling its own hover/disabled colors.
 * `variant` keeps its original three names (`primary`/`secondary`/`danger`)
 * so no call site changes; `ghost` is new, for low-emphasis actions inside
 * dense rows (a category's Edit icon, a table row action) where an outlined
 * button would be too heavy. `size` is new and optional -- every existing
 * call site keeps the original default size.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        secondary:
          'border border-border bg-secondary text-secondary-foreground shadow-sm hover:bg-muted',
        danger: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9 flex-shrink-0 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Renders the single child element (e.g. a `<Link>`) with the button's classes and behavior instead of a `<button>` -- for a navigation action that must look like a Button (Radix `Slot`). */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ className, variant, size, asChild = false, ref, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
