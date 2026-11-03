/**
 * Default artwork of the VERDE menu, used until the Restaurant uploads its own photos.
 * Pure inline SVG (no network, no uploaded data) and decorative, so every piece is `aria-hidden`.
 */

const PEPPERONI: [number, number][] = [
  [200, 92], [262, 118], [306, 176], [292, 246], [246, 296], [176, 308], [118, 272], [92, 206],
  [112, 140], [160, 112], [200, 200], [240, 168], [164, 224], [236, 244],
];
const BASIL: [number, number, number][] = [
  [226, 140, 28], [144, 168, -40], [282, 214, 70], [214, 270, 150], [130, 238, 210], [180, 190, 110],
];
const OLIVES: [number, number][] = [[178, 142], [262, 168], [150, 262], [228, 232], [268, 270], [120, 190]];

/** A hand-drawn style pizza, the default hero image. */
export function VerdePizzaArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="vd-crust" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#F1C46E" />
          <stop offset="1" stopColor="#B97A2A" />
        </radialGradient>
        <radialGradient id="vd-sauce" cx="45%" cy="40%" r="70%">
          <stop offset="0" stopColor="#E0583B" />
          <stop offset="1" stopColor="#A82E1B" />
        </radialGradient>
        <radialGradient id="vd-cheese" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#FBE49A" />
          <stop offset="1" stopColor="#E9B94E" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="192" fill="url(#vd-crust)" />
      <circle cx="200" cy="200" r="168" fill="url(#vd-sauce)" />
      <circle cx="200" cy="200" r="158" fill="url(#vd-cheese)" />
      {[0, 60, 120].map((deg) => (
        <line key={deg} x1="200" y1="44" x2="200" y2="356" stroke="#B97A2A" strokeOpacity=".35" strokeWidth="3" transform={`rotate(${deg} 200 200)`} />
      ))}
      {PEPPERONI.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="24" fill="#B8321F" />
          <circle cx={x} cy={y} r="24" fill="none" stroke="#7E1F12" strokeWidth="3" />
          <circle cx={x - 7} cy={y - 6} r="3.5" fill="#E0614A" />
          <circle cx={x + 8} cy={y + 7} r="3" fill="#E0614A" />
        </g>
      ))}
      {OLIVES.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="11" fill="#2F3A2A" />
          <circle cx={x} cy={y} r="4.5" fill="#F3D786" />
        </g>
      ))}
      {BASIL.map(([x, y, deg], i) => (
        <g key={i} transform={`rotate(${deg} ${x} ${y})`}>
          <ellipse cx={x} cy={y} rx="20" ry="9" fill="#2F9A4E" />
          <path d={`M${x - 18} ${y}H${x + 18}`} stroke="#1E7436" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

/** Soft green artwork for a discover card without a photo. */
export function VerdeChapterArt({ tone = 'a', className }: { tone?: 'a' | 'b'; className?: string }) {
  const base = tone === 'a' ? ['#0B7A41', '#06301F'] : ['#2E7D4F', '#0B3D2A'];
  const ink = '#FFFFFF';
  return (
    <svg className={className} viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`vd-ch-${tone}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={base[0]} />
          <stop offset="1" stopColor={base[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill={`url(#vd-ch-${tone})`} />
      <circle cx="300" cy="120" r="120" fill={ink} fillOpacity=".08" />
      <circle cx="300" cy="120" r="82" fill="none" stroke={ink} strokeOpacity=".25" strokeWidth="2" strokeDasharray="6 8" />
      <circle cx="300" cy="120" r="42" fill={ink} fillOpacity=".12" />
      <path d="M20 230 L120 130 L180 190 L240 120" fill="none" stroke={ink} strokeOpacity=".18" strokeWidth="3" />
    </svg>
  );
}

/** A milkshake glass, the default closing-banner image. */
export function VerdeBannerArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 380" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="vd-shake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9C7A0" />
          <stop offset="1" stopColor="#7A4A2B" />
        </linearGradient>
        <linearGradient id="vd-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".55" />
          <stop offset=".5" stopColor="#FFFFFF" stopOpacity=".12" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity=".4" />
        </linearGradient>
      </defs>
      <ellipse cx="150" cy="362" rx="92" ry="12" fill="#000" fillOpacity=".25" />
      <path d="M62 120 H238 L214 346 Q150 370 86 346 Z" fill="url(#vd-shake)" />
      <path d="M62 120 H238 L214 346 Q150 370 86 346 Z" fill="url(#vd-glass)" />
      <path d="M52 112 Q150 60 248 112 Q232 146 150 146 Q68 146 52 112Z" fill="#FFF7E6" />
      <path d="M92 100 Q112 40 150 70 Q176 30 204 76 Q232 70 214 106 Q150 130 92 100Z" fill="#FFFFFF" />
      <circle cx="170" cy="40" r="15" fill="#C42A2F" />
      <path d="M170 26 Q176 6 192 0" fill="none" stroke="#2F7A3A" strokeWidth="4" strokeLinecap="round" />
      <rect x="196" y="10" width="14" height="190" rx="5" fill="#E84F42" transform="rotate(12 203 105)" />
      <path d="M86 190 Q150 214 214 190" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="5" />
    </svg>
  );
}
