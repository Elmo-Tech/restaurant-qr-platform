import Link from 'next/link';
import { useStaffI18n } from '../../lib/i18n/client';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Small, purpose-built breadcrumb for the Restaurant workspace shell
 * (UX-1, Section 7) -- not a general-purpose routing framework. The final
 * item is always the current page and is never a link; Restaurant/internal
 * ids are never displayed, only the human-readable Restaurant name already
 * supplied by the caller.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const { t } = useStaffI18n();
  return (
    <nav aria-label={t('shell.breadcrumb')} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex min-w-0 items-center gap-1.5">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="truncate text-[#655D56] transition-colors hover:text-[#302C29]"
                >
                  <bdi dir="auto">{item.label}</bdi>
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={`truncate ${
                    isLast ? 'font-medium text-[#1D1A18]' : 'text-[#655D56]'
                  }`}
                >
                  {item.label}
                </span>
              )}
              {!isLast ? (
                <span className="text-[#AFA397] rtl:-scale-x-100" aria-hidden="true">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
