'use client';

import type { FormEvent, ReactNode } from 'react';
import { Alert } from './Alert';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What is about to happen and, where relevant, what it does not affect. */
  description: ReactNode;
  confirmLabel: string;
  /** `danger` (default) for destructive / access-removing actions. */
  tone?: 'danger' | 'primary';
  isSubmitting: boolean;
  /** A domain error from the last attempt (e.g. last-Owner protection), shown inside the dialog. */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The one confirmation step for destructive or access-changing actions
 * (revoke an invitation, disable a Staff member, deactivate a Branch). Built
 * on the shared `Dialog` so it keeps the same focus trap, Escape / backdrop
 * handling and mobile full-screen behavior -- it only adds a message body and
 * a danger-toned confirm button.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  isSubmitting,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    onConfirm();
  }

  return (
    <Dialog
      open={open}
      title={title}
      isSubmitting={isSubmitting}
      submitLabel={confirmLabel}
      submitVariant={tone}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <div className="text-sm leading-relaxed text-secondary-foreground">{description}</div>
      </div>
    </Dialog>
  );
}
