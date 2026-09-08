interface IconProps {
  className?: string;
}

const BASE_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconDashboard({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.25" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.25" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.25" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.25" />
    </svg>
  );
}

export function IconMenu({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
    </svg>
  );
}

export function IconQr({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
      <path d="M14.5 14.5h3v3h-3zM20.5 14.5v3M17.5 20.5h3" />
    </svg>
  );
}

export function IconOrders({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <path d="M6 3.5h12v17l-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5-2-1.5z" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" />
    </svg>
  );
}

export function IconStaff({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17" cy="8.5" r="2.25" />
      <path d="M15.5 19c.2-2.2 1.7-3.9 3.7-4.3" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3" />
    </svg>
  );
}

export function IconHamburger({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconPencil({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function IconImage({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M20.5 15.5l-5-5-9.5 9.5" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.35-4.35" />
    </svg>
  );
}
