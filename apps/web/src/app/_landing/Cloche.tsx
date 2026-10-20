import styles from './landing.module.css';

/**
 * The Wayta cloche (the logo's smiling dome) as a character. With `animated` it lifts its lid now and then
 * and a QR code slips out from under it; without, it simply smiles on its plate. Drawn from the same shapes
 * as the logo (`components/brand/Wayta.tsx`), so it stays sharp at any size.
 */
export function Cloche({ animated = false, className }: { animated?: boolean; className?: string }) {
  return (
    <svg viewBox="0 -18 100 104" aria-hidden="true" focusable="false" className={className}>
      <rect x="4" y="70" width="92" height="9" rx="4.5" fill="var(--wayta-ink, #12100e)" />
      {animated ? (
        <g className={styles.clocheQr}>
          <rect x="33" y="44" width="34" height="26" rx="5" fill="#fffdf8" stroke="#12100e" strokeWidth="2" />
          {[
            [37, 48],
            [55, 48],
            [37, 58],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width="8" height="8" fill="#12100e" />
              <rect x={x + 2} y={y + 2} width="4" height="4" fill="#fffdf8" />
            </g>
          ))}
          <rect x="50" y="60" width="3" height="3" fill="#12100e" />
          <rect x="56" y="56" width="3" height="3" fill="#12100e" />
          <rect x="59" y="62" width="3" height="3" fill="#12100e" />
        </g>
      ) : null}
      <g className={animated ? styles.clocheLid : undefined}>
        <path d="M12 66 A38 38 0 0 1 88 66 Z" fill="#f5a524" />
        <circle cx="50" cy="22" r="6" fill="#f5a524" />
        <circle cx="40" cy="45" r="3.6" fill="#12100e" />
        <circle cx="60" cy="45" r="3.6" fill="#12100e" />
        <path d="M37 54 Q50 63 63 54" fill="none" stroke="#12100e" strokeWidth="5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
