'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GuestIconInfo } from '../../../components/guest/icons';
import { GuestLocaleProvider } from '../../../components/guest/GuestLocale';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import { getPublicMenuCopy } from '../../../lib/public-menu/copy';
import {
  cartLineKey,
  loadCart,
  offerLineIdentity,
  saveCart,
  storedItemKey,
  type StoredCartItem,
} from '../../../lib/public-menu/cart-storage';
import {
  MAX_OFFER_QUANTITY,
  OFFERS_SECTION_ID,
  resolveOfferLine,
  type OfferPick,
} from '../../../lib/public-menu/offers';
import { extraLabel, getOffersCopy } from '../../../lib/public-menu/offers-copy';
import { OfferSheet } from './OfferSheet';
import { OffersStrip } from './OffersStrip';
import {
  lineTotalMinorUnits,
  fromMinorUnits,
  toMinorUnits,
  ZERO_MINOR_UNITS,
} from '../../../lib/public-menu/money';
import { getTableOrdering, submitGuestOrder } from '../../../lib/public-menu/orders-api';
import { TableClosedNotice, type OrderingRecheckStatus } from './TableClosedNotice';
import {
  clearPendingAttempt,
  payloadMatchesPendingAttempt,
  resolveClientRequestId,
  type PendingOrderCheckout,
  type PendingOrderItem,
} from '../../../lib/public-menu/pending-order-attempt';
import { currencyLabel, formatAmount } from '../../../lib/public-menu/price-format';
import { matchesSearch, normalizeForSearch } from '../../../lib/public-menu/search';
import { generateUuid } from '../../../lib/public-menu/uuid';
import type {
  GuestOrderView,
  PublicMenuData,
  PublicMenuProduct,
  PublicOffer,
} from '../../../lib/public-menu/types';
import { CartBar } from './CartBar';
import { CartPanel } from './CartPanel';
import { CategoryChips, type ChipItem } from './CategoryChips';
import { FeaturedBanners } from './FeaturedBanners';
import { AnnouncementBar } from './AnnouncementBar';
import {
  submitWhatsappOrder,
  type SubmitGuestOrderItem,
  type SubmitGuestOrderResult,
  type WhatsappOrderView,
} from '../../../lib/public-menu/orders-api';
import { TrackOrderSheet } from './TrackOrderSheet';
import { useCheckoutValidation } from './useCheckoutValidation';
import { sanitizeWhileTyping } from '../../../lib/public-menu/checkout-validation';
import { fetchSuggestions } from '../../../lib/public-menu/suggestions';
import { readTrackedOrders, rememberOrder } from '../../../lib/public-menu/tracking';
import { WaytaLockup } from '../../../components/brand/Wayta';
import { GuestContact } from './GuestContact';
import { GuestHero, type GuestHeroProps } from './GuestHero';
import {
  GuestHeroCentered,
  GuestHeroCompact,
  GuestHeroEditorial,
  GuestHeroFloating,
} from './GuestHeroVariants';
import type {
  CartLine,
  CheckoutFieldKey,
  DesignOffers,
  Fulfillment,
  OrderingContextView,
} from './guest-view-types';
import { DEFAULT_MENU_TEMPLATE, layoutOf, type MenuTemplate } from '../../../lib/public-menu/templates';
import {
  DEFAULT_EMBER_SETTINGS,
  EMBER_DESIGN_PREVIEW_READY,
  isEmberPreviewUpdate,
  normalizeEmberTemplateSettings,
  type EmberTemplateSettings,
} from '../../../lib/public-menu/ember-settings';
import { GuestHeroEmber } from './GuestHeroEmber';
import { GuestHeroBloom } from './GuestHeroBloom';
import { GuestHeroBrew } from './GuestHeroBrew';
import dynamic from 'next/dynamic';
import { DEFAULT_VERDE_SETTINGS, normalizeVerdeSettings, type VerdeMenuSettings } from '../../../lib/public-menu/verde-settings';
import { VERDE_DESIGN_PREVIEW_READY, isVerdePreviewUpdate } from '../../../lib/public-menu/verde-preview';

// Loaded on demand: other Restaurants' menus never download the VERDE renderer, its CSS or its fonts.
const VerdeMenu = dynamic(() => import('./verde/VerdeMenu').then((module) => module.VerdeMenu));
import { DEFAULT_SHERBINY_SETTINGS, normalizeSherbinySettings, type SherbinyMenuSettings } from '../../../lib/public-menu/sherbiny-settings';
import { SHERBINY_DESIGN_PREVIEW_READY, isSherbinyPreviewUpdate } from '../../../lib/public-menu/sherbiny-preview';
// Same on-demand rule for the El Sherbiny renderer (its CSS and Arabic font stay out of every other menu).
const SherbinyMenu = dynamic(() => import('./sherbiny/SherbinyMenu').then((module) => module.SherbinyMenu));
import { DEFAULT_MAKKBOZ_SETTINGS, normalizeMakkbozSettings, type MakkbozMenuSettings } from '../../../lib/public-menu/makkboz-settings';
import { MAKKBOZ_DESIGN_PREVIEW_READY, isMakkbozPreviewUpdate } from '../../../lib/public-menu/makkboz-preview';
const MakkbozMenu = dynamic(() => import('./makkboz/MakkbozMenu').then((module) => module.MakkbozMenu));
import { DEFAULT_MEAT_LOVERS_SETTINGS, normalizeMeatLoversSettings, type MeatLoversMenuSettings } from '../../../lib/public-menu/meat-lovers-settings';
import { MEAT_LOVERS_DESIGN_PREVIEW_READY, isMeatLoversPreviewUpdate } from '../../../lib/public-menu/meat-lovers-preview';
const MeatLoversMenu = dynamic(() => import('./meat-lovers/MeatLoversMenu').then((module) => module.MeatLoversMenu));
import {DEFAULT_BREW_SETTINGS,BREW_DESIGN_PREVIEW_READY,isBrewPreviewUpdate,normalizeBrewTemplateSettings,type BrewTemplateSettings} from '../../../lib/public-menu/brew-settings';
import {DEFAULT_EDITORIAL_SETTINGS, EDITORIAL_DESIGN_PREVIEW_READY, isEditorialPreviewUpdate, normalizeEditorialTemplateSettings,type EditorialTemplateSettings} from '../../../lib/public-menu/editorial-settings';
import {
  DEFAULT_BLOOM_SETTINGS,
  BLOOM_DESIGN_PREVIEW_READY,
  isBloomPreviewUpdate,
  normalizeBloomTemplateSettings,
  type BloomTemplateSettings,
} from '../../../lib/public-menu/bloom-settings';
import { MenuSections } from './MenuSections';
import { ModeSwitch } from './ModeSwitch';
import { ProductSheet } from './ProductSheet';
import { SearchField } from './SearchField';
import { FEATURED_SECTION_ID, useMenuNavigation } from './useMenuNavigation';

const MAX_QUANTITY = 99;

/**
 * The Guest Menu (FT-3/FT-5, FT-13A architecture, FT-13B "Ember & Saffron" look): the hero,
 * the ordering-mode switch and search, sticky category chips, the featured banners, the menu
 * itself and -- for any QR with something orderable -- the cart/checkout.
 *
 * This component owns the state and the business wiring (Cart identity, checkout fields,
 * Branch/zone resolution, idempotent submission); everything visual lives in the small
 * components it composes. It is a Client Component because the Cart needs React state,
 * localStorage and a browser `fetch`; Next.js still server-renders the first paint. The
 * theme (`data-guest-theme`) comes from the /q layout, so it is already right on first paint.
 *
 * `dir` is set on this component's own root, not the document `<html>` (shared with Staff)
 * -- everything inside mirrors for Arabic through logical utilities only.
 */
