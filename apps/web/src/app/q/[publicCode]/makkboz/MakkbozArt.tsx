/**
 * Built-in artwork of the Makkboz menu: defaults for every photo slot without an upload, and the village
 * illustration of the story section. Plain SVG, no third-party artwork.
 */
import type { SVGProps } from 'react';

type ArtProps = SVGProps<SVGSVGElement>;

/** A round baked pie on a tray: default hero photo. */
export function MakkbozPieArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 300 300" aria-hidden="true" {...props}>
      <ellipse cx="150" cy="262" rx="112" ry="14" fill="#000" opacity=".25" />
      <circle cx="150" cy="148" r="124" fill="#e8dcc2" />
      <circle cx="150" cy="148" r="108" fill="#c98b3c" />
      <circle cx="150" cy="148" r="96" fill="#e3a54e" />
      <path d="M70 120c30-26 130-30 160 0M64 160c40 24 132 24 172 0" stroke="#a8691f" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".6" />
      <ellipse cx="150" cy="132" rx="30" ry="18" fill="#f6dd9a" />
      <ellipse cx="144" cy="126" rx="12" ry="7" fill="#fff3c4" />
    </svg>
  );
}

/** Two rolled wraps: default small photo. */
export function MakkbozWrapArt(props: ArtProps) {
  return (
    <svg viewBox="0 0 300 220" aria-hidden="true" {...props}>
      <ellipse cx="150" cy="190" rx="110" ry="12" fill="#000" opacity=".22" />
      <g transform="rotate(-10 150 105)">
        <rect x="40" y="70" width="220" height="80" rx="40" fill="#d9892f" />
        <rect x="46" y="76" width="208" height="68" rx="34" fill="#f2b45a" />
        <ellipse cx="252" cy="110" rx="14" ry="34" fill="#a8510c" />
        <circle cx="248" cy="98" r="6" fill="#9ad46a" />
        <circle cx="254" cy="120" r="7" fill="#e5532a" />
      </g>
    </svg>
  );
}

/** A flat ornament for dishes and sections without a photo. */
export function MakkbozOrnament(props: ArtProps) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" {...props}>
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".5" />
      <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 5" opacity=".5" />
      <path d="M50 22l5 23 23 5-23 5-5 23-5-23-23-5 23-5 5-23Z" fill="currentColor" opacity=".7" />
    </svg>
  );
}

/** The village skyline of the story section (from the approved concept). */
export function MakkbozVillage(props: ArtProps) {
  return (
    <svg viewBox="0 0 620 350" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path d="M20 312H595" stroke="#cfab73" strokeWidth="3" strokeLinecap="round" />
      <path d="M58 310V191l46-21 49 21v119H58Z" fill="#dfb778" />
      <path d="M79 309v-57c0-16 11-29 25-29s25 13 25 29v57H79Z" fill="#174433" />
      <path d="M149 311V155l43-18 54 21v153H149Z" fill="#edd2a0" />
      <path d="M179 309v-51c0-13 9-24 20-24 12 0 20 11 20 24v51h-40Z" fill="#174433" />
      <path d="M172 175h19v26h-19z" fill="#b27d37" />
      <path d="M241 310V206l52-24 57 24v104H241Z" fill="#c99e63" />
      <path d="M267 309v-52c0-13 11-24 25-24s25 11 25 24v52h-50Z" fill="#174433" />
      <path d="M327 310V177l40-20 49 19v134H327Z" fill="#e5be81" />
      <path d="M349 195h22v29h-22z" fill="#174433" />
      <path d="M417 310V221l43-20 56 20v89h-99Z" fill="#ddba87" />
      <path d="M444 310v-44c0-14 11-25 24-25 14 0 25 11 25 25v44h-49Z" fill="#174433" />
      <path d="M462 204c-2-65 6-119 17-153" stroke="#b88b4c" strokeWidth="12" strokeLinecap="round" />
      <path d="M479 63c-49-41-67-30-101-26 44 4 75 23 101 26ZM479 62c-6-48-36-53-57-56 19 15 38 35 57 56ZM478 63c43-43 71-45 102-40-40 10-76 25-102 40ZM477 63c44-10 81-7 111 11-45-7-81-8-111-11ZM477 63c-34 8-49 35-63 61 24-21 44-44 63-61Z" fill="#d2b079" stroke="#d2b079" strokeWidth="5" strokeLinejoin="round" />
      <path d="M133 85c18-8 28-6 43 7 12-12 24-13 39-8M268 68c15-8 25-4 34 5 12-8 20-8 30-3" stroke="#b88b4c" strokeWidth="3" strokeLinecap="round" />
      <path d="M52 318h522M87 331h432" stroke="#cda56c" strokeWidth="2" opacity=".7" />
    </svg>
  );
}
