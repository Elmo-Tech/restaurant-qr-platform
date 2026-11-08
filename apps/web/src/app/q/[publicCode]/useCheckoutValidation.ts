'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { checkoutIssueMessage } from '../../../lib/public-menu/checkout-issue-copy';
import {
  CHECKOUT_LIMITS,
  checkoutValuesForSubmit,
  DEFAULT_PHONE_COUNTRY,
  isCheckoutField,
  issueFromApiCode,
  loadedPhoneLibrary,
  loadPhoneLibrary,
  phoneNeedsLibrary,
  validateCheckoutFields,
  type CheckoutField,
  type CheckoutIssues,
  type FieldIssue,
  type PhoneLibrary,
} from '../../../lib/public-menu/checkout-validation';

/**
 * The checkout form's validation state, for every menu template (the checkout is shared): which
 * problems exist, which of them the Guest should see yet (a field after it was left, everything
 * after a send attempt), and the API's own verdict after a send. State only; the rules live in
 * `lib/public-menu/checkout-validation.ts`.
 */
export function useCheckoutValidation({
  fields,
  enabled,
  delivery,
  country,
  locale,
}: {
  fields: Record<CheckoutField, string>;
  /** False for a Table QR, which has no customer details to check. */
  enabled: boolean;
  delivery: boolean;
  /** The Restaurant's ISO country (the default country of the phone number). */
  country: string | undefined;
  locale: string;
}) {
  const phoneCountry = country || DEFAULT_PHONE_COUNTRY;
  const [library, setLibrary] = useState<PhoneLibrary | null>(() => loadedPhoneLibrary());
  const [touched, setTouched] = useState<Partial<Record<CheckoutField, true>>>({});
  const [attempted, setAttempted] = useState(false);
  const [serverIssues, setServerIssues] = useState<Partial<Record<CheckoutField, FieldIssue>>>({});

  // Only a number that is not clearly Egyptian needs the full library; it loads once, on demand.
  const needsLibrary = enabled && fields.customerPhone.trim() !== '' && phoneNeedsLibrary(fields.customerPhone, phoneCountry);
  useEffect(() => {
    if (!needsLibrary || library) return;
    let cancelled = false;
    void loadPhoneLibrary().then((loaded) => {
      if (!cancelled) setLibrary(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [needsLibrary, library]);

  const context = useMemo(
    () => ({ country: phoneCountry, delivery, library }),
    [phoneCountry, delivery, library],
  );
  const issues: CheckoutIssues = useMemo(
    () => (enabled ? validateCheckoutFields(fields, context) : {}),
    [enabled, fields, context],
  );

  const egyptianPhone = phoneCountry === 'EG';
  const fieldErrors = useMemo(() => {
    const visible: Partial<Record<CheckoutField, string>> = {};
    for (const key of Object.keys(issues) as CheckoutField[]) {
      const issue = issues[key];
      if (issue && (attempted || touched[key])) {
        visible[key] = checkoutIssueMessage(locale, key, issue, { egyptianPhone, max: CHECKOUT_LIMITS[key].max });
      }
    }
    // The API's verdict wins until the Guest edits the field again.
    for (const key of Object.keys(serverIssues) as CheckoutField[]) {
      const issue = serverIssues[key];
      if (issue) {
        visible[key] = checkoutIssueMessage(locale, key, issue, { egyptianPhone, max: CHECKOUT_LIMITS[key].max });
      }
    }
    return visible;
  }, [issues, attempted, touched, serverIssues, locale, egyptianPhone]);

  const onFieldBlur = useCallback((key: CheckoutField) => {
    setTouched((previous) => (previous[key] ? previous : { ...previous, [key]: true }));
  }, []);

  /** The Guest edited a field: the API's old verdict about it no longer applies. */
  const onFieldEdited = useCallback((key: CheckoutField) => {
    setServerIssues((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }, []);

  /**
   * Called when the Guest taps send. With problems: shows every message, moves focus to the first
   * invalid field and returns false (nothing is sent). A number that needs the library waits for it
   * first, so the answer is the real one.
   */
  const checkBeforeSend = useCallback(async (): Promise<boolean> => {
    if (!enabled) return true;
    let activeLibrary = library;
    if (!activeLibrary && phoneNeedsLibrary(fields.customerPhone, phoneCountry)) {
      try {
        activeLibrary = await loadPhoneLibrary();
        setLibrary(activeLibrary);
      } catch {
        // Offline chunk failure: fall back to the shape check; the API still judges the number.
      }
    }
    const current = validateCheckoutFields(fields, { country: phoneCountry, delivery, library: activeLibrary });
    const first = (Object.keys(current) as CheckoutField[])[0];
    if (!first) return true;
    setAttempted(true);
    const element = document.getElementById(`checkout-${first}`);
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      element.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }
    return false;
  }, [enabled, library, fields, phoneCountry, delivery]);

  /** The API refused fields (VALIDATION_ERROR): show its code for each as a sentence. Returns whether any field was shown. */
  const applyServerIssues = useCallback((list: { field: string; code: string }[]): boolean => {
    const next: Partial<Record<CheckoutField, FieldIssue>> = {};
    for (const entry of list) {
      if (isCheckoutField(entry.field)) next[entry.field] = issueFromApiCode(entry.code);
    }
    const shown = Object.keys(next).length > 0;
    if (shown) {
      setServerIssues(next);
      setAttempted(true);
      const first = Object.keys(next)[0];
      document.getElementById(`checkout-${first}`)?.focus({ preventScroll: true });
    }
    return shown;
  }, []);

  /** Cleaned values (phone as E.164) for the request; call at send time so they match what was checked. */
  const valuesForSubmit = useCallback(
    () => checkoutValuesForSubmit(fields, { country: phoneCountry, delivery, library }),
    [fields, phoneCountry, delivery, library],
  );

  return {
    /** Problems of the form right now, whether or not they are shown. */
    issues,
    hasIssues: Object.keys(issues).length > 0,
    fieldErrors,
    onFieldBlur,
    onFieldEdited,
    checkBeforeSend,
    applyServerIssues,
    valuesForSubmit,
    phoneCountry,
  };
}
