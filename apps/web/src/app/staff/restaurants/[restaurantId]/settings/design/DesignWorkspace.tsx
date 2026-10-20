'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import * as qrApi from '../../../../../../lib/qr/api';
import * as settingsApi from '../../../../../../lib/settings/api';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import type { MenuTemplateApi } from '../../../../../../lib/public-menu/templates';
import { SettingsTabs } from '../SettingsTabs';

type Template = MenuTemplateApi;

/** The premium designs (DEC-052); the rest are standard. Mirrors the API. */
const PREMIUM: readonly Template[] = ['GALLERY', 'MENU', 'FLOATING'];
const TIERS = ['STANDARD', 'PREMIUM'] as const;

const TEMPLATES: { key: Template; title: MessageKey; hint: MessageKey }[] = [
  { key: 'CLASSIC', title: 'design.classic', hint: 'design.classicHint' },
  { key: 'LIST', title: 'design.list', hint: 'design.listHint' },
  { key: 'GALLERY', title: 'design.gallery', hint: 'design.galleryHint' },
  { key: 'MENU', title: 'design.menu', hint: 'design.menuHint' },
  { key: 'FLOATING', title: 'design.floating', hint: 'design.floatingHint' },
  { key: 'CENTERED', title: 'design.centered', hint: 'design.centeredHint' },
  { key: 'COMPACT', title: 'design.compact', hint: 'design.compactHint' },
];

/** A simple wireframe of each layout, drawn with the theme colours (no images to load). */
function Wireframe({ template }: { template: Template }): ReactNode {
  // Shapes use currentColor at low opacity (muted) or the primary colour (accents), so they follow the theme.
  const soft = { fill: 'currentColor', fillOpacity: 0.22 } as const;
  const frame = { fill: 'none', stroke: 'currentColor', strokeOpacity: 0.3, strokeWidth: 1 } as const;
  return (
    <svg viewBox="0 0 120 76" className="h-full w-full text-muted-foreground" aria-hidden="true">
      {template === 'CLASSIC' ? (
        <>
          {[0, 1].map((col) =>
            [0, 1].map((row) => (
              <g key={`${col}${row}`} transform={`translate(${8 + col * 55} ${6 + row * 34})`}>
                <rect width="49" height="30" rx="4" {...frame} />
                <rect x="4" y="4" width="41" height="14" rx="3" {...soft} />
                <rect x="4" y="21" width="24" height="3" rx="1.5" {...soft} />
              </g>
            )),
          )}
        </>
      ) : null}
      {template === 'LIST' ? (
        <>
          {[0, 1, 2, 3].map((row) => (
            <g key={row} transform={`translate(8 ${5 + row * 17})`}>
              <rect width="104" height="14" rx="3" {...frame} />
              <rect x="3" y="3" width="8" height="8" rx="2" {...soft} />
              <rect x="15" y="4" width="44" height="3" rx="1.5" {...soft} />
              <rect x="15" y="9" width="24" height="2" rx="1" {...soft} />
              <circle cx="97" cy="7" r="3.5" className="fill-primary" />
            </g>
          ))}
        </>
      ) : null}
      {template === 'GALLERY' ? (
        <>
          {[0, 1, 2].map((col) => (
            <g key={col} transform={`translate(${6 + col * 37} 8)`}>
              <rect width="33" height="60" rx="5" {...frame} />
              <rect x="2" y="2" width="29" height="34" rx="4" {...soft} />
              <rect x="4" y="42" width="20" height="3" rx="1.5" {...soft} />
              <rect x="4" y="48" width="12" height="3" rx="1.5" className="fill-primary" />
            </g>
          ))}
        </>
      ) : null}
      {template === 'MENU' ? (
        <>
          <rect x="36" y="6" width="48" height="3" rx="1.5" {...soft} />
          {[0, 1, 2, 3, 4].map((row) => (
            <g key={row} transform={`translate(18 ${16 + row * 11})`}>
              <rect width="34" height="3" rx="1.5" {...soft} />
              <line x1="38" y1="1.5" x2="76" y2="1.5" strokeDasharray="1.5 2" stroke="currentColor" strokeOpacity="0.4" />
              <rect x="80" width="22" height="3" rx="1.5" className="fill-primary" />
            </g>
          ))}
        </>
      ) : null}
      {template === 'FLOATING' ? (
        <>
          <rect x="0" y="0" width="120" height="22" {...soft} />
          <g transform="translate(8 12)">
            <rect width="104" height="24" rx="5" fill="var(--background, #fff)" stroke="currentColor" strokeOpacity="0.3" />
            <rect x="5" y="5" width="12" height="12" rx="3" {...soft} />
            <rect x="21" y="6" width="36" height="3" rx="1.5" {...soft} />
            <rect x="21" y="12" width="20" height="2" rx="1" {...soft} />
            <rect x="5" y="19" width="22" height="3" rx="1.5" className="fill-primary" />
            <rect x="30" y="19" width="22" height="3" rx="1.5" className="fill-primary" />
          </g>
          {[0, 1, 2].map((col) => (
            <g key={col} transform={`translate(${8 + col * 36} 42)`}>
              <rect width="32" height="30" rx="4" {...frame} />
              <rect x="2" y="2" width="28" height="16" rx="3" {...soft} />
              <rect x="3" y="21" width="16" height="2.5" rx="1.2" {...soft} />
              <rect x="3" y="25" width="10" height="2.5" rx="1.2" className="fill-primary" />
            </g>
          ))}
        </>
      ) : null}
      {template === 'CENTERED' ? (
        <>
          <rect x="0" y="0" width="120" height="36" {...soft} />
          <circle cx="60" cy="36" r="9" fill="var(--background, #fff)" stroke="currentColor" strokeOpacity="0.4" />
          <rect x="44" y="48" width="32" height="4" rx="2" {...soft} />
          {[0, 1, 2, 3].map((dot) => (
            <circle key={dot} cx={47 + dot * 9.5} cy="58" r="3" className="fill-primary" />
          ))}
          {[0, 1].map((col) => (
            <g key={col} transform={`translate(${8 + col * 55} 63)`}>
              <rect width="49" height="12" rx="3" {...frame} />
              <rect x="3" y="3" width="14" height="6" rx="2" {...soft} />
            </g>
          ))}
        </>
      ) : null}
      {template === 'COMPACT' ? (
        <>
          <rect x="0" y="0" width="120" height="10" {...soft} />
          <g transform="translate(6 13)">
            <circle cx="6" cy="6" r="5" {...soft} />
            <rect x="15" y="2" width="34" height="3.5" rx="1.7" {...soft} />
            <rect x="15" y="8" width="18" height="2.5" rx="1.2" {...soft} />
            {[0, 1, 2].map((dot) => (
              <circle key={dot} cx={92 + dot * 8} cy="6" r="3" className="fill-primary" />
            ))}
          </g>
          <line x1="6" y1="29" x2="114" y2="29" stroke="currentColor" strokeOpacity="0.25" />
          <line x1="8" y1="29" x2="28" y2="29" stroke="var(--primary, #c2410c)" strokeWidth="1.5" />
          {[0, 1, 2].map((row) => (
            <g key={row} transform={`translate(6 ${33 + row * 14})`}>
              <rect width="108" height="12" rx="3" {...frame} />
              <rect x="3" y="3" width="6" height="6" rx="1.5" {...soft} />
              <rect x="13" y="3" width="32" height="2.5" rx="1.2" {...soft} />
              <circle cx="100" cy="6" r="3" className="fill-primary" />
            </g>
          ))}
        </>
      ) : null}
    </svg>
  );
}

