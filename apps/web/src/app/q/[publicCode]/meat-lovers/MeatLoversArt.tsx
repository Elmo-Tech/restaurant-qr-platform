/** Built-in line art of the Meat Lovers menu (own artwork; shown where a photo is missing). Decorative only. */

/** A stylised bull head, drawn with a stroke so it follows the surrounding colour. */
export function MeatLoversMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 14C9.5 14 5 10 4 4c4 4 8 5 12 5.5" />
      <path d="M32 14c6.5 0 11-4 12-10-4 4-8 5-12 5.5" />
      <path d="M16 14C14 24 17 33 20.5 39h7C31 33 34 24 32 14" />
      <path d="M16 16.5 9 17.5l3.5 4.5 3.5-.5M32 16.5l7 1-3.5 4.5-3.5-.5" />
      <ellipse cx="24" cy="38" rx="6.5" ry="4.5" />
      <path d="M21.5 38h.01M26.5 38h.01M19.5 25h.01M28.5 25h.01" />
    </svg>
  );
}

export function MeatLoversKnife({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3c8 0 14 5 14 12H3V3Z" />
      <path d="M17 15v6" />
    </svg>
  );
}

/** Shown in a card or the hero when the Restaurant has no photo for it. */
export function MeatLoversPlaceholder({ className }: { className?: string }) {
  return (
    <span className={`ml-placeholder ${className ?? ''}`} aria-hidden="true">
      <MeatLoversMark className="ml-placeholder-mark" />
    </span>
  );
}
