'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as branchesApi from '../../../../../../lib/branches/api';
import type { BranchItem } from '../../../../../../lib/branches/types';
import { validationFieldCode } from '../../../../../../lib/api/errors';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Dialog } from '../../../../../../components/ui/Dialog';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';

export interface BranchFormDialogProps {
  restaurantId: string;
  /** `'create'` for a new Branch, the Branch itself to edit, or `null` when the dialog is closed. */
  target: 'create' | BranchItem | null;
  /** The browser's own IANA zone, offered as the default for a new Branch. */
  defaultTimezone: string;
  onClose: () => void;
  onSaved: (branch: BranchItem, mode: 'create' | 'edit') => void;
}

export function BranchFormDialog(props: BranchFormDialogProps) {
  const { target, ...rest } = props;
  if (!target) return null;
  return <BranchForm key={target === 'create' ? 'create' : target.id} target={target} {...rest} />;
}

function BranchForm({
  restaurantId,
  target,
  defaultTimezone,
  onClose,
  onSaved,
}: Omit<BranchFormDialogProps, 'target'> & { target: 'create' | BranchItem }) {
  const { t } = useStaffI18n();
  const nameRef = useRef<HTMLInputElement>(null);
  const isCreate = target === 'create';
  const [name, setName] = useState(isCreate ? '' : target.name);
  const [timezone, setTimezone] = useState(isCreate ? defaultTimezone : target.timezone);
  const [phone, setPhone] = useState(isCreate ? '' : (target.phone ?? ''));
  const [address, setAddress] = useState(isCreate ? '' : (target.address ?? ''));
  const [nameError, setNameError] = useState<string | null>(null);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const values = {
      name: name.trim(),
      timezone: timezone.trim(),
      phone: phone.trim(),
      address: address.trim(),
    };
    const nextNameError = values.name ? null : t('branches.form.error.nameRequired');
    const nextTimezoneError = values.timezone ? null : t('branches.form.error.timezoneRequired');
    setNameError(nextNameError);
    setTimezoneError(nextTimezoneError);
    setFormError(null);
    if (nextNameError || nextTimezoneError) return;

    setIsSubmitting(true);
    try {
      const saved = isCreate
        ? await branchesApi.createBranch(restaurantId, values)
        : await branchesApi.updateBranch(restaurantId, target.id, values);
      onSaved(saved, isCreate ? 'create' : 'edit');
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      if (validationFieldCode(error, 'timezone') === 'INVALID_TIMEZONE') {
        setTimezoneError(t('branches.form.error.timezoneInvalid'));
      } else {
        setFormError(describeError(error));
      }
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      title={isCreate ? t('branches.form.createTitle') : t('branches.form.editTitle')}
      subtitle={isCreate ? undefined : target.name}
      isSubmitting={isSubmitting}
      submitLabel={
        isSubmitting
          ? t('common.saving')
          : isCreate
            ? t('branches.form.createSubmit')
            : t('branches.form.editSubmit')
      }
      onSubmit={handleSubmit}
      onClose={onClose}
      initialFocusRef={nameRef}
    >
      <div className="flex flex-col gap-5">
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        {isCreate ? <Alert variant="info">{t('branches.form.createNote')}</Alert> : null}

        <FormField label={t('branches.form.name')} htmlFor="branch-name" error={nameError ?? undefined}>
          <Input
            ref={nameRef}
            id="branch-name"
            dir="auto"
            value={name}
            disabled={isSubmitting}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>

        <FormField label={t('branches.form.timezone')} htmlFor="branch-timezone" error={timezoneError ?? undefined}>
          <Input
            id="branch-timezone"
            dir="ltr"
            value={timezone}
            disabled={isSubmitting}
            onChange={(event) => setTimezone(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('branches.form.timezoneHint')}</p>
        </FormField>

        <FormField label={`${t('branches.form.phone')} (${t('common.optional')})`} htmlFor="branch-phone">
          <Input
            id="branch-phone"
            type="tel"
            dir="ltr"
            value={phone}
            disabled={isSubmitting}
            onChange={(event) => setPhone(event.target.value)}
          />
        </FormField>

        <FormField label={`${t('branches.form.address')} (${t('common.optional')})`} htmlFor="branch-address">
          <Input
            id="branch-address"
            dir="auto"
            value={address}
            disabled={isSubmitting}
            onChange={(event) => setAddress(event.target.value)}
          />
        </FormField>
      </div>
    </Dialog>
  );
}
