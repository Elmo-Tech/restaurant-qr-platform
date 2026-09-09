import type { InputHTMLAttributes, Ref } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
};

/** React 19 accepts `ref` as a normal prop on function components -- no `forwardRef` needed. */
export function Input({ className = '', ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      {...props}
      className={`w-full rounded-md border border-[#E5DED6] bg-white px-3 py-2 text-sm text-[#1D1A18] outline-none focus:border-[#7A5138] focus:ring-1 focus:ring-[#7A5138] disabled:bg-[#F1ECE6] ${className}`}
    />
  );
}
