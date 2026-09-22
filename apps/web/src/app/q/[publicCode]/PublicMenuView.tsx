'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { IconImage } from '../../../components/staff/icons';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import { getPublicMenuCopy, type PublicMenuCopy } from '../../../lib/public-menu/copy';
import {
  cartLineKey,
  loadCart,
  saveCart,
  type StoredCartItem,
} from '../../../lib/public-menu/cart-storage';
import {
  lineTotalMinorUnits,
  fromMinorUnits,
  toMinorUnits,
  ZERO_MINOR_UNITS,
} from '../../../lib/public-menu/money';
import { submitGuestOrder } from '../../../lib/public-menu/orders-api';
import {
  clearPendingAttempt,
  itemsMatchPendingAttempt,
  resolveClientRequestId,
} from '../../../lib/public-menu/pending-order-attempt';
import { generateUuid } from '../../../lib/public-menu/uuid';
import type {
  GuestOrderView,
  PublicMenuCategory,
  PublicMenuData,
  PublicMenuProduct,
} from '../../../lib/public-menu/types';
import { CartDrawer, type CartLine } from './CartDrawer';
import { ProductOptionsDialog } from './ProductOptionsDialog';

/** Platform locales stay exactly `en`/`ar` (Section 8) -- no locale-name library needed for two fixed labels. */
const LOCALE_LABELS: Record<string, string> = { en: 'English', ar: 'العربية' };

const MAX_QUANTITY = 99;

/**
 * The shared page container width (FT-3B, Section 4): full-bleed on mobile
 * with ~16px side padding (`px-4`), growing to a centered, comfortably
 * readable ~1100px column on larger screens -- never edge-to-edge on a
 * wide desktop, never a narrow column drowning in whitespace. Applied
 * identically to the sticky header's inner row and to `<main>` so both
 * stay visually aligned.
 */
const PAGE_CONTAINER = 'mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-10';

/**
 * FT-3/FT-3B/FT-5: the Guest Menu -- Restaurant header, language switcher,
 * sticky Category chip nav, Category/Product sections, and (Section 3/18,
 * TABLE QR only) a Cart. Promoted to a Client Component in FT-5 (it was a
 * Server Component through FT-3B) purely because the Cart needs React
 * state/localStorage/a browser `fetch` -- Next.js still server-renders a
 * Client Component's first paint, so this costs nothing visually; it is
 * required simply because "Add to Cart" cannot exist without client JS.
 * The language switcher stays plain `<Link>`s carrying `?lang=` (a real
 * navigation), and Category selection stays a plain anchor jump -- neither
 * needed client interactivity and both still work identically.
 *
 * `dir` is set on this component's own root, not the document `<html>`
 * (shared with Staff) -- everything inside genuinely mirrors for Arabic
 * since no physical-direction utility is used, only `gap` and logical
 * browser bidi/flex behavior.
 */
