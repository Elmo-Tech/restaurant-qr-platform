import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Design-system-v2: merges conditional class lists and resolves conflicting
 * Tailwind utilities (the later one wins) -- the one helper every `components/ui`
 * primitive uses so a caller's `className` can safely override a primitive's
 * own defaults instead of just appending and hoping the cascade cooperates.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
