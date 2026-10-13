'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import * as menuApi from '../../../../../lib/menu/api';
import type { Product, ProductAvailability } from '../../../../../lib/menu/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { Dialog } from '../../../../../components/ui/Dialog';
import { LoadingState } from '../../../../../components/ui/LoadingState';

const MAX_RESULTS = 30;

/**
 * "Mark an item sold out" without leaving the Dashboard: search an item and
 * flip its availability. It is the same `PATCH .../availability` the Menu
 * editor uses, so the Guest Menu reflects it immediately. Only ACTIVE
 * products are listed (an inactive product is already hidden from guests).
 */
export function SoldOutDialog({
  open,
  restaurantId,
  onClose,
}: {
  open: boolean;
  restaurantId: string;
  onClose: () => void;
}) {
  const { t, locale } = useStaffI18n();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const rows = await menuApi.listProducts(restaurantId);
      setProducts(rows.filter((product) => product.status === 'ACTIVE'));
      setError(null);
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setError(describeError(caught));
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQuery('');
      setProducts(null);
      void load();
    });
  }, [open, load]);

  async function setAvailability(product: Product, availability: ProductAvailability) {
    if (busyId) return;
    setBusyId(product.id);
    setError(null);
    try {
      await menuApi.updateProductAvailability(restaurantId, product.id, availability);
      setProducts((current) =>
        current
          ? current.map((row) => (row.id === product.id ? { ...row, availability } : row))
          : current,
      );
    } catch (caught) {
      if (isUnauthenticatedError(caught)) {
        redirectToLogin();
        return;
      }
      setError(describeError(caught));
    } finally {
      setBusyId(null);
    }
  }

  const { soldOut, matches } = useMemo(() => {
    const all = products ?? [];
    const needle = query.trim().toLocaleLowerCase(locale);
    const byName = (a: Product, b: Product) =>
      a.translation.name.localeCompare(b.translation.name, locale);
    const found =
      needle === ''
        ? []
        : all
            .filter((product) => product.translation.name.toLocaleLowerCase(locale).includes(needle))
            .sort(byName)
            .slice(0, MAX_RESULTS);
    const foundIds = new Set(found.map((product) => product.id));
    return {
      matches: found,
      // An item already shown in the search results is not listed twice.
      soldOut: all
        .filter((product) => product.availability === 'SOLD_OUT' && !foundIds.has(product.id))
        .sort(byName),
    };
  }, [products, query, locale]);

  function row(product: Product) {
    const isSoldOut = product.availability === 'SOLD_OUT';
    return (
      <li
        key={product.id}
        className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" dir="auto">
          {product.translation.name}
        </span>
        <span
          className={`flex-shrink-0 text-xs font-medium ${isSoldOut ? 'text-destructive' : 'text-success'}`}
        >
          {t(`ops.soldOut.state.${product.availability}` as const)}
        </span>
        <Button
          type="button"
          size="sm"
          variant={isSoldOut ? 'secondary' : 'danger'}
          disabled={busyId !== null}
          onClick={() => void setAvailability(product, isSoldOut ? 'AVAILABLE' : 'SOLD_OUT')}
        >
          {isSoldOut ? t('ops.soldOut.restore') : t('ops.soldOut.markSoldOut')}
        </Button>
      </li>
    );
  }

  return (
    <Dialog
      open={open}
      title={t('ops.soldOut.title')}
      subtitle={t('ops.soldOut.hint')}
      isSubmitting={false}
      submitLabel={t('ops.soldOut.done')}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      initialFocusRef={searchRef}
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert variant="error">{error}</Alert> : null}

        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
          }}
          placeholder={t('ops.soldOut.search')}
          aria-label={t('ops.soldOut.search')}
          className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-ring"
        />

        {products === null && !error ? <LoadingState label={t('ops.soldOut.loading')} /> : null}

        {products !== null ? (
          <>
            {query.trim() !== '' ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('ops.soldOut.results')}
                </h3>
                {matches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('ops.soldOut.none')}</p>
                ) : (
                  <ul className="flex flex-col gap-2">{matches.map(row)}</ul>
                )}
              </section>
            ) : null}

            {soldOut.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('ops.soldOut.soldOutNow')}
                </h3>
                <ul className="flex flex-col gap-2">{soldOut.map(row)}</ul>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
