import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-[#E5DED6] bg-white p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