export function PublicMenuView({
  data,
  publicCode,
}: {
  data: PublicMenuData;
  publicCode: string;
}) {
  const dir = data.locale.resolved === 'ar' ? 'rtl' : 'ltr';
  const currency = data.context.restaurant.currencyCode;
  const copy = getPublicMenuCopy(data.locale.resolved);
  const hasCategories = data.menu.categories.length > 0;
  const canOrder = data.context.qrType === 'TABLE';

  const productById = useMemo(() => {
    const map = new Map<string, PublicMenuProduct>();
    for (const category of data.menu.categories) {
      for (const product of category.products) {
        map.set(product.id, product);
      }
    }
    return map;
  }, [data.menu.categories]);

  const [cart, setCart] = useState<StoredCartItem[]>([]);
  const [hasHydratedCart, setHasHydratedCart] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<GuestOrderView | null>(null);
  // FT-6A: the Product currently open in the "choose your options" dialog --
  // null means no dialog is open. A Product with Modifier Groups never adds
  // directly from its card; it always opens this dialog first (Section:
  // "clicking Add should open a focused Product Options dialog instead of
  // blindly adding").
  const [optionsDialogProduct, setOptionsDialogProduct] = useState<PublicMenuProduct | null>(
    null,
  );

  // Section 21: load once on mount (localStorage does not exist during SSR)
  // and reconcile immediately against the CURRENT Menu response -- a stored
  // productId the current Menu no longer has at all (deleted/hidden) is
  // dropped outright, never blindly resubmitted.
  useEffect(() => {
    // `queueMicrotask` here is purely to satisfy eslint-plugin-react-hooks'
    // `set-state-in-effect` rule (same established pattern used elsewhere
    // in this repo, e.g. `MenuWorkspace`'s mount effect) -- it has nothing
    // to do with the reconciliation itself, which still runs essentially
    // immediately on mount.
    queueMicrotask(() => {
      const stored = loadCart(publicCode);
      const reconciled = stored.filter((item) => productById.has(item.productId));
      setCart(reconciled);
      if (reconciled.length !== stored.length) {
        saveCart(publicCode, reconciled);
      }
      setHasHydratedCart(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on mount/publicCode change, not on every productById identity change (that would fight the User's own in-progress edits).
  }, [publicCode]);

  // FT-5 critical fix: whenever the Cart no longer matches whatever payload
  // the persisted pending submission attempt (if any) was generated for,
  // drop that attempt -- the next "Place Order" must get a fresh
  // `clientRequestId` rather than reusing one that belonged to different
  // items/quantities (see `pending-order-attempt.ts`). Gated on
  // `hasHydratedCart` so this never fires against the transient initial
  // `cart === []` render BEFORE the real persisted Cart has loaded, which
  // would otherwise wipe out a still-valid pending attempt on every mount.
  useEffect(() => {
    if (!hasHydratedCart) return;
    const items = cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      modifierOptionIds: item.modifierOptionIds,
    }));
    if (!itemsMatchPendingAttempt(publicCode, items)) {
      clearPendingAttempt(publicCode);
    }
  }, [cart, publicCode, hasHydratedCart]);

  // Every Cart mutation goes through this one helper, which always reads
  // the LATEST `cart` state (via the functional `setState` form) and
  // persists the result -- safe even across rapid successive clicks.
  function updateCart(updater: (prev: StoredCartItem[]) => StoredCartItem[]) {
    setCart((prev) => {
      const next = updater(prev);
      saveCart(publicCode, next);
      return next;
    });
  }

  // FT-6A: Cart identity is (productId + selected modifierOptionIds), not
  // productId alone -- "Burger + Cheese" and "Burger + Bacon" are two
  // genuinely distinct lines. Every quantity control below keys off this
  // same `cartLineKey`, never `productId` in isolation.
  const quantityByLineKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      map.set(cartLineKey(item.productId, item.modifierOptionIds), item.quantity);
    }
    return map;
  }, [cart]);

  /** Adds one unit of `productId` with the given selections -- merges into an existing line with the SAME selections, otherwise starts a new distinct line. */
  function addLine(productId: string, modifierOptionIds: string[]) {
    const key = cartLineKey(productId, modifierOptionIds);
    updateCart((prev) => {
      const current = prev.find(
        (item) => cartLineKey(item.productId, item.modifierOptionIds) === key,
      );
      if (!current) {
        return [...prev, { productId, quantity: 1, modifierOptionIds }];
      }
      return prev.map((item) =>
        cartLineKey(item.productId, item.modifierOptionIds) === key
          ? { ...item, quantity: Math.min(item.quantity + 1, MAX_QUANTITY) }
          : item,
      );
    });
  }

  /** A Product with Modifier Groups always opens the options dialog first (never adds directly); one with none adds a plain no-selection line exactly like before FT-6A. */
  function handleAddClick(product: PublicMenuProduct) {
    if (product.modifierGroups.length > 0) {
      setOptionsDialogProduct(product);
      return;
    }
    addLine(product.id, []);
  }

  function handleConfirmOptions(selectedOptionIds: string[]) {
    if (!optionsDialogProduct) return;
    addLine(optionsDialogProduct.id, selectedOptionIds);
    setOptionsDialogProduct(null);
  }

  function handleIncrement(lineKey: string) {
    updateCart((prev) =>
      prev.map((item) =>
        cartLineKey(item.productId, item.modifierOptionIds) === lineKey
          ? { ...item, quantity: Math.min(item.quantity + 1, MAX_QUANTITY) }
          : item,
      ),
    );
  }

  function handleDecrement(lineKey: string) {
    updateCart((prev) =>
      prev
        .map((item) =>
          cartLineKey(item.productId, item.modifierOptionIds) === lineKey
            ? { ...item, quantity: item.quantity - 1 }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function handleRemove(lineKey: string) {
    updateCart((prev) =>
      prev.filter((item) => cartLineKey(item.productId, item.modifierOptionIds) !== lineKey),
    );
  }

  const cartLines: CartLine[] = cart
    .map((item) => {
      const product = productById.get(item.productId);
      if (!product) return null;

      // Resolve each selected Option's CURRENT display name/price for this
      // render -- an id the Menu no longer recognizes (Group/Option
      // deactivated or removed since being added) is simply omitted from
      // the display; the Cart line itself is left intact either way (the
      // Backend re-validates authoritatively at submission time and
      // rejects the whole Order with a guest-safe error if it's genuinely
      // no longer valid -- Section: Cart remains intact on that error).
      const selections: { groupName: string; optionName: string; priceAdjustment: string }[] = [];
      let modifiersMinorUnits = ZERO_MINOR_UNITS;
      for (const group of product.modifierGroups) {
        for (const option of group.options) {
          if (item.modifierOptionIds.includes(option.id)) {
            selections.push({
              groupName: group.name,
              optionName: option.name,
              priceAdjustment: option.priceAdjustment,
            });
            modifiersMinorUnits += toMinorUnits(option.priceAdjustment);
          }
        }
      }
      const unitPrice = fromMinorUnits(toMinorUnits(product.basePrice) + modifiersMinorUnits);

      return {
        lineKey: cartLineKey(item.productId, item.modifierOptionIds),
        productId: item.productId,
        quantity: item.quantity,
        modifierOptionIds: item.modifierOptionIds,
        name: product.name,
        unitPrice,
        selections,
        blocked: product.availability === 'SOLD_OUT',
      };
    })
    .filter((line): line is CartLine => line !== null);

  const orderableLines = cartLines.filter((line) => !line.blocked);
  const hasBlockedLines = cartLines.some((line) => line.blocked);
  const totalMinorUnits = orderableLines.reduce(
    (sum, line) => sum + lineTotalMinorUnits(line.unitPrice, line.quantity),
    ZERO_MINOR_UNITS,
  );
  const totalDisplay = fromMinorUnits(totalMinorUnits);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const canSubmit = cartLines.length > 0 && !hasBlockedLines && !isSubmitting;

  async function handlePlaceOrder() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setSubmitError(null);
    const items = orderableLines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      modifierOptionIds: line.modifierOptionIds,
    }));
    // FT-5 critical fix: reuse the SAME clientRequestId as any still-
    // pending attempt for this exact Cart payload (a retry after a lost
    // response, including across a refresh or an EN/AR navigation), or
    // generate+persist a fresh one -- never a brand-new id on every call,
    // which would silently defeat the Backend's idempotency guarantee on
    // the most important case (an ambiguous network failure).
    const clientRequestId = resolveClientRequestId(publicCode, items, generateUuid);
    const result = await submitGuestOrder(publicCode, clientRequestId, items);
    setIsSubmitting(false);

    if (result.outcome === 'success') {
      setConfirmedOrder(result.data);
      persistCartCleared();
      clearPendingAttempt(publicCode);
      return;
    }
    if (result.outcome === 'itemsUnavailable') {
      setSubmitError(copy.itemsUnavailableError);
      return;
    }
    if (result.outcome === 'notFound') {
      setSubmitError(copy.orderNotFoundError);
      return;
    }
    // Network/unexpected failure (Section: Backend may have actually
    // created the Order despite a lost response) -- the pending attempt is
    // deliberately left in place so an unchanged retry reuses this same
    // `clientRequestId` above.
    setSubmitError(copy.orderNetworkError);
  }

  function persistCartCleared() {
    setCart([]);
    saveCart(publicCode, []);
  }

  function closeCart() {
    setIsCartOpen(false);
    if (confirmedOrder) {
      setConfirmedOrder(null);
      setSubmitError(null);
    }
  }

  return (
    <div dir={dir} lang={data.locale.resolved} className="min-h-screen bg-[#F8F5F1] text-[#1D1A18]">
      <header className="sticky top-0 z-20 border-b border-[#E5DED6] bg-[#FCFBF9]/95 backdrop-blur">
        <div className={`${PAGE_CONTAINER} pt-5 pb-3`}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-[#1D1A18] sm:text-2xl">
                {data.context.restaurant.name}
              </h1>
              {data.context.table ? (
                <p className="mt-0.5 text-sm text-[#8A5138]">
                  {copy.table} {data.context.table.number}
                </p>
              ) : null}
            </div>
            <LanguageSwitcher
              available={data.locale.available}
              resolved={data.locale.resolved}
              publicCode={publicCode}
            />
          </div>

          {hasCategories ? (
            <nav
              aria-label={copy.categories}
              className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 [&::-webkit-scrollbar]:hidden"
            >
              {data.menu.categories.map((category) => (
                <a
                  key={category.id}
                  href={`#category-${category.id}`}
                  className="shrink-0 whitespace-nowrap rounded-full border border-[#E5DED6] bg-white px-3.5 py-1.5 text-sm font-medium text-[#302C29] transition-colors hover:border-[#7A5138] hover:text-[#7A5138] active:bg-[#F1ECE6]"
                >
                  {category.name}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <main className={`${PAGE_CONTAINER} pt-6 ${canOrder && cartCount > 0 ? 'pb-28' : 'pb-16'}`}>
        <div className="mb-8 border-b border-[#E5DED6] pb-6">
          <h2 className="text-xl font-bold text-[#1D1A18] sm:text-2xl">{data.menu.name}</h2>
          {data.menu.description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#655D56]">
              {data.menu.description}
            </p>
          ) : null}
        </div>

        {!hasCategories ? (
          <p className="rounded-md border border-[#E5DED6] bg-white px-4 py-6 text-center text-sm text-[#655D56]">
            {copy.noItemsInMenu}
          </p>
        ) : (
          <div className="divide-y divide-[#E5DED6]">
            {data.menu.categories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                currency={currency}
                copy={copy}
                canOrder={canOrder}
                quantityByLineKey={quantityByLineKey}
                onAddClick={handleAddClick}
                onIncrement={handleIncrement}
                onDecrement={handleDecrement}
              />
            ))}
          </div>
        )}
      </main>

      {canOrder && cartCount > 0 ? (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between gap-3 rounded-full bg-[#7A5138] px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#634127] sm:inset-x-auto sm:end-6 sm:min-w-[280px]"
        >
          <span>
            {copy.viewCart} · {cartCount}
          </span>
          <span dir="ltr">
            {totalDisplay} {currency}
          </span>
        </button>
      ) : null}

      {canOrder && (isCartOpen || confirmedOrder) ? (
        <CartDrawer
          copy={copy}
          currency={currency}
          dir={dir}
          lines={cartLines}
          totalDisplay={totalDisplay}
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
          submitError={submitError}
          confirmedOrder={confirmedOrder}
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
          onRemove={handleRemove}
          onPlaceOrder={() => void handlePlaceOrder()}
          onClose={closeCart}
        />
      ) : null}

      {optionsDialogProduct ? (
        <ProductOptionsDialog
          product={optionsDialogProduct}
          currency={currency}
          copy={copy}
          onCancel={() => setOptionsDialogProduct(null)}
          onConfirm={handleConfirmOptions}
        />
      ) : null}
    </div>
  );
}

function LanguageSwitcher({
  available,
  resolved,
  publicCode,
}: {
  available: string[];
  resolved: string;
  publicCode: string;
}) {
  if (available.length <= 1) return null;
  return (
    <div className="flex shrink-0 gap-0.5 rounded-full border border-[#E5DED6] bg-white p-1 text-xs">
      {available.map((locale) => {
        const isActive = locale === resolved;
        return (
          <Link
            key={locale}
            href={`/q/${publicCode}?lang=${locale}`}
            aria-current={isActive ? 'true' : undefined}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
              isActive ? 'bg-[#7A5138] text-white' : 'text-[#655D56] hover:text-[#302C29]'
            }`}
          >
            {LOCALE_LABELS[locale] ?? locale}
          </Link>
        );
      })}
    </div>
  );
}

function CategorySection({
  category,
  currency,
  copy,
  canOrder,
  quantityByLineKey,
  onAddClick,
  onIncrement,
  onDecrement,
}: {
  category: PublicMenuCategory;
  currency: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
  quantityByLineKey: Map<string, number>;
  onAddClick: (product: PublicMenuProduct) => void;
  onIncrement: (lineKey: string) => void;
  onDecrement: (lineKey: string) => void;
}) {
  const imageUrl = resolveAssetUrl(category.imageAssetPath);
  return (
    <section id={`category-${category.id}`} className="scroll-mt-36 py-8 first:pt-0">
      <div className="mb-4 flex items-center gap-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable static/local image.
          <img
            src={imageUrl}
            alt=""
            className="h-14 w-14 flex-shrink-0 rounded-lg border border-[#E5DED6] object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#1D1A18]">{category.name}</h3>
          {category.description ? (
            <p className="mt-0.5 text-sm text-[#655D56]">{category.description}</p>
          ) : null}
        </div>
      </div>

      {category.products.length === 0 ? (
        <p className="text-sm text-[#AFA397]">{copy.noItemsInCategory}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {category.products.map((product) => {
            // A Product with Modifier Groups can have several distinct
            // Cart lines at once (different selections) -- its card never
            // shows a single quantity stepper, only "Add" (which always
            // opens the options dialog). A Product with none has exactly
            // one possible line (empty selections), so the simple stepper
            // still applies unchanged from before FT-6A.
            const hasModifiers = product.modifierGroups.length > 0;
            const simpleLineKey = cartLineKey(product.id, []);
            return (
              <ProductCard
                key={product.id}
                product={product}
                currency={currency}
                copy={copy}
                canOrder={canOrder}
                hasModifiers={hasModifiers}
                quantity={hasModifiers ? 0 : (quantityByLineKey.get(simpleLineKey) ?? 0)}
                onAddClick={() => onAddClick(product)}
                onIncrement={() => onIncrement(simpleLineKey)}
                onDecrement={() => onDecrement(simpleLineKey)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProductCard({
  product,
  currency,
  copy,
  canOrder,
  hasModifiers,
  quantity,
  onAddClick,
  onIncrement,
  onDecrement,
}: {
  product: PublicMenuProduct;
  currency: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
  hasModifiers: boolean;
  quantity: number;
  onAddClick: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const imageUrl = resolveAssetUrl(product.primaryImageAssetPath);
  const isSoldOut = product.availability === 'SOLD_OUT';

  return (
    <article className="flex gap-4 rounded-xl border border-[#E5DED6] bg-white p-3.5 shadow-sm">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- see CategorySection above.
        <img
          src={imageUrl}
          alt=""
          className={`h-24 w-24 flex-shrink-0 rounded-lg object-cover ${isSoldOut ? 'opacity-60' : ''}`}
        />
      ) : (
        <span className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-[#F1ECE6] text-[#AFA397]">
          <IconImage className="h-7 w-7" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <h4 className={`text-base font-semibold ${isSoldOut ? 'text-[#8A8177]' : 'text-[#1D1A18]'}`}>
          {product.name}
        </h4>
        {product.description ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-[#655D56]">
            {product.description}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-base font-bold text-[#302C29]">
            {/* FT-3B micro fix: the price+currency pair must always read as
                one stable "100.00 EGP" LTR unit, in both English and Arabic
                -- `<bdi dir="ltr">` isolates it from the surrounding RTL
                bidi context so it never visually reorders, while the outer
                `<span>` still flows with the card's natural RTL layout. */}
            <bdi dir="ltr">
              {product.basePrice} {currency}
            </bdi>
          </span>
          {product.featured && !isSoldOut ? (
            <span className="rounded-full bg-[#F1ECE6] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#7A5138]">
              {copy.featured}
            </span>
          ) : null}
          {isSoldOut ? (
            <span className="rounded-full bg-[#F6E4DE] px-2 py-0.5 text-xs font-medium text-[#8A3B24]">
              {copy.soldOut}
            </span>
          ) : null}
        </div>

        {/* Section 3/18/24: ordering controls exist ONLY for a TABLE QR and
            an AVAILABLE Product -- a GENERIC QR or a SOLD_OUT Product never
            renders any Add/quantity control at all. */}
        {canOrder && !isSoldOut ? (
          <div className="mt-2">
            {/* A Product with Modifier Groups always shows a plain "Add"
                button that opens the options dialog -- per-line quantity
                for it lives only in the Cart (each distinct selection is
                its own line there), never a single stepper here. */}
            {hasModifiers || quantity === 0 ? (
              <button
                type="button"
                onClick={onAddClick}
                className="rounded-full border border-[#7A5138] px-4 py-1.5 text-sm font-semibold text-[#7A5138] transition-colors hover:bg-[#7A5138] hover:text-white"
              >
                {copy.add}
              </button>
            ) : (
              <div className="inline-flex items-center gap-3 rounded-full border border-[#E5DED6] bg-[#F8F5F1] px-1 py-1">
                <button
                  type="button"
                  onClick={onDecrement}
                  aria-label={copy.remove}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#7A5138] shadow-sm"
                >
                  −
                </button>
                <span className="min-w-[1.5rem] text-center text-sm font-semibold">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={onIncrement}
                  aria-label={copy.add}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#7A5138] shadow-sm"
                >
                  +
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
