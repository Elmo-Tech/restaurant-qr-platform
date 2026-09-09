import type { ReactNode } from 'react';

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#AFA397]">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}
