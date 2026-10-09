'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Alert } from '../../../../../components/ui/Alert';
import { ConfirmDialog } from '../../../../../components/ui/ConfirmDialog';
import { Dialog } from '../../../../../components/ui/Dialog';
import { FormField } from '../../../../../components/ui/FormField';
import { Input } from '../../../../../components/ui/Input';
import { Textarea } from '../../../../../components/ui/Textarea';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { PaymentMethod } from '../../../../../lib/table-sessions/types';
import { Money } from './SessionBadges';

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
 * Closing: never touches payment. When PENDING orders exist the staff member
 * MUST choose KEEP or REJECT (no default), exactly like the Backend requires
 * (decision P3). REJECT is only offered to users who may reject orders.
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

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'OTHER'];

/**
 * Full-balance settlement of a CLOSED session. The amount shown is the
 * Backend's own balance; the same string is sent back as `expectedAmount` so
 * the Backend can reject the call if the balance changed in the meantime. The
 * request id is created once per dialog, so a double click or a retry records
 * the payment once.
 */
export function RecordPaymentDialog({
  balance,
  currency,
  isSubmitting,
  error,
  onConfirm,
  onClose,
}: {
  balance: string;
  currency: string;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: (input: {
    clientRequestId: string;
    method: PaymentMethod;
    expectedAmount: string;
    note: string;
  }) => void;
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const requestIdRef = useRef<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (requestIdRef.current === null) {
      requestIdRef.current = crypto.randomUUID();
    }
    onConfirm({
      clientRequestId: requestIdRef.current,
      method,
      expectedAmount: balance,
      note: note.trim(),
    });
  }

  return (
    <Dialog
      open
      title={t('sessions.pay.title')}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? t('sessions.pay.recording') : t('sessions.pay.confirm')}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <p className="text-sm text-muted-foreground">{t('sessions.pay.description')}</p>

        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs font-medium text-muted-foreground">{t('sessions.pay.amount')}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            <Money amount={balance} currency={currency} />
          </p>
        </div>

        <fieldset className="flex flex-col gap-2" disabled={isSubmitting}>
          <legend className="text-sm font-medium text-foreground">{t('sessions.pay.method')}</legend>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((option) => (
              <label
                key={option}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                  method === option ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-card'
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={option}
                  checked={method === option}
                  onChange={() => setMethod(option)}
                  className="h-4 w-4"
                />
                {t(`sessions.payments.method.${option}` as const)}
              </label>
            ))}
          </div>
        </fieldset>

        <FormField label={t('sessions.pay.note')} htmlFor="payment-note">
          <Input
            id="payment-note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('sessions.pay.notePlaceholder')}
            disabled={isSubmitting}
            dir="auto"
          />
        </FormField>
      </div>
    </Dialog>
  );
}

/** Voiding a payment record: an audited accounting correction, never a refund. A reason is mandatory. */
export function VoidPaymentDialog({
  amount,
  currency,
  isSubmitting,
  error,
  onConfirm,
  onClose,
}: {
  amount: string;
  currency: string;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useStaffI18n();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const trimmed = reason.trim();
    if (trimmed === '') {
      setReasonError(t('sessions.void.reasonRequired'));
      document.getElementById('void-reason')?.focus();
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <Dialog
      open
      title={t('sessions.void.title')}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? t('sessions.void.voiding') : t('sessions.void.confirm')}
      submitVariant="danger"
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <p className="text-sm text-muted-foreground">{t('sessions.void.description')}</p>
        <p className="text-sm font-semibold text-foreground">
          <Money amount={amount} currency={currency} />
        </p>
        <FormField label={t('sessions.void.reason')} htmlFor="void-reason" error={reasonError ?? undefined}>
          <Textarea
            id="void-reason"
            required
            value={reason}
            maxLength={500}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(null);
            }}
            placeholder={t('sessions.void.reasonPlaceholder')}
            disabled={isSubmitting}
            dir="auto"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
