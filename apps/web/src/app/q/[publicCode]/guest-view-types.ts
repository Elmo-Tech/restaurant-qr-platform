/**
 * View-model types shared between `PublicMenuView` (state + orchestration) and the
 * presentational Guest components. Everything money-shaped here is a display string the
 * Backend returned or an exact BigInt-derived one -- never authoritative; the Backend
 * recomputes every total on submit.
 */
import type { ReactNode } from 'react';

/**
 * Offers / Bundles (DEC-069) as the exclusive designs receive them: the ready-made strip (one shared component, dressed by the
 * design's own `--g-*` tokens), the label of the first "Offers" chip and what the chip does (scroll to the strip). `null` when
 * there is nothing to show (no offers, or the Guest is searching).
 */
export interface DesignOffers {
  strip: ReactNode;
  chipLabel: string;
  onJump: () => void;
}

/** One selected Modifier Option shown on a Cart line, e.g. "Size: Large". */
export interface CartLineSelection {
  groupName: string;
  optionName: string;
  priceAdjustment: string;
}

export interface CartLine {
  /** Stable identity for THIS Cart line (productId + selections). */
  lineKey: string;
  productId: string;
  quantity: number;
  modifierOptionIds: string[];
  /** The chosen size (DEC-041) and its current name; null for a product without sizes. */
  variantId: string | null;
  variantName: string | null;
  name: string;
  /** The product has Modifier Groups, so the cart row offers "Edit" (re-open the sheet with these selections). */
  hasModifierGroups: boolean;
  /** The product photo, or null (the cart row then shows the shared dish tile). */
  imageAssetPath: string | null;
  /** The CHARGED unit price: the (discounted) product price PLUS every selected Option's priceAdjustment -- display-only. */
  unitPrice: string;
  /** unitPrice * quantity -- display-only, exact via BigInt minor units. */
  lineTotal: string;
  /** Product Discounts V1: the same line before the discount (original price + options) * quantity; equals `lineTotal` when not discounted. */
  originalLineTotal: string;
  /** True while a product discount applies to this line. */
  discounted: boolean;
  selections: CartLineSelection[];
  /** Offers (DEC-069): set for an Offer line (then `productId` is empty); `offerChoices` are the Guest's choices (identities). */
  offerId: string | null;
  offerChoices: { slotId: string; optionId: string; quantity: number }[];
  /** An Offer line shows one row per slot: "Pick your sandwich: Liver (+10)" and "Gift: Free fries". */
  offerRows?: { slotId: string; title: string; value: string; included: boolean }[];
  /** SOLD_OUT since being added to the Cart: stays visible, blocks submit until removed. */
  blocked: boolean;
  /** Why an Offer line is blocked: not valid today / switched off, or its items changed and must be chosen again. */
  blockedReason: 'OFFER_NOT_TODAY' | 'OFFER_SOLD_OUT' | 'OFFER_CHANGED' | null;
}

/** The free-text checkout fields, keyed for one shared change handler. */
export type CheckoutFieldKey =
  | 'customerName'
  | 'customerPhone'
  | 'customerNotes'
  | 'deliveryAddress'
  | 'deliveryBuilding'
  | 'deliveryFloor'
  | 'deliveryApartment'
  | 'deliveryLandmark';

export type Fulfillment = 'PICKUP' | 'DELIVERY';

/** GENERIC QR checkout state + handlers (Pickup or Delivery). `null` for a TABLE QR. */
export interface CheckoutFormProps {
  fulfillment: Fulfillment;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  onFulfillmentChange: (next: Fulfillment) => void;
  /** The Branches eligible for the CURRENT mode (Pickup: ACTIVE; Delivery: ACTIVE with an ACTIVE zone). */
  branches: { id: string; name: string }[];
  /** The resolved Branch: the only eligible one automatically, or the Guest's choice among several. */
  branchId: string | null;
  onBranchChange: (branchId: string | null) => void;
  /** Delivery only: the resolved Branch's ACTIVE zones. */
  zones: { id: string; name: string; deliveryFee: string; minimumOrder: string }[];
  zoneId: string | null;
  onZoneChange: (zoneId: string | null) => void;
  fields: Record<CheckoutFieldKey, string>;
  onFieldChange: (key: CheckoutFieldKey, value: string) => void;
  /** Localized problem sentences to show under fields (already limited to what the Guest should see now). */
  fieldErrors: Partial<Record<CheckoutFieldKey, string>>;
  /** The Guest left a field: its problem (if any) may be shown from now on. */
  onFieldBlur: (key: CheckoutFieldKey) => void;
  subtotalDisplay: string;
  /** Delivery only, once a zone is chosen. */
  deliveryFeeDisplay: string | null;
  grandTotalDisplay: string;
  /** Delivery only: shown when the items subtotal is below the chosen zone's minimum. */
  minimumMessage: string | null;
  /** Delivery only: how much more the items need to reach the zone minimum (display-only). */
  minimumShortfallDisplay: string | null;
}

/** What the Guest is ordering into -- drives the hero line, the cart header and the cart bar's sub-line. */
export interface OrderingContextView {
  kind: 'TABLE' | 'GENERIC';
  tableNumber: string | null;
  branchName: string | null;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
}
