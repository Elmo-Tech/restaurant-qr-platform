interface TableGlyphProps {
  className?: string;
}

/**
 * A quiet top-down table illustration (a rounded tabletop with a chair on each
 * side). Drawn with `currentColor` only, so the surrounding tone (state tint,
 * muted, ...) decides its colour in light and dark themes alike. Purely
 * decorative: it carries no meaning of its own and is hidden from assistive
 * technology -- the table number and state are always real text beside it.
 */
export function TableGlyph({ className }: TableGlyphProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true" focusable="false">
      {/* chairs */}
      <rect x="12" y="5" width="10" height="6" rx="3" fill="currentColor" opacity="0.38" />
      <rect x="26" y="5" width="10" height="6" rx="3" fill="currentColor" opacity="0.38" />
      <rect x="12" y="37" width="10" height="6" rx="3" fill="currentColor" opacity="0.38" />
      <rect x="26" y="37" width="10" height="6" rx="3" fill="currentColor" opacity="0.38" />
      <rect x="3" y="18" width="6" height="12" rx="3" fill="currentColor" opacity="0.38" />
      <rect x="39" y="18" width="6" height="12" rx="3" fill="currentColor" opacity="0.38" />
      {/* tabletop */}
      <rect
        x="9"
        y="12"
        width="30"
        height="24"
        rx="7"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M17 24h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}
