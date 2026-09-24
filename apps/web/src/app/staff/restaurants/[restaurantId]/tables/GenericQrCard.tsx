'use client';

import { useCallback, useEffect, useState } from 'react';
import * as qrApi from '../../../../../lib/qr/api';
import type { GenericQr } from '../../../../../lib/qr/api';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
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
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#7A5138]/10 text-[#7A5138]">
            <IconQr className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#1D1A18]">Restaurant QR</h2>
            <p className="mt-0.5 max-w-xl text-sm text-[#655D56]">
              For Pickup and Delivery: one QR for the whole restaurant, opening your current menu.
              Table QRs below are for Dine-in.
            </p>
          </div>
        </div>
        {qr ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              isActive ? 'bg-[#DDF1DF] text-[#1E6B25]' : 'bg-[#F1EDE7] text-[#655D56]'
            }`}
          >
            {isActive ? 'Active' : 'Inactive'}
          </span>
        ) : null}
      </div>

      {error ? (
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {qr === undefined && !error ? (
        <p className="text-sm text-[#655D56]">Loading…</p>
      ) : null}

      {qr === null ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[#655D56]">
            This restaurant doesn&apos;t have a Restaurant QR yet.
          </p>
          <Button
            disabled={!canManage || isBusy}
            onClick={() => void run(() => qrApi.createGenericQr(restaurantId))}
          >
            {isBusy ? 'Creating…' : 'Create Restaurant QR'}
          </Button>
          {!canManage ? (
            <p className="text-xs text-[#8A8177]">
              An Owner with full restaurant access can create it.
            </p>
          ) : null}
        </div>
      ) : null}

      {qr && guestUrl ? (
        <>
          {!isActive ? (
            <Alert variant="info">
              This QR is inactive: scanning a printed copy currently shows &quot;QR code is no
              longer active&quot;. Reactivate it to accept Pickup and Delivery orders again.
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setShowPreview(true)}>View, download &amp; print</Button>
            {isActive ? (
              <a
                href={guestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-[#E5DED6] bg-white px-4 py-2 text-sm font-medium text-[#302C29] transition-colors hover:bg-[#F8F5F1]"
              >
                Open Guest Menu
              </a>
            ) : null}
            <Button
              variant="secondary"
              disabled={!canManage || isBusy}
              onClick={() => {
                if (
                  isActive &&
                  !window.confirm(
                    'Deactivate the Restaurant QR? Printed copies will stop working for guests until you reactivate it.',
                  )
                ) {
                  return;
                }
                void run(() => qrApi.setGenericQrStatus(restaurantId, isActive ? 'INACTIVE' : 'ACTIVE'));
              }}
            >
              {isActive ? 'Deactivate' : 'Activate'}
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
