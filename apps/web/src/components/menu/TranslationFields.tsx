import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';

export interface TranslationFieldsDraft {
  name: string;
  description: string;
  exists: boolean;
  isSaving: boolean;
  isRemoving: boolean;
  error: string | null;
}

export interface TranslationFieldsProps {
  idPrefix: string;
  locale: string;
  /** Text direction for this locale's Name/Description inputs only (FT-1 correction, Section 4) -- never the page's own direction. */
  dir: 'ltr' | 'rtl';
  draft: TranslationFieldsDraft | undefined;
  onChange: (patch: Partial<Pick<TranslationFieldsDraft, 'name' | 'description'>>) => void;
  onSave: () => void;
  onRemove: () => void;
}

/**
 * One secondary-locale translation editor block, shared by the Menu Dialog,
 * Category Dialog, and Product Editor (FT-1, Section 7/8/14/15/19). Save and
 * Remove act independently of whatever surrounding form/Dialog hosts this --
 * both controls are `type="button"`, so they never submit an enclosing
 * `<form>`, keeping a translation failure from blocking or hiding the
 * structural/default-locale Save flow next to it (Section 19). The default
 * translation is never deletable through this UI at all -- callers simply
 * never render this component for the default locale (Section 6/14).
 */
export function TranslationFields({
  idPrefix,
  locale,
  dir,
  draft,
  onChange,
  onSave,
  onRemove,
}: TranslationFieldsProps) {
  const name = draft?.name ?? '';
  const description = draft?.description ?? '';
  const exists = draft?.exists ?? false;
  const isSaving = draft?.isSaving ?? false;
  const isRemoving = draft?.isRemoving ?? false;
  const error = draft?.error ?? null;
  const isBusy = isSaving || isRemoving;

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {!exists ? <p className="text-xs text-[#655D56]">Not translated yet.</p> : null}
      <FormField label="Name" htmlFor={`${idPrefix}-name-${locale}`}>
        <Input
          id={`${idPrefix}-name-${locale}`}
          dir={dir}
          value={name}
          onChange={(event) => onChange({ name: event.target.value })}
          disabled={isBusy}
        />
      </FormField>
      <FormField label="Description" htmlFor={`${idPrefix}-description-${locale}`}>
        <Textarea
          id={`${idPrefix}-description-${locale}`}
          dir={dir}
          value={description}
          onChange={(event) => onChange({ description: event.target.value })}
          disabled={isBusy}
        />
      </FormField>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" disabled={isBusy} onClick={onSave}>
          {isSaving ? 'Saving…' : 'Save translation'}
        </Button>
        {exists ? (
          <Button type="button" variant="danger" className="px-3 py-1.5 text-xs" disabled={isBusy} onClick={onRemove}>
            {isRemoving ? 'Removing…' : 'Remove translation'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
