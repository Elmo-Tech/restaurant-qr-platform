/**
 * A form can be taller than the viewport; always show the field that failed
 * validation after a Save action. Native focus remains keyboard accessible.
 * Caller must pass its own form to avoid focusing a different form on the page.
 */
export function focusInvalidFormField(form: HTMLFormElement | null, fieldId: string): boolean {
  if (!form) return false;
  const control = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input, textarea, select',
  )).find(item => item.id === fieldId && !item.disabled);
  if (!control) return false;

  control.focus({ preventScroll: true });
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  control.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  return true;
}
