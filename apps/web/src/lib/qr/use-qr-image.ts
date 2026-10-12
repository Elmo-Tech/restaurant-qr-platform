'use client';

import { useEffect, useState } from 'react';
import { renderQrImage, type QrImageOptions } from './render';

export interface UseQrImageResult {
  dataUrl: string | null;
  logoFailed: boolean;
  failed: boolean;
}

/**
 * The styled QR image for the given options. Re-renders (debounced, so a
 * color picker drag stays smooth) whenever an input changes and never lets a
 * stale render overwrite a newer one. `null` options render nothing.
 */
export function useQrImage(options: QrImageOptions | null): UseQrImageResult {
  const [state, setState] = useState<UseQrImageResult>({
    dataUrl: null,
    logoFailed: false,
    failed: false,
  });

  const key = options
    ? JSON.stringify([
        options.url,
        options.foregroundColor,
        options.backgroundColor,
        options.logoUrl ?? null,
        options.title ?? null,
        options.subtitle ?? null,
        options.size ?? null,
      ])
    : null;

  useEffect(() => {
    if (!options) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      renderQrImage(options)
        .then((result) => {
          if (!cancelled) {
            setState({ dataUrl: result.dataUrl, logoFailed: result.logoFailed, failed: false });
          }
        })
        .catch(() => {
          if (!cancelled) setState({ dataUrl: null, logoFailed: false, failed: true });
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `key` captures every input that matters; `options` itself is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
