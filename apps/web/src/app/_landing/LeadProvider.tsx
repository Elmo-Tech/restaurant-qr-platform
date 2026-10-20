'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { apiFetch } from '../../lib/api/client';
import { ApiError } from '../../lib/api/errors';
import type { LandingCopy } from './copy';
import type { LandingPlan } from './plans-api';
import styles from './landing.module.css';

type Kind = 'TRIAL' | 'SUBSCRIBE';

interface OpenOptions {
  kind: Kind;
  packageId?: string | null;
}

const LeadContext = createContext<((options: OpenOptions) => void) | null>(null);

/** Opens the request dialog from anywhere on the landing page. */
export function useOpenLead() {
  const open = useContext(LeadContext);
  if (!open) throw new Error('useOpenLead must be used inside LeadProvider');
  return open;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 -]{5,18}[0-9]$/;

type FieldErrors = Partial<Record<'name' | 'email' | 'phone', string>>;

/**
 * The subscription / free-trial request form (DEC-053), shown in a native modal dialog (focus trap,
 * Escape and backdrop behaviour come from the browser). It posts to the public Backend route; the
 * Backend answers the same way for a repeated request, so the visitor always sees one clear result.
 */
export function LeadProvider({
  copy,
  plans,
  locale,
  children,
}: {
  copy: LandingCopy['lead'];
  plans: LandingPlan[];
  locale: 'ar' | 'en';
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>('TRIAL');
  const [packageId, setPackageId] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const open = useCallback((options: OpenOptions) => {
    setKind(options.kind);
    setPackageId(options.packageId ?? '');
    setStatus((current) => (current === 'done' ? 'idle' : current));
    setErrors({});
    setFormError(null);
    dialogRef.current?.showModal();
  }, []);

  // clicking the backdrop closes the dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener('click', onClick);
    return () => dialog.removeEventListener('click', onClick);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();

    const next: FieldErrors = {};
    if (value('name').length < 2) next.name = copy.errors.name;
    if (!EMAIL.test(value('email'))) next.email = copy.errors.email;
    if (!PHONE.test(value('phone'))) next.phone = copy.errors.phone;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setStatus('sending');
    try {
      await apiFetch('/public/landing/leads', {
        method: 'POST',
        body: {
          kind,
          packageId: packageId || null,
          name: value('name'),
          email: value('email'),
          phone: value('phone'),
          restaurantName: value('restaurantName') || null,
          message: value('message') || null,
          locale,
        },
      });
      setStatus('done');
    } catch (caught) {
      setStatus('idle');
      if (caught instanceof ApiError) {
        setFormError(caught.status === 429 ? copy.errors.rate : copy.errors.other);
      } else {
        setFormError(copy.errors.network);
      }
    }
  }

  const value = useMemo(() => open, [open]);
  const title = kind === 'TRIAL' ? copy.titleTrial : copy.titleSubscribe;

  return (
    <LeadContext.Provider value={value}>
      {children}
      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="lead-title" onClose={() => setStatus((s) => (s === 'done' ? 'idle' : s))}>
        <button type="button" className={styles.dialogClose} aria-label={copy.close} onClick={() => dialogRef.current?.close()}>
          ×
        </button>
        <div className={styles.dialogBody}>
          {status === 'done' ? (
            <div className={styles.doneBox} role="status">
              <span className={styles.doneMark}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <h3 className={styles.display} id="lead-title">
                {copy.done.title}
              </h3>
              <p>{copy.done.text}</p>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => dialogRef.current?.close()}>
                {copy.close}
              </button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} noValidate>
              <h2 className={`${styles.display} ${styles.dialogTitle}`} id="lead-title">
                {title}
              </h2>
              <p className={styles.dialogLead}>{copy.lead}</p>

              <div className={styles.kindRow} role="radiogroup">
                {(['TRIAL', 'SUBSCRIBE'] as const).map((option) => (
                  <label key={option} className={styles.kindOption}>
                    <input type="radio" name="kind" checked={kind === option} onChange={() => setKind(option)} />
                    <span>{option === 'TRIAL' ? copy.kind.trial : copy.kind.subscribe}</span>
                  </label>
                ))}
              </div>

              {formError ? (
                <p className={styles.formError} role="alert">
                  {formError}
                </p>
              ) : null}

              <div className={styles.fields}>
                <div className={styles.field}>
                  <label htmlFor="lead-package">{copy.package}</label>
                  <select id="lead-package" value={packageId} onChange={(event) => setPackageId(event.target.value)}>
                    <option value="">{copy.packageNone}</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="lead-name">{copy.name}</label>
                  <input id="lead-name" name="name" autoComplete="name" maxLength={100} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'lead-name-err' : undefined} />
                  {errors.name ? (
                    <p className={styles.fieldError} id="lead-name-err">
                      {errors.name}
                    </p>
                  ) : null}
                </div>
                <div className={styles.field}>
                  <label htmlFor="lead-email">{copy.email}</label>
                  <input id="lead-email" name="email" type="email" dir="ltr" autoComplete="email" maxLength={254} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'lead-email-err' : undefined} style={{ textAlign: 'start' }} />
                  {errors.email ? (
                    <p className={styles.fieldError} id="lead-email-err">
                      {errors.email}
                    </p>
                  ) : null}
                </div>
                <div className={styles.field}>
                  <label htmlFor="lead-phone">{copy.phone}</label>
                  <input id="lead-phone" name="phone" type="tel" dir="ltr" autoComplete="tel" maxLength={20} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'lead-phone-err' : undefined} style={{ textAlign: 'start' }} />
                  {errors.phone ? (
                    <p className={styles.fieldError} id="lead-phone-err">
                      {errors.phone}
                    </p>
                  ) : null}
                </div>
                <div className={styles.field}>
                  <label htmlFor="lead-restaurant">
                    {copy.restaurant} <em>{copy.restaurantOptional}</em>
                  </label>
                  <input id="lead-restaurant" name="restaurantName" maxLength={100} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="lead-message">
                    {copy.message} <em>{copy.messageOptional}</em>
                  </label>
                  <textarea id="lead-message" name="message" maxLength={500} />
                </div>
              </div>

              <div className={styles.dialogActions}>
                <button type="submit" className={`${styles.btn} ${styles.btnSaffron} ${styles.btnBlock}`} disabled={status === 'sending'}>
                  {status === 'sending' ? copy.submitting : copy.submit}
                </button>
                <p className={styles.privacy}>{copy.privacy}</p>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </LeadContext.Provider>
  );
}

/** A button that opens the request dialog. */
export function LeadButton({
  kind,
  packageId,
  className,
  children,
}: {
  kind: Kind;
  packageId?: string | null;
  className: string;
  children: ReactNode;
}) {
  const open = useOpenLead();
  return (
    <button type="button" className={className} onClick={() => open({ kind, packageId })}>
      {children}
    </button>
  );
}
