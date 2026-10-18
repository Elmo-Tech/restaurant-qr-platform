'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import * as suggestionsApi from '../../../../../../lib/suggestions/api';
import type { SuggestionsMode } from '../../../../../../lib/suggestions/api';
import type { Product } from '../../../../../../lib/menu/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../../lib/menu/error-message';
import { Alert } from '../../../../../../components/ui/Alert';
import { Button } from '../../../../../../components/ui/Button';
import { FormSection } from '../../../../../../components/ui/FormSection';
import { LoadingState } from '../../../../../../components/ui/LoadingState';
import { Select } from '../../../../../../components/ui/Select';

const MAX = suggestionsApi.MAX_RULES_PER_PRODUCT;

/**
 * The "Suggestions" part of the product page (DEC-042): which dishes the Guest cart suggests when a
 * guest orders THIS product, in order. Saved on its own (not with the product form), like the add-ons.
 */
export function SuggestionsSection({
  restaurantId,
  productId,
  allProducts,
  canManage,
}: {
  restaurantId: string;
  productId: string;
  /** Every product of the Restaurant (for the names and the picker). */
  allProducts: readonly Product[];
  canManage: boolean;
}) {
  const { t } = useStaffI18n();
  const [saved, setSaved] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [mode, setMode] = useState<SuggestionsMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    suggestionsApi
      .getProductSuggestions(restaurantId, productId)
      .then((ids) => {
        if (cancelled) return;
        setSaved(ids);
        setDraft(ids);
      })
      .catch((caught) => {
        if (cancelled) return;
        if (isUnauthenticatedError(caught)) {
          redirectToLogin();
          return;
        }
        setError(describeError(caught));
      });
    suggestionsApi
      .getSuggestionsSettings(restaurantId)
      .then((settings) => {
        if (!cancelled) setMode(settings.mode);
      })
      .catch(() => {
        if (!cancelled) setMode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, productId]);

  const nameOf = useMemo(() => {
    const names = new Map(allProducts.map((product) => [product.id, product.translation.name]));
    return (id: string) => names.get(id) ?? id;
  }, [allProducts]);

  const candidates = useMemo(
    () =>
      allProducts
        .filter((product) => product.id !== productId && !draft.includes(product.id))
        .sort((a, b) => a.translation.name.localeCompare(b.translation.name)),
    [allProducts, productId, draft],
  );

  const dirty = saved !== null && (saved.length !== draft.length || saved.some((id, i) => id !== draft[i]));

  function move(index: number, by: -1 | 1) {
    setNotice(null);
    setDraft((prev) => {
      const next = [...prev];
      const target = index + by;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const ids = await suggestionsApi.saveProductSuggestions(restaurantId, productId, draft);
      setSaved(ids);
      setDraft(ids);
      setNotice(t('suggestions.product.saved'));
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setError(describeError(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FormSection title={t('suggestions.product.title')}>
      <p className="-mt-2 text-sm text-muted-foreground">
        {t('suggestions.product.description', { max: String(MAX) })}
      </p>

      {mode === 'OFF' ? <Alert variant="info">{t('suggestions.product.modeOff')}</Alert> : null}
      {mode === 'AUTO' ? <Alert variant="info">{t('suggestions.product.modeAuto')}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {saved === null && !error ? <LoadingState label={t('suggestions.loading')} /> : null}

      {saved !== null ? (
        <>
          {draft.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('suggestions.product.empty')}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {draft.map((id, index) => (
                <li key={id} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-5 text-xs font-semibold text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    <bdi>{nameOf(id)}</bdi>
                  </span>
                  {canManage ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('suggestions.product.moveUp')}
                        disabled={index === 0 || isSaving}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('suggestions.product.moveDown')}
                        disabled={index === draft.length - 1 || isSaving}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${t('suggestions.product.remove')}: ${nameOf(id)}`}
                        disabled={isSaving}
                        onClick={() => {
                          setNotice(null);
                          setDraft((prev) => prev.filter((other) => other !== id));
                        }}
                      >
                        ×
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          {canManage ? (
            <div className="flex flex-col gap-3">
              {draft.length < MAX ? (
                <Select
                  aria-label={t('suggestions.product.add')}
                  value=""
                  disabled={isSaving || candidates.length === 0}
                  onChange={(event) => {
                    const id = event.target.value;
                    if (!id) return;
                    setNotice(null);
                    setDraft((prev) => (prev.includes(id) || prev.length >= MAX ? prev : [...prev, id]));
                  }}
                >
                  <option value="">{t('suggestions.product.choose')}</option>
                  {candidates.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.translation.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">{t('suggestions.product.max', { max: String(MAX) })}</p>
              )}
              <div>
                <Button type="button" onClick={() => void save()} disabled={!dirty || isSaving}>
                  {t('suggestions.product.save')}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </FormSection>
  );
}
