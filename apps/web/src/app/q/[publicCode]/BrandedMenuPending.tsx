import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type { PublicMenuBranding } from '../../../lib/public-menu/api';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import { MAKKBOZ_FONT_CLASSES } from './makkboz/makkboz-fonts';
import { MEAT_LOVERS_FONT_CLASSES } from './meat-lovers/meat-lovers-fonts';
import { SHERBINY_FONT_CLASSES } from './sherbiny/sherbiny-fonts';
import { VERDE_FONT_CLASSES } from './verde/verde-fonts';
import './branded-pending.css';

const LOOK = {
  VERDE_NAPOLI_V1: { skin: 'verde', fonts: VERDE_FONT_CLASSES },
  SHERBINY_FIRE_DOUGH_V1: { skin: 'sherbiny', fonts: SHERBINY_FONT_CLASSES },
  MAKKBOZ_HERITAGE_V1: { skin: 'makkboz', fonts: MAKKBOZ_FONT_CLASSES },
  MEAT_LOVERS_BUTCHER_V1: { skin: 'meat-lovers', fonts: MEAT_LOVERS_FONT_CLASSES },
} as const;

/**
 * The page a Restaurant with an exclusive design shows while it has no published menu yet (a new account, or a menu
 * that was switched off), dressed in that design's palette and fonts so the QR never lands on a generic error. It
 * carries only what the guest menu already makes public (name, logo) and none of the ordering UI.
 */
export function BrandedMenuPending({
  branding,
  copy,
}: {
  branding: PublicMenuBranding;
  copy: PublicMenuCopy;
}) {
  const look = LOOK[branding.exclusiveRendererKey];
  const logoUrl = resolveAssetUrl(branding.logoAssetPath);
  return (
    <main
      className={`bp-page ${look.fonts}`}
      data-bp-skin={look.skin}
      dir={branding.locale === 'ar' ? 'rtl' : 'ltr'}
      lang={branding.locale}
    >
      <div className="bp-card">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Restaurant logo from the runtime API origin.
          <img className="bp-logo" src={logoUrl} alt={branding.restaurantName} />
        ) : (
          <p className="bp-brand">{branding.restaurantName}</p>
        )}
        <span className="bp-rule" aria-hidden="true">✦</span>
        <h1 className="bp-title">{copy.menuPreparingTitle}</h1>
        <p className="bp-message">{copy.menuPreparingMessage}</p>
      </div>
    </main>
  );
}
