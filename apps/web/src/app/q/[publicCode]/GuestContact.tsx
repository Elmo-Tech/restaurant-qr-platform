'use client';

import type { CSSProperties, ReactNode } from 'react';
import { GuestIconLink, GuestIconPhone } from '../../../components/guest/icons';
import { BRAND_PATHS, type BrandName } from '../../../lib/contact/brand-paths';
import { telHref, whatsappHref, type ContactField, type RestaurantContact } from '../../../lib/contact/types';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';

/**
 * One contact channel as the Guest sees it: where it goes, its (brand) label, and how
 * its app-style badge looks. Brand names are shown as they are in every language.
 */
interface Channel {
  key: string;
  href: string;
  label: string;
  brand: BrandName | null;
  background: string;
  color: string;
  /** Only the brand logo needs a ring to stay visible on both themes (black / yellow badges). */
  ring: boolean;
  external: boolean;
}

const BRANDS: ReadonlyArray<{
  field: ContactField;
  brand: BrandName | null;
  label: string | ((copy: PublicMenuCopy) => string);
  background: string;
  color: string;
  ring?: boolean;
}> = [
  { field: 'instagramUrl', brand: 'instagram', label: 'Instagram', background: 'linear-gradient(45deg,#F58529,#DD2A7B 55%,#8134AF)', color: '#fff' },
  { field: 'facebookUrl', brand: 'facebook', label: 'Facebook', background: '#1877F2', color: '#fff' },
  { field: 'tiktokUrl', brand: 'tiktok', label: 'TikTok', background: '#000', color: '#fff', ring: true },
  { field: 'youtubeUrl', brand: 'youtube', label: 'YouTube', background: '#FF0000', color: '#fff' },
  { field: 'telegramUrl', brand: 'telegram', label: 'Telegram', background: '#26A5E4', color: '#fff' },
  { field: 'xUrl', brand: 'x', label: 'X', background: '#000', color: '#fff', ring: true },
  { field: 'snapchatUrl', brand: 'snapchat', label: 'Snapchat', background: '#FFFC00', color: '#000', ring: true },
  { field: 'mapsUrl', brand: 'googlemaps', label: (copy) => copy.contactMaps, background: '#34A853', color: '#fff' },
  { field: 'websiteUrl', brand: null, label: (copy) => copy.contactWebsite, background: 'var(--g-accent)', color: 'var(--g-on-accent)' },
];

/** Every channel that has a value, in display order: call, hotline, WhatsApp, then the social links. */
function buildChannels(contact: RestaurantContact, copy: PublicMenuCopy): Channel[] {
  const channels: Channel[] = [];
  if (contact.phone) {
    channels.push({ key: 'phone', href: telHref(contact.phone), label: copy.callUs, brand: null, background: 'var(--g-accent)', color: 'var(--g-on-accent)', ring: false, external: false });
  }
  if (contact.hotline) {
    channels.push({ key: 'hotline', href: telHref(contact.hotline), label: copy.hotlineLabel, brand: null, background: 'var(--g-accent)', color: 'var(--g-on-accent)', ring: false, external: false });
  }
  if (contact.whatsapp) {
    channels.push({ key: 'whatsapp', href: whatsappHref(contact.whatsapp), label: copy.whatsappUs, brand: 'whatsapp', background: '#25D366', color: '#fff', ring: false, external: true });
  }
  for (const entry of BRANDS) {
    const value = contact[entry.field];
    if (!value) continue;
    channels.push({
      key: entry.field,
      href: value,
      label: typeof entry.label === 'function' ? entry.label(copy) : entry.label,
      brand: entry.brand,
      background: entry.background,
      color: entry.color,
      ring: entry.ring === true,
      external: true,
    });
  }
  return channels;
}

