'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GuestIconInfo } from '../../../components/guest/icons';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import { getPublicMenuCopy } from '../../../lib/public-menu/copy';
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
  payloadMatchesPendingAttempt,
  resolveClientRequestId,
  type PendingOrderCheckout,
} from '../../../lib/public-menu/pending-order-attempt';
import { matchesSearch, normalizeForSearch } from '../../../lib/public-menu/search';
import { generateUuid } from '../../../lib/public-menu/uuid';
import type {
  GuestOrderView,
  PublicMenuData,
  PublicMenuProduct,
} from '../../../lib/public-menu/types';
import { CartBar } from './CartBar';
import { CartPanel } from './CartPanel';
import { CompactBar, GuestHeader } from './GuestHeader';
import type {
  CartLine,
  CheckoutFieldKey,
  Fulfillment,
  OrderingContextView,
} from './guest-view-types';
import { MenuNav } from './MenuNav';
import { MenuSections } from './MenuSections';
import { ProductSheet } from './ProductSheet';
import { useMenuNavigation } from './useMenuNavigation';

const MAX_QUANTITY = 99;

/**
 * The Guest Menu (FT-3/FT-5, redesigned FT-13A): brand block, ordering-context
 * ticket, sticky category navigation with search, the menu itself, and -- for
 * any QR with something orderable -- the cart/checkout.
 *
 * This component owns the state and the business wiring (Cart identity,
 * checkout fields, Branch/zone resolution, idempotent submission); everything
 * visual lives in the small components it composes. It is a Client Component
 * because the Cart needs React state, localStorage and a browser `fetch`;
 * Next.js still server-renders the first paint.
 *
 * `dir` is set on this component's own root, not the document `<html>` (shared
 * with Staff) -- everything inside mirrors for Arabic through logical
 * utilities only.
 */
