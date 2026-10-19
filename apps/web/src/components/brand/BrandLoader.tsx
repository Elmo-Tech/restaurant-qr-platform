'use client';

import Image from 'next/image';
import { useStaffI18n } from '../../lib/i18n/client';
import { WaytaMark } from './Wayta';

/**
 * The Wayta loading animation (a cloche lifting its lid with steam) for the
 * light Staff workspace. The GIF has its cream background baked in (it is not
 * truly transparent), so it is shown as a rounded tile rather than floated on
 * the page. It cannot honour `prefers-reduced-motion`, so those visitors get
 * the still mark instead. Announced to screen readers as a status; the artwork
 * itself is decorative.
 */
export function BrandLoader({ size = 112, className }: { size?: number; className?: string }) {
  const { t } = useStaffI18n();
  return (
    <div role="status" className={`inline-flex flex-col items-center ${className ?? ''}`}>
      <Image
        src="/brand/wayta-loader-light.gif"
        alt=""
        width={size}
        height={size}
        unoptimized
        priority
        className="rounded-[28px] shadow-sm ring-1 ring-black/5 motion-reduce:hidden"
      />
      <div className="hidden motion-reduce:block" style={{ paddingBlock: size * 0.3 }}>
        <WaytaMark tone="light" size={Math.round(size * 0.4)} />
      </div>
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}
