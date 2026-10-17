'use client';

import { useEffect, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../../lib/i18n/messages';

const STEPS: MessageKey[] = [
  'import.processing.step1',
  'import.processing.step2',
  'import.processing.step3',
  'import.processing.step4',
];
const STEP_MS = 4_500;

/** Menu-sheet rows: [name bar width, price bar width]. The rows "write themselves" one by one while a scan beam sweeps down the sheet. */
const ROWS: ReadonlyArray<readonly [number, number]> = [
  [92, 26],
  [70, 26],
  [104, 26],
  [78, 26],
  [96, 26],
];

/**
 * A pure SVG + CSS "reading the menu" animation (no animation library, no
 * assets): a menu card whose lines fill in as a scan beam passes over it, with a
 * short rotating hint underneath. The hints are not a progress claim -- the
 * Backend gives no percentage -- they only keep the wait feeling alive.
 * Motion stops under `prefers-reduced-motion` (the card is then simply shown
 * filled). The card is drawn mirrored-neutral, so it reads the same in RTL.
 */
export function MenuReadingAnimation() {
  const { t } = useStaffI18n();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => (current + 1) % STEPS.length), STEP_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 py-6" role="status" aria-live="polite">
      <svg
        viewBox="0 0 240 210"
        className="menu-read h-52 w-auto"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="menu-read-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0" />
            <stop offset="0.85" stopColor="var(--color-primary)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0.9" />
          </linearGradient>
          <clipPath id="menu-read-clip">
            <rect x="30" y="14" width="180" height="182" rx="14" />
          </clipPath>
        </defs>

        <ellipse cx="120" cy="202" rx="70" ry="5" fill="var(--color-border)" opacity="0.7" />
        <rect
          x="30"
          y="14"
          width="180"
          height="182"
          rx="14"
          fill="var(--color-card)"
          stroke="var(--color-border)"
          strokeWidth="2"
        />
        {/* header band */}
        <rect x="46" y="28" width="70" height="10" rx="5" fill="var(--color-primary)" opacity="0.85" />
        <circle cx="190" cy="33" r="6" fill="var(--color-accent)" />

        <g clipPath="url(#menu-read-clip)">
          {ROWS.map(([nameWidth, priceWidth], index) => {
            const y = 58 + index * 28;
            return (
              <g key={index} className="menu-read-row" style={{ animationDelay: `${index * 0.55}s` }}>
                <rect x="46" y={y} width={nameWidth} height="9" rx="4.5" fill="var(--color-muted-foreground)" opacity="0.55" />
                <rect x="46" y={y + 12} width={nameWidth * 0.55} height="6" rx="3" fill="var(--color-muted-foreground)" opacity="0.25" />
                <rect x={194 - priceWidth} y={y} width={priceWidth} height="9" rx="4.5" fill="var(--color-primary)" opacity="0.8" />
              </g>
            );
          })}
          <rect className="menu-read-beam" x="30" y="-40" width="180" height="46" fill="url(#menu-read-beam)" />
        </g>

        <g className="menu-read-spark" fill="var(--color-primary)">
          <path d="M214 56l2.4 6.6 6.6 2.4-6.6 2.4-2.4 6.6-2.4-6.6-6.6-2.4 6.6-2.4z" />
        </g>
        <g className="menu-read-spark menu-read-spark-late" fill="var(--color-accent-foreground)">
          <path d="M22 118l1.7 4.6 4.6 1.7-4.6 1.7-1.7 4.6-1.7-4.6-4.6-1.7 4.6-1.7z" />
        </g>
      </svg>

      <p key={step} className="menu-read-hint text-sm font-medium text-foreground">
        {t(STEPS[step])}
      </p>
    </div>
  );
}
