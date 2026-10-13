interface IconProps {
  className?: string;
}

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Dashboard-local glyphs (the shared staff set has no alert / clock / copy / refresh yet). */
export function IconAlert({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="M12 3.5l9.2 16H2.8L12 3.5z" />
      <path d="M12 10v4.2M12 17.4v.1" />
    </svg>
  );
}

export function IconCheckCircle({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.4l2.7 2.7L16.2 9.5" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconCopy({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.3-4.6L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.6L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </svg>
  );
}

export function IconBan({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  );
}

export function IconExternal({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

export function IconTrend({ className, down = false }: IconProps & { down?: boolean }) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      {down ? (
        <>
          <path d="M4 7l6 6 4-4 6 6" />
          <path d="M20 10v5h-5" />
        </>
      ) : (
        <>
          <path d="M4 17l6-6 4 4 6-6" />
          <path d="M20 14V9h-5" />
        </>
      )}
    </svg>
  );
}
