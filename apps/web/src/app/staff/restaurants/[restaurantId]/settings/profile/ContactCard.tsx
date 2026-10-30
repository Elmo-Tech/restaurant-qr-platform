'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../../lib/i18n/messages';
import * as settingsApi from '../../../../../../lib/settings/api';
import {
  CONTACT_FIELDS,
  type ContactField,
  type RestaurantContact,
} from '../../../../../../lib/contact/types';
import { ApiError } from '../../../../../../lib/api/errors';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';
import { SectionCard } from '../../../../../../components/ui/SectionCard';
import { StaffFeedbackToast, type StaffFeedbackVariant } from '../../../../../../components/staff/StaffFeedbackToast';
import { focusInvalidFormField } from '../../../../../../lib/staff/focus-invalid-field';
import { InternationalPhoneField } from '../../../../../../components/staff/InternationalPhoneField';
import {
  normalizePhoneDraft,
  phoneDraftFromStored,
  type InternationalPhoneDraft,
} from '../../../../../../lib/contact/international-phone';

const PHONE_FIELDS: readonly ContactField[] = ['phone', 'whatsapp', 'hotline'];
type InternationalContactField = 'phone' | 'whatsapp';
const INTERNATIONAL_CONTACT_FIELDS: readonly InternationalContactField[] = ['phone', 'whatsapp'];

function phoneDraftsFromContact(
  contact: Record<ContactField, string>,
): Record<InternationalContactField, InternationalPhoneDraft> {
  return {
    phone: phoneDraftFromStored(contact.phone),
    whatsapp: phoneDraftFromStored(contact.whatsapp),
  };
}

const toDraft = (contact: RestaurantContact): Record<ContactField, string> =>
  Object.fromEntries(CONTACT_FIELDS.map((field) => [field, contact[field] ?? ''])) as Record<
    ContactField,
    string
  >;

