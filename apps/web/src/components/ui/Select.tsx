import type { SelectHTMLAttributes } from 'react';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = '', ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={`w-full rounded-md border border-[#E5DED6] bg-white px-3 py-2 text-sm text-[#1D1A18] outline-none focus:border-[#7A5138] focus:ring-1 focus:ring-[#7A5138] disabled:bg-[#F1ECE6] ${className}`}
    />
  );
}
