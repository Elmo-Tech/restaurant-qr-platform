'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as settingsApi from '../../../../../../lib/settings/api';
import { resolveAssetUrl } from '../../../../../../lib/media/asset-url';
import { validateImageFile } from '../../../../../../lib/menu/image-validation';
import { validateCoverImageFile } from '../../../../../../lib/menu/cover-image-validation';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { ImageField } from '../../../../../../components/menu/ImageField';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { ConfirmDialog } from '../../../../../../components/ui/ConfirmDialog';
import { FormField } from '../../../../../../components/ui/FormField';
import { Input } from '../../../../../../components/ui/Input';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { SectionCard } from '../../../../../../components/ui/SectionCard';
import { StaffFeedbackToast, type StaffFeedbackVariant } from '../../../../../../components/staff/StaffFeedbackToast';
import { focusInvalidFormField } from '../../../../../../lib/staff/focus-invalid-field';
import { SettingsBackLink } from '../../../../../../components/staff/SettingsBackLink';
import { ContactCard } from './ContactCard';
import type { RestaurantContact } from '../../../../../../lib/contact/types';

const NAME_MAX_LENGTH = 200;

export interface ProfileWorkspaceProps {
  restaurantId: string;
  initialName: string;
  initialLogoAssetPath: string | null;
  initialCoverAssetPath: string | null;
  initialContact: RestaurantContact;
  currencyCode: string;
  /** `restaurant.manage` AND `allBranches === true`. */
  canManage: boolean;
  /** `restaurant.manage` alone -- only picks the explanatory read-only note. */
  hasRestaurantManagePermission: boolean;
}

/**
 * Restaurant Settings -- Profile (FT-12): the Restaurant's display name and
 * logo, and nothing else (no theme editor; currency is shown read-only
 * because it is fixed at creation). After a successful save the Server
 * Components are refreshed so the Staff sidebar identity (which reads the
 * same `/auth/me` Restaurant) shows the new name/logo immediately.
 */
