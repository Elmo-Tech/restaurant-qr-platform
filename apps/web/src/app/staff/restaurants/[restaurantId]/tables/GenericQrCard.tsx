'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import * as qrApi from '../../../../../lib/qr/api';
import type { GenericQr } from '../../../../../lib/qr/api';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Badge } from '../../../../../components/ui/Badge';
import { Button } from '../../../../../components/ui/Button';
import { Card } from '../../../../../components/ui/Card';
import { IconQr } from '../../../../../components/staff/icons';
import { QrPreviewDialog } from './QrPreviewDialog';

/**
 * FT-9: the Restaurant-wide "Restaurant QR" -- the public entry point for
 * Pickup and Delivery (a Table QR is only for Dine-in). One per Restaurant:
 * create it if none exists, then Open / Download / Print it (reusing the
 * Table QR panel), or deactivate/reactivate it. It always opens the
 * Restaurant's CURRENT primary active Menu -- there are no per-menu URLs.
 * Deactivating makes the printed code stop working for guests until it is
 * reactivated; it is never deleted or rotated here.
 */
export function GenericQrCard({
  restaurantId,
  restaurantName,
  canManage,
  webOrigin,
}: {
  restaurantId: string;
  restaurantName: string;
  canManage: boolean;
  webOrigin: string;
}) {
  const { t } = useStaffI18n();
  const [qr, setQr] = useState<GenericQr | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <IconQr className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">{t('tables.generic.title')}</h2>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              {t('tables.generic.description')}
            </p>
          </div>
        </div>
        {qr ? (
          <Badge variant={isActive ? 'success' : 'neutral'}>
            {isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ) : null}
      </div>

      {error ? (
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void load()}>
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
            disabled={!canManage || isBusy}
            onClick={() => void run(() => qrApi.createGenericQr(restaurantId))}
          >
            {isBusy ? t('tables.generic.creating') : t('tables.generic.create')}
          </Button>
          {!canManage ? (
            <p className="text-xs text-muted-foreground">{t('tables.generic.ownerOnly')}</p>
          ) : null}
        </div>
      ) : null}

      {qr && guestUrl ? (
        <>
          {!isActive ? (
            <Alert variant="info">{t('tables.generic.inactiveNotice')}</Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setShowPreview(true)}>{t('tables.generic.viewPrint')}</Button>
            {isActive ? (
              <Button variant="secondary" asChild>
                <a href={guestUrl} target="_blank" rel="noopener noreferrer">
                  {t('tables.generic.openGuestMenu')}
                </a>
              </Button>
            ) : null}
            <Button
              variant="secondary"
              disabled={!canManage || isBusy}
              onClick={() => {
                if (
                  isActive &&
                  !window.confirm(t('tables.generic.confirmDeactivate'))
                ) {
                  return;
                }
                void run(() => qrApi.setGenericQrStatus(restaurantId, isActive ? 'INACTIVE' : 'ACTIVE'));
              }}
            >
              {isActive ? t('common.deactivate') : t('common.activate')}
            </Button>
          </div>
        </>
      ) : null}

      {showPreview && qr && guestUrl ? (
        <QrPreviewDialog
          target={{
            restaurantName,
            branchName: null,
            tableNumber: null,
            publicCode: qr.publicCode,
          }}
          guestUrl={guestUrl}
          onClose={() => setShowPreview(false)}
        />
      ) : null}
    </Card>
  );
}
