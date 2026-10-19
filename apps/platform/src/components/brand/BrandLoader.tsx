"use client";

import Image from "next/image";
import { useI18n } from "@/lib/i18n/client";
import { WaytaMark } from "./Wayta";

/**
 * The Wayta loading animation (a cloche lifting its lid with steam), in the
 * light or dark edition to match the console theme. The GIFs have their
 * background baked in (they are not truly transparent), so they are shown as a
 * rounded tile rather than floated on the page. They cannot honour
 * `prefers-reduced-motion`, so those visitors get the still mark instead.
 * Announced to screen readers as a status; the artwork itself is decorative.
 */
export function BrandLoader({ size = 112, className }: { size?: number; className?: string }) {
  const { t } = useI18n();
  const tile = "rounded-[28px] shadow-sm ring-1 ring-black/5 motion-reduce:hidden";
  return (
    <div role="status" className={`inline-flex flex-col items-center ${className ?? ""}`}>
      <Image
        src="/brand/wayta-loader-light.gif"
        alt=""
        width={size}
        height={size}
        unoptimized
        className={`${tile} dark:hidden`}
      />
      <Image
        src="/brand/wayta-loader-dark.gif"
        alt=""
        width={size}
        height={size}
        unoptimized
        className={`${tile} hidden dark:block dark:ring-white/10`}
      />
      <div className="hidden motion-reduce:block" style={{ paddingBlock: size * 0.3 }}>
        <WaytaMark size={Math.round(size * 0.4)} />
      </div>
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}
