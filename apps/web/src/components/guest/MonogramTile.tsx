/**
 * FT-13A: what a product (or the restaurant itself) looks like when it has no
 * photo. Not a gray "image missing" icon and never an unrelated stock photo --
 * a tinted tile carrying the item's own initial in the display face, with a
 * fine dotted texture so it reads as a deliberate menu-board swatch.
 *
 * The tint is chosen from a stable seed (the category id), so every dish in a
 * category shares a colour family and the page stays calm instead of random.
 */
const TINTS = [
  'bg-guest-tint-1 text-guest-tint-ink-1',
  'bg-guest-tint-2 text-guest-tint-ink-2',
  'bg-guest-tint-3 text-guest-tint-ink-3',
  'bg-guest-tint-4 text-guest-tint-ink-4',
  'bg-guest-tint-5 text-guest-tint-ink-5',
  'bg-guest-tint-6 text-guest-tint-ink-6',
] as const;

function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** First visible letter/digit of `name`, in its own script (Arabic stays Arabic). */
function initialOf(name: string): string {
  const match = name.trim().match(/[\p{L}\p{N}]/u);
  return match ? match[0].toLocaleUpperCase() : '•';
}

export function MonogramTile({
  name,
  seed,
  className = '',
  letterClassName = 'text-5xl',
}: {
  name: string;
  seed: string;
  className?: string;
  letterClassName?: string;
}) {
  const tint = TINTS[hashSeed(seed) % TINTS.length];
  return (
    <div
      aria-hidden="true"
      className={`relative flex items-center justify-center overflow-hidden ${tint} ${className}`}
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(currentColor 0.7px, transparent 0.8px)',
          backgroundSize: '9px 9px',
          maskImage: 'radial-gradient(circle at 50% 55%, transparent 28%, black 100%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 55%, transparent 28%, black 100%)',
        }}
      />
      <span
        dir="auto"
        className={`relative font-guest-display font-extrabold leading-none opacity-90 ${letterClassName}`}
      >
        {initialOf(name)}
      </span>
    </div>
  );
}