export function PublicMenuView({
  data,
  publicCode,
  template = DEFAULT_MENU_TEMPLATE,
  designPreview = false,
  exclusiveRendererKey,
  guestTheme = null,
}: {
  data: PublicMenuData;
  publicCode: string;
  /** How the menu is laid out (DEC-044); presentation only. */
  template?: MenuTemplate;
  /** Explicit staff-frame preview flag; the server never returns draft settings. */
  designPreview?: boolean;
  /** Backend-resolved private renderer; must never be selected by public URL. */
  exclusiveRendererKey?: 'VERDE_NAPOLI_V1' | 'SHERBINY_FIRE_DOUGH_V1' | 'MAKKBOZ_HERITAGE_V1' | 'MEAT_LOVERS_BUTCHER_V1';
  /** The guest's saved light / dark pick (cookie), read on the server; null = never chose. */
  guestTheme?: 'light' | 'dark' | null;
}) {
  const router = useRouter();
  const locale = data.locale.resolved;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const currency = data.context.restaurant.currencyCode;
  const logoUrl = resolveAssetUrl(data.context.restaurant.logoAssetPath);
  const coverUrl = resolveAssetUrl(data.context.restaurant.coverAssetPath);
  const copy = getPublicMenuCopy(locale);
  const [emberLiveDraft, setEmberLiveDraft] = useState<EmberTemplateSettings | null>(null);
  useEffect(() => {
    if (!designPreview || template !== 'ember' || window.parent === window) return;
    const onDraftMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin ||
          event.source !== window.parent ||
          !isEmberPreviewUpdate(event.data)) return;
      // Treat messages as untrusted display data; normalize the allowlisted
      // palette, motion, localized copy and server-owned image asset path.
      setEmberLiveDraft(normalizeEmberTemplateSettings(event.data.settings));
    };
    window.addEventListener('message', onDraftMessage);
    // Child -> parent handshake covers hydration after iframe load.
    window.parent.postMessage({ type: EMBER_DESIGN_PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener('message', onDraftMessage);
  }, [designPreview, template]);
  const emberSettings = designPreview && template === 'ember' && emberLiveDraft
    ? emberLiveDraft
    : data.context.restaurant.emberSettings ?? DEFAULT_EMBER_SETTINGS;
  const [bloomLiveDraft, setBloomLiveDraft] = useState<BloomTemplateSettings | null>(null);
  useEffect(() => {
    if (!designPreview || template !== 'bloom' || window.parent === window) return;
    const onBloomDraft = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent ||
          !isBloomPreviewUpdate(event.data)) return;
      setBloomLiveDraft(normalizeBloomTemplateSettings(event.data.settings));
    };
    window.addEventListener('message', onBloomDraft);
    window.parent.postMessage({ type: BLOOM_DESIGN_PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener('message', onBloomDraft);
  }, [designPreview, template]);
  const bloomSettings = designPreview && template === 'bloom' && bloomLiveDraft
    ? bloomLiveDraft
    : data.context.restaurant.bloomSettings ?? DEFAULT_BLOOM_SETTINGS;
  const [brewLiveDraft,setBrewLiveDraft]=useState<BrewTemplateSettings|null>(null);
  useEffect(()=>{
    if(!designPreview||template!=='brew'||window.parent===window)return;
    const listen=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin||event.source!==window.parent||!isBrewPreviewUpdate(event.data))return;
      setBrewLiveDraft(normalizeBrewTemplateSettings(event.data.settings));
    };
    window.addEventListener('message',listen);
    window.parent.postMessage({type:BREW_DESIGN_PREVIEW_READY},window.location.origin);
    return ()=>window.removeEventListener('message',listen);
  },[designPreview,template]);
  const brewSettings=designPreview&&template==='brew'&&brewLiveDraft?brewLiveDraft:data.context.restaurant.brewSettings??DEFAULT_BREW_SETTINGS;
  const [editorialLiveDraft,setEditorialLiveDraft]=useState<EditorialTemplateSettings|null>(null);
  useEffect(()=>{
    if(!designPreview||template!=='editorial'||window.parent===window)return;
    const handlePreview=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin || event.source!==window.parent || !isEditorialPreviewUpdate(event.data))return;
      setEditorialLiveDraft(normalizeEditorialTemplateSettings(event.data.settings));
    };
    window.addEventListener('message',handlePreview);
    window.parent.postMessage({type:EDITORIAL_DESIGN_PREVIEW_READY},window.location.origin);
    return()=>window.removeEventListener('message',handlePreview);
  },[designPreview,template]);
  const editorialSettings=designPreview&&template==='editorial'&&editorialLiveDraft
    ? editorialLiveDraft : data.context.restaurant.editorialSettings??DEFAULT_EDITORIAL_SETTINGS;
  const isVerde = exclusiveRendererKey === 'VERDE_NAPOLI_V1';
  const [verdeLiveDraft, setVerdeLiveDraft] = useState<VerdeMenuSettings | null>(null);
  useEffect(() => {
    if (!designPreview || !isVerde || window.parent === window) return;
    const listen = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || !isVerdePreviewUpdate(event.data)) return;
      setVerdeLiveDraft(normalizeVerdeSettings(event.data.settings));
    };
    window.addEventListener('message', listen);
    window.parent.postMessage({ type: VERDE_DESIGN_PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener('message', listen);
  }, [designPreview, isVerde]);
  const verdeSettings: VerdeMenuSettings | null = isVerde
    ? designPreview && verdeLiveDraft
      ? verdeLiveDraft
      : (data.context.restaurant.verdeSettings ?? DEFAULT_VERDE_SETTINGS)
    : null;
  const isSherbiny = exclusiveRendererKey === 'SHERBINY_FIRE_DOUGH_V1';
  const [sherbinyLiveDraft, setSherbinyLiveDraft] = useState<SherbinyMenuSettings | null>(null);
  useEffect(() => {
    if (!designPreview || !isSherbiny || window.parent === window) return;
    const listen = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || !isSherbinyPreviewUpdate(event.data)) return;
      setSherbinyLiveDraft(normalizeSherbinySettings(event.data.settings));
    };
    window.addEventListener('message', listen);
    window.parent.postMessage({ type: SHERBINY_DESIGN_PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener('message', listen);
  }, [designPreview, isSherbiny]);
  const sherbinySettings: SherbinyMenuSettings | null = isSherbiny
    ? designPreview && sherbinyLiveDraft
      ? sherbinyLiveDraft
      : (data.context.restaurant.sherbinySettings ?? DEFAULT_SHERBINY_SETTINGS)
    : null;
  const isMakkboz = exclusiveRendererKey === 'MAKKBOZ_HERITAGE_V1';
  const [makkbozLiveDraft, setMakkbozLiveDraft] = useState<MakkbozMenuSettings | null>(null);
  useEffect(() => {
    if (!designPreview || !isMakkboz || window.parent === window) return;
    const listen = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || !isMakkbozPreviewUpdate(event.data)) return;
      setMakkbozLiveDraft(normalizeMakkbozSettings(event.data.settings));
    };
    window.addEventListener('message', listen);
    window.parent.postMessage({ type: MAKKBOZ_DESIGN_PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener('message', listen);
  }, [designPreview, isMakkboz]);
  const makkbozSettings: MakkbozMenuSettings | null = isMakkboz
    ? designPreview && makkbozLiveDraft
      ? makkbozLiveDraft
      : (data.context.restaurant.makkbozSettings ?? DEFAULT_MAKKBOZ_SETTINGS)
    : null;
  const isMeatLovers = exclusiveRendererKey === 'MEAT_LOVERS_BUTCHER_V1';
  const [meatLoversLiveDraft, setMeatLoversLiveDraft] = useState<MeatLoversMenuSettings | null>(null);
  useEffect(() => {
    if (!designPreview || !isMeatLovers || window.parent === window) return;
    const listen = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || !isMeatLoversPreviewUpdate(event.data)) return;
      setMeatLoversLiveDraft(normalizeMeatLoversSettings(event.data.settings));
    };
    window.addEventListener('message', listen);
    window.parent.postMessage({ type: MEAT_LOVERS_DESIGN_PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener('message', listen);
  }, [designPreview, isMeatLovers]);
  const meatLoversSettings: MeatLoversMenuSettings | null = isMeatLovers
    ? designPreview && meatLoversLiveDraft
      ? meatLoversLiveDraft
      : (data.context.restaurant.meatLoversSettings ?? DEFAULT_MEAT_LOVERS_SETTINGS)
    : null;
  const hasCategories = data.menu.categories.length > 0;
  // Both premium demo references show one category at a time.
  // Search results still span all categories so no matching products disappear.
  const [premiumCategoryId, setPremiumCategoryId] = useState(data.menu.categories[0]?.id ?? '');
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
  // DEC-038: a Table channel the Restaurant switched off is a view-only menu. The page value
  // is advisory; a refused order (ORDERING_DISABLED) or "Check again" can also set it.
  const [serverOrderingDisabled, setServerOrderingDisabled] = useState(false);
  const tableChannelDisabled =
    !isGenericQr && (data.context.tableOrdering === 'DISABLED' || serverOrderingDisabled);
  const canOrder = isGenericQr ? pickupAvailable || deliveryAvailable : !tableChannelDisabled;

  const orderingContext: OrderingContextView = {
    kind: isGenericQr ? 'GENERIC' : 'TABLE',
    tableNumber: data.context.table?.number ?? null,
    branchName: data.context.branch?.name ?? null,
    pickupAvailable,
    deliveryAvailable,
  };

  // The hero names a branch only when exactly one applies (a table's own branch, or the
  // single branch a generic QR can order from).
  const branchLine = useMemo(() => {
    if (!isGenericQr) return data.context.branch?.name ?? null;
    const unique = new Map<string, string>();
    for (const branch of [...pickupBranches, ...deliveryBranches])
      unique.set(branch.id, branch.name);
    return unique.size === 1 ? [...unique.values()][0] : null;
  }, [isGenericQr, data.context.branch, pickupBranches, deliveryBranches]);

  const productById = useMemo(() => {
    const products = new Map<string, PublicMenuProduct>();
    for (const category of data.menu.categories) {
      for (const product of category.products) products.set(product.id, product);
    }
    return products;
  }, [data.menu.categories]);

  // Offers / Bundles (DEC-069): fixed-price packages with choices. With at least one active offer the top strip shows
  // them INSTEAD of the featured products (which come back when there are none), and the first chip jumps there.
  const offers = useMemo(() => data.context.offers ?? [], [data.context.offers]);
  const offersCopy = getOffersCopy(locale);
  const hasOffers = offers.length > 0;

  // The template decides the header, the cards, the headings and the category strip (DEC-044).
  // Photo-free templates show no photos anywhere (cards, cart, product page, featured banners).
  const layout = layoutOf(template);
  const showPhotos = isVerde || isSherbiny || isMakkboz || isMeatLovers || layout.photos;

  // "Our picks": featured, still available, with a photo (the banner needs one). Photo banners do
  // not exist in the photo-free template; a featured dish still carries its "Featured" tag there.
  const featuredProducts = useMemo(
    () =>
      showPhotos && layout.featured
        ? data.menu.categories
            .flatMap((category) => category.products)
            .filter(
              (product) =>
                product.featured &&
                product.availability !== 'SOLD_OUT' &&
                product.primaryImageAssetPath !== null,
            )
        : [],
    [data.menu.categories, showPhotos, layout.featured],
  );

  // ---- search (client-side, over the already-loaded Menu) ----
  const [query, setQuery] = useState('');
  const normalizedQuery = normalizeForSearch(query);
  const isSearching = normalizedQuery !== '';
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
  const isPremiumSingleCategory = isVerde || isSherbiny || isMakkboz || isMeatLovers || template === 'ember' || template === 'bloom' || template === 'brew';
  const premiumVisibleCategories = isPremiumSingleCategory && !isSearching
    ? visibleCategories.filter((category) => category.id === premiumCategoryId)
    : visibleCategories;
  const searchResultCount = visibleCategories.reduce(
    (sum, category) => sum + category.products.length,
    0,
  );

  const showOffers = hasOffers && !isSearching;
  // The featured strip gives its place to the offers while there are any.
  const showFeatured = featuredProducts.length > 0 && !isSearching && !hasOffers;
  const scrollToOffers = () => {
    document.getElementById(`category-${OFFERS_SECTION_ID}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  };
  const selectPremiumCategory = (id: string) => {
    // The "Offers" chip is not a category: it scrolls to the strip at the top and keeps the shown category.
    if (id === OFFERS_SECTION_ID) {
      setQuery('');
      window.requestAnimationFrame(scrollToOffers);
      return;
    }
    // Category content switches in place, unlike normal templates which jump to an anchored section.
    // Clear search first so every category is selectable, then keep the chip strip at the top.
    setQuery('');
    setPremiumCategoryId(id);
    window.requestAnimationFrame(() => {
      const anchor = document.getElementById('premium-menu-start');
      if (!anchor) return;
      anchor.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };
  const navigation = useMenuNavigation(
    [
      ...(hasOffers ? [OFFERS_SECTION_ID] : featuredProducts.length > 0 ? [FEATURED_SECTION_ID] : []),
      ...data.menu.categories.map((category) => category.id),
    ],
    isSearching,
  );
  const chipItems: ChipItem[] = [
    ...(showOffers
      ? [{ id: OFFERS_SECTION_ID, name: offersCopy.sectionTitle, imageUrl: null, isOffers: true }]
      : []),
    ...(showFeatured
      ? [{ id: FEATURED_SECTION_ID, name: copy.ourPicks, imageUrl: null, isFeatured: true }]
      : []),
    ...data.menu.categories.map((category) => ({
      id: category.id,
      name: category.name,
      imageUrl: showPhotos ? resolveAssetUrl(category.imageAssetPath) : null,
    })),
  ];

  const [cart, setCart] = useState<StoredCartItem[]>([]);
  const [hasHydratedCart, setHasHydratedCart] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Table Sessions: staff can close ordering for a TABLE QR. The server-rendered value is
  // advisory; a 409 from the order endpoint or "Check again" overrides it. Never applies to
  // Pickup/Delivery (GENERIC QR).
  const [orderingOverride, setOrderingOverride] = useState<'AVAILABLE' | 'CLOSED' | null>(null);
  const [isRecheckingOrdering, setIsRecheckingOrdering] = useState(false);
  const [orderingRecheck, setOrderingRecheck] = useState<OrderingRecheckStatus>('idle');
  const tableOrdering =
    orderingOverride ?? (data.context.tableOrdering === 'CLOSED' ? 'CLOSED' : 'AVAILABLE');
  const tableLocked = !isGenericQr && tableOrdering === 'CLOSED';
  const [confirmedOrder, setConfirmedOrder] = useState<GuestOrderView | null>(null);
  // FT-7/FT-8 checkout state -- kept here (not inside the Cart panel) so it
  // survives closing/reopening the panel and a failed submission. The hero's mode
  // switch and the checkout's switch both read/write `requestedFulfillment`: one
  // source of truth.
  const [requestedFulfillment, setRequestedFulfillment] = useState<Fulfillment>('PICKUP');
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [isTrackOpen, setIsTrackOpen] = useState(false);
  const [whatsappHandoff, setWhatsappHandoff] = useState<WhatsappOrderView | null>(null);
  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  useEffect(() => {
    // Read after mount so the server render and the first client render are identical.
    queueMicrotask(() => setHasActiveOrder(readTrackedOrders(publicCode).length > 0));
  }, [publicCode]);
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
  // Name, phone, address and the other typed fields: one shared set of rules for every template
  // (instant inline feedback here; the API repeats them and is the authority).
  const validation = useCheckoutValidation({
    fields,
    enabled: isGenericQr,
    delivery: isDelivery,
    country: data.context.restaurant.countryCode,
    locale,
  });
  const submitValues = validation.valuesForSubmit();
  const checkout: PendingOrderCheckout | null = isGenericQr
    ? {
        fulfillment,
        branchId: resolvedBranchId,
        customerName: submitValues.customerName,
        customerPhone: submitValues.customerPhone,
        customerNotes: submitValues.customerNotes,
        deliveryZoneId: isDelivery ? resolvedZoneId : null,
        // A Pickup attempt never carries delivery text (typed earlier, then switched away from).
        deliveryAddress: isDelivery ? submitValues.deliveryAddress : '',
        deliveryBuilding: isDelivery ? submitValues.deliveryBuilding : '',
        deliveryFloor: isDelivery ? submitValues.deliveryFloor : '',
        deliveryApartment: isDelivery ? submitValues.deliveryApartment : '',
        deliveryLandmark: isDelivery ? submitValues.deliveryLandmark : '',
      }
    : null;
  // A stable primitive for effect dependencies (the object above is new every render).
  const checkoutKey = JSON.stringify(checkout);
  // The Product open in the customizer sheet -- null means no sheet is open.
  // Any available Product can open it (it shows the dish and a quantity); a
  // Product with Modifier Groups always opens it before adding.
  const [sheetProduct, setSheetProduct] = useState<PublicMenuProduct | null>(null);
  // Set while the sheet is open from a cart row's "Edit": the line being replaced and its starting state.
  const [editing, setEditing] = useState<{
    lineKey: string;
    selectedByGroup: Record<string, string[]>;
    quantity: number;
    variantId: string | null;
  } | null>(null);

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
      // An Offer line (DEC-069) stays only while the current menu still offers that offer; its choices are
      // re-checked against the offer when the lines are built (a changed offer blocks the line, never silently drops it).
      const reconciled = stored.filter((item) =>
        item.offerId ? offers.some((offer) => offer.id === item.offerId) : productById.has(item.productId),
      );
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
      variantId: item.variantId ?? null,
      offerId: item.offerId ?? null,
      offerChoices: item.offerChoices ?? [],
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
      if (item.offerId) continue; // Offer lines have no product card to count on.
      total.set(item.productId, (total.get(item.productId) ?? 0) + item.quantity);
      if (item.modifierOptionIds.length === 0 && !item.variantId) simple.set(item.productId, item.quantity);
    }
    return { simpleQuantityByProductId: simple, totalQuantityByProductId: total };
  }, [cart]);

  /** Adds `quantity` of `productId` with the given selections -- merges into an existing line with the SAME selections, otherwise starts a new distinct line. */
  const addLine = useCallback(
    (productId: string, modifierOptionIds: string[], quantity = 1, variantId: string | null = null) => {
      const key = cartLineKey(productId, modifierOptionIds, variantId);
      updateCart((prev) => {
        const current = prev.find(
          (item) => storedItemKey(item) === key,
        );
        if (!current) {
          return [
            ...prev,
            { productId, quantity: Math.min(quantity, MAX_QUANTITY), modifierOptionIds, variantId },
          ];
        }
        return prev.map((item) =>
          storedItemKey(item) === key
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
      if (product.modifierGroups.length > 0 || (product.variants?.length ?? 0) > 0) {
        setSheetProduct(product);
        return;
      }
      addLine(product.id, []);
    },
    [addLine, setSheetProduct],
  );

  // "Complete your meal" (DEC-042): ask the Backend what goes with the cart while the cart is open.
  // The answer is product ids of this very menu; a failed request just means no suggestions.
  const suggestionsOn = data.context.suggestions === true;
  const cartProductKey = useMemo(
    () =>
      [...new Set(cart.filter((item) => !item.offerId).map((item) => item.productId))].sort().join(','),
    [cart],
  );
  const [suggestionIds, setSuggestionIds] = useState<string[]>([]);
  useEffect(() => {
    if (!suggestionsOn || !isCartOpen || cartProductKey === '') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchSuggestions(publicCode, cartProductKey.split(',')).then((ids) => {
        if (!cancelled) setSuggestionIds(ids);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [suggestionsOn, isCartOpen, cartProductKey, publicCode]);
  const suggestedProducts = useMemo(() => {
    if (!suggestionsOn || !isCartOpen || cartProductKey === '') return [];
    const inCart = new Set(cartProductKey.split(','));
    return suggestionIds
      .map((id) => productById.get(id))
      .filter(
        (product): product is PublicMenuProduct =>
          product !== undefined && product.availability !== 'SOLD_OUT' && !inCart.has(product.id),
      );
  }, [suggestionsOn, isCartOpen, cartProductKey, suggestionIds, productById]);

  const handleOpenProduct = useCallback(
    (product: PublicMenuProduct) => setSheetProduct(product),
    [setSheetProduct],
  );

  function handleConfirmOptions(
    selectedOptionIds: string[],
    quantity: number,
    variantId: string | null = null,
  ) {
    if (!sheetProduct) return;
    if (editing) {
      replaceLine(editing.lineKey, sheetProduct.id, selectedOptionIds, quantity, variantId);
    } else {
      addLine(sheetProduct.id, selectedOptionIds, quantity, variantId);
    }
    closeSheet();
  }

  function closeSheet() {
    setSheetProduct(null);
    setEditing(null);
  }

  /**
   * "Edit" on a cart row: the line's identity is (product + selected options), so editing is
   * replacing it -- the old line is swapped, in place, for the new selection (and merged into an
   * existing line when the new selection already exists). The cart's identity rules are unchanged.
   */
  function replaceLine(
    oldKey: string,
    productId: string,
    modifierOptionIds: string[],
    quantity: number,
    variantId: string | null = null,
  ) {
    const newKey = cartLineKey(productId, modifierOptionIds, variantId);
    updateCart((prev) => {
      const index = prev.findIndex(
        (item) => storedItemKey(item) === oldKey,
      );
      if (index === -1) return prev;
      const rest = prev.filter((_, position) => position !== index);
      const existing = rest.findIndex(
        (item) => storedItemKey(item) === newKey,
      );
      if (existing !== -1) {
        return rest.map((item, position) =>
          position === existing
            ? { ...item, quantity: Math.min(item.quantity + quantity, MAX_QUANTITY) }
            : item,
        );
      }
      const replacement = {
        productId,
        quantity: Math.min(quantity, MAX_QUANTITY),
        modifierOptionIds,
        variantId,
      };
      return [...rest.slice(0, index), replacement, ...rest.slice(index)];
    });
  }

  // ---- Offers (DEC-069) ----
  // The Offer open in its choice sheet, and -- when opened from a cart row -- the line being replaced.
  const [sheetOffer, setSheetOffer] = useState<PublicOffer | null>(null);
  const [editingOffer, setEditingOffer] = useState<{
    lineKey: string;
    choices: OfferPick[];
    quantity: number;
  } | null>(null);

  const handleOpenOffer = useCallback((offer: PublicOffer) => setSheetOffer(offer), []);

  function closeOfferSheet() {
    setSheetOffer(null);
    setEditingOffer(null);
  }

  /** Adds `quantity` copies of the offer with these exact choices (an identical line is merged, a different choice is its own line). */
  const addOfferLine = useCallback(
    (offerId: string, choices: OfferPick[], quantity: number) => {
      const key = offerLineIdentity(offerId, choices);
      updateCart((prev) => {
        if (prev.some((item) => storedItemKey(item) === key)) {
          return prev.map((item) =>
            storedItemKey(item) === key
              ? { ...item, quantity: Math.min(item.quantity + quantity, MAX_OFFER_QUANTITY) }
              : item,
          );
        }
        return [
          ...prev,
          {
            productId: '',
            quantity: Math.min(quantity, MAX_OFFER_QUANTITY),
            modifierOptionIds: [],
            variantId: null,
            offerId,
            offerChoices: choices,
          },
        ];
      });
    },
    [updateCart],
  );

  function handleConfirmOffer(choices: OfferPick[], quantity: number) {
    if (!sheetOffer) return;
    if (editingOffer) {
      // Editing replaces the line in place (its identity is the offer plus its choices).
      const oldKey = editingOffer.lineKey;
      const newKey = offerLineIdentity(sheetOffer.id, choices);
      const offerId = sheetOffer.id;
      updateCart((prev) => {
        const index = prev.findIndex((item) => storedItemKey(item) === oldKey);
        if (index === -1) return prev;
        const rest = prev.filter((_, position) => position !== index);
        const existing = rest.findIndex((item) => storedItemKey(item) === newKey);
        if (existing !== -1) {
          return rest.map((item, position) =>
            position === existing
              ? { ...item, quantity: Math.min(item.quantity + quantity, MAX_OFFER_QUANTITY) }
              : item,
          );
        }
        const replacement: StoredCartItem = {
          productId: '',
          quantity: Math.min(quantity, MAX_OFFER_QUANTITY),
          modifierOptionIds: [],
          variantId: null,
          offerId,
          offerChoices: choices,
        };
        return [...rest.slice(0, index), replacement, ...rest.slice(index)];
      });
    } else {
      addOfferLine(sheetOffer.id, choices, quantity);
    }
    closeOfferSheet();
  }

  function handleEditLine(lineKey: string) {
    const item = cart.find((entry) => storedItemKey(entry) === lineKey);
    if (item?.offerId) {
      const offer = offers.find((candidate) => candidate.id === item.offerId);
      if (!offer) return;
      // A changed offer starts the choice again; an unchanged one reopens with the same choices.
      const resolved = resolveOfferLine(offers, { offerId: offer.id, choices: item.offerChoices ?? [] }, extraLabel);
      setEditingOffer({
        lineKey,
        choices: resolved?.problem === 'CHANGED' ? [] : (item.offerChoices ?? []),
        quantity: item.quantity,
      });
      setSheetOffer(offer);
      return;
    }
    const product = item ? productById.get(item.productId) : undefined;
    if (!item || !product) return;
    const selectedByGroup: Record<string, string[]> = {};
    for (const group of product.modifierGroups) {
      selectedByGroup[group.id] = group.options
        .filter((option) => item.modifierOptionIds.includes(option.id))
        .map((option) => option.id);
    }
    setEditing({ lineKey, selectedByGroup, quantity: item.quantity, variantId: item.variantId ?? null });
    setSheetProduct(product);
  }

  const handleIncrement = useCallback(
    (lineKey: string) => {
      updateCart((prev) =>
        prev.map((item) =>
          storedItemKey(item) === lineKey
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
            storedItemKey(item) === lineKey
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
      prev.filter((item) => storedItemKey(item) !== lineKey),
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

  /** The sticky bar's search button: back to the top, then into the first visible search field. */
  const handleJumpToSearch = useCallback(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    window.setTimeout(
      () => {
        const fieldsInPage = Array.from(
          document.querySelectorAll<HTMLInputElement>('[data-guest-search]'),
        );
        fieldsInPage.find((field) => field.offsetParent !== null)?.focus({ preventScroll: true });
      },
      reduced ? 0 : 450,
    );
  }, []);

  // An offer that vanished from the menu (switched off, deleted, expired) after the page loaded: drop its cart line.
  useEffect(() => {
    if (!hasHydratedCart) return;
    if (!cart.some((item) => item.offerId && !offers.some((offer) => offer.id === item.offerId))) return;
    queueMicrotask(() =>
      updateCart((prev) =>
        prev.filter((item) => !item.offerId || offers.some((offer) => offer.id === item.offerId)),
      ),
    );
  }, [offers, hasHydratedCart, cart, updateCart]);

  const cartLines: CartLine[] = cart
    .map((item): CartLine | null => {
      if (item.offerId) {
        // An Offer line (DEC-069): name, rows and price always come from the CURRENT offer, never from storage.
        const resolved = resolveOfferLine(
          offers,
          { offerId: item.offerId, choices: item.offerChoices ?? [] },
          extraLabel,
          locale === 'ar' ? '، ' : ', ',
        );
        if (!resolved) return null;
        const unitPrice = resolved.unitPrice;
        return {
          lineKey: storedItemKey(item),
          productId: '',
          offerId: resolved.offer.id,
          offerChoices: item.offerChoices ?? [],
          quantity: item.quantity,
          modifierOptionIds: [],
          variantId: null,
          variantName: null,
          name: resolved.offer.name,
          hasModifierGroups: true,
          imageAssetPath: resolved.offer.imageAssetPath,
          unitPrice,
          lineTotal: fromMinorUnits(lineTotalMinorUnits(unitPrice, item.quantity)),
          originalLineTotal: fromMinorUnits(lineTotalMinorUnits(unitPrice, item.quantity)),
          discounted: false,
          selections: [],
          offerRows: resolved.rows,
          blocked: resolved.problem !== null,
          blockedReason:
            resolved.problem === 'UNAVAILABLE'
              ? resolved.offer.soldOut === true
                ? ('OFFER_SOLD_OUT' as const)
                : ('OFFER_NOT_TODAY' as const)
              : resolved.problem === 'CHANGED'
                ? ('OFFER_CHANGED' as const)
                : null,
        };
      }
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
      // DEC-041: a product with sizes is priced by the size in this line (its own price and
      // discount); a size the menu no longer offers blocks the line until the Guest re-chooses.
      const sizes = product.variants ?? [];
      const size = item.variantId ? (sizes.find((entry) => entry.id === item.variantId) ?? null) : null;
      const sizeMissing = sizes.length > 0 && size === null;
      // Product Discounts V1: the discount applies to the product (or size) price only, never to
      // paid extras. Display only -- the Backend recomputes every amount on submit.
      const baseForLine = size ? size.price : product.basePrice;
      const discountedForLine = size
        ? size.discountedPrice
        : product.discount
          ? product.discount.discountedPrice
          : null;
      const discounted = discountedForLine !== null;
      const originalUnitPrice = fromMinorUnits(toMinorUnits(baseForLine) + modifiersMinorUnits);
      const unitPrice = discountedForLine !== null
        ? fromMinorUnits(toMinorUnits(discountedForLine) + modifiersMinorUnits)
        : originalUnitPrice;

      return {
        lineKey: storedItemKey(item),
        productId: item.productId,
        quantity: item.quantity,
        modifierOptionIds: item.modifierOptionIds,
        variantId: item.variantId ?? null,
        variantName: size ? size.name : null,
        name: product.name,
        hasModifierGroups: product.modifierGroups.length > 0 || sizes.length > 0,
        imageAssetPath: product.primaryImageAssetPath,
        unitPrice,
        lineTotal: fromMinorUnits(lineTotalMinorUnits(unitPrice, item.quantity)),
        originalLineTotal: fromMinorUnits(lineTotalMinorUnits(originalUnitPrice, item.quantity)),
        discounted,
        selections,
        offerId: null,
        offerChoices: [],
        blockedReason: null,
        blocked: product.availability === 'SOLD_OUT' || sizeMissing,
      };
    })
    .filter((line): line is CartLine => line !== null);

  /** What the order endpoints receive for the orderable lines: identities and quantities only -- never a price or a name. */
  const toPendingItems = (lines: CartLine[]): PendingOrderItem[] =>
    lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      modifierOptionIds: line.modifierOptionIds,
      variantId: line.variantId,
      offerId: line.offerId,
      offerChoices: line.offerChoices,
    }));
  const toSubmitItems = (lines: CartLine[]): SubmitGuestOrderItem[] =>
    lines.map((line) =>
      line.offerId
        ? { offerId: line.offerId, quantity: line.quantity, offerChoices: line.offerChoices }
        : {
            productId: line.productId,
            quantity: line.quantity,
            modifierOptionIds: line.modifierOptionIds,
            ...(line.variantId ? { variantId: line.variantId } : {}),
          },
    );

  const orderableLines = cartLines.filter((line) => !line.blocked);
  const hasBlockedLines = cartLines.some((line) => line.blocked);
  const totalMinorUnits = orderableLines.reduce(
    (sum, line) => sum + lineTotalMinorUnits(line.unitPrice, line.quantity),
    ZERO_MINOR_UNITS,
  );
  const totalDisplay = fromMinorUnits(totalMinorUnits);
  const originalTotalMinorUnits = orderableLines.reduce(
    (sum, line) => sum + toMinorUnits(line.originalLineTotal),
    ZERO_MINOR_UNITS,
  );
  const discountDisplay =
    originalTotalMinorUnits > totalMinorUnits
      ? fromMinorUnits(originalTotalMinorUnits - totalMinorUnits)
      : null;
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
  // Money inside sentences uses the Guest display format ("100 ج.م" / "100 EGP").
  const unitLabel = currencyLabel(currency, locale);
  const minimumMessage =
    selectedZone !== null && belowMinimum
      ? copy.minimumOrderMessage(
          selectedZone.name,
          formatAmount(selectedZone.minimumOrder),
          unitLabel,
        )
      : null;
  const minimumShortfallDisplay =
    selectedZone !== null && belowMinimum
      ? copy.minimumShortfall(
          formatAmount(fromMinorUnits(toMinorUnits(selectedZone.minimumOrder) - totalMinorUnits)),
          unitLabel,
        )
      : null;
  // Branch, delivery area and the minimum order block the button with a reason. The typed
  // fields (name, phone, address ...) do not: tapping send shows each problem under its field.
  const checkoutDetailsComplete =
    !isGenericQr ||
    (resolvedBranchId !== null && (!isDelivery || (resolvedZoneId !== null && !belowMinimum)));
  // Opening hours (DEC-042): a closed Branch takes no Pickup / Delivery orders. Advisory
  // here; the Backend refuses with BRANCH_CLOSED either way.
  const branchClosed =
    isGenericQr &&
    eligibleBranches.find((branch) => branch.id === resolvedBranchId)?.hours?.open === false;
  const canSubmit =
    cartLines.length > 0 &&
    !hasBlockedLines &&
    !isSubmitting &&
    checkoutDetailsComplete &&
    !branchClosed &&
    !tableLocked;
  // WhatsApp ordering (DEC-042): while it is on, a Restaurant QR order is sent to the Restaurant on
  // WhatsApp INSTEAD of the dashboard (which kinds of order are offered is still the Restaurant's switches).
  // Order tracking: off with the platform feature (DEC-043), and meaningless for WhatsApp orders
  // (nothing is stored, so there is no status to show).
  const trackingAvailable =
    data.context.tracking !== false && !(isGenericQr && data.context.ordering?.whatsapp);
  const whatsappAction =
    isGenericQr && data.context.ordering?.whatsapp
      ? { onSend: () => void handleSendWhatsapp() }
      : null;

  // Why the primary action is unavailable, in words (shown instead of a silently greyed button).
  // A locked table shows its own dedicated notice instead of this one-line hint.
  const submitHint = tableLocked
    ? null
    : hasBlockedLines
    ? copy.placeOrderHintBlocked
    : branchClosed
      ? copy.branchClosedHint
      : !checkoutDetailsComplete && !belowMinimum
      ? isDelivery && resolvedBranchId !== null
        ? copy.deliveryAreaError
        : copy.pickupBranchError
      : null;

  // "Check again": re-read the advisory availability. Failure is shown as such -- never
  // silently treated as open or closed; the order endpoint stays the authority.
  const checkOrderingAgain = useCallback(async () => {
    if (isGenericQr) return;
    setIsRecheckingOrdering(true);
    const result = await getTableOrdering(publicCode);
    setIsRecheckingOrdering(false);
    if (result === 'unknown') {
      setOrderingRecheck('failed');
      return;
    }
    if (result === 'DISABLED') {
      setServerOrderingDisabled(true);
      return;
    }
    setOrderingOverride(result);
    setSubmitError(null);
    if (result === 'CLOSED') {
      setOrderingRecheck('stillClosed');
      return;
    }
    setOrderingRecheck('reopened');
    window.setTimeout(() => setOrderingRecheck('idle'), 8000);
  }, [isGenericQr, publicCode]);

  // A phone often sleeps on the table: re-check when the page becomes visible again.
  useEffect(() => {
    if (!tableLocked) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkOrderingAgain();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [tableLocked, checkOrderingAgain]);

  async function handlePlaceOrder() {
    if (!canSubmit) return;
    if (!(await validation.checkBeforeSend())) return;
    setIsSubmitting(true);
    setSubmitError(null);
    const items = toSubmitItems(orderableLines);
    // FT-5 critical fix: reuse the SAME clientRequestId as any still-
    // pending attempt for this exact Cart payload (a retry after a lost
    // response, including across a refresh or an EN/AR navigation), or
    // generate+persist a fresh one -- never a brand-new id on every call,
    // which would silently defeat the Backend's idempotency guarantee on
    // the most important case (an ambiguous network failure).
    const clientRequestId = resolveClientRequestId(
      publicCode,
      toPendingItems(orderableLines),
      checkout,
      generateUuid,
    );
    const result = await submitGuestOrder(
      publicCode,
      clientRequestId,
      items,
      checkout,
      data.locale.resolved,
      // The total the Guest is looking at: if a discount changed meanwhile the Backend
      // answers 409 instead of silently charging a different amount.
      isDelivery ? grandTotalDisplay : totalDisplay,
    );
    setIsSubmitting(false);

    if (result.outcome === 'success') {
      rememberOrder(publicCode, result.data.id);
      setHasActiveOrder(true);
      setConfirmedOrder(result.data);
      persistCartCleared();
      clearPendingAttempt(publicCode);
      return;
    }
    reportFailure(result);
  }

  /** Why an order (or a WhatsApp order) was not accepted, in the Guest's words. Nothing was created. */
  function reportFailure(result: Exclude<SubmitGuestOrderResult, { outcome: 'success' }>) {
    if (result.outcome === 'tableOrderingUnavailable') {
      // Staff closed ordering since this page loaded. Nothing was created; the cart and the
      // pending attempt are kept, so the SAME request id is reused if ordering reopens.
      setOrderingOverride('CLOSED');
      setOrderingRecheck('idle');
      return;
    }
    if (result.outcome === 'orderingDisabled') {
      // The Restaurant switched ordering off since this page loaded: nothing was created.
      // The menu stays browsable and the notice explains why the cart is gone.
      setServerOrderingDisabled(true);
      return;
    }
    if (result.outcome === 'priceChanged') {
      // A discount started, ended or changed. Nothing was created: refetch the menu so
      // the cart shows the current prices, and ask the Guest to review before ordering.
      setSubmitError(copy.priceChangedError);
      router.refresh();
      return;
    }
    if (result.outcome === 'itemsUnavailable') {
      setSubmitError(copy.itemsUnavailableError);
      return;
    }
    if (result.outcome === 'offerUnavailable' || result.outcome === 'offerChanged') {
      // An offer was switched off, expired, is not valid today, or its items changed. Nothing was created; the cart
      // is kept. Refetch the menu so the cart marks the line (remove / choose again) and the strip shows the truth.
      setSubmitError(
        result.outcome === 'offerUnavailable' ? offersCopy.unavailableError : offersCopy.changedError,
      );
      router.refresh();
      return;
    }
    if (result.outcome === 'notFound') {
      setSubmitError(copy.orderNotFoundError);
      return;
    }
    if (result.outcome === 'invalidFields') {
      // The API refused specific fields: show each one under its field (stable codes, our words).
      if (!validation.applyServerIssues(result.fields)) {
        setSubmitError(isDelivery ? copy.deliveryDetailsRequiredError : copy.pickupDetailsRequiredError);
      }
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
          formatAmount(result.minimumOrder ?? selectedZone?.minimumOrder ?? ''),
          unitLabel,
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
    if (result.outcome === 'whatsappOnly') {
      // The Restaurant switched to WhatsApp since this page loaded: refresh so the cart sends it there.
      setSubmitError(copy.whatsappOnlyError);
      router.refresh();
      return;
    }
    if (result.outcome === 'whatsappUnavailable') {
      setSubmitError(copy.whatsappUnavailable);
      return;
    }
    if (result.outcome === 'branchClosed') {
      setSubmitError(copy.branchClosedHint);
      return;
    }
    // Network/unexpected failure (Section: Backend may have actually
    // created the Order despite a lost response) -- the pending attempt is
    // deliberately left in place so an unchanged retry reuses this same
    // `clientRequestId` above.
    setSubmitError(copy.orderNetworkError);
  }

  /** DEC-042: prices the cart on the Backend and hands the ready-to-send message to WhatsApp. No order is stored. */
  async function handleSendWhatsapp() {
    if (!canSubmit) return;
    if (!(await validation.checkBeforeSend())) return;
    setIsSubmitting(true);
    setSubmitError(null);
    const items = toSubmitItems(orderableLines);
    const result = await submitWhatsappOrder(
      publicCode,
      items,
      checkout,
      data.locale.resolved,
      isDelivery ? grandTotalDisplay : totalDisplay,
      generateUuid(),
    );
    setIsSubmitting(false);
    if (result.outcome === 'whatsappSuccess') {
      setWhatsappHandoff(result.data);
      persistCartCleared();
      clearPendingAttempt(publicCode);
      // Try to open WhatsApp at once; a browser may block it after the wait, so the panel also has a button.
      try {
        window.open(result.data.whatsappUrl, '_blank', 'noopener,noreferrer');
      } catch {
        // The button in the panel does the same.
      }
      return;
    }
    reportFailure(result);
  }

  function openTracking() {
    setIsCartOpen(false);
    setConfirmedOrder(null);
    setIsTrackOpen(true);
  }

  function persistCartCleared() {
    setCart([]);
    saveCart(publicCode, []);
  }

  function closeCart() {
    setIsCartOpen(false);
    setWhatsappHandoff(null);
    if (confirmedOrder) {
      setConfirmedOrder(null);
      setSubmitError(null);
    }
  }

  function handleFulfillmentChange(next: Fulfillment) {
    setRequestedFulfillment(next);
    // Branch/zone lists differ per mode -- the Guest re-chooses if needed.
    setSelectedBranchId(null);
    setSelectedZoneId(null);
  }

  const showCartBar = canOrder && cartCount > 0;
  const showModeSwitch = isGenericQr && (pickupAvailable || deliveryAvailable);
  const cartBarModeLabel = isGenericQr
    ? fulfillment === 'DELIVERY'
      ? copy.delivery
      : copy.pickup
    : `${copy.table} ${data.context.table?.number ?? ''}`.trim();

  const emberHeroProduct =
    data.menu.categories.flatMap((category) => category.products)
      .find((product) => product.featured && product.primaryImageAssetPath && product.availability !== 'SOLD_OUT') ??
    data.menu.categories.flatMap((category) => category.products)
      .find((product) => product.primaryImageAssetPath && product.availability !== 'SOLD_OUT');
  const emberAutoPhotoUrl = resolveAssetUrl(emberHeroProduct?.primaryImageAssetPath ?? null);
  const emberPhotoUrl = emberSettings.heroImageMode === 'CUSTOM' && emberSettings.heroImageAssetPath
    ? resolveAssetUrl(emberSettings.heroImageAssetPath)
    : emberAutoPhotoUrl;

  const heroProps: GuestHeroProps = {
    sentinelRef: navigation.headerRef,
    restaurantName: data.context.restaurant.name,
    logoUrl,
    coverUrl,
    menuDescription: data.menu.description,
    emberHeadline: locale === 'ar' ? emberSettings.headlineAr : emberSettings.headlineEn,
    emberSubtitle: locale === 'ar' ? emberSettings.subtitleAr : emberSettings.subtitleEn,
    emberNavTagline: locale === 'ar' ? emberSettings.navTaglineAr : emberSettings.navTaglineEn,
    emberEyebrow: locale === 'ar' ? emberSettings.eyebrowAr : emberSettings.eyebrowEn,
    emberSignature: locale === 'ar' ? emberSettings.signatureAr : emberSettings.signatureEn,
    emberMarquee: locale === 'ar' ? emberSettings.marqueeAr : emberSettings.marqueeEn,
    emberPhotoUrl,
    emberPhotoFallbackUrl: emberAutoPhotoUrl,
    emberCartCount: cartCount,
    emberDesignPreview: designPreview,
    brewNavTagline:locale==='ar'?brewSettings.navTaglineAr:brewSettings.navTaglineEn,
    brewEyebrow:locale==='ar'?brewSettings.eyebrowAr:brewSettings.eyebrowEn,
    brewHeadlineTop:locale==='ar'?brewSettings.headlineTopAr:brewSettings.headlineTopEn,
    brewHeadlineBottom:locale==='ar'?brewSettings.headlineBottomAr:brewSettings.headlineBottomEn,
    brewSubtitle:locale==='ar'?brewSettings.subtitleAr:brewSettings.subtitleEn,
    brewStory:locale==='ar'?brewSettings.storyAr:brewSettings.storyEn,
    brewCartCount:cartCount,
    onBrewCartOpen:canOrder?()=>setIsCartOpen(true):undefined,
    bloomRibbon: locale === 'ar' ? bloomSettings.ribbonAr : bloomSettings.ribbonEn,
    bloomNavTagline: locale === 'ar' ? bloomSettings.navTaglineAr : bloomSettings.navTaglineEn,
    bloomEyebrow: locale === 'ar' ? bloomSettings.eyebrowAr : bloomSettings.eyebrowEn,
    bloomHeadlineTop: locale === 'ar' ? bloomSettings.headlineTopAr : bloomSettings.headlineTopEn,
    bloomHeadlineMiddle: locale === 'ar' ? bloomSettings.headlineMiddleAr : bloomSettings.headlineMiddleEn,
    bloomHeadlineBottom: locale === 'ar' ? bloomSettings.headlineBottomAr : bloomSettings.headlineBottomEn,
    bloomSubtitle: locale === 'ar' ? bloomSettings.subtitleAr : bloomSettings.subtitleEn,
    bloomCta: locale === 'ar' ? bloomSettings.ctaAr : bloomSettings.ctaEn,
    bloomHeroImageUrl: bloomSettings.heroImageMode === 'CUSTOM' ? resolveAssetUrl(bloomSettings.heroImageAssetPath) : null,
    bloomCartCount: cartCount,
    onBloomCartOpen: canOrder ? () => setIsCartOpen(true) : undefined,
    onEmberCartOpen: canOrder ? () => setIsCartOpen(true) : undefined,
    tableNumber: data.context.table?.number ?? null,
    branchLine,
    copy,
    locale: data.locale,
    publicCode,
    shareCode: data.context.restaurant.shareCode,
    contact: data.context.restaurant.contact,
    hours: data.context.restaurant.hours,
    onTrack: trackingAvailable ? openTracking : null,
    hasActiveOrder,
  };
  const Hero =
    isVerde || isSherbiny || isMakkboz || isMeatLovers ? GuestHeroCompact : layout.hero === 'brew' ? GuestHeroBrew : layout.hero === 'bloom'
      ? GuestHeroBloom
      : layout.hero === 'ember'
      ? GuestHeroEmber
      : layout.hero === 'floating'
      ? GuestHeroFloating
      : layout.hero === 'centered'
        ? GuestHeroCentered
        : layout.hero === 'editorial'
          ? GuestHeroEditorial
        : layout.hero === 'compact'
          ? GuestHeroCompact
          : GuestHero;
  // Only the classic hero is tall enough for the announcement and order bars to overlap its edge.
  const overlapsHero = layout.hero === 'classic';

  const overlays = (
    <>
        {isTrackOpen ? (
          <TrackOrderSheet
            publicCode={publicCode}
            copy={copy}
            locale={locale}
            dir={dir}
            onClose={() => {
              setIsTrackOpen(false);
              setHasActiveOrder(readTrackedOrders(publicCode).length > 0);
            }}
          />
        ) : null}

        {showCartBar ? (
          <CartBar
            count={cartCount}
            totalDisplay={totalDisplay}
            currency={currency}
            modeLabel={cartBarModeLabel}
            copy={copy}
            onOpen={() => setIsCartOpen(true)}
          />
        ) : null}

        {canOrder && (isCartOpen || confirmedOrder || whatsappHandoff) ? (
          <CartPanel
            copy={copy}
            currency={currency}
            locale={locale}
            dir={dir}
            context={orderingContext}
            lines={cartLines}
            count={cartCount}
            totalDisplay={totalDisplay}
            discountDisplay={discountDisplay}
            isSubmitting={isSubmitting}
            canSubmit={canSubmit}
            submitError={submitError}
            submitHint={submitHint}
            orderingClosed={
              tableLocked
                ? {
                    isChecking: isRecheckingOrdering,
                    status: orderingRecheck,
                    onCheckAgain: () => void checkOrderingAgain(),
                  }
                : null
            }
            confirmedOrder={confirmedOrder}
            checkout={
              isGenericQr
                ? {
                    fulfillment,
                    pickupAvailable,
                    deliveryAvailable,
                    onFulfillmentChange: handleFulfillmentChange,
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
                    onFieldChange: (key, value) => {
                      validation.onFieldEdited(key);
                      setFields((prev) => ({ ...prev, [key]: sanitizeWhileTyping(key, value) }));
                    },
                    fieldErrors: validation.fieldErrors,
                    onFieldBlur: validation.onFieldBlur,
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
            onEditLine={handleEditLine}
            onPlaceOrder={() => void handlePlaceOrder()}
            onClose={closeCart}
            onTrackOrder={trackingAvailable ? openTracking : null}
            showPhotos={showPhotos}
            suggestions={suggestedProducts}
            onAddSuggestion={handleQuickAdd}
            whatsapp={whatsappAction}
            whatsappHandoff={whatsappHandoff}
          />
        ) : null}

        {sheetProduct ? (
          <ProductSheet
            key={sheetProduct.id}
            product={sheetProduct}
            currency={currency}
            copy={copy}
            dir={dir}
            initial={editing ?? undefined}
            showPhotos={showPhotos}
            onCancel={closeSheet}
            onConfirm={handleConfirmOptions}
          />
        ) : null}

        {sheetOffer ? (
          <OfferSheet
            key={`${sheetOffer.id}:${editingOffer?.lineKey ?? 'new'}`}
            offer={sheetOffer}
            currency={currency}
            copy={copy}
            offersCopy={offersCopy}
            dir={dir}
            initial={editingOffer ?? undefined}
            showPhotos={showPhotos}
            onCancel={closeOfferSheet}
            onConfirm={handleConfirmOffer}
          />
        ) : null}
    </>
  );
  // Offers (DEC-069) for the exclusive designs: the same shared strip, dressed by the design's own tokens, plus the first chip.
  const designOffers: DesignOffers | null = showOffers
    ? {
        strip: (
          <OffersStrip
            offers={offers}
            currency={currency}
            offersCopy={offersCopy}
            canOrder={canOrder}
            showPhotos={showPhotos}
            onOpen={handleOpenOffer}
          />
        ),
        chipLabel: offersCopy.sectionTitle,
        onJump: () => selectPremiumCategory(OFFERS_SECTION_ID),
      }
    : null;
  const poweredByLink = data.context.platform?.poweredByUrl ?? 'https://waytaapp.com/';
  const verdePoweredBy = (
    <>
      <span>{copy.poweredBy}</span>
      <a href={poweredByLink} aria-label="Wayta ويتا" className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-g-accent">
        <WaytaLockup tone="auto" size={16} className="[--wayta-ink:currentColor]" />
      </a>
    </>
  );
  const verdeNotices = (
    <div className="empty:hidden">
      <AnnouncementBar announcements={data.context.announcements ?? []} publicCode={publicCode} copy={copy} />
    </div>
  );
  // Pickup / delivery switch and the ordering notices sit under the hero and the ticker, right before the menu.
  const verdeOrdering = (
    <>
      {showModeSwitch ? (
        <div className="flex min-w-0 gap-1 rounded-[26px] border border-g-line bg-g-surface p-1">
          <ModeSwitch variant="hero" value={fulfillment} pickupAvailable={pickupAvailable} deliveryAvailable={deliveryAvailable} onChange={handleFulfillmentChange} copy={copy} />
        </div>
      ) : null}
      {tableLocked ? (
        <TableClosedNotice copy={copy} isChecking={isRecheckingOrdering} status={orderingRecheck} onCheckAgain={() => void checkOrderingAgain()} />
      ) : orderingRecheck === 'reopened' ? (
        <p role="status" className="rounded-2xl border border-g-line bg-g-surface-2 px-4 py-3 text-[14px] font-semibold text-g-text">{copy.tableOrderingReopened}</p>
      ) : null}
      {!canOrder ? (
        <p className="flex items-start gap-3 rounded-[22px] border border-g-line bg-g-surface px-4 py-3.5 text-[14px] leading-[1.7] text-g-text-2">
          <GuestIconInfo className="mt-0.5 size-5 shrink-0 text-g-accent-text" />
          {copy.pickupUnavailable}
        </p>
      ) : null}
      {isGenericQr && canOrder && data.context.restaurant.hours?.open === false ? (
        <p className="flex items-start gap-3 rounded-[22px] border border-g-line bg-g-surface px-4 py-3.5 text-[14px] leading-[1.7] text-g-text-2">
          <GuestIconInfo className="mt-0.5 size-5 shrink-0 text-g-accent-text" />
          {copy.branchClosedNotice}
        </p>
      ) : null}
    </>
  );

  return (
    <GuestLocaleProvider locale={locale}>
      <div
          dir={dir}
          lang={locale}
          className={`g-body relative ${template === 'ember' ? 'ember-experience' : template === 'bloom' ? 'bloom-experience' : template === 'brew' ? 'brew-experience' : ''}`}
          data-ember-palette={template === 'ember' ? emberSettings.palette : undefined}
          data-ember-motion={template === 'ember' ? emberSettings.motion : undefined}
          data-brew-palette={template==='brew'?brewSettings.palette:undefined}
          data-brew-motion={template==='brew'?brewSettings.motion:undefined}
          data-bloom-palette={template === 'bloom' ? bloomSettings.palette : undefined}
          data-bloom-motion={template === 'bloom' ? bloomSettings.motion : undefined}
        >
        {meatLoversSettings ? (
          <MeatLoversMenu
            settings={meatLoversSettings}
            guestTheme={guestTheme}
            restaurantName={data.context.restaurant.name}
            logoUrl={logoUrl}
            locale={locale}
            availableLocales={data.locale.available}
            publicCode={publicCode}
            designPreview={designPreview}
            copy={copy}
            currency={currency}
            categories={data.menu.categories}
            visibleCategories={visibleCategories}
            query={query}
            onQueryChange={setQuery}
            canOrder={canOrder}
            simpleQuantityByProductId={simpleQuantityByProductId}
            totalQuantityByProductId={totalQuantityByProductId}
            onOpenProduct={handleOpenProduct}
            onQuickAdd={handleQuickAdd}
            onIncrement={handleCardIncrement}
            onDecrement={handleCardDecrement}
            cartCount={cartCount}
            onOpenCart={canOrder ? () => setIsCartOpen(true) : null}
            onTrack={trackingAvailable ? openTracking : null}
            hasActiveOrder={hasActiveOrder}
            shareCode={data.context.restaurant.shareCode}
            contact={data.context.restaurant.contact}
            locations={data.context.locations ?? []}
            hours={data.context.restaurant.hours}
            notices={verdeNotices}
            orderingBar={verdeOrdering}
            offers={designOffers}
            poweredBy={verdePoweredBy}
          >
            {overlays}
          </MeatLoversMenu>
        ) : makkbozSettings ? (
          <MakkbozMenu
            settings={makkbozSettings}
            guestTheme={guestTheme}
            restaurantName={data.context.restaurant.name}
            logoUrl={logoUrl}
            locale={locale}
            availableLocales={data.locale.available}
            publicCode={publicCode}
            designPreview={designPreview}
            copy={copy}
            currency={currency}
            categories={data.menu.categories}
            visibleCategories={visibleCategories}
            query={query}
            onQueryChange={setQuery}
            canOrder={canOrder}
            simpleQuantityByProductId={simpleQuantityByProductId}
            totalQuantityByProductId={totalQuantityByProductId}
            onOpenProduct={handleOpenProduct}
            onQuickAdd={handleQuickAdd}
            onIncrement={handleCardIncrement}
            onDecrement={handleCardDecrement}
            cartCount={cartCount}
            onOpenCart={canOrder ? () => setIsCartOpen(true) : null}
            onTrack={trackingAvailable ? openTracking : null}
            hasActiveOrder={hasActiveOrder}
            shareCode={data.context.restaurant.shareCode}
            contact={data.context.restaurant.contact}
            locations={data.context.locations ?? []}
            hours={data.context.restaurant.hours}
            notices={verdeNotices}
            orderingBar={verdeOrdering}
            offers={designOffers}
            poweredBy={verdePoweredBy}
          >
            {overlays}
          </MakkbozMenu>
        ) : sherbinySettings ? (
          <SherbinyMenu
            settings={sherbinySettings}
            guestTheme={guestTheme}
            restaurantName={data.context.restaurant.name}
            logoUrl={logoUrl}
            coverUrl={resolveAssetUrl(data.context.restaurant.coverAssetPath)}
            locale={locale}
            availableLocales={data.locale.available}
            publicCode={publicCode}
            designPreview={designPreview}
            copy={copy}
            currency={currency}
            categories={data.menu.categories}
            visibleCategories={visibleCategories}
            query={query}
            onQueryChange={setQuery}
            activeCategoryId={premiumCategoryId}
            onSelectCategory={selectPremiumCategory}
            canOrder={canOrder}
            simpleQuantityByProductId={simpleQuantityByProductId}
            totalQuantityByProductId={totalQuantityByProductId}
            onOpenProduct={handleOpenProduct}
            onQuickAdd={handleQuickAdd}
            onIncrement={handleCardIncrement}
            onDecrement={handleCardDecrement}
            cartCount={cartCount}
            onOpenCart={canOrder ? () => setIsCartOpen(true) : null}
            onTrack={trackingAvailable ? openTracking : null}
            hasActiveOrder={hasActiveOrder}
            shareCode={data.context.restaurant.shareCode}
            contact={data.context.restaurant.contact}
            locations={data.context.locations ?? []}
            hours={data.context.restaurant.hours}
            notices={verdeNotices}
            orderingBar={verdeOrdering}
            offers={designOffers}
            poweredBy={verdePoweredBy}
          >
            {overlays}
          </SherbinyMenu>
        ) : verdeSettings ? (
          <VerdeMenu
            settings={verdeSettings}
            restaurantName={data.context.restaurant.name}
            logoUrl={logoUrl}
            locale={locale}
            availableLocales={data.locale.available}
            publicCode={publicCode}
            designPreview={designPreview}
            copy={copy}
            currency={currency}
            categories={data.menu.categories}
            visibleCategories={visibleCategories}
            query={query}
            onQueryChange={setQuery}
            activeCategoryId={premiumCategoryId}
            onSelectCategory={selectPremiumCategory}
            canOrder={canOrder}
            simpleQuantityByProductId={simpleQuantityByProductId}
            totalQuantityByProductId={totalQuantityByProductId}
            onOpenProduct={handleOpenProduct}
            onQuickAdd={handleQuickAdd}
            onIncrement={handleCardIncrement}
            onDecrement={handleCardDecrement}
            cartCount={cartCount}
            onOpenCart={canOrder ? () => setIsCartOpen(true) : null}
            onTrack={trackingAvailable ? openTracking : null}
            hasActiveOrder={hasActiveOrder}
            shareCode={data.context.restaurant.shareCode}
            notices={verdeNotices}
            orderingBar={verdeOrdering}
            offers={designOffers}
            contact={<GuestContact contact={data.context.restaurant.contact} copy={copy} />}
            poweredBy={verdePoweredBy}
          >
            {overlays}
          </VerdeMenu>
        ) : (
          <>
        <Hero {...heroProps} />

        <div className="relative z-20 px-4 lg:px-8">
          <div className="mx-auto max-w-[1280px]">
            <div className={`announce-slot ${overlapsHero ? '-mt-7' : 'mt-4'} mb-3 empty:hidden`}>
              <AnnouncementBar
                announcements={data.context.announcements ?? []}
                publicCode={publicCode}
                copy={copy}
              />
            </div>
            <div
              className={`${showModeSwitch ? 'flex' : 'hidden lg:flex'} g-shadow ${template === 'ember' ? 'ember-v2-toolbar' : ''} ${overlapsHero ? '-mt-7' : 'mt-4'} [.announce-slot:not(:empty)+&]:mt-0 items-center justify-between gap-4 rounded-[30px] border border-g-line bg-g-surface p-[5px] lg:rounded-[32px] lg:p-2`}
            >
              {showModeSwitch ? (
                <div className="flex min-w-0 flex-1 gap-1 lg:flex-none lg:rounded-[26px] lg:bg-g-surface-2 lg:p-0.5">
                  <ModeSwitch
                    variant="hero"
                    value={fulfillment}
                    pickupAvailable={pickupAvailable}
                    deliveryAvailable={deliveryAvailable}
                    onChange={handleFulfillmentChange}
                    copy={copy}
                  />
                </div>
              ) : null}
              <SearchField
                id="guest-search-desktop"
                variant="desktop"
                value={query}
                onChange={setQuery}
                placeholder={copy.searchPlaceholder}
                label={copy.searchMenu}
                clearLabel={copy.clearSearch}
                className="hidden max-w-[460px] flex-1 lg:flex"
              />
            </div>
            <SearchField
              id="guest-search-phone"
              variant="phone"
              value={query}
              onChange={setQuery}
              placeholder={copy.searchPlaceholder}
              label={copy.searchMenu}
              clearLabel={copy.clearSearch}
              className="mt-5 lg:hidden"
            />
            {tableLocked ? (
              <TableClosedNotice
                className="mt-4"
                copy={copy}
                isChecking={isRecheckingOrdering}
                status={orderingRecheck}
                onCheckAgain={() => void checkOrderingAgain()}
              />
            ) : orderingRecheck === 'reopened' ? (
              <p
                role="status"
                className="mt-4 rounded-2xl border border-g-line bg-g-surface-2 px-4 py-3 text-[14px] font-semibold text-g-text"
              >
                {copy.tableOrderingReopened}
              </p>
            ) : null}
          </div>
        </div>

        {/* A sticky element only sticks inside its parent: the chips must be a direct child of
            this page-height root (no short wrapper), or the bar scrolls away with its own box. */}
        {hasCategories ? (
          <CategoryChips
            items={chipItems}
            activeId={isPremiumSingleCategory ? premiumCategoryId : navigation.activeId}
            onSelect={isPremiumSingleCategory ? selectPremiumCategory : navigation.select}
            compact={navigation.compact}
            onJumpToSearch={handleJumpToSearch}
            copy={copy}
            template={template}
          />
        ) : null}

        <main
          id={isPremiumSingleCategory ? 'premium-menu-start' : undefined}
          className={`scroll-mt-[76px] px-4 pt-5 lg:px-8 lg:pt-7 ${showCartBar ? 'pb-[150px]' : 'pb-16'}`}
        >
          <div className="mx-auto flex max-w-[1280px] flex-col gap-[34px] lg:gap-[52px]">
            {!canOrder ? (
              <p className="flex items-start gap-3 rounded-[22px] border border-g-line bg-g-surface px-4 py-3.5 text-[14px] leading-[1.7] text-g-text-2">
                <GuestIconInfo className="mt-0.5 size-5 shrink-0 text-g-accent-text" />
                {copy.pickupUnavailable}
              </p>
            ) : null}

            {isGenericQr && canOrder && data.context.restaurant.hours?.open === false ? (
              <p className="flex items-start gap-3 rounded-[22px] border border-g-line bg-g-surface px-4 py-3.5 text-[14px] leading-[1.7] text-g-text-2">
                <GuestIconInfo className="mt-0.5 size-5 shrink-0 text-g-accent-text" />
                {copy.branchClosedNotice}
              </p>
            ) : null}

            {showOffers ? (
              <OffersStrip
                offers={offers}
                currency={currency}
                offersCopy={offersCopy}
                canOrder={canOrder}
                showPhotos={showPhotos}
                onOpen={handleOpenOffer}
              />
            ) : null}

            {showFeatured ? (
              <FeaturedBanners
                products={featuredProducts}
                currency={currency}
                copy={copy}
                canOrder={canOrder}
                onOpen={handleOpenProduct}
                onQuickAdd={handleQuickAdd}
              />
            ) : null}

            {isSearching && searchResultCount > 0 ? (
              <p role="status" className="-mb-4 text-sm font-semibold text-g-text-2">
                {copy.searchResultsCount(searchResultCount)}
              </p>
            ) : null}

            <MenuSections
              categories={premiumVisibleCategories}
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
              brewSettings={template==='brew'?brewSettings:undefined}
              brewLocale={locale}
              bloomSectionEyebrow={locale === 'ar' ? bloomSettings.sectionEyebrowAr : bloomSettings.sectionEyebrowEn}
              bloomSectionHeadline={locale === 'ar' ? bloomSettings.sectionHeadlineAr : bloomSettings.sectionHeadlineEn}
              editorialPriceDisplay={template==='editorial'?editorialSettings.priceDisplay:undefined}
              template={template}
            />
          </div>
        </main>

        <GuestContact contact={data.context.restaurant.contact} copy={copy} />

        <footer className="flex items-center justify-center gap-2 px-4 pb-28 pt-6 text-[11px] text-muted-foreground">
          <span>{copy.poweredBy}</span>
          <a
            href={
              data.context.platform?.poweredByUrl ??
              'https://waytaapp.com/'
            }
            aria-label="Wayta ويتا"
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-g-accent"
          >
            <WaytaLockup tone="auto" size={16} className="[--wayta-ink:currentColor]" />
          </a>
        </footer>

{overlays}
          </>
        )}
      </div>
    </GuestLocaleProvider>
  );
}
