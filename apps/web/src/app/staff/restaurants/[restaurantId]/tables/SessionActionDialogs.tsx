'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '../../../../../components/ui/Alert';
import { ConfirmDialog } from '../../../../../components/ui/ConfirmDialog';
import { Dialog } from '../../../../../components/ui/Dialog';
import { useStaffI18n } from '../../../../../lib/i18n/client';

/** Manual session opening: a plain confirmation (no destructive effect, but it changes guest ordering). */
export function OpenSessionDialog({
  tableNumber,
  isSubmitting,
  error,
  onConfirm,
  onClose,
}: {
  tableNumber: string;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  return (
    <ConfirmDialog
      open
      tone="primary"
      title={t('sessions.open.title', { number: tableNumber })}
      description={t('sessions.open.description')}
      confirmLabel={isSubmitting ? t('sessions.open.opening') : t('sessions.open.confirm')}
      isSubmitting={isSubmitting}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

/**
 * Closing only stops further Table QR ordering until a new session is opened.
 * When PENDING orders exist the staff member MUST choose KEEP or REJECT (no
 * default), exactly like the Backend requires (decision P3). REJECT is only
 * offered to users who may reject orders.
 */
export function CloseSessionDialog({
  pendingCount,
  canRejectOrders,
  isSubmitting,
  error,
  onConfirm,
  onClose,
}: {
  pendingCount: number;
  canRejectOrders: boolean;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: (policy: 'KEEP' | 'REJECT' | undefined) => void;
  onClose: () => void;
}) {
  const { t, tp } = useStaffI18n();
  const [policy, setPolicy] = useState<'KEEP' | 'REJECT' | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (pendingCount > 0 && policy === null) {
      setChoiceError(t('sessions.close.choiceRequired'));
      return;
    }
    onConfirm(pendingCount > 0 ? (policy ?? undefined) : undefined);
  }

  const options: { value: 'KEEP' | 'REJECT'; label: string; hint: string; disabled: boolean }[] = [
    {
      value: 'KEEP',
      label: t('sessions.close.keep'),
      hint: t('sessions.close.keepHint'),
      disabled: false,
    },
    {
      value: 'REJECT',
      label: t('sessions.close.reject'),
      hint: canRejectOrders ? t('sessions.close.rejectHint') : t('sessions.close.rejectNeedsPermission'),
      disabled: !canRejectOrders,
    },
  ];

  return (
    <Dialog
      open
      title={t('sessions.close.title')}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? t('sessions.close.closing') : t('sessions.close.confirm')}
      submitVariant="danger"
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <p className="text-sm text-muted-foreground">{t('sessions.close.description')}</p>

        {pendingCount > 0 ? (
          <fieldset className="flex flex-col gap-2" disabled={isSubmitting}>
            <legend className="text-sm font-semibold text-foreground">
              {tp('sessions.close.pending', pendingCount)}
            </legend>
            <p className="text-sm text-muted-foreground">{t('sessions.close.pendingPrompt')}</p>
            {options.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 rounded-lg border p-3 text-start ${
                  policy === option.value
                    ? 'border-primary bg-accent'
                    : 'border-border bg-card'
                } ${option.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <input
                  type="radio"
                  name="pending-policy"
                  value={option.value}
                  checked={policy === option.value}
                  disabled={option.disabled}
                  onChange={() => {
                    setPolicy(option.value);
                    setChoiceError(null);
                  }}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
            {choiceError ? (
              <p role="alert" className="text-sm text-destructive">
                {choiceError}
              </p>
            ) : null}
          </fieldset>
        ) : null}
      </div>
    </Dialog>
  );
}