/** The round app-style badge: the brand glyph on the brand colour (a phone or link glyph for the rest). */
function Badge({ channel, size }: { channel: Channel; size: number | 'hero' }) {
  // `hero`: the compact hero row -- 32px on a phone (six badges fit beside the logo on one line), 40px from `lg`.
  const style: CSSProperties =
    size === 'hero'
      ? { background: channel.background, color: channel.color }
      : { background: channel.background, color: channel.color, width: size, height: size };
  const glyph = size === 'hero' ? '56%' : Math.round(size * 0.56);
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${size === 'hero' ? 'size-8 lg:size-10' : ''} ${channel.ring ? 'ring-1 ring-white/25' : ''}`}
    >
      {channel.brand ? (
        <svg viewBox="0 0 24 24" width={glyph} height={glyph} fill="currentColor" focusable="false">
          <path d={BRAND_PATHS[channel.brand]} />
        </svg>
      ) : channel.key === 'phone' || channel.key === 'hotline' ? (
        <GuestIconPhone style={{ width: glyph, height: glyph }} strokeWidth={2.2} />
      ) : (
        <GuestIconLink style={{ width: glyph, height: glyph }} strokeWidth={2.2} />
      )}
    </span>
  );
}

const LINK_PROPS = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * The compact row under the restaurant name in the hero: app-icon style round badges
 * (at most six, so it never crowds the header); the full list is in "Find us" below.
 * Each is a real link with an accessible name and a 40px touch target.
 */
export function HeroContactIcons({
  contact,
  copy,
  exclude = [],
  limit = 6,
  className = '',
}: {
  contact: RestaurantContact;
  copy: PublicMenuCopy;
  /** Channel keys already shown elsewhere (for example as labelled buttons). */
  exclude?: readonly string[];
  /** At most this many icons (default six). */
  limit?: number;
  /** Extra classes for the row (alignment, margin). */
  className?: string;
}) {
  // One call icon is enough up here: the hotline joins in only when there is no phone.
  const channels = buildChannels(contact, copy)
    .filter((channel) => !(channel.key === 'hotline' && contact.phone))
    .filter((channel) => !exclude.includes(channel.key))
    .slice(0, limit);
  if (channels.length === 0) return null;
  return (
    <ul
      aria-label={copy.findUs}
      className={`mt-3 flex flex-wrap items-center gap-[5px] lg:mt-4 lg:gap-2.5 ${className}`}
    >
      {channels.map((channel) => (
        <li key={channel.key}>
          <a
            href={channel.href}
            aria-label={channel.label}
            title={channel.label}
            {...(channel.external ? LINK_PROPS : {})}
            className="relative inline-flex size-8 items-center justify-center rounded-full transition-transform after:absolute after:-inset-[3px] after:content-[''] hover:scale-110 active:scale-95 lg:size-11"
          >
            <Badge channel={channel} size="hero" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The channels HeroContactButtons shows, so the icon row can leave them out. */
export const HERO_BUTTON_KEYS = ['phone', 'hotline', 'whatsapp', 'mapsUrl'] as const;

/**
 * The main ways to reach the restaurant as labelled buttons (call, WhatsApp, location) for the
 * hero of the `floating` template. The hotline stands in for the phone only when there is none.
 */
export function HeroContactButtons({ contact, copy }: { contact: RestaurantContact; copy: PublicMenuCopy }) {
  const channels = buildChannels(contact, copy)
    .filter((channel) => (HERO_BUTTON_KEYS as readonly string[]).includes(channel.key))
    .filter((channel) => !(channel.key === 'hotline' && contact.phone))
    .slice(0, 3);
  if (channels.length === 0) return null;
  return (
    <ul aria-label={copy.findUs} className="flex flex-wrap items-center gap-2">
      {channels.map((channel) => (
        <li key={channel.key}>
          <a
            href={channel.href}
            {...(channel.external ? LINK_PROPS : {})}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-g-line bg-g-surface-2 ps-1.5 pe-3.5 text-[13px] font-bold text-g-text transition-colors hover:border-g-accent hover:bg-g-accent-soft"
          >
            <Badge channel={channel} size={28} />
            {channel.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Pill({ channel, children }: { channel: Channel; children?: ReactNode }) {
  return (
    <a
      href={channel.href}
      {...(channel.external ? LINK_PROPS : {})}
      className="inline-flex h-12 items-center gap-2.5 rounded-full border border-g-line bg-g-surface ps-2 pe-4 text-[14px] font-bold text-g-text transition-colors hover:border-g-accent hover:bg-g-accent-soft"
    >
      <Badge channel={channel} size={32} />
      <span>{channel.label}</span>
      {children}
    </a>
  );
}

/**
 * "Find us" at the bottom of the Guest Menu: one pill per channel that has a value
 * (brand logo + name), the phone numbers showing the number itself. Renders nothing
 * when there is nothing to show. External links open in a new tab with `noopener`;
 * the Backend has already restricted every link to https on the platform's own domain.
 */
export function GuestContact({ contact, copy }: { contact: RestaurantContact; copy: PublicMenuCopy }) {
  const channels = buildChannels(contact, copy);
  if (channels.length === 0) return null;

  return (
    <section aria-labelledby="guest-contact-heading" className="relative z-20 px-4 pb-28 pt-10 lg:px-8 lg:pb-16">
      <div className="mx-auto max-w-[1280px] rounded-[26px] border border-g-line bg-g-surface p-5 lg:p-7">
        <h2 id="guest-contact-heading" className="mb-4 flex items-center gap-2.5 text-[18px] font-extrabold text-g-text lg:text-[20px]">
          <span aria-hidden="true" className="h-5 w-1.5 rounded-full bg-g-accent" />
          {copy.findUs}
        </h2>
        <ul className="flex flex-wrap gap-2.5">
          {channels.map((channel) => (
            <li key={channel.key}>
              <Pill channel={channel}>
                {channel.key === 'phone' || channel.key === 'hotline' ? (
                  <bdi dir="ltr" className="g-num font-extrabold text-g-accent-text">
                    {channel.key === 'phone' ? contact.phone : contact.hotline}
                  </bdi>
                ) : null}
              </Pill>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