export function PublicMenuView({ data, publicCode }: { data: PublicMenuData; publicCode: string }) {
  const dir = data.locale.resolved === 'ar' ? 'rtl' : 'ltr';
  const currency = data.context.restaurant.currencyCode;
  const logoUrl = resolveAssetUrl(data.context.restaurant.logoAssetPath);
  const copy = getPublicMenuCopy(data.locale.resolved);
  const hasCategories = data.menu.categories.length > 0;
  // FT-7/FT-8: a TABLE QR orders exactly as before (DINE_IN); a GENERIC QR
  // orders for Pickup or Delivery, each only while at least one Branch is
  // eligible for it (Delivery: an ACTIVE Branch with an ACTIVE zone).
  const isGenericQr = data.context.qrType === 'GENERIC';
  const pickupBranches = useMemo(
    () => data.context.pickupBranches ?? [],
    [data.context.pickupBranches],
  );
  const deliveryBranches = useMemo(
    () => data.context.deliveryBranches ?? [],
    [data.context.deliveryBranches],
  );
  const pickupAvailable = pickupBranches.length > 0;
  const deliveryAvailable = deliveryBranches.length > 0;
  const canOrder = !isGenericQr || pickupAvailable || deliveryAvailable;

  const orderingContext: OrderingContextView = {
    kind: isGenericQr ? 'GENERIC' : 'TABLE',
    tableNumber: data.context.table?.number ?? null,
    branchName: data.context.branch?.name ?? null,
    pickupAvailable,
    deliveryAvailable,
  };

  const { productById, categoryIdByProductId } = useMemo(() => {
    const products = new Map<string, PublicMenuProduct>();
    const categoryIds = new Map<string, string>();
    for (const category of data.menu.categories) {
      for (const product of category.products) {
        products.set(product.id, product);
        categoryIds.set(product.id, category.id);
      }
    }
    return { productById: products, categoryIdByProductId: categoryIds };
  }, [data.menu.categories]);

  // ---- search (client-side, over the already-loaded Menu) ----
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedQuery = normalizeForSearch(query);
  const isSearching = searchOpen && normalizedQuery !== '';
  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const product of productById.values()) {
      index.set(product.id, normalizeForSearch(`${product.name} ${product.description ?? ''}`));
    }
    return index;
  }, [productById]);
  const visibleCategories = useMemo(() => {
    if (!isSearching) return data.menu.categories;
    return data.menu.categories
      .map((category) => ({
        ...category,
        products: category.products.filter((product) =>
          matchesSearch(searchIndex.get(product.id) ?? '', normalizedQuery),
        ),
      }))
      .filter((category) => category.products.length > 0);
  }, [data.menu.categories, isSearching, normalizedQuery, searchIndex]);
  const searchResultCount = visibleCategories.reduce(
    (sum, category) => sum + category.products.length,
    0,
  );

  const navigation = useMenuNavigation(
    data.menu.categories.map((category) => category.id),
    isSearching,
  );

  const [cart, setCart] = useState<StoredCartItem[]>([]);
  const [hasHydratedCart, setHasHydratedCart] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<GuestOrderView | null>(null);
  // FT-7/FT-8 checkout state -- kept here (not inside the Cart panel) so it
  // survives closing/reopening the panel and a failed submission.
  const [requestedFulfillment, setRequestedFulfillment] = useState<Fulfillment>('PICKUP');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<CheckoutFieldKey, string>>({
    customerName: '',
    customerPhone: '',
    customerNotes: '',
    deliveryAddress: '',
    deliveryBuilding: '',
    deliveryFloor: '',
    deliveryApartment: '',
    deliveryLandmark: '',
  });
  // The mode actually in effect: the Guest's choice while it is available,
  // otherwise whichever mode is (a Restaurant with only Delivery, say).
  const fulfillment: Fulfillment = !isGenericQr
    ? 'PICKUP'
    : requestedFulfillment === 'DELIVERY' && deliveryAvailable
      ? 'DELIVERY'
      : pickupAvailable
        ? 'PICKUP'
        : 'DELIVERY';
  const isDelivery = isGenericQr && fulfillment === 'DELIVERY';
  // One eligible Branch auto-resolves; several require the Guest's own choice.
  const eligibleBranches = isDelivery ? deliveryBranches : pickupBranches;
  const resolvedBranchId =
    eligibleBranches.length === 1
      ? eligibleBranches[0].id
      : eligibleBranches.some((branch) => branch.id === selectedBranchId)
        ? selectedBranchId
        : null;
  // Delivery area: only zones of the resolved Branch; a single zone is chosen for the Guest.
  const zones = isDelivery
    ? (deliveryBranches.find((branch) => branch.id === resolvedBranchId)?.zones ?? [])
    : [];
  const resolvedZoneId =
    zones.length === 1
      ? zones[0].id
      : zones.some((zone) => zone.id === selectedZoneId)
        ? selectedZoneId
        : null;
  const selectedZone = zones.find((zone) => zone.id === resolvedZoneId) ?? null;
  const checkout: PendingOrderCheckout | null = isGenericQr
    ? {
        fulfillment,
        branchId: resolvedBranchId,
        customerName: fields.customerName,
        customerPhone: fields.customerPhone,
        customerNotes: fields.customerNotes,
        deliveryZoneId: isDelivery ? resolvedZoneId : null,
        // A Pickup attempt never carries delivery text (typed earlier, then switched away from).
        deliveryAddress: isDelivery ? fields.deliveryAddress : '',
        deliveryBuilding: isDelivery ? fields.deliveryBuilding : '',
        deliveryFloor: isDelivery ? fields.deliveryFloor : '',
        deliveryApartment: isDelivery ? fields.deliveryApartment : '',
        deliveryLandmark: isDelivery ? fields.deliveryLandmark : '',
      }
    : null;
  // A stable primitive for effect dependencies (the object above is new every render).
  const checkoutKey = JSON.stringify(checkout);
  // The Product open in the customizer sheet -- null means no sheet is open.
  // Any available Product can open it (it shows the dish and a quantity); a
  // Product with Modifier Groups always opens it before adding.
  const [sheetProduct, setSheetProduct] = useState<PublicMenuProduct | null>(null);

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
    const currentCheckout = JSON.parse(checkoutKey) as PendingOrderCheckout | null;
    if (!payloadMatchesPendingAttempt(publicCode, items, currentCheckout)) {
      clearPendingAttempt(publicCode);
    }
  }, [cart, publicCode, hasHydratedCart, checkoutKey]);

  // Every Cart mutation goes through this one helper, which always reads
  // the LATEST `cart` state (via the functional `setState` form) and
  // persists the result -- safe even across rapid successive clicks.
  // (Stable identity: the memoized menu below depends on the handlers.)
  const updateCart = useCallback(
    (updater: (prev: StoredCartItem[]) => StoredCartItem[]) => {
      setCart((prev) => {
        const next = updater(prev);
        saveCart(publicCode, next);
        return next;
      });
    },
    [publicCode],
  );

  // FT-6A: Cart identity is (productId + selected modifierOptionIds), not
  // productId alone -- "Burger + Cheese" and "Burger + Bacon" are two
  // genuinely distinct lines. Every quantity control keys off this same
  // `cartLineKey`, never `productId` in isolation.
  const { simpleQuantityByProductId, totalQuantityByProductId } = useMemo(() => {
    const simple = new Map<string, number>();
    const total = new Map<string, number>();
    for (const item of cart) {
      total.set(item.productId, (total.get(item.productId) ?? 0) + item.quantity);
      if (item.modifierOptionIds.length === 0) simple.set(item.productId, item.quantity);
    }
    return { simpleQuantityByProductId: simple, totalQuantityByProductId: total };
  }, [cart]);

  /** Adds `quantity` of `productId` with the given selections -- merges into an existing line with the SAME selections, otherwise starts a new distinct line. */
  const addLine = useCallback(
    (productId: string, modifierOptionIds: string[], quantity = 1) => {
      const key = cartLineKey(productId, modifierOptionIds);
      updateCart((prev) => {
        const current = prev.find(
          (item) => cartLineKey(item.productId, item.modifierOptionIds) === key,
        );
        if (!current) {
          return [
            ...prev,
            { productId, quantity: Math.min(quantity, MAX_QUANTITY), modifierOptionIds },
          ];
        }
        return prev.map((item) =>
          cartLineKey(item.productId, item.modifierOptionIds) === key
            ? { ...item, quantity: Math.min(item.quantity + quantity, MAX_QUANTITY) }
            : item,
        );
      });
    },
    [updateCart],
  );

  /** The card's quick-add: a Product with Modifier Groups never adds blindly (it opens the sheet); one with none adds a plain no-selection line. */
  const handleQuickAdd = useCallback(
    (product: PublicMenuProduct) => {
      if (product.modifierGroups.length > 0) {
        setSheetProduct(product);
        return;
      }
      addLine(product.id, []);
    },
    [addLine, setSheetProduct],
  );

  const handleOpenProduct = useCallback(
    (product: PublicMenuProduct) => setSheetProduct(product),
    [setSheetProduct],
  );

  function handleConfirmOptions(selectedOptionIds: string[], quantity: number) {
    if (!sheetProduct) return;
    addLine(sheetProduct.id, selectedOptionIds, quantity);
    setSheetProduct(null);
  }

  const handleIncrement = useCallback(
    (lineKey: string) => {
      updateCart((prev) =>
        prev.map((item) =>
          cartLineKey(item.productId, item.modifierOptionIds) === lineKey
            ? { ...item, quantity: Math.min(item.quantity + 1, MAX_QUANTITY) }
            : item,
        ),
      );
    },
    [updateCart],
  );

  const handleDecrement = useCallback(
    (lineKey: string) => {
      updateCart((prev) =>
        prev
          .map((item) =>
            cartLineKey(item.productId, item.modifierOptionIds) === lineKey
              ? { ...item, quantity: item.quantity - 1 }
              : item,
          )
          .filter((item) => item.quantity > 0),
      );
    },
    [updateCart],
  );

  function handleRemove(lineKey: string) {
    updateCart((prev) =>
      prev.filter((item) => cartLineKey(item.productId, item.modifierOptionIds) !== lineKey),
    );
  }

  // The product cards only ever touch the no-selection line of a simple product.
  const handleCardIncrement = useCallback(
    (productId: string) => handleIncrement(cartLineKey(productId, [])),
    [handleIncrement],
  );
  const handleCardDecrement = useCallback(
    (productId: string) => handleDecrement(cartLineKey(productId, [])),
    [handleDecrement],
  );
  const handleClearSearch = useCallback(() => setQuery(''), []);

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
        lineTotal: fromMinorUnits(lineTotalMinorUnits(unitPrice, item.quantity)),
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
  // FT-8 display-only breakdown (exact BigInt minor units). The Backend
  // recomputes the fee, minimum and total from the zone row on submit.
  const deliveryFeeMinorUnits = selectedZone
    ? toMinorUnits(selectedZone.deliveryFee)
    : ZERO_MINOR_UNITS;
  const deliveryFeeDisplay = fromMinorUnits(deliveryFeeMinorUnits);
  const grandTotalDisplay = fromMinorUnits(totalMinorUnits + deliveryFeeMinorUnits);
  const belowMinimum =
    selectedZone !== null && totalMinorUnits < toMinorUnits(selectedZone.minimumOrder);
  const minimumMessage =
    selectedZone !== null && belowMinimum
      ? copy.minimumOrderMessage(selectedZone.name, selectedZone.minimumOrder, currency)
      : null;
  const minimumShortfallDisplay =
    selectedZone !== null && belowMinimum
      ? copy.minimumShortfall(
          fromMinorUnits(toMinorUnits(selectedZone.minimumOrder) - totalMinorUnits),
          currency,
        )
      : null;
  const checkoutDetailsComplete =
    !isGenericQr ||
    (resolvedBranchId !== null &&
      fields.customerName.trim() !== '' &&
      fields.customerPhone.trim() !== '' &&
      (!isDelivery ||
        (resolvedZoneId !== null && fields.deliveryAddress.trim() !== '' && !belowMinimum)));
  const canSubmit =
    cartLines.length > 0 && !hasBlockedLines && !isSubmitting && checkoutDetailsComplete;
  // Why the primary action is unavailable, in words (shown instead of a silently greyed button).
  const submitHint = hasBlockedLines
    ? copy.placeOrderHintBlocked
    : !checkoutDetailsComplete && !belowMinimum
      ? isDelivery
        ? copy.deliveryDetailsRequiredError
        : copy.pickupDetailsRequiredError
      : null;

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
    const clientRequestId = resolveClientRequestId(publicCode, items, checkout, generateUuid);
    const result = await submitGuestOrder(publicCode, clientRequestId, items, checkout);
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
    if (result.outcome === 'pickupDetailsRequired') {
      setSubmitError(
        isDelivery ? copy.deliveryDetailsRequiredError : copy.pickupDetailsRequiredError,
      );
      return;
    }
    if (result.outcome === 'deliveryDetailsRequired') {
      setSubmitError(copy.deliveryDetailsRequiredError);
      return;
    }
    if (result.outcome === 'deliveryZoneInvalid') {
      setSubmitError(copy.deliveryAreaError);
      return;
    }
    if (result.outcome === 'deliveryUnavailable') {
      setSubmitError(copy.deliveryUnavailable);
      return;
    }
    if (result.outcome === 'minimumNotMet') {
      setSubmitError(
        copy.minimumOrderMessage(
          result.zoneName ?? selectedZone?.name ?? '',
          result.minimumOrder ?? selectedZone?.minimumOrder ?? '',
          currency,
        ),
      );
      return;
    }
    if (result.outcome === 'pickupBranchInvalid') {
      setSubmitError(isDelivery ? copy.deliveryAreaError : copy.pickupBranchError);
      return;
    }
    if (result.outcome === 'pickupUnavailable') {
      setSubmitError(copy.pickupUnavailable);
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

  const showCartBar = canOrder && cartCount > 0;
  const sheetCategoryId = sheetProduct ? (categoryIdByProductId.get(sheetProduct.id) ?? '') : '';

  return (
    <div
      dir={dir}
      lang={data.locale.resolved}
      className="guest-root min-h-dvh bg-guest-paper text-guest-ink"
    >
      <CompactBar
        visible={navigation.compact}
        restaurantName={data.context.restaurant.name}
        logoUrl={logoUrl}
        context={orderingContext}
        copy={copy}
        locale={data.locale}
        publicCode={publicCode}
      />

      <GuestHeader
        sentinelRef={navigation.headerRef}
        restaurantName={data.context.restaurant.name}
        logoUrl={logoUrl}
        menuName={data.menu.name}
        menuDescription={data.menu.description}
        context={orderingContext}
        copy={copy}
        locale={data.locale}
        publicCode={publicCode}
      />

      {hasCategories ? (
        <MenuNav
          categories={data.menu.categories}
          activeId={navigation.activeId}
          onSelect={navigation.select}
          compact={navigation.compact}
          searchOpen={searchOpen}
          query={query}
          onSearchOpen={() => setSearchOpen(true)}
          onSearchClose={() => {
            setSearchOpen(false);
            setQuery('');
          }}
          onQueryChange={setQuery}
          copy={copy}
        />
      ) : null}

      <main className={`px-4 pt-6 sm:px-6 sm:pt-8 lg:px-10 ${showCartBar ? 'pb-36' : 'pb-16'}`}>
        <div className="mx-auto max-w-[1180px]">
          {!canOrder ? (
            <p className="mb-6 flex items-start gap-3 rounded-2xl border border-guest-line bg-guest-surface px-4 py-3.5 text-[0.95rem] leading-relaxed text-guest-ink-soft">
              <GuestIconInfo className="mt-0.5 size-5 shrink-0 text-guest-pine" />
              {copy.pickupUnavailable}
            </p>
          ) : null}

          {isSearching && searchResultCount > 0 ? (
            <p role="status" className="mb-4 text-sm font-semibold text-guest-muted">
              {copy.searchResultsCount(searchResultCount)}
            </p>
          ) : null}

          <MenuSections
            categories={visibleCategories}
            menuCategoryCount={data.menu.categories.length}
            currency={currency}
            copy={copy}
            canOrder={canOrder}
            searchQuery={isSearching ? query : ''}
            simpleQuantityByProductId={simpleQuantityByProductId}
            totalQuantityByProductId={totalQuantityByProductId}
            onOpen={handleOpenProduct}
            onQuickAdd={handleQuickAdd}
            onIncrement={handleCardIncrement}
            onDecrement={handleCardDecrement}
            onClearSearch={handleClearSearch}
          />
        </div>
      </main>

      {showCartBar ? (
        <CartBar
          count={cartCount}
          totalDisplay={totalDisplay}
          currency={currency}
          copy={copy}
          onOpen={() => setIsCartOpen(true)}
        />
      ) : null}

      {canOrder && (isCartOpen || confirmedOrder) ? (
        <CartPanel
          copy={copy}
          currency={currency}
          dir={dir}
          context={orderingContext}
          lines={cartLines}
          totalDisplay={totalDisplay}
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
          submitError={submitError}
          submitHint={submitHint}
          confirmedOrder={confirmedOrder}
          checkout={
            isGenericQr
              ? {
                  fulfillment,
                  pickupAvailable,
                  deliveryAvailable,
                  onFulfillmentChange: (next) => {
                    setRequestedFulfillment(next);
                    // Branch/zone lists differ per mode -- the Guest re-chooses if needed.
                    setSelectedBranchId(null);
                    setSelectedZoneId(null);
                  },
                  branches: eligibleBranches.map((branch) => ({
                    id: branch.id,
                    name: branch.name,
                  })),
                  branchId: resolvedBranchId,
                  onBranchChange: (branchId) => {
                    setSelectedBranchId(branchId);
                    setSelectedZoneId(null);
                  },
                  zones,
                  zoneId: resolvedZoneId,
                  onZoneChange: setSelectedZoneId,
                  fields,
                  onFieldChange: (key, value) => setFields((prev) => ({ ...prev, [key]: value })),
                  subtotalDisplay: totalDisplay,
                  deliveryFeeDisplay: isDelivery && selectedZone ? deliveryFeeDisplay : null,
                  grandTotalDisplay: isDelivery ? grandTotalDisplay : totalDisplay,
                  minimumMessage,
                  minimumShortfallDisplay,
                }
              : null
          }
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
          onRemove={handleRemove}
          onPlaceOrder={() => void handlePlaceOrder()}
          onClose={closeCart}
        />
      ) : null}

      {sheetProduct ? (
        <ProductSheet
          key={sheetProduct.id}
          product={sheetProduct}
          categoryId={sheetCategoryId}
          currency={currency}
          copy={copy}
          dir={dir}
          onCancel={() => setSheetProduct(null)}
          onConfirm={handleConfirmOptions}
        />
      ) : null}
    </div>
  );
}
