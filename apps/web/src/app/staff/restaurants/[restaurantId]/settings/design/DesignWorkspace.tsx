'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { MenuHubBackLink } from '../../../../../../components/staff/MenuHubBackLink';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import type { MenuTemplateApi } from '../../../../../../lib/public-menu/templates';
import { EmberTemplateEditor } from './EmberTemplateEditor';
import { BloomTemplateEditor } from './BloomTemplateEditor';
import { BrewTemplateEditor } from './BrewTemplateEditor';
import { EditorialPriceDisplayEditor } from './EditorialPriceDisplayEditor';
import {BREW_DESIGN_PREVIEW_READY,BREW_DESIGN_PREVIEW_UPDATE,type BrewTemplateSettings} from '../../../../../../lib/public-menu/brew-settings';
import { EDITORIAL_DESIGN_PREVIEW_READY, EDITORIAL_DESIGN_PREVIEW_UPDATE, type EditorialTemplateSettings } from '../../../../../../lib/public-menu/editorial-settings';
import {
  EMBER_DESIGN_PREVIEW_READY,
  EMBER_DESIGN_PREVIEW_UPDATE,
  type EmberTemplateSettings,
} from '../../../../../../lib/public-menu/ember-settings';
import {
  BLOOM_DESIGN_PREVIEW_READY,
  BLOOM_DESIGN_PREVIEW_UPDATE,
  type BloomTemplateSettings,
} from '../../../../../../lib/public-menu/bloom-settings';

type Template = MenuTemplateApi;

/** The premium designs (DEC-052); the rest are standard. Mirrors the API. */
const PREMIUM: readonly Template[] = ['GALLERY', 'MENU', 'FLOATING', 'EMBER', 'BLOOM', 'BREW'];
const TIERS = ['STANDARD', 'PREMIUM'] as const;

