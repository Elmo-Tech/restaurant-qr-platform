'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';
import type { MessageKey } from '../../lib/i18n/messages';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { cn } from '../../lib/utils';
import {
  downloadBlob,
  loadLogoDataUrl,
  loadStandFontCss,
  printStandPages,
  qrSvgToPngBlob,
  standSvgToPngBlob,
  standSvgsToPdfBlob,
  svgToCanvas,
} from '../../lib/qr/stand/export';
import { allTablesFileName, standFileName } from '../../lib/qr/stand/file-names';
import { createQrMatrix } from '../../lib/qr/stand/qr-matrix';
import {
  HEX6,
  STAND_CAPTION_LANGS,
  STAND_COLOR_PRESETS,
  STAND_DEFAULT_COLOR,
  STAND_PNG_HEIGHT,
  STAND_PNG_WIDTH,
  STAND_TEMPLATES,
  buildQrOnlySvg,
  buildStandSvg,
  defaultStandNames,
  type StandCaptionLang,
  type StandOptions,
  type StandTemplate,
} from '../../lib/qr/stand/stand-svg';

export interface StandTable {
  number: string;
  /** The exact Guest Menu URL of this table's QR. */
  url: string;
}

interface Design {
  template: StandTemplate;
  color: string;
  captionLang: StandCaptionLang;
  showLogo: boolean;
}

const DEFAULT_DESIGN: Design = {
  template: 'classic',
  color: STAND_DEFAULT_COLOR,
  captionLang: 'both',
  showLogo: true,
};

function storageKey(restaurantId: string): string {
  return `wayta.standDesign.v1.${restaurantId}`;
}

