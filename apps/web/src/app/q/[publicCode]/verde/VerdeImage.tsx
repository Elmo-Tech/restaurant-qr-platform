'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * An uploaded photo that always falls back to built-in artwork. A broken or missing file is detected
 * both through `onError` and, for images that failed before React hydrated, through `complete` +
 * `naturalWidth` on mount; so the guest never sees a broken-image icon or an empty frame.
 */
export function VerdeImage({
  src,
  fallback,
  className,
  eager = false,
}: {
  src: string | null;
  fallback: ReactNode;
  className?: string;
  eager?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = ref.current;
    if (src && image && image.complete && image.naturalWidth === 0) setFailedSrc(src);
  }, [src]);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Restaurant-uploaded media from the runtime API origin.
    <img
      ref={ref}
      src={src}
      alt=""
      className={className}
      loading={eager ? undefined : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      onError={() => setFailedSrc(src)}
    />
  );
}
