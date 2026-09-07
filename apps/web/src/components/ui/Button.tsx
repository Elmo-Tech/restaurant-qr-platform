import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#7A5138] text-white hover:bg-[#634127] disabled:bg-[#AFA397]',
  secondary:
    'bg-white text-[#302C29] border border-[#E5DED6] hover:bg-[#F8F5F1] disabled:text-[#AFA397]',
  danger: 'bg-[#B3261E] text-white hover:bg-[#8f1e18] disabled:bg-[#D2C8BD]',
};

export function Button({
  variant = 'primary',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
    />
  );
}