function readStoredDesign(restaurantId: string): Design | null {
  try {
    const raw = window.localStorage.getItem(storageKey(restaurantId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Design>;
    return {
      template: STAND_TEMPLATES.includes(value.template as StandTemplate) ? (value.template as StandTemplate) : DEFAULT_DESIGN.template,
      color: typeof value.color === 'string' && HEX6.test(value.color) ? value.color.toUpperCase() : DEFAULT_DESIGN.color,
      captionLang: STAND_CAPTION_LANGS.includes(value.captionLang as StandCaptionLang)
        ? (value.captionLang as StandCaptionLang)
        : DEFAULT_DESIGN.captionLang,
      showLogo: typeof value.showLogo === 'boolean' ? value.showLogo : DEFAULT_DESIGN.showLogo,
    };
  } catch {
    return null;
  }
}

type Busy = 'png' | 'pdf' | 'print' | 'qrPng' | 'qrSvg' | 'allPdf' | 'allPrint' | null;

/**
 * The QR stand: four ready-made A6 looks with one main colour, plus the two
 * kinds of download (the finished stand as PNG / PDF / print, or the QR code
 * alone as PNG / SVG). Deliberately not a design editor: the look, the colour,
 * the caption language, the names, the logo and (for a table) the number.
 */
export function StandDesigner({
  restaurantId,
  restaurantName,
  logoUrl,
  guestUrl,
  fixedTableNumber = null,
  allowTableInput = false,
  tables,
  batchOnly = false,
}: {
  restaurantId: string;
  restaurantName: string;
  /** Absolute URL of the uploaded logo, or null when there is none. */
  logoUrl: string | null;
  /** The exact Guest Menu URL encoded in the code. */
  guestUrl: string;
  /** Set when the stand is for one specific table (the tag follows the table). */
  fixedTableNumber?: string | null;
  /** The Restaurant QR page lets staff type an optional table tag. */
  allowTableInput?: boolean;
  /** When given, an "all tables" section prints one page per table. */
  tables?: readonly StandTable[];
  /** Only the look and the all-tables downloads (the dialog on the Tables page). */
  batchOnly?: boolean;
}) {
  const { t } = useStaffI18n();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [names, setNames] = useState(() => defaultStandNames(restaurantName));
  const [typedTable, setTypedTable] = useState('');
  const [customHex, setCustomHex] = useState(DEFAULT_DESIGN.color);
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  // Remembered per browser (a convenience only; the page works without it).
  useEffect(() => {
    queueMicrotask(() => {
      const stored = readStoredDesign(restaurantId);
      if (stored) {
        setDesign(stored);
        setCustomHex(stored.color);
      }
    });
  }, [restaurantId]);

  function update(change: Partial<Design>) {
    setDesign((current) => {
      const next = { ...current, ...change };
      try {
        window.localStorage.setItem(storageKey(restaurantId), JSON.stringify(next));
      } catch {
        /* storage unavailable: the choice just is not remembered */
      }
      return next;
    });
  }

  // The logo has to be embedded in the drawing (an SVG used as an image cannot fetch it).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLogoDataUrl(null);
      setLogoFailed(false);
      if (!logoUrl) return;
      loadLogoDataUrl(logoUrl)
        .then((url) => {
          if (!cancelled) setLogoDataUrl(url);
        })
        .catch(() => {
          if (!cancelled) setLogoFailed(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  const matrix = useMemo(() => createQrMatrix(guestUrl), [guestUrl]);
  const tableNumber = batchOnly ? (tables?.[0]?.number ?? null) : fixedTableNumber ?? (allowTableInput && typedTable.trim() ? typedTable.trim() : null);

  function stand(overrides: Partial<StandOptions>): StandOptions {
    return {
      template: design.template,
      color: design.color,
      captionLang: design.captionLang,
      nameAr: names.nameAr,
      nameEn: names.nameEn,
      showLogo: design.showLogo && logoUrl !== null,
      logoDataUrl,
      tableNumber,
      matrix,
      ...overrides,
    };
  }

  const previewSvg = useMemo(
    () => buildStandSvg(stand({ sizing: 'fluid', idPrefix: `${uid}p` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design, names, tableNumber, matrix, logoDataUrl, logoUrl, uid],
  );

  async function run(kind: Exclude<Busy, null>, work: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setProgress(null);
    try {
      await work();
    } catch {
      setError(t('stand.download.error'));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function exportSvg(overrides: Partial<StandOptions> = {}): Promise<string> {
    const fontCss = await loadStandFontCss();
    return buildStandSvg(stand({ ...overrides, fontCss, sizing: 'mm', idPrefix: 'export' }));
  }

  const fileBase = { restaurantName, tableNumber };

  const downloadPng = () =>
    run('png', async () => {
      downloadBlob(
        await standSvgToPngBlob(await exportSvg()),
        standFileName({ ...fileBase, kind: 'stand', ext: 'png', template: design.template }),
      );
    });

  const downloadPdf = () =>
    run('pdf', async () => {
      downloadBlob(
        await standSvgsToPdfBlob([await exportSvg()]),
        standFileName({ ...fileBase, kind: 'stand', ext: 'pdf', template: design.template }),
      );
    });

  const print = () =>
    run('print', async () => {
      const canvas = await svgToCanvas(await exportSvg(), STAND_PNG_WIDTH, STAND_PNG_HEIGHT);
      printStandPages([canvas.toDataURL('image/png')]);
    });

  const downloadQrPng = () =>
    run('qrPng', async () => {
      downloadBlob(await qrSvgToPngBlob(buildQrOnlySvg(matrix)), standFileName({ ...fileBase, kind: 'qr', ext: 'png' }));
    });

  const downloadQrSvg = () =>
    run('qrSvg', async () => {
      downloadBlob(
        new Blob([buildQrOnlySvg(matrix, { transparent })], { type: 'image/svg+xml;charset=utf-8' }),
        standFileName({ ...fileBase, kind: 'qr', ext: 'svg' }),
      );
    });

  async function allPages(): Promise<string[]> {
    const fontCss = await loadStandFontCss();
    return (tables ?? []).map((table) =>
      buildStandSvg(
        stand({ fontCss, sizing: 'mm', idPrefix: 'export', tableNumber: table.number, matrix: createQrMatrix(table.url) }),
      ),
    );
  }

  const downloadAll = () =>
    run('allPdf', async () => {
      const svgs = await allPages();
      downloadBlob(
        await standSvgsToPdfBlob(svgs, (done, total) => setProgress(t('stand.all.progress', { done, total }))),
        allTablesFileName(restaurantName, design.template),
      );
    });

  const printAll = () =>
    run('allPrint', async () => {
      const svgs = await allPages();
      const urls: string[] = [];
      for (let index = 0; index < svgs.length; index += 1) {
        setProgress(t('stand.all.progress', { done: index + 1, total: svgs.length }));
        urls.push((await svgToCanvas(svgs[index], STAND_PNG_WIDTH, STAND_PNG_HEIGHT)).toDataURL('image/png'));
      }
      printStandPages(urls);
    });

  const isBusy = busy !== null;
  const label = (key: MessageKey, kind: Exclude<Busy, null>) => (busy === kind ? t('stand.download.preparing') : t(key));
  const presetSelected = (color: string) => design.color.toUpperCase() === color;

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-6">
      {/* ---- preview ---- */}
      <div className="flex min-w-0 flex-col items-center gap-3">
        <div className="w-full max-w-[300px] rounded-xl border border-border bg-muted/50 p-3">
          <div
            role="img"
            aria-label={t('stand.previewAlt')}
            className="mx-auto aspect-[105/148] w-full overflow-hidden rounded-md bg-white shadow-md [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: previewSvg }}
          />
        </div>
        {logoFailed ? <p className="text-xs text-warning">{t('stand.logoFailed')}</p> : null}
      </div>

      {/* ---- controls and downloads ---- */}
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t('stand.template.label')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STAND_TEMPLATES.map((template) => {
              const selected = design.template === template;
              const svg = buildStandSvg(stand({ template, sizing: 'fluid', idPrefix: `${uid}${template}` }));
              return (
                <button
                  key={template}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => update({ template })}
                  className={cn(
                    'flex min-w-0 flex-col items-center gap-1.5 rounded-lg border p-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="block aspect-[105/148] w-full max-w-[84px] overflow-hidden rounded border border-border bg-white [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                  {t(`stand.template.${template}` as MessageKey)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t('stand.color.label')}</p>
          <div className="flex flex-wrap items-center gap-2">
            {STAND_COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                aria-pressed={presetSelected(color)}
                aria-label={t('stand.color.preset', { color })}
                onClick={() => {
                  setCustomHex(color);
                  update({ color });
                }}
                style={{ backgroundColor: color }}
                className={cn(
                  'size-9 rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  presetSelected(color) ? 'border-foreground ring-2 ring-foreground/30' : 'border-card',
                )}
              />
            ))}
            <input
              type="color"
              aria-label={t('stand.color.custom')}
              value={design.color.toLowerCase()}
              onChange={(event) => {
                setCustomHex(event.target.value.toUpperCase());
                update({ color: event.target.value.toUpperCase() });
              }}
              className="h-9 w-11 cursor-pointer rounded-md border border-border bg-card p-1"
            />
            <input
              type="text"
              dir="ltr"
              aria-label={t('stand.color.customHex')}
              value={customHex}
              maxLength={7}
              spellCheck={false}
              onChange={(event) => {
                const next = event.target.value.trim();
                setCustomHex(next);
                if (HEX6.test(next)) update({ color: next.toUpperCase() });
              }}
              className="h-9 w-24 rounded-md border border-input bg-card px-2 text-sm uppercase text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t('stand.caption.label')}</p>
          <div className="inline-flex flex-wrap gap-2">
            {STAND_CAPTION_LANGS.map((lang) => (
              <button
                key={lang}
                type="button"
                aria-pressed={design.captionLang === lang}
                onClick={() => update({ captionLang: lang })}
                className={cn(
                  'min-h-10 rounded-lg border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  design.captionLang === lang
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                {t(`stand.caption.${lang}` as MessageKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('stand.nameAr.label')}</span>
            <input
              type="text"
              dir="rtl"
              value={names.nameAr}
              maxLength={60}
              onChange={(event) => setNames((current) => ({ ...current, nameAr: event.target.value }))}
              className="h-10 min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('stand.nameEn.label')}</span>
            <input
              type="text"
              dir="ltr"
              value={names.nameEn}
              maxLength={60}
              onChange={(event) => setNames((current) => ({ ...current, nameEn: event.target.value }))}
              className="h-10 min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </label>
          {batchOnly ? null : fixedTableNumber ? (
            <p className="text-sm font-medium text-foreground sm:col-span-2">
              {t('stand.table.fixed', { number: fixedTableNumber })}
            </p>
          ) : allowTableInput ? (
            <label className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">{t('stand.table.label')}</span>
              <input
                type="text"
                value={typedTable}
                maxLength={12}
                onChange={(event) => setTypedTable(event.target.value)}
                className="h-10 w-32 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </label>
          ) : null}
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t('stand.showLogo')}</p>
            {!logoUrl ? <p className="text-xs text-muted-foreground">{t('stand.showLogo.none')}</p> : null}
          </div>
          <Switch
            checked={design.showLogo && logoUrl !== null}
            label={t('stand.showLogo')}
            disabled={logoUrl === null}
            onCheckedChange={(next) => update({ showLogo: next })}
          />
        </label>

        {error ? <Alert variant="error">{error}</Alert> : null}

        {/* ---- the finished stand ---- */}
        {batchOnly ? null : (
        <section aria-labelledby={`${uid}-dl`} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:p-4">
          <h4 id={`${uid}-dl`} className="text-sm font-semibold text-foreground">
            {t('stand.download.title')}
          </h4>
          <p className="text-xs text-muted-foreground">{t('stand.download.hint')}</p>
          <div className="flex flex-wrap gap-2 max-[420px]:flex-col">
            <Button disabled={isBusy} onClick={() => void downloadPng()} className="min-w-0 flex-1">
              {label('stand.download.png', 'png')}
            </Button>
            <Button disabled={isBusy} onClick={() => void downloadPdf()} className="min-w-0 flex-1">
              {label('stand.download.pdf', 'pdf')}
            </Button>
            <Button variant="secondary" disabled={isBusy} onClick={() => void print()} className="min-w-0 flex-1">
              {label('stand.download.print', 'print')}
            </Button>
          </div>
        </section>
        )}

        {/* ---- the QR alone ---- */}
        {batchOnly ? null : (
        <section aria-labelledby={`${uid}-qr`} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:p-4">
          <h4 id={`${uid}-qr`} className="text-sm font-semibold text-foreground">
            {t('stand.qr.title')}
          </h4>
          <p className="text-xs text-muted-foreground">{t('stand.qr.hint')}</p>
          <div className="flex flex-wrap gap-2 max-[420px]:flex-col">
            <Button variant="secondary" disabled={isBusy} onClick={() => void downloadQrPng()} className="min-w-0 flex-1">
              {label('stand.qr.png', 'qrPng')}
            </Button>
            <Button variant="secondary" disabled={isBusy} onClick={() => void downloadQrSvg()} className="min-w-0 flex-1">
              {label('stand.qr.svg', 'qrSvg')}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(event) => setTransparent(event.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            {t('stand.qr.transparent')}
          </label>
        </section>
        )}

        {/* ---- every table ---- */}
        {tables ? (
          <section aria-labelledby={`${uid}-all`} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:p-4">
            <h4 id={`${uid}-all`} className="text-sm font-semibold text-foreground">
              {t('stand.all.title')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {tables.length > 0 ? t('stand.all.hint') : t('stand.all.none')}
            </p>
            <div className="flex flex-wrap gap-2 max-[420px]:flex-col">
              <Button disabled={isBusy || tables.length === 0} onClick={() => void downloadAll()} className="min-w-0 flex-1">
                {busy === 'allPdf' ? t('stand.download.preparing') : t('stand.all.pdf')}
              </Button>
              <Button
                variant="secondary"
                disabled={isBusy || tables.length === 0}
                onClick={() => void printAll()}
                className="min-w-0 flex-1"
              >
                {busy === 'allPrint' ? t('stand.download.preparing') : t('stand.all.print')}
              </Button>
            </div>
            <p role="status" aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
              {progress}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
