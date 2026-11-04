/**
 * Built-in artwork of the El Sherbiny menu: the default for every photo slot that has no upload yet, and the
 * brand mark when the Restaurant has no logo. Plain SVG drawn for this project, no third-party artwork.
 */
import type { SVGProps } from 'react';

type ArtProps = SVGProps<SVGSVGElement>;

/** The chef hat mark of the concept (also the logo placeholder). */
export function SherbinyHat(props: ArtProps) {
  return (
    <svg viewBox="0 0 46 40" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M10 23C2 23 2 9 13 9c3-11 17-11 20 0 12-1 13 13 3 14v13H10V23Z" />
      <path d="M10 30h26M15 30V17M23 30V16M31 30V18" />
    </svg>
  );
}

export function SherbinyFlame(props: ArtProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 22c4.5 0 8-3.4 8-7.7 0-2.9-1.6-5-4.5-7.7.1 2.6-1.6 4.1-2.8 4.1C13.1 7 11.7 4 9.5 2 9.2 6.1 6 7.9 4.7 10.7 2.6 15.6 5.8 22 12 22Z" />
      <path d="M12 22c2.2 0 4-1.8 4-4.1 0-1.8-1-3.2-2.8-4.6.1 2.4-2.5 2.2-3.3.5-1.5 1.7-2.1 2.9-2.1 4.1C7.8 20.3 9.6 22 12 22Z" />
    </svg>
  );
}

/** A whole pizza with a lifted slice: default hero photo. */
export function SherbinyPizzaArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" {...props}>
      <defs>
        <radialGradient id="s-pz-crust" cx="50%" cy="46%" r="55%">
          <stop offset="0" stopColor="#ffb347" />
          <stop offset=".72" stopColor="#e8841f" />
          <stop offset="1" stopColor="#a8510c" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="205" r="176" fill="#3a2212" opacity=".55" />
      <circle cx="200" cy="200" r="170" fill="url(#s-pz-crust)" />
      <circle cx="200" cy="200" r="142" fill="#f4b04a" />
      <circle cx="200" cy="200" r="132" fill="#e7581a" opacity=".8" />
      <circle cx="200" cy="200" r="124" fill="#ffd27a" opacity=".85" />
      {[[140, 150], [250, 135], [175, 240], [265, 230], [205, 190], [120, 225], [290, 175]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="19" fill="#b5301c" />
          <circle cx={x - 5} cy={y - 5} r="5" fill="#d9573a" opacity=".7" />
        </g>
      ))}
      {[[200, 120], [150, 190], [235, 262], [296, 212]].map(([x, y], i) => (
        <ellipse key={`o${i}`} cx={x} cy={y} rx="9" ry="6" fill="#241b12" />
      ))}
      <path d="M200 200 L200 30" stroke="#a8510c" strokeWidth="5" opacity=".45" />
      <path d="M200 200 L338 105" stroke="#a8510c" strokeWidth="5" opacity=".45" />
      <path d="M200 200 L350 215" stroke="#a8510c" strokeWidth="5" opacity=".45" />
    </svg>
  );
}

/** A rolled, golden wrap: default hero plate / savory crêpe art. */
export function SherbinyWrapArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 400 300" aria-hidden="true" {...props}>
      <ellipse cx="200" cy="262" rx="150" ry="18" fill="#000" opacity=".3" />
      <g transform="rotate(-14 200 150)">
        <rect x="55" y="90" width="290" height="120" rx="60" fill="#d9892f" />
        <rect x="62" y="98" width="276" height="104" rx="52" fill="#f2b45a" />
        <ellipse cx="338" cy="150" rx="22" ry="52" fill="#a8510c" />
        <ellipse cx="338" cy="150" rx="14" ry="40" fill="#5a3014" />
        <circle cx="332" cy="128" r="8" fill="#9ad46a" />
        <circle cx="338" cy="162" r="9" fill="#e5532a" />
        <circle cx="330" cy="146" r="6" fill="#f4e0b0" />
        <path d="M95 110c40-14 120-16 200 0" stroke="#fff" strokeWidth="6" opacity=".25" fill="none" strokeLinecap="round" />
        <path d="M110 190c50 12 120 12 180-2" stroke="#8a4a14" strokeWidth="5" opacity=".35" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Generic round dish for any section without a photo. */
export function SherbinyDishArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 400 300" aria-hidden="true" {...props}>
      <ellipse cx="200" cy="250" rx="140" ry="16" fill="#000" opacity=".28" />
      <ellipse cx="200" cy="165" rx="150" ry="78" fill="#e9dfcc" />
      <ellipse cx="200" cy="160" rx="128" ry="62" fill="#f8f0e0" />
      <ellipse cx="200" cy="150" rx="92" ry="42" fill="#f1851c" />
      <ellipse cx="190" cy="143" rx="62" ry="24" fill="#ffb347" />
      <ellipse cx="170" cy="138" rx="14" ry="8" fill="#b5301c" />
      <ellipse cx="222" cy="150" rx="12" ry="7" fill="#9ad46a" />
      <ellipse cx="200" cy="162" rx="10" ry="6" fill="#241b12" opacity=".7" />
    </svg>
  );
}