/** Restaurant Settings -> Profile: the phone, WhatsApp number and social links shown on the Guest Menu. Empty fields are simply not shown. */
export function ContactCard({
  restaurantId,
  initialContact,
  canManage,
}: {
  restaurantId: string;
  initialContact: RestaurantContact;
  canManage: boolean;
}) {
  const { t } = useStaffI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const [feedback, setFeedback] = useState<{ variant: StaffFeedbackVariant; message: string } | null>(null);
  const [saved, setSaved] = useState<Record<ContactField, string>>(() => toDraft(initialContact));
  const [draft, setDraft] = useState<Record<ContactField, string>>(() => toDraft(initialContact));
  const [phoneDrafts, setPhoneDrafts] = useState(() => phoneDraftsFromContact(toDraft(initialContact)));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const dirty = CONTACT_FIELDS.some((field) => {
    if (field === 'phone' || field === 'whatsapp') {
      const phone = phoneDrafts[field];
      if (!phone.edited) return false;
      const checked = normalizePhoneDraft(phone);
      return !checked.valid || (checked.value ?? '') !== saved[field];
    }
    return draft[field].trim() !== saved[field];
  });

  // Inputs are disabled while Saving. Wait until React has rendered the
  // re-enabled control after the API error before moving keyboard focus.
  useEffect(() => {
    if (isSaving) return;
    const firstInvalid = CONTACT_FIELDS.find((field) => Boolean(fieldErrors[field]));
    if (firstInvalid) {
      focusInvalidFormField(formRef.current, `contact-${firstInvalid}`);
    }
  }, [fieldErrors, isSaving]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !canManage) return;
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
    setFeedback(null);

    const changes: Partial<Record<ContactField, string | null>> = {};
    const validationErrors: Partial<Record<ContactField, string>> = {};
    for (const field of CONTACT_FIELDS) {
      if (field === 'phone' || field === 'whatsapp') {
        const phone = phoneDrafts[field];
        if (!phone.edited) continue; // Preserve old numbers, even those without a country prefix.
        const checked = normalizePhoneDraft(phone);
        if (!checked.valid) {
          validationErrors[field] = t(field === 'whatsapp' ? 'contact.error.whatsapp' : 'contact.error.phone');
          continue;
        }
        if ((checked.value ?? '') !== saved[field]) changes[field] = checked.value;
        continue;
      }
      const value = draft[field].trim();
      if (value !== saved[field]) changes[field] = value === '' ? null : value;
    }
    const firstInvalid = INTERNATIONAL_CONTACT_FIELDS.find(field => validationErrors[field]);
    if (firstInvalid) {
      setFieldErrors(validationErrors);
      setFeedback({ variant: 'error', message: validationErrors[firstInvalid]! });
      return; // Stop before the API request, leaving other fields unsaved until errors are fixed.
    }
    if (Object.keys(changes).length === 0) return;
    setIsSaving(true);
    try {
      const next = await settingsApi.updateContact(restaurantId, changes);
      const nextDraft = toDraft(next);
      setSaved(nextDraft);
      setDraft(nextDraft);
      setPhoneDrafts(phoneDraftsFromContact(nextDraft));
      setNotice(t('contact.saved'));
      setFeedback({ variant: 'success', message: t('contact.saved') });
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      const field = caught instanceof ApiError
        ? (caught.details as { field?: ContactField } | undefined)?.field
        : undefined;
      if (field && CONTACT_FIELDS.includes(field)) {
        const fieldError = t(
          field === 'whatsapp'
            ? 'contact.error.whatsapp'
            : field === 'hotline'
              ? 'contact.error.hotline'
              : PHONE_FIELDS.includes(field)
              ? 'contact.error.phone'
              : 'contact.error.url',
        );
        setFieldErrors({ [field]: fieldError });
        setFeedback({ variant: 'error', message: fieldError });
        // The effect focuses this control once it is enabled again.
      } else {
        const message = describeError(caught);
        setFormError(message);
        setFeedback({ variant: 'error', message });
      }
    } finally {
      setIsSaving(false);
    }
  }

  const internationalInput = (field: InternationalContactField) => (
    <InternationalPhoneField
      key={field}
      id={`contact-${field}`}
      label={t(`contact.field.${field}` as MessageKey)}
      value={phoneDrafts[field]}
      error={fieldErrors[field]}
      disabled={!canManage || isSaving}
      onChange={(value) => {
        setPhoneDrafts(current => ({ ...current, [field]: value }));
        setFieldErrors(current => ({ ...current, [field]: undefined }));
        setNotice(null);
        setFeedback(null);
      }}
    />
  );

  const input = (field: ContactField, placeholder: string) => (
    <FormField
      key={field}
      label={t(`contact.field.${field}` as MessageKey)}
      htmlFor={`contact-${field}`}
      error={fieldErrors[field]}
    >
      <Input
        id={`contact-${field}`}
        dir="ltr"
        inputMode={PHONE_FIELDS.includes(field) ? 'tel' : 'url'}
        autoComplete="off"
        placeholder={placeholder}
        value={draft[field]}
        disabled={!canManage || isSaving}
        aria-invalid={fieldErrors[field] ? true : undefined}
        aria-describedby={fieldErrors[field] ? `contact-${field}-error` : undefined}
        onChange={(event) => {
          setDraft((current) => ({ ...current, [field]: event.target.value }));
          setFieldErrors((current) => ({ ...current, [field]: undefined }));
          setNotice(null);
          setFeedback(null);
        }}
      />
    </FormField>
  );

  return (
    <SectionCard title={t('contact.heading')} description={t('contact.description')}>
      <StaffFeedbackToast message={feedback?.message ?? null} variant={feedback?.variant} onDismiss={() => setFeedback(null)} />
      <form ref={formRef} onSubmit={(event) => void handleSave(event)} className="flex max-w-3xl flex-col gap-5" noValidate>
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        {notice ? <Alert variant="success">{notice}</Alert> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {internationalInput('phone')}
          {internationalInput('whatsapp')}
        </div>
        <p className="text-xs leading-6 text-muted-foreground">{t('contact.phoneNote')}</p>
        <div className="max-w-xs">
          {input('hotline', '16512')}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {input('instagramUrl', 'instagram.com/your.restaurant')}
          {input('facebookUrl', 'facebook.com/your.restaurant')}
          {input('tiktokUrl', 'tiktok.com/@your.restaurant')}
          {input('youtubeUrl', 'youtube.com/@your.restaurant')}
          {input('telegramUrl', 't.me/your_restaurant')}
          {input('xUrl', 'x.com/your_restaurant')}
          {input('snapchatUrl', 'snapchat.com/add/your.restaurant')}
          {input('mapsUrl', 'maps.app.goo.gl/…')}
        </div>
        {input('websiteUrl', 'https://your-restaurant.com')}
        <p className="-mt-2 text-xs text-muted-foreground">{t('contact.linksNote')}</p>

        {canManage ? (
          <div>
            <Button type="submit" disabled={isSaving || !dirty}>
              {isSaving ? t('common.saving') : t('contact.save')}
            </Button>
          </div>
        ) : null}
      </form>
    </SectionCard>
  );
}
