'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as qrApi from '../../../../../../lib/qr/api';
import type { GenericQr } from '../../../../../../lib/qr/api';
import * as settingsApi from '../../../../../../lib/settings/api';
import { resolveAssetUrl } from '../../../../../../lib/media/asset-url';
import {
  colorIssue,
  DEFAULT_QR_STYLE,
  HEX_COLOR_PATTERN,
  QR_PRESETS,
  sameStyle,
  type QrStyle,
} from '../../../../../../lib/qr/style';
import { useQrImage } from '../../../../../../lib/qr/use-qr-image';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Badge } from '../../../../../../components/ui/Badge';
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { Switch } from '../../../../../../components/ui/Switch';
import { IconQr } from '../../../../../../components/staff/icons';

function sanitizeFilenameSegment(value: string): string {
  const cleaned = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'restaurant';
}

/**
 * The Restaurant QR, designed in one place: a live preview of exactly what will
 * be downloaded or printed, and the controls that shape it (color theme, QR and
 * background colors, the restaurant logo in the center, the restaurant name).
 * The appearance is saved for the whole Restaurant and also dresses the table
 * QR panels. Every choice is checked for scannability before it can be saved:
 * the preview, the download and the print are one and the same picture.
 *
 * Create / deactivate / reactivate behave exactly as before; deactivating now
 * confirms inline (no browser dialog).
 */
