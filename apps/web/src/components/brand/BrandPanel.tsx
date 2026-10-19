import { WaytaStacked } from './Wayta';

/**
 * The brand half of the signed-out screens (desktop only): a graphite panel
 * playing the "scan -> served" intro, a QR code becoming the Wayta cloche.
 * Purely decorative, so it is hidden from assistive tech.
 *
 * The 1.7 MB GIF is a CSS background inside the `lg` breakpoint on purpose: a
 * browser only fetches a background for an element that is actually rendered
 * in a matching media query, so a phone (and a reduced-motion visitor, who
 * gets the still stacked logo instead) never downloads it. An `<img>` would be
 * fetched even inside a `display: none` parent.
 */
export function BrandPanel() {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden items-center justify-center overflow-hidden bg-[#12100E] lg:flex"
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom,rgb(245_165_36/0.16),transparent_70%)]" />
      <div className="relative aspect-square w-[min(80%,560px)] bg-contain bg-center bg-no-repeat lg:bg-[url('/brand/wayta-intro-scan-transparent-for-dark-bg.gif')] motion-reduce:hidden" />
      <div className="relative hidden motion-reduce:block">
        <WaytaStacked tone="dark" size={96} />
      </div>
    </aside>
  );
}
