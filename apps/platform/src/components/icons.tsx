import type { SVGProps } from "react";

/** Small stroke icons (24px grid, drawn for the console). All decorative unless the caller adds a label. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const IconOverview = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="8" rx="1.8" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.8" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.8" />
    <rect x="3.5" y="14.5" width="7" height="6" rx="1.8" />
  </Icon>
);
export const IconStore = (p: P) => (
  <Icon {...p}>
    <path d="M4 9.5 5.5 4h13L20 9.5" />
    <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
    <path d="M5.5 12.5V20h13v-7.5" />
    <path d="M10 20v-4.5h4V20" />
  </Icon>
);
export const IconActivity = (p: P) => (
  <Icon {...p}>
    <path d="M3 12h4l2.5-7 5 14 2.5-7H21" />
  </Icon>
);
export const IconLogout = (p: P) => (
  <Icon {...p}>
    <path d="M9.5 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3" />
    <path d="M14 8.5 18 12l-4 3.5" />
    <path d="M18 12H9.5" />
  </Icon>
);
export const IconSearch = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
);
export const IconSun = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </Icon>
);
export const IconMoon = (p: P) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </Icon>
);
export const IconMonitor = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="11.5" rx="2" />
    <path d="M9 20h6M12 16v4" />
  </Icon>
);
export const IconGlobe = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.5 3.6 5.3 3.6 8.5s-1.2 6-3.6 8.5c-2.4-2.5-3.6-5.3-3.6-8.5S9.6 6 12 3.5Z" />
  </Icon>
);
export const IconChevron = (p: P) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);
export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const IconX = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const IconAlert = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.8 21 19.5H3L12 3.8Z" />
    <path d="M12 10v4.2M12 17.2v.1" />
  </Icon>
);
export const IconMenu = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
export const IconShield = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-2.5Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Icon>
);
export const IconArrowLeft = (p: P) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);
export const IconPackage = (p: P) => (
  <Icon {...p}>
    <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
    <path d="m4 7 8 4 8-4" />
    <path d="M12 11v10" />
  </Icon>
);
export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IconUsers = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.7c1.8.5 3 2.1 3.2 4.8" />
  </Icon>
);

export const IconInbox = (p: P) => (
  <Icon {...p}>
    <path d="M4 13.5 6.4 5.8A2 2 0 0 1 8.3 4.5h7.4a2 2 0 0 1 1.9 1.3L20 13.5" />
    <path d="M4 13.5v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4h-4.5a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 1-3 0 1.5 1.5 0 0 0-1.5-1.5Z" />
  </Icon>
);