export function RestaurantQrPanel({
  restaurantId,
  restaurantName,
  logoAssetPath,
  canManageQr,
  canStyle,
  initialStyle,
  webOrigin,
}: {
  restaurantId: string;
  restaurantName: string;
  logoAssetPath: string | null;
  /** `tables.manage` AND full Restaurant branch scope: create / activate / deactivate. */
  canManageQr: boolean;
  /** `restaurant.manage` AND full Restaurant branch scope: change the appearance. */
  canStyle: boolean;
  initialStyle: QrStyle;
  webOrigin: string;
}) {
  const { t } = useStaffI18n();
  const [qr, setQr] = useState<GenericQr | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

  const [saved, setSaved] = useState<QrStyle>(initialStyle);
  const [draft, setDraft] = useState<QrStyle>(initialStyle);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'preview' | 'appearance'>('preview');

  const load = useCallback(async () => {
    setError(null);
    try {
      setQr(await qrApi.getGenericQr(restaurantId));
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
    }
  }, [restaurantId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function run(action: () => Promise<GenericQr>) {
    setIsBusy(true);
    setError(null);
    try {
      setQr(await action());
      setConfirmingDeactivate(false);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setError(describeError(err));
    } finally {
      setIsBusy(false);
    }
  }

  const guestUrl = qr ? `${webOrigin}/q/${qr.publicCode}` : null;
  const isActive = qr?.status === 'ACTIVE';
  const logoUrl = resolveAssetUrl(logoAssetPath);
  const issue = colorIssue(draft.foregroundColor, draft.backgroundColor);
  const dirty = !sameStyle(draft, saved);

  const image = useQrImage(
    guestUrl
      ? {
          url: guestUrl,
          foregroundColor: draft.foregroundColor,
          backgroundColor: draft.backgroundColor,
          logoUrl: draft.showLogo ? logoUrl : null,
          title: draft.showName ? restaurantName : null,
          subtitle: t('tables.qr.scan'),
        }
      : null,
  );

  function patch(change: Partial<QrStyle>) {
    setDraft((current) => ({ ...current, ...change }));
    setJustSaved(false);
    setSaveError(null);
  }

  async function save() {
    if (issue || isSaving || !dirty) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const stored = await settingsApi.updateQrStyle(restaurantId, draft);
      setSaved(stored);
      setDraft(stored);
      setJustSaved(true);
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        redirectToLogin();
        return;
      }
      setSaveError(describeError(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function copyLink() {
    if (!guestUrl) return;
    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the link is shown in full anyway */
    }
  }

  const filename = `${sanitizeFilenameSegment(restaurantName)}-restaurant-qr.png`;

  return (
    <Card className="min-w-0 max-w-full overflow-hidden p-0">
      {/* header */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <IconQr className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                {t('tables.generic.title')}
              </h2>
              {qr ? (
                <Badge variant={isActive ? 'success' : 'neutral'} dot>
                  {isActive ? t('common.active') : t('common.inactive')}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {t('tables.generic.description')}
            </p>
          </div>
        </div>

        {qr && canManageQr ? (
          confirmingDeactivate ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t('settings.qr.deactivateWarning')}
              </span>
              <Button
                variant="danger"
                size="sm"
                disabled={isBusy}
                onClick={() => void run(() => qrApi.setGenericQrStatus(restaurantId, 'INACTIVE'))}
              >
                {t('settings.qr.deactivateConfirm')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDeactivate(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                if (isActive) {
                  setConfirmingDeactivate(true);
                } else {
                  void run(() => qrApi.setGenericQrStatus(restaurantId, 'ACTIVE'));
                }
              }}
            >
              {isActive ? t('common.deactivate') : t('common.activate')}
            </Button>
          )
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-4 p-3 sm:p-5">
        {error ? (
          <Alert variant="error">
            <div className="flex items-center justify-between gap-4">
              <span>{error}</span>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {t('common.retry')}
              </Button>
            </div>
          </Alert>
        ) : null}

        {qr === undefined && !error ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : null}

        {qr === null ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">{t('tables.generic.none')}</p>
            <Button
              disabled={!canManageQr || isBusy}
              onClick={() => void run(() => qrApi.createGenericQr(restaurantId))}
            >
              {isBusy ? t('tables.generic.creating') : t('tables.generic.create')}
            </Button>
            {!canManageQr ? (
              <p className="text-xs text-muted-foreground">{t('tables.generic.ownerOnly')}</p>
            ) : null}
          </div>
        ) : null}

        {qr && guestUrl ? (
          <>
            {!isActive ? <Alert variant="info">{t('tables.generic.inactiveNotice')}</Alert> : null}

            <div className="min-w-0">
              <div role="tablist" aria-label={t('settings.qr.mobile.nav')} className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1 sm:hidden">
                {(['preview','appearance'] as const).map(panel=>(
                  <button key={panel} type="button" role="tab" aria-selected={mobilePanel===panel}
                    aria-controls={panel==='preview'?'restaurant-qr-preview':'restaurant-qr-appearance'}
                    onClick={()=>setMobilePanel(panel)}
                    className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      mobilePanel===panel?'bg-card text-foreground shadow-sm':'text-muted-foreground'
                    }`}>
                    {t(panel==='preview'?'settings.qr.mobile.preview':'settings.qr.mobile.appearance')}
                  </button>
                ))}
              </div>
              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-6">
              {/* ---- preview: exactly what is downloaded and printed ---- */}
              <div id="restaurant-qr-preview" role="tabpanel" className={`min-w-0 flex-col gap-3 ${mobilePanel==='preview'?'flex':'hidden sm:flex'}`}>
                <div
                  className={`flex min-w-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/50 p-2 sm:p-4 ${
                    isActive ? '' : 'opacity-60'
                  }`}
                >
                  {image.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a client-generated data: URL.
                    <img
                      src={image.dataUrl}
                      alt={t('tables.qr.alt.restaurant')}
                      className="block h-auto min-w-0 w-full max-w-[300px] rounded-lg object-contain shadow-sm"
                    />
                  ) : image.failed ? (
                    <p className="py-16 text-center text-xs text-destructive">
                      {t('tables.qr.generateError')}
                    </p>
                  ) : (
                    <div className="flex aspect-square w-full max-w-[300px] items-center justify-center text-xs text-muted-foreground">
                      {t('tables.qr.generating')}
                    </div>
                  )}
                </div>

                {image.logoFailed ? (
                  <p className="text-xs text-warning">{t('settings.qr.logoFailed')}</p>
                ) : null}

                <div className="flex min-w-0 flex-wrap gap-2 max-[390px]:flex-col">
                  <Button asChild disabled={!image.dataUrl} className="min-w-0 flex-1">
                    <a href={image.dataUrl ?? undefined} download={filename}>
                      {t('settings.qr.download')}
                    </a>
                  </Button>
                  <Button
                    variant="secondary"
                    className="min-w-0 flex-1"
                    disabled={!image.dataUrl}
                    onClick={() => window.print()}
                  >
                    {t('tables.qr.print')}
                  </Button>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md bg-muted px-2 py-2 sm:px-3">
                  <p dir="ltr" className="min-w-0 basis-full flex-1 truncate text-start text-xs text-muted-foreground sm:basis-auto">
                    {guestUrl}
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => void copyLink()}>
                    {copied ? t('settings.qr.copied') : t('settings.qr.copyLink')}
                  </Button>
                </div>
                {isActive ? (
                  <Button variant="secondary" asChild>
                    <a href={guestUrl} target="_blank" rel="noopener noreferrer">
                      {t('tables.generic.openGuestMenu')}
                    </a>
                  </Button>
                ) : null}
              </div>

              {/* ---- appearance ---- */}
              <div id="restaurant-qr-appearance" role="tabpanel" className={`min-w-0 flex-col gap-5 ${mobilePanel==='appearance' ? 'flex' : 'hidden sm:flex'}`}>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {t('settings.qr.appearance')}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('settings.qr.appearanceHint')}
                  </p>
                </div>

                <fieldset disabled={!canStyle} className="flex flex-col gap-5 disabled:opacity-70">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {t('settings.qr.presets')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {QR_PRESETS.map((preset) => {
                        const selected =
                          draft.foregroundColor.toUpperCase() === preset.foregroundColor &&
                          draft.backgroundColor.toUpperCase() === preset.backgroundColor;
                        return (
                          <button
                            key={preset.key}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              patch({
                                foregroundColor: preset.foregroundColor,
                                backgroundColor: preset.backgroundColor,
                              })
                            }
                            className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                              selected
                                ? 'border-primary bg-accent text-accent-foreground'
                                : 'border-border bg-card text-foreground hover:bg-muted'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="flex h-6 w-6 items-center justify-center rounded border border-border"
                              style={{ backgroundColor: preset.backgroundColor }}
                            >
                              <span
                                className="h-3 w-3 rounded-sm"
                                style={{ backgroundColor: preset.foregroundColor }}
                              />
                            </span>
                            {t(`settings.qr.preset.${preset.key}` as const)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                    <ColorField
                      label={t('settings.qr.foreground')}
                      value={draft.foregroundColor}
                      onChange={(value) => patch({ foregroundColor: value })}
                    />
                    <ColorField
                      label={t('settings.qr.background')}
                      value={draft.backgroundColor}
                      onChange={(value) => patch({ backgroundColor: value })}
                    />
                  </div>

                  {issue ? (
                    <Alert variant="error">
                      {issue === 'inverted'
                        ? t('settings.qr.contrast.inverted')
                        : t('settings.qr.contrast.low')}
                    </Alert>
                  ) : (
                    <p className="text-xs font-medium text-success">{t('settings.qr.contrast.good')}</p>
                  )}

                  <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                    <label className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {t('settings.qr.showLogo')}
                        </p>
                        {!logoUrl ? (
                          <p className="text-xs text-muted-foreground">
                            {t('settings.qr.showLogoNoLogo')}
                          </p>
                        ) : null}
                      </div>
                      <Switch
                        checked={draft.showLogo && logoUrl !== null}
                        label={t('settings.qr.showLogo')}
                        disabled={!canStyle || logoUrl === null}
                        onCheckedChange={(next) => patch({ showLogo: next })}
                      />
                    </label>
                    <label className="flex items-center gap-3 px-4 py-3">
                      <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
                        {t('settings.qr.showName')}
                      </p>
                      <Switch
                        checked={draft.showName}
                        label={t('settings.qr.showName')}
                        disabled={!canStyle}
                        onCheckedChange={(next) => patch({ showName: next })}
                      />
                    </label>
                  </div>
                </fieldset>

                {saveError ? <Alert variant="error">{saveError}</Alert> : null}

                {canStyle ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button disabled={!dirty || issue !== null || isSaving} onClick={() => void save()}>
                      {isSaving ? t('settings.qr.saving') : t('settings.qr.save')}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={isSaving || sameStyle(draft, DEFAULT_QR_STYLE)}
                      onClick={() => patch({ ...DEFAULT_QR_STYLE })}
                    >
                      {t('settings.qr.reset')}
                    </Button>
                    {dirty ? (
                      <span className="text-xs font-medium text-warning">
                        {t('settings.qr.unsaved')}
                      </span>
                    ) : justSaved ? (
                      <span className="text-xs font-medium text-success">{t('settings.qr.saved')}</span>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('settings.qr.viewOnly')}</p>
                )}

                <p className="text-xs text-muted-foreground">{t('settings.qr.testHint')}</p>
              </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Print: the page is reduced to the styled QR image alone. */}
      {image.dataUrl ? (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #qr-print-section, #qr-print-section * { visibility: visible; }
            }
          `}</style>
          <div
            id="qr-print-section"
            className="hidden print:fixed print:inset-0 print:z-[100] print:flex print:items-center print:justify-center print:bg-white"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a client-generated data: URL. */}
            <img
              src={image.dataUrl}
              alt={t('tables.qr.alt.restaurant')}
              className="max-h-[85vh] max-w-[85vw]"
            />
          </div>
        </>
      ) : null}
    </Card>
  );
}

/** A color picker plus its hex value; only a well-formed #RRGGBB is applied. */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  // keep the text box in step when the value changes from a preset or reset
  useEffect(() => {
    queueMicrotask(() => setText(value));
  }, [value]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={value.toLowerCase()}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-10 w-12 flex-shrink-0 cursor-pointer rounded-md border border-border bg-card p-1"
        />
        <input
          type="text"
          dir="ltr"
          aria-label={`${label} (hex)`}
          value={text}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value.trim();
            setText(next);
            if (HEX_COLOR_PATTERN.test(next)) onChange(next.toUpperCase());
          }}
          className="h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm uppercase text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </div>
    </div>
  );
}