export function ProfileWorkspace({
  restaurantId,
  initialName,
  initialLogoAssetPath,
  initialCoverAssetPath,
  initialContact,
  currencyCode,
  canManage,
  hasRestaurantManagePermission,
}: ProfileWorkspaceProps) {
  const { t } = useStaffI18n();
  const router = useRouter();
  const nameFormRef = useRef<HTMLFormElement>(null);
  const [feedback, setFeedback] = useState<{ variant: StaffFeedbackVariant; message: string } | null>(null);

  const [savedName, setSavedName] = useState(initialName);
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  const [logoAssetPath, setLogoAssetPath] = useState(initialLogoAssetPath);
  const [isLogoBusy, setIsLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [coverAssetPath, setCoverAssetPath] = useState(initialCoverAssetPath);
  const [isCoverBusy, setIsCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [confirmRemoveCover, setConfirmRemoveCover] = useState(false);
  const [removeCoverError, setRemoveCoverError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const isNameDirty = trimmedName !== savedName;

  async function handleSaveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingName || !canManage) return;

    if (!trimmedName) {
      const message = t('profile.name.error.required');
      setNameError(message);
      setFeedback({ variant: 'error', message });
      focusInvalidFormField(nameFormRef.current, 'restaurant-name');
      return;
    }
    setNameError(null);
    setFormError(null);
    setNotice(null);
    setFeedback(null);
    setIsSavingName(true);
    try {
      const profile = await settingsApi.updateRestaurantProfile(restaurantId, { name: trimmedName });
      setSavedName(profile.name);
      setName(profile.name);
      setNotice(t('profile.saved'));
      setFeedback({ variant: 'success', message: t('profile.saved') });
      router.refresh();
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      const message = describeError(error);
      setFormError(message);
      setFeedback({ variant: 'error', message });
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleSelectLogo(file: File) {
    if (isLogoBusy || !canManage) return;
    setNotice(null);
    const validationError = validateImageFile(file);
    if (validationError) {
      setLogoError(validationError);
      setFeedback({ variant: 'error', message: validationError });
      return;
    }
    setLogoError(null);
    setIsLogoBusy(true);
    try {
      const profile = await settingsApi.uploadRestaurantLogo(restaurantId, file);
      setLogoAssetPath(profile.logoAssetPath);
      setNotice(t('profile.logo.saved'));
      setFeedback({ variant: 'success', message: t('profile.logo.saved') });
      router.refresh();
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      const message = describeError(error);
      setLogoError(message);
      setFeedback({ variant: 'error', message });
    } finally {
      setIsLogoBusy(false);
    }
  }

  async function handleRemoveLogo() {
    if (isLogoBusy) return;
    setIsLogoBusy(true);
    setRemoveError(null);
    try {
      await settingsApi.removeRestaurantLogo(restaurantId);
      setLogoAssetPath(null);
      setConfirmRemove(false);
      setNotice(t('profile.logo.removed'));
      setFeedback({ variant: 'success', message: t('profile.logo.removed') });
      router.refresh();
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      const message = describeError(error);
      setRemoveError(message);
      setFeedback({ variant: 'error', message });
    } finally {
      setIsLogoBusy(false);
    }
  }

  async function handleSelectCover(file: File) {
    if (isCoverBusy || !canManage) return;
    setNotice(null);
    setCoverError(null);
    setIsCoverBusy(true);
    try {
      const validationError = await validateCoverImageFile(file);
      if (validationError) {
        setCoverError(validationError);
        setFeedback({ variant: 'error', message: validationError });
        return;
      }
      const profile = await settingsApi.uploadRestaurantCover(restaurantId, file);
      setCoverAssetPath(profile.coverAssetPath);
      setNotice(t('profile.cover.saved'));
      setFeedback({ variant: 'success', message: t('profile.cover.saved') });
      router.refresh();
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      const message = describeError(error);
      setCoverError(message);
      setFeedback({ variant: 'error', message });
    } finally {
      setIsCoverBusy(false);
    }
  }

  async function handleRemoveCover() {
    if (isCoverBusy) return;
    setIsCoverBusy(true);
    setRemoveCoverError(null);
    try {
      await settingsApi.removeRestaurantCover(restaurantId);
      setCoverAssetPath(null);
      setConfirmRemoveCover(false);
      setNotice(t('profile.cover.removed'));
      setFeedback({ variant: 'success', message: t('profile.cover.removed') });
      router.refresh();
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      const message = describeError(error);
      setRemoveCoverError(message);
      setFeedback({ variant: 'error', message });
    } finally {
      setIsCoverBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsBackLink restaurantId={restaurantId} />
      <PageHeader title={t('settingsHub.profile')} description={t('settingsHub.profile.description')} />

      {!canManage && hasRestaurantManagePermission ? (
        <Alert variant="info">{t('profile.needsFullScope')}</Alert>
      ) : !canManage ? (
        <Alert variant="info">{t('profile.viewOnly')}</Alert>
      ) : null}
      <StaffFeedbackToast message={feedback?.message ?? null} variant={feedback?.variant} onDismiss={() => setFeedback(null)} />
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <SectionCard title={t('profile.heading')} description={t('profile.description')}>
        <form ref={nameFormRef} onSubmit={handleSaveName} className="flex max-w-xl flex-col gap-5" noValidate>
          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <FormField label={t('profile.name')} htmlFor="restaurant-name" error={nameError ?? undefined}>
            <Input
              id="restaurant-name"
              dir="auto"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'restaurant-name-error' : undefined}
              maxLength={NAME_MAX_LENGTH}
              value={name}
              disabled={!canManage || isSavingName}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
                setFeedback(null);
              }}
            />
          </FormField>

          <FormField label={t('profile.currency')} htmlFor="restaurant-currency">
            <Input id="restaurant-currency" dir="ltr" value={currencyCode} readOnly disabled />
            <p className="text-xs text-muted-foreground">{t('profile.currencyNote')}</p>
          </FormField>

          {canManage ? (
            <div>
              <Button type="submit" disabled={isSavingName || !isNameDirty}>
                {isSavingName ? t('common.saving') : t('profile.save')}
              </Button>
            </div>
          ) : null}
        </form>
      </SectionCard>

      <SectionCard title={t('profile.logo.heading')} description={t('profile.logo.description')}>
        <div className="flex max-w-xl flex-col gap-3">
          {canManage ? (
            <ImageField
              idPrefix="restaurant-logo"
              imageUrl={resolveAssetUrl(logoAssetPath)}
              onSelectFile={(file) => void handleSelectLogo(file)}
              onRemove={
                logoAssetPath
                  ? () => {
                      setRemoveError(null);
                      setConfirmRemove(true);
                    }
                  : undefined
              }
              isBusy={isLogoBusy}
              error={logoError}
              selectLabel={logoAssetPath ? t('profile.logo.replace') : t('profile.logo.upload')}
              removeLabel={t('profile.logo.remove')}
              helperText={
                logoAssetPath ? t('profile.logo.helper') : `${t('profile.logo.empty')} ${t('profile.logo.helper')}`
              }
            />
          ) : resolveAssetUrl(logoAssetPath) ? (
            // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
            <img
              src={resolveAssetUrl(logoAssetPath) ?? undefined}
              alt=""
              className="h-20 w-20 rounded-lg border border-border object-cover"
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t('profile.logo.empty')}</p>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t('profile.cover.heading')} description={t('profile.cover.description')}>
        <div className="flex max-w-xl flex-col gap-3">
          {canManage ? (
            <ImageField
              idPrefix="restaurant-cover"
              imageUrl={resolveAssetUrl(coverAssetPath)}
              previewShape="wide"
              onSelectFile={(file) => void handleSelectCover(file)}
              onRemove={
                coverAssetPath
                  ? () => {
                      setRemoveCoverError(null);
                      setConfirmRemoveCover(true);
                    }
                  : undefined
              }
              isBusy={isCoverBusy}
              error={coverError}
              selectLabel={coverAssetPath ? t('profile.cover.replace') : t('profile.cover.upload')}
              removeLabel={t('profile.cover.remove')}
              helperText={
                coverAssetPath
                  ? t('profile.cover.helper')
                  : `${t('profile.cover.empty')} ${t('profile.cover.helper')}`
              }
            />
          ) : resolveAssetUrl(coverAssetPath) ? (
            // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
            <img
              src={resolveAssetUrl(coverAssetPath) ?? undefined}
              alt=""
              className="h-28 w-full max-w-[16rem] rounded-lg border border-border object-cover"
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t('profile.cover.empty')}</p>
          )}
        </div>
      </SectionCard>

      <div id="contact-settings" className="scroll-mt-24">
        <ContactCard restaurantId={restaurantId} initialContact={initialContact} canManage={canManage} />
      </div>

      <ConfirmDialog
        open={confirmRemoveCover}
        title={t('profile.cover.removeConfirm.title')}
        description={t('profile.cover.removeConfirm.description')}
        confirmLabel={t('profile.cover.remove')}
        isSubmitting={isCoverBusy}
        error={removeCoverError}
        onConfirm={() => void handleRemoveCover()}
        onClose={() => setConfirmRemoveCover(false)}
      />

      <ConfirmDialog
        open={confirmRemove}
        title={t('profile.logo.removeConfirm.title')}
        description={t('profile.logo.removeConfirm.description')}
        confirmLabel={t('profile.logo.remove')}
        isSubmitting={isLogoBusy}
        error={removeError}
        onConfirm={() => void handleRemoveLogo()}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  );
}
