'use client';

import { useStaffI18n } from '../../lib/i18n/client';
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
  /** FT-6A closeout: the second field's label, e.g. "Helper text" for a Modifier Group (`ModifierGroupTranslation.helperText`) -- defaults to "Description" (Menu/Category/Product's own field name). Purely a label; the underlying draft field stays `description` either way, so `useTranslationsEditor` needs no changes. */
  secondFieldLabel?: string;
  /** FT-6A closeout: a Modifier Option Translation has no second content field at all (DATABASE_SPEC.md #77) -- hides the field entirely rather than showing an always-empty, never-persisted input. */
  hideSecondField?: boolean;
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
  secondFieldLabel,
  hideSecondField = false,
}: TranslationFieldsProps) {
  const { t } = useStaffI18n();
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
      {!exists ? <p className="text-xs text-muted-foreground">{t('menu.tr.notTranslatedYet')}</p> : null}
      <FormField label={t('menu.tr.name')} htmlFor={`${idPrefix}-name-${locale}`}>
        <Input
          id={`${idPrefix}-name-${locale}`}
          dir={dir}
          value={name}
          onChange={(event) => onChange({ name: event.target.value })}
          disabled={isBusy}
        />
      </FormField>
      {!hideSecondField ? (
        <FormField label={secondFieldLabel ?? t('menu.tr.description')} htmlFor={`${idPrefix}-description-${locale}`}>
          <Textarea
            id={`${idPrefix}-description-${locale}`}
            dir={dir}
            value={description}
            onChange={(event) => onChange({ description: event.target.value })}
            disabled={isBusy}
          />
        </FormField>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" disabled={isBusy} onClick={onSave}>
          {isSaving ? t('common.saving') : t('menu.tr.save')}
        </Button>
        {exists ? (
          <Button type="button" variant="danger" className="px-3 py-1.5 text-xs" disabled={isBusy} onClick={onRemove}>
            {isRemoving ? t('menu.tr.removing') : t('menu.tr.remove')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
