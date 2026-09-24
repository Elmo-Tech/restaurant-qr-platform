'use client';

import { useRef } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { IconImage } from '../staff/icons';

export interface ImageFieldProps {
  idPrefix: string;
  /** Absolute, browser-loadable URL -- either a persisted asset (via `resolveAssetUrl`) or a local object-URL preview of a not-yet-uploaded selection. `null` renders the placeholder. */
  imageUrl: string | null;
  onSelectFile: (file: File) => void;
  /** Omit entirely to hide the Remove control (e.g. nothing selected/persisted yet). */
  onRemove?: () => void;
  isBusy: boolean;
  error: string | null;
  selectLabel: string;
  removeLabel?: string;
  helperText: string;
}

/**
 * One shared image upload/preview/replace/remove control (FT-2, Section
 * 13/18/20), used identically by the Product Editor's Image section and the
 * Category Create/Edit dialog -- never a raw asset-path text field. Purely
 * presentational: the caller owns what "select" and "remove" actually do
 * (store a pending local file before an entity exists, or call the
 * dedicated upload/remove endpoint once it does), so this component has no
 * idea whether it's in Create or Edit mode.
 */
export function ImageField({
  idPrefix,
  imageUrl,
  onSelectFile,
  onRemove,
  isBusy,
  error,
  selectLabel,
  removeLabel,
  helperText,
}: ImageFieldProps) {
  const { t } = useStaffI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-4">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable static/local image.
          <img
            src={imageUrl}
            alt=""
            className="h-20 w-20 flex-shrink-0 rounded-md border border-[#E5DED6] object-cover"
          />
        ) : (
          <span className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-[#E5DED6] text-[#AFA397]">
            <IconImage className="h-6 w-6" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              disabled={isBusy}
              onClick={() => inputRef.current?.click()}
            >
              {isBusy ? t('menu.image.uploading') : selectLabel}
            </Button>
            {onRemove ? (
              <Button
                type="button"
                variant="danger"
                className="px-3 py-1.5 text-xs"
                disabled={isBusy}
                onClick={onRemove}
              >
                {removeLabel ?? t('menu.image.remove')}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-[#655D56]">{helperText}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        id={`${idPrefix}-image-input`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={isBusy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset immediately so selecting the exact same file again still
          // fires a change event next time.
          event.target.value = '';
          if (file) onSelectFile(file);
        }}
      />
    </div>
  );
}