/**
 * Restaurant Settings -> Menu design (DEC-044): pick how the guest menu is laid out and watch it on the
 * Restaurant's real menu before saving. The layout is presentation only. The preview is the real Guest
 * menu in a phone-sized frame, asked to render the chosen layout through `?template=`.
 */
export function DesignWorkspace({
  restaurantId,
  canManage,
  initialTemplate,
  allowedTemplates,
}: {
  restaurantId: string;
  canManage: boolean;
  initialTemplate: Template;
  /** The templates the package allows (DEC-051); Classic is always in it. The others are shown locked. */
  allowedTemplates: readonly Template[];
}) {
  const { t } = useStaffI18n();
  const [saved, setSaved] = useState<Template>(initialTemplate);
  const [selected, setSelected] = useState<Template>(initialTemplate);
  const [qrCode, setQrCode] = useState<string | null | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    qrApi
      .getGenericQr(restaurantId)
      .then((qr) => {
        if (!cancelled) setQrCode(qr && qr.status === 'ACTIVE' ? qr.publicCode : null);
      })
      .catch(() => {
        if (!cancelled) setQrCode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const dirty = selected !== saved;

  async function save() {
    setIsSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const result = await settingsApi.updateMenuTemplate(restaurantId, selected);
      setSaved(result.menuTemplate);
      setSelected(result.menuTemplate);
      setJustSaved(true);
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setError(describeError(caught));
    } finally {
      setIsSaving(false);
    }
  }

  const previewSrc = qrCode ? `/q/${qrCode}?template=${selected.toLowerCase()}` : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      <SettingsTabs restaurantId={restaurantId} active="design" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('design.heading')}</h2>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {t('design.description')}
            </p>
          </div>

          {error ? <Alert variant="error">{error}</Alert> : null}
          {justSaved && !dirty ? <Alert variant="success">{t('design.saved')}</Alert> : null}
          {!canManage ? <Alert variant="info">{t('design.needsFullScope')}</Alert> : null}
          {allowedTemplates.length < TEMPLATES.length ? (
            <Alert variant="warning">
              {t(allowedTemplates.length <= 1 ? 'features.templates.locked' : 'design.someLocked')}{' '}
              <Link
                href={`/staff/restaurants/${restaurantId}/subscription`}
                className="font-semibold underline underline-offset-4"
              >
                {t('design.seePlans')}
              </Link>
            </Alert>
          ) : null}

          {TIERS.map((tier) => (
            <div key={tier} className="space-y-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {tier === 'PREMIUM' ? (
                    <span aria-hidden="true" className="text-warning">
                      ★
                    </span>
                  ) : null}
                  {t(tier === 'PREMIUM' ? 'design.premiumHeading' : 'design.standardHeading')}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(tier === 'PREMIUM' ? 'design.premiumHint' : 'design.standardHint')}
                </p>
              </div>
          <ul
            role="radiogroup"
            aria-label={t(tier === 'PREMIUM' ? 'design.premiumHeading' : 'design.standardHeading')}
            className="grid gap-3 sm:grid-cols-2"
          >
            {TEMPLATES.filter((template) => PREMIUM.includes(template.key) === (tier === 'PREMIUM')).map((template) => {
              const isSelected = selected === template.key;
              const locked = !allowedTemplates.includes(template.key);
              return (
                <li key={template.key}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={!canManage || locked}
                    onClick={() => {
                      setSelected(template.key);
                      setJustSaved(false);
                    }}
                    className={`flex w-full flex-col gap-2 rounded-xl border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                      isSelected
                        ? 'border-primary bg-accent ring-2 ring-primary/40'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                  >
                    <span className="block h-24 w-full rounded-lg border border-border bg-background p-1.5">
                      <Wireframe template={template.key} />
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{t(template.title)}</span>
                      {saved === template.key ? (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                          {t('design.current')}
                        </span>
                      ) : isSelected ? (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {t('design.previewing')}
                        </span>
                      ) : locked ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          {t(tier === 'PREMIUM' ? 'design.premiumLockedTag' : 'design.lockedTag')}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs leading-relaxed text-muted-foreground">{t(template.hint)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} disabled={!canManage || !dirty || isSaving}>
              {t('design.save')}
            </Button>
            {dirty ? <span className="text-xs text-muted-foreground">{t('design.unsaved')}</span> : null}
          </div>
        </section>

        <PreviewPane src={previewSrc} isLoading={qrCode === undefined} />
      </div>
    </div>
  );
}

const DESKTOP_WIDTH = 1280;
const DESKTOP_HEIGHT = 1000;

/**
 * The live preview: the real Guest menu in an iframe. `Mobile` is a phone-sized frame; `Desktop`
 * renders the page at a 1280px-wide viewport and scales it down to fit the panel, so the whole
 * desktop layout is visible without scrolling sideways.
 */
function PreviewPane({ src, isLoading }: { src: string | null; isLoading: boolean }) {
  const { t } = useStaffI18n();
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const holderRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = holderRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = width > 0 ? Math.min(1, width / DESKTOP_WIDTH) : 0.5;

  return (
    <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{t('design.preview')}</p>
        <div
          role="radiogroup"
          aria-label={t('design.preview')}
          className="inline-flex rounded-lg border border-border bg-card p-0.5"
        >
          {(['mobile', 'desktop'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={device === option}
              onClick={() => setDevice(option)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                device === option
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(option === 'mobile' ? 'design.device.mobile' : 'design.device.desktop')}
            </button>
          ))}
        </div>
      </div>

      <div ref={holderRef} className="w-full">
        {src ? (
          device === 'mobile' ? (
            <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[32px] border-[6px] border-foreground/80 bg-background shadow-lg">
              <iframe
                key={`m-${src}`}
                src={src}
                title={t('design.preview')}
                className="block h-[720px] w-full bg-background"
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-background shadow-lg">
              <div className="flex h-6 items-center gap-1.5 border-b border-border bg-muted px-3">
                <span className="size-2 rounded-full bg-muted-foreground/40" />
                <span className="size-2 rounded-full bg-muted-foreground/40" />
                <span className="size-2 rounded-full bg-muted-foreground/40" />
              </div>
              <div style={{ height: DESKTOP_HEIGHT * scale }} className="relative overflow-hidden">
                <iframe
                  key={`d-${src}`}
                  src={src}
                  title={t('design.preview')}
                  style={{
                    width: DESKTOP_WIDTH,
                    height: DESKTOP_HEIGHT,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }}
                  className="absolute left-0 top-0 block border-0 bg-background"
                />
              </div>
            </div>
          )
        ) : (
          <div className="grid h-[420px] place-items-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {isLoading ? '...' : t('design.previewNoQr')}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">{t('design.previewHint')}</p>
    </aside>
  );
}