const TEMPLATES: { key: Template; title: MessageKey; hint: MessageKey }[] = [
  { key: 'CLASSIC', title: 'design.classic', hint: 'design.classicHint' },
  { key: 'LIST', title: 'design.list', hint: 'design.listHint' },
  { key: 'GALLERY', title: 'design.gallery', hint: 'design.galleryHint' },
  { key: 'MENU', title: 'design.menu', hint: 'design.menuHint' },
  { key: 'FLOATING', title: 'design.floating', hint: 'design.floatingHint' },
  { key: 'CENTERED', title: 'design.centered', hint: 'design.centeredHint' },
  { key: 'COMPACT', title: 'design.compact', hint: 'design.compactHint' },
  { key: 'EDITORIAL', title: 'design.editorial', hint: 'design.editorialHint' },
  { key: 'EMBER', title: 'design.ember', hint: 'design.emberHint' },
  { key: 'BLOOM', title: 'design.bloom', hint: 'design.bloomHint' },
  { key:'BREW',title:'design.brew',hint:'design.brewHint'},
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
      {template === 'BREW' ? (
        <>
          <rect width="120" height="76" rx="5" fill="#eee8da"/>
          <path d="M7 9 Q7 4 13 4 H42 Q48 4 48 9 V40 H7Z" fill="#294538"/>
          <ellipse cx="28" cy="26" rx="17" ry="10" fill="#f8f3e3"/>
          <ellipse cx="28" cy="25" rx="13" ry="7" fill="#946b45"/>
          <path d="M24 23 Q28 17 32 23 Q34 26 28 29Z" fill="#fff4dc"/>
          <rect x="62" y="9" width="48" height="5" rx="2" fill="#294538"/>
          <rect x="70" y="18" width="40" height="4" rx="2" fill="#a97b4d"/>
          <rect x="8" y="47" width="103" height="2" rx="1" fill="#d3c9ac"/>
          {[0,1,2].map(n=><g key={n} transform={`translate(8 ${54+n*7})`}>
            <rect width="49" height="2" rx="1" fill="#5a7763"/>
            <rect x="40" width="9" height="2" rx="1" fill="#aa8058"/>
          </g>)}
          <rect x="70" y="52" width="40" height="22" rx="3" fill="#294538"/>
        </>
      ) : null}
      {template === 'BLOOM' ? (
        <>
          <rect x="0" y="0" width="120" height="76" rx="5" fill="#fff4f2" />
          <rect x="0" y="0" width="120" height="9" fill="#bc5875" />
          <circle cx="24" cy="33" r="19" fill="#edbec8" />
          <circle cx="24" cy="33" r="14" fill="#f6d8dd" />
          <path d="M13 38 L36 38 L33 50 L16 50Z" fill="#d89ca6" />
          <ellipse cx="24" cy="36" rx="13" ry="4" fill="#ffedeb" />
          <rect x="61" y="23" width="47" height="6" rx="2" fill="#9a4d64" />
          <rect x="70" y="33" width="37" height="4" rx="2" fill="#c67a92" />
          {[0,1,2].map((col) => (
            <g key={col} transform={`translate(${7 + col * 37} 56)`}>
              <rect width="32" height="17" rx="4" fill="#fff" stroke="#f0bbc7" />
              <rect x="2" y="2" width="28" height="9" rx="3" fill="#e7aeb9" />
            </g>
          ))}
        </>
      ) : null}
      {template === 'EMBER' ? (
        <>
          <rect x="0" y="0" width="120" height="40" rx="4" fill="#24140f" />
          <circle cx="91" cy="17" r="26" fill="#cf6835" opacity="0.4" />
          <rect x="8" y="22" width="46" height="5" rx="2" fill="#fff3e4" />
          <rect x="8" y="30" width="32" height="3" rx="1.5" fill="#eaa775" />
          {[0,1,2].map((col) => <g key={col} transform={`translate(${6 + col * 37} 44)`}><rect width="32" height="29" rx="4" fill="#281813"/><rect x="2" y="2" width="28" height="16" rx="3" fill="#a7542b"/><rect x="4" y="21" width="20" height="3" rx="1.5" fill="#fff3e4" /></g>)}
        </>
      ) : null}
      {template === 'EDITORIAL' ? (
        <>
          {[0, 1].map((column) => (
            <g key={column} transform={`translate(${5 + column * 57} 5)`}>
              {[0, 1].map((panel) => (
                <g key={panel} transform={`translate(0 ${panel * 35})`}>
                  <rect width="53" height="31" rx="4" {...frame} />
                  <circle cx="7" cy="7" r="3.5" className="fill-primary" />
                  <rect x="13" y="5.5" width="22" height="3" rx="1.5" {...soft} />
                  {[0, 1, 2].map((row) => (
                    <g key={row} transform={`translate(5 ${13 + row * 5.5})`}>
                      <rect width="20" height="2" rx="1" {...soft} />
                      <rect x="31" width="8" height="2" rx="1" className="fill-primary" />
                      <rect x="43" y="-1.5" width="6" height="5" rx="2.5" {...frame} />
                    </g>
                  ))}
                </g>
              ))}
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
  // Keep the selected template's settings beside its card, not below an ever-growing catalogue.
  const [customizeOpen, setCustomizeOpen] = useState(true);
  const [qrCode, setQrCode] = useState<string | null | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [emberPreviewDraft, setEmberPreviewDraft] = useState<EmberTemplateSettings | null>(null);
  const [emberPreviewLanguage, setEmberPreviewLanguage] = useState<'ar' | 'en' | null>(null);
  const [bloomPreviewDraft, setBloomPreviewDraft] = useState<BloomTemplateSettings | null>(null);
  const [bloomPreviewLanguage, setBloomPreviewLanguage] = useState<'ar' | 'en' | null>(null);
  const [editorialPreview,setEditorialPreview]=useState<EditorialTemplateSettings|null>(null);
  const [brewPreviewDraft,setBrewPreviewDraft]=useState<BrewTemplateSettings|null>(null);
  const [brewPreviewLanguage,setBrewPreviewLanguage]=useState<'ar'|'en'|null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exclusiveDesign, setExclusiveDesign] = useState<settingsApi.ExclusiveDesignStatusView | null>(null);
  const exclusiveActive = exclusiveDesign?.status === 'ACTIVE_BASE';

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

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    settingsApi.getExclusiveDesign(restaurantId)
      .then((result) => { if (!cancelled) setExclusiveDesign(result); })
      .catch(() => { /* private status is optional; do not leak errors into stock selection */ });
    return () => { cancelled = true; };
  }, [canManage, restaurantId]);

  const dirty = selected !== saved;

  async function save() {
    if (exclusiveActive) return;
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

  const previewLocale = selected === 'EMBER' ? emberPreviewLanguage
    : selected === 'BLOOM' ? bloomPreviewLanguage : selected==='BREW'?brewPreviewLanguage:null;
  const designPreview = selected === 'EMBER' || selected === 'BLOOM' || selected==='BREW' || selected==='EDITORIAL';
  const previewSrc = qrCode
    ? `/q/${qrCode}?template=${selected.toLowerCase()}${designPreview
        ? `&designPreview=1${previewLocale ? `&lang=${previewLocale}` : ''}`
        : ''}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <MenuHubBackLink restaurantId={restaurantId} parent="hub" />
      <PageHeader title={t('menuHub.design')} description={t('menuHub.design.description')} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('design.heading')}</h2>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {t('design.description')}
            </p>
          </div>

          {exclusiveDesign ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-semibold text-foreground">
                {t('design.exclusive.heading')}
              </p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                {t(
                  exclusiveDesign.status === 'RESERVED'
                    ? 'design.exclusive.reserved'
                    : exclusiveDesign.status === 'ACTIVE_BASE'
                      ? 'design.exclusive.active'
                      : 'design.exclusive.disabled',
                )}
              </p>
              <p className="mt-2 text-sm font-semibold text-primary">
                {exclusiveDesign.baseTemplate}
              </p>
            </div>
          ) : null}
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
                  {tier === 'PREMIUM' ? <span aria-hidden="true" className="text-warning">★</span> : null}
                  {t(tier === 'PREMIUM' ? 'design.premiumHeading' : 'design.standardHeading')}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t(tier === 'PREMIUM' ? 'design.premiumHint' : 'design.standardHint')}
                </p>
              </div>
              <ul
                role="radiogroup"
                aria-label={t(tier === 'PREMIUM' ? 'design.premiumHeading' : 'design.standardHeading')}
                className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2"
              >
                {TEMPLATES.filter((item) => PREMIUM.includes(item.key) === (tier === 'PREMIUM')).map((template) => {
                  const isSelected = selected === template.key;
                  const locked = !allowedTemplates.includes(template.key);
                  const customizable = template.key === 'EMBER' || template.key === 'BLOOM' ||
                    template.key === 'BREW' || template.key === 'EDITORIAL';
                  const expanded = isSelected && customizable && customizeOpen && !locked && canManage;
                  return (
                    <li key={template.key} className={`min-w-0 ${expanded ? 'sm:col-span-2' : ''}`}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        disabled={!canManage || locked || exclusiveActive}
                        onClick={() => {
                          setSelected(template.key);
                          setCustomizeOpen(true);
                          setJustSaved(false);
                        }}
                        className={`flex w-full min-w-0 flex-col gap-2 rounded-xl border p-3 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70 ${
                          isSelected
                            ? 'border-primary bg-accent ring-2 ring-primary/40'
                            : 'border-border bg-card hover:border-primary/50'
                        }`}
                      >
                        <span className={`block h-24 w-full overflow-hidden rounded-lg border border-border bg-background p-1.5 ${expanded ? 'sm:max-w-[330px]' : ''}`}>
                          <Wireframe template={template.key} />
                        </span>
                        <span className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 text-sm font-semibold text-foreground">{t(template.title)}</span>
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

                      {isSelected && !locked && canManage ? (
                        <div className="mt-3 flex min-w-0 flex-col gap-3" aria-label={t(template.title)}>
                          {customizable ? (
                            <button type="button"
                              aria-expanded={customizeOpen}
                              aria-controls={`template-customization-${template.key}`}
                              onClick={() => setCustomizeOpen((value) => !value)}
                              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-start text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              <span>{t(customizeOpen ? 'design.hideCustomization' : 'design.customize')}</span>
                              <span aria-hidden="true">{customizeOpen ? '−' : '+'}</span>
                            </button>
                          ) : null}
                          {customizable ? (
                            <div id={`template-customization-${template.key}`} hidden={!customizeOpen} className="min-w-0">
                              {expanded && template.key === 'EMBER' ? (
                                <EmberTemplateEditor restaurantId={restaurantId} canManage={canManage}
                                  onDraftChange={setEmberPreviewDraft} onCopyLanguageChange={setEmberPreviewLanguage}/>
                              ) : null}
                              {expanded && template.key === 'BLOOM' ? (
                                <BloomTemplateEditor restaurantId={restaurantId} canManage={canManage}
                                  onDraftChange={setBloomPreviewDraft} onCopyLanguageChange={setBloomPreviewLanguage}/>
                              ) : null}
                              {expanded && template.key === 'BREW' ? (
                                <BrewTemplateEditor restaurantId={restaurantId} canManage={canManage}
                                  onDraftChange={setBrewPreviewDraft} onCopyLanguageChange={setBrewPreviewLanguage}/>
                              ) : null}
                              {expanded && template.key === 'EDITORIAL' ? (
                                <EditorialPriceDisplayEditor restaurantId={restaurantId} canManage={canManage}
                                  onPreviewChange={setEditorialPreview}/>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={() => void save()} disabled={!dirty || isSaving || exclusiveActive}>
                              {t('design.save')}
                            </Button>
                            {dirty ? <span className="text-xs text-muted-foreground">{t('design.unsaved')}</span> : null}
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        <PreviewPane
          src={previewSrc}
          isLoading={qrCode === undefined}
          premiumDraft={
            selected === 'EMBER' && emberPreviewDraft
              ? { kind: 'ember', settings: emberPreviewDraft }
              : selected === 'BLOOM' && bloomPreviewDraft
                ? { kind: 'bloom', settings: bloomPreviewDraft }
                : selected==='BREW'&&brewPreviewDraft?{kind:'brew',settings:brewPreviewDraft}
                : selected==='EDITORIAL'&&editorialPreview?{kind:'editorial',settings:editorialPreview}:null
          }
        />
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
type PremiumPreviewDraft =
  | { kind: 'ember'; settings: EmberTemplateSettings }
  | { kind: 'bloom'; settings: BloomTemplateSettings }
  | { kind:'brew';settings:BrewTemplateSettings }
  | { kind:'editorial';settings:EditorialTemplateSettings }
  | null;

function PreviewPane({
  src,
  isLoading,
  premiumDraft,
}: {
  src: string | null;
  isLoading: boolean;
  premiumDraft: PremiumPreviewDraft;
}) {
  const { t } = useStaffI18n();
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const holderRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Update the existing iframe, not its URL, so typing doesn't reset scroll
  // or the guest cart. No API request or database mutation is performed here.
  const sendPremiumDraft = useCallback(() => {
    if (!src?.includes('designPreview=1') || !premiumDraft) return;
    frameRef.current?.contentWindow?.postMessage(
      {
        type: premiumDraft.kind === 'ember' ? EMBER_DESIGN_PREVIEW_UPDATE : premiumDraft.kind==='brew'?BREW_DESIGN_PREVIEW_UPDATE:premiumDraft.kind==='editorial'?EDITORIAL_DESIGN_PREVIEW_UPDATE:BLOOM_DESIGN_PREVIEW_UPDATE,
        settings: premiumDraft.settings,
      },
      window.location.origin,
    );
  }, [src, premiumDraft]);

  useEffect(() => { sendPremiumDraft(); }, [sendPremiumDraft]);

  // The iframe announces when its message listener has mounted. The handshake
  // also restores the live draft after mobile/desktop or language navigation.
  useEffect(() => {
    if (!src?.includes('designPreview=1')) return;
    const receiveReady = (event: MessageEvent) => {
      if (event.origin !== window.location.origin ||
          event.source !== frameRef.current?.contentWindow ||
          !event.data || typeof event.data !== 'object' ||
          (event.data as { type?: unknown }).type !== (
            premiumDraft?.kind === 'bloom' ? BLOOM_DESIGN_PREVIEW_READY : premiumDraft?.kind==='brew'?BREW_DESIGN_PREVIEW_READY:premiumDraft?.kind==='editorial'?EDITORIAL_DESIGN_PREVIEW_READY:EMBER_DESIGN_PREVIEW_READY
          )) return;
      sendPremiumDraft();
    };
    window.addEventListener('message', receiveReady);
    return () => window.removeEventListener('message', receiveReady);
  }, [src, sendPremiumDraft, premiumDraft?.kind]);
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
                ref={frameRef}
                onLoad={sendPremiumDraft}
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
                  ref={frameRef}
                  onLoad={sendPremiumDraft}
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
      <p className="text-center text-xs text-muted-foreground">{t(premiumDraft && src?.includes('designPreview=1')
        ? premiumDraft.kind === 'bloom' ? 'design.bloomPreviewLiveHint' : premiumDraft.kind==='brew'?'design.brewPreviewLiveHint':premiumDraft.kind==='editorial'?'design.editorialPricePreviewHint':'design.emberPreviewLiveHint'
        : 'design.previewHint')}</p>
    </aside>
  );
}
