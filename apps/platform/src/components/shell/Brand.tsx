import { cn } from "@/lib/utils";

/** The console mark: a rounded square holding three stacked bars (a list of tenants). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-9 place-items-center rounded-[10px] bg-primary text-primary-foreground", className)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 7.5h12M6 12h8M6 16.5h10" />
      </svg>
    </span>
  );
}
