'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import { startFreshMenu } from '../../../../../lib/menu/api';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { Dialog } from '../../../../../components/ui/Dialog';

interface StartFreshMenuActionProps {
  restaurantId: string;
  primaryMenuId: string;
  primaryMenuName: string;
  onCompleted: (newPrimaryMenuId: string) => void;
}

/**
 * This is NOT hard-delete. Archival keeps order/variant history and old media
 * intact, and creates a blank primary menu in one Backend transaction.
 */
export function StartFreshMenuAction({
  restaurantId,
  primaryMenuId,
  primaryMenuName,
  onCompleted,
}: StartFreshMenuActionProps) {
  const { t } = useStaffI18n();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setAcknowledged(false);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!acknowledged) {
      setError(t('menu.fresh.confirmRequired'));
      checkboxRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await startFreshMenu(restaurantId, primaryMenuId);
      setOpen(false);
      setAcknowledged(false);
      if (!result.changed) setNotice(t('menu.fresh.alreadyEmpty'));
      onCompleted(result.menuId);
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setError(describeError(caught) || t('menu.fresh.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-start gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setError(null);
            setNotice(null);
            setOpen(true);
          }}
        >
          {t('menu.fresh.action')}
        </Button>
        {notice ? <Alert variant="info">{notice}</Alert> : null}
      </div>
      <Dialog
        open={open}
        title={t('menu.fresh.title')}
        subtitle={primaryMenuName}
        submitLabel={busy ? t('menu.fresh.processing') : t('menu.fresh.submit')}
        submitVariant="danger"
        isSubmitting={busy}
        onSubmit={(event) => void submit(event)}
        onClose={close}
        initialFocusRef={checkboxRef}
      >
        <div className="space-y-4">
          <p className="text-sm leading-7 text-foreground">{t('menu.fresh.description')}</p>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm text-foreground">
            <input
              ref={checkboxRef}
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => {
                setAcknowledged(e.target.checked);
                setError(null);
              }}
              disabled={busy}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span>{t('menu.fresh.confirm')}</span>
          </label>
          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
      </Dialog>
    </>
  );
}
