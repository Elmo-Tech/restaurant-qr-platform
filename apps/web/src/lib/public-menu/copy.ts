/**
 * FT-3B, Section 3 / FT-5: the public Guest Menu's own INTERFACE copy
 * (chrome labels, never Restaurant/Menu/Product content -- that always
 * comes from the Backend's already-resolved, field-level-fallback text and
 * must never be retranslated here). Only two Platform locales exist
 * (`en`/`ar`), so a full i18n library is unjustified (CLAUDE.md #52) --
 * this is one small typed lookup instead.
 */
export interface PublicMenuCopy {
  table: string;
  featured: string;
  soldOut: string;
  categories: string;
  noItemsInCategory: string;
  noItemsInMenu: string;
  menuUnavailableTitle: string;
  menuUnavailableMessage: string;
  /** Branded page of a Restaurant whose menu is not published yet. */
  menuPreparingTitle: string;
  menuPreparingMessage: string;
  qrNotFoundTitle: string;
  qrNotFoundMessage: string;
  add: string;
  cart: string;
  viewCart: string;
  yourOrder: string;
  emptyCart: string;
  remove: string;
  total: string;
  placeOrder: string;
  placingOrder: string;
  removeToContinue: string;
  orderSent: string;
  orderStatusPending: string;
  itemsUnavailableError: string;
  orderNetworkError: string;
  orderNotFoundError: string;
  close: string;
  backToMenu: string;
  required: string;
  optional: string;
  chooseSize: string;
  fromPrice: string;
  /** "+2 more sizes" under the size price list of a product card. */
  moreSizes: (count: number) => string;
  chooseUpTo: string;
  chooseExactly: string;
  addToCart: string;
  cancel: string;
  selectionRequiredError: string;
  pickup: string;
  pickupFrom: string;
  chooseBranch: string;
  customerName: string;
  customerPhone: string;
  customerNotes: string;
  placePickupOrder: string;
  pickupOrderSent: string;
  pickupOrderPending: string;
  pickupUnavailable: string;
  pickupDetailsRequiredError: string;
  pickupBranchError: string;
  fulfillment: string;
  delivery: string;
  deliveryFrom: string;
  deliveryArea: string;
  chooseDeliveryArea: string;
  deliveryAddress: string;
  deliveryBuilding: string;
  deliveryFloor: string;
  deliveryApartment: string;
  deliveryLandmark: string;
  subtotal: string;
  deliveryFee: string;
  minimumOrderLabel: string;
  minimumOrderMessage: (zone: string, amount: string, currency: string) => string;
  placeDeliveryOrder: string;
  deliveryOrderSent: string;
  deliveryOrderPending: string;
  deliveryUnavailable: string;
  deliveryDetailsRequiredError: string;
  deliveryAreaError: string;
  deliveryTo: string;
  // FT-13A: ordering context, navigation, search
  dineIn: string;
  pickupOrDelivery: string;
  chooseAtCheckout: string;
  browseOnly: string;
  language: string;
  /** Share button (the Restaurant menu link) and its confirmations. */
  share: string;
  /** WhatsApp ordering (DEC-042). */
  sendOnWhatsapp: string;
  orderViaWhatsapp: string;
  preparingWhatsapp: string;
  whatsappReadyTitle: string;
  whatsappReadyBody: string;
  whatsappOpen: string;
  whatsappCopy: string;
  whatsappCopied: string;
  whatsappMessageLabel: string;
  whatsappUnavailable: string;
  whatsappOnlyError: string;
  /** Order tracking (DEC-042). */
  trackOrder: string;
  trackTitle: string;
  trackThisDevice: string;
  trackNoneOnDevice: string;
  trackOtherDevice: string;
  trackOtherDeviceHint: string;
  trackPhoneLabel: string;
  trackFind: string;
  trackFinding: string;
  trackNoneFound: string;
  trackInvalidPhone: string;
  trackError: string;
  trackRefresh: string;
  trackRef: (ref: string) => string;
  trackItems: (count: number) => string;
  trackTypeLabel: (type: string) => string;
  trackStatusLabel: (status: string, type: string) => string;
  trackStatusHint: (status: string, type: string) => string | null;
  trackUpdatedAt: (time: string) => string;
  trackForget: string;
  announcementsLabel: string;
  dismissAnnouncement: string;
  pauseAnnouncements: string;
  resumeAnnouncements: string;
  /** Opening-hours badge (DEC-042). Times are already formatted for the Guest. */
  openNow: string;
  openUntil: (time: string) => string;
  closedNow: string;
  temporarilyClosed: string;
  closedOpensToday: (time: string) => string;
  closedOpensTomorrow: (time: string) => string;
  closedOpensOn: (day: string, time: string) => string;
  /** Shown near the cart when the chosen branch is closed. */
  branchClosedHint: string;
  branchClosedNotice: string;
  shareTitle: (restaurantName: string) => string;
  linkCopied: string;
  /** Contact block at the bottom of the menu. */
  findUs: string;
  callUs: string;
  hotlineLabel: string;
  whatsappUs: string;
  contactMaps: string;
  contactWebsite: string;
  poweredBy: string;
  searchMenu: string;
  searchPlaceholder: string;
  clearSearch: string;
  noSearchResults: string;
  searchResultsCount: (count: number) => string;
  menuEmptyTitle: string;
  // FT-13A: products and the customizer
  customizable: string;
  addToOrder: string;
  addAria: (name: string) => string;
  increaseAria: (name: string) => string;
  decreaseAria: (name: string) => string;
  removeAria: (name: string) => string;
  quantity: string;
  inOrderCount: (count: number) => string;
  clearChoice: string;
  chooseBetween: (min: number, max: number) => string;
  pickOne: string;
  selectedOf: (count: number, max: number) => string;
  // FT-13A: order, checkout
  viewOrder: string;
  itemsCount: (count: number) => string;
  yourItems: string;
  pickupHint: string;
  deliveryHint: string;
  yourDetails: string;
  deliveryAddressSection: string;
  minimumShortfall: (amount: string, currency: string) => string;
  discountPercentOff: (percent: string) => string;
  discountAmountOff: (amount: string, currency: string) => string;
  discountLabel: string;
  originalPriceAria: string;
  discountedPriceAria: string;
  priceChangedError: string;
  orderSummary: string;
  selectBranchFirst: string;
  notAvailableNow: string;
  placeOrderHintBlocked: string;
  tableOrderingClosedTitle: string;
  tableOrderingClosedBody: string;
  tableOrderingCheckAgain: string;
  tableOrderingChecking: string;
  tableOrderingStillClosed: string;
  tableOrderingCheckFailed: string;
  tableOrderingReopened: string;
  // FT-13B "Ember & Saffron"
  ourPicks: string;
  /** Cart suggestions (DEC-042): the row of products that go with the order. */
  completeYourMeal: string;
  unavailableNow: string;
  chooseOne: string;
  upTo: (max: number) => string;
  upToSelected: (max: number, selected: number) => string;
  tableDineIn: (table: string) => string;
  deliveringFrom: string;
  change: string;
  minimumOrderOf: (amount: string) => string;
  itemsSubtotal: string;
  lightMode: string;
  darkMode: string;
  // Exclusive VERDE menu chrome
  verdeNavDiscover: string;
  verdeNavMenu: string;
  verdeMenuSections: string;
  verdeViewMode: string;
  verdeViewPhotos: string;
  verdeViewQuick: string;
  verdeThemeSwitch: string;
  verdeSearchResults: string;
  verdeSearchEyebrow: string;
  verdeAcrossMenu: string;
  verdeItemsCount: (count: number) => string;
  verdeNoMatchTitle: string;
  verdeNoMatchText: string;
  verdeOpenCategory: (name: string) => string;
  verdeBrandHome: string;
  verdeHeroPlate: string;
  /** Navigation, list hints and contact labels of the exclusive El Sherbiny menu. */
  sherbinyNavHome: string;
  sherbinyNavFavorites: string;
  sherbinyNavMenu: string;
  sherbinyNavContact: string;
  sherbinyPageLinks: string;
  sherbinyOpenLinks: string;
  sherbinyAllSections: string;
  sherbinyListHint: (count: number) => string;
  sherbinyDetails: (name: string) => string;
  sherbinyAddressLabel: string;
  sherbinyPhoneLabel: string;
  sherbinySectionsStat: string;
  /** Navigation, favorites and view labels of the exclusive Makkboz menu. */
  makkbozNavMenu: string;
  makkbozNavStory: string;
  makkbozNavContact: string;
  makkbozFavoritesShow: string;
  makkbozFavoritesHide: string;
  makkbozFavoriteAdd: (name: string) => string;
  makkbozFavoriteRemove: (name: string) => string;
  makkbozFavoriteAdded: string;
  makkbozFavoriteRemoved: string;
  makkbozNoFavoritesTitle: string;
  makkbozNoFavoritesText: string;
  makkbozViewCards: string;
  makkbozViewList: string;
  makkbozViewMode: string;
  makkbozAll: string;
  makkbozSummaryAll: (count: number) => string;
  makkbozSummaryFavorites: (count: number) => string;
  makkbozSummarySearch: (count: number) => string;
  makkbozShowAll: string;
  makkbozChooseOptions: string;
  makkbozLinkCopied: string;
  /** Navigation, favorites, view and weight labels of the exclusive Meat Lovers menu. */
  meatLoversNavSections: string;
  meatLoversNavMenu: string;
  meatLoversNavStory: string;
  meatLoversNavContact: string;
  meatLoversAll: string;
  meatLoversFavorites: string;
  meatLoversFavoriteAdd: (name: string) => string;
  meatLoversFavoriteRemove: (name: string) => string;
  meatLoversFavoriteAdded: string;
  meatLoversFavoriteRemoved: string;
  meatLoversViewMode: string;
  meatLoversViewCards: string;
  meatLoversViewList: string;
  meatLoversResultCount: (count: number) => string;
  meatLoversChooseWeight: string;
  meatLoversChooseWeightAria: (name: string) => string;
  meatLoversChoose: string;
  /** "EGP / kg": `unit` is the localized currency label. */
  meatLoversPerKg: (unit: string) => string;
  meatLoversShowAll: string;
  meatLoversBackTop: string;
  slideOf: (index: number, count: number) => string;
  orderingMode: string;
  // Final polish: two-step checkout + editing a line
  stepOf: (step: number, total: number) => string;
  stepReview: string;
  stepDetails: string;
  continueToDetails: string;
  back: string;
  edit: string;
  editAria: (name: string) => string;
  updateOrder: string;
  deliveryFeeNextStep: string;
  reviewItemsHint: string;
}

const EN_COPY: PublicMenuCopy = {
  table: 'Table',
  featured: 'Featured',
  soldOut: 'Sold out',
  categories: 'Categories',
  noItemsInCategory: 'No items in this category yet.',
  noItemsInMenu: "This menu doesn't have any items yet.",
  menuUnavailableTitle: 'Menu unavailable',
  menuUnavailableMessage:
    'This restaurant menu is temporarily unavailable. Please check back soon.',
  menuPreparingTitle: 'Our menu is on its way',
  menuPreparingMessage: "We're putting the final touches on it. Please check back in a little while.",
  qrNotFoundTitle: 'This QR code is no longer active.',
  qrNotFoundMessage: 'Please ask a member of staff for help.',
  add: 'Add',
  cart: 'Cart',
  viewCart: 'View cart',
  yourOrder: 'Your order',
  emptyCart: 'Your cart is empty.',
  remove: 'Remove',
  total: 'Total',
  placeOrder: 'Send order',
  placingOrder: 'Sending order…',
  removeToContinue: 'No longer available — remove to continue.',
  orderSent: 'Order sent',
  orderStatusPending: 'Waiting for the restaurant to accept your order.',
  itemsUnavailableError:
    'One or more items in your cart are no longer available. Please review your cart.',
  orderNetworkError:
    "Couldn't send your order. Check your connection and try again — your items and details are still here.",
  orderNotFoundError: 'This QR code is no longer active. Please ask a member of staff for help.',
  close: 'Close',
  backToMenu: 'Back to menu',
  required: 'Required',
  optional: 'Optional',
  chooseSize: 'Size',
  fromPrice: 'From',
  moreSizes: (count) => (count === 1 ? '+1 more size' : `+${count} more sizes`),
  chooseUpTo: 'Choose up to',
  chooseExactly: 'Choose',
  addToCart: 'Add to cart',
  cancel: 'Cancel',
  selectionRequiredError: 'Please complete the required selections above.',
  pickup: 'Pickup',
  pickupFrom: 'Pickup from',
  chooseBranch: 'Choose a branch',
  customerName: 'Name',
  customerPhone: 'Phone',
  customerNotes: 'Notes (optional)',
  placePickupOrder: 'Place pickup order',
  pickupOrderSent: 'Pickup order sent',
  pickupOrderPending: 'Waiting for the restaurant to accept your pickup order.',
  pickupUnavailable: 'Ordering is not available through the menu right now. You can still browse the menu.',
  pickupDetailsRequiredError: 'Please enter your name and phone number.',
  pickupBranchError: 'Please choose a valid pickup branch.',
  fulfillment: 'How would you like your order?',
  delivery: 'Delivery',
  deliveryFrom: 'Delivery from',
  deliveryArea: 'Delivery area',
  chooseDeliveryArea: 'Choose your area',
  deliveryAddress: 'Address',
  deliveryBuilding: 'Building (optional)',
  deliveryFloor: 'Floor (optional)',
  deliveryApartment: 'Apartment (optional)',
  deliveryLandmark: 'Landmark (optional)',
  subtotal: 'Subtotal',
  deliveryFee: 'Delivery fee',
  minimumOrderLabel: 'minimum',
  minimumOrderMessage: (zone, amount, currency) =>
    `Minimum order for ${zone} is ${amount} ${currency}.`,
  placeDeliveryOrder: 'Place delivery order',
  deliveryOrderSent: 'Delivery order sent',
  deliveryOrderPending: 'Waiting for the restaurant to accept your delivery order.',
  deliveryUnavailable: 'Delivery is not available right now.',
  deliveryDetailsRequiredError: 'Please enter your name, phone number and address.',
  deliveryAreaError: 'Please choose a valid delivery area.',
  deliveryTo: 'Delivering to',
  dineIn: 'Dine in',
  pickupOrDelivery: 'Pickup or delivery',
  chooseAtCheckout: 'Choose at checkout',
  browseOnly: 'Browse only',
  language: 'Language',
  share: 'Share',
  sendOnWhatsapp: 'Send order on WhatsApp',
  orderViaWhatsapp: 'Or send it on WhatsApp',
  preparingWhatsapp: 'Preparing your message…',
  whatsappReadyTitle: 'Send it on WhatsApp',
  whatsappReadyBody: 'Your order is written and ready. Open WhatsApp and press send so the restaurant receives it. It is not placed until you send the message.',
  whatsappOpen: 'Open WhatsApp',
  whatsappCopy: 'Copy the message',
  whatsappCopied: 'Message copied',
  whatsappMessageLabel: 'Your order message',
  whatsappUnavailable: 'Ordering on WhatsApp is not available right now.',
  whatsappOnlyError: 'This restaurant now takes orders on WhatsApp. The page was refreshed: send your order again.',
  trackOrder: 'Track order',
  trackTitle: 'Track your order',
  trackThisDevice: 'Your orders on this device',
  trackNoneOnDevice: 'No orders from this device yet.',
  trackOtherDevice: 'Ordered from another device?',
  trackOtherDeviceHint: 'Enter the phone number you used for the order to see its status (orders from the last 24 hours).',
  trackPhoneLabel: 'Phone number',
  trackFind: 'Find my order',
  trackFinding: 'Searching…',
  trackNoneFound: 'No recent orders found for this number.',
  trackInvalidPhone: 'Enter the full phone number you used for the order.',
  trackError: 'Could not load the status. Check your connection and try again.',
  trackRefresh: 'Refresh',
  trackRef: (ref) => `Order #${ref}`,
  trackItems: (count) => (count === 1 ? '1 item' : `${count} items`),
  trackTypeLabel: (type) => (type === 'DELIVERY' ? 'Delivery' : type === 'PICKUP' ? 'Pickup' : 'Dine-in'),
  trackStatusLabel: (status, type) => {
    switch (status) {
      case 'PENDING':
        return 'Order received';
      case 'ACCEPTED':
        return 'Order accepted';
      case 'PREPARING':
        return 'Being prepared';
      case 'READY':
        return type === 'PICKUP' ? 'Ready for pickup' : 'Ready';
      case 'OUT_FOR_DELIVERY':
        return 'On the way';
      case 'SERVED':
        return type === 'DELIVERY' ? 'Delivered' : type === 'PICKUP' ? 'Picked up' : 'Served';
      case 'REJECTED':
        return 'Not accepted';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  },
  trackStatusHint: (status, type) => {
    switch (status) {
      case 'PENDING':
        return 'Waiting for the restaurant to accept your order.';
      case 'READY':
        return type === 'PICKUP'
          ? 'Your order is ready. Come and pick it up.'
          : type === 'DELIVERY'
            ? 'Your order is ready and will be on its way shortly.'
            : null;
      case 'OUT_FOR_DELIVERY':
        return 'Your order is on its way to you.';
      case 'REJECTED':
        return 'The restaurant could not take this order. Please contact them.';
      case 'CANCELLED':
        return 'This order was cancelled.';
      default:
        return null;
    }
  },
  trackUpdatedAt: (time) => `Updated ${time}`,
  trackForget: 'Remove from this device',
  announcementsLabel: 'Announcements',
  dismissAnnouncement: 'Dismiss',
  pauseAnnouncements: 'Pause scrolling',
  resumeAnnouncements: 'Resume scrolling',
  openNow: 'Open now',
  openUntil: (time) => `Open now · until ${time}`,
  closedNow: 'Closed',
  temporarilyClosed: 'Temporarily closed',
  closedOpensToday: (time) => `Closed · opens today at ${time}`,
  closedOpensTomorrow: (time) => `Closed · opens tomorrow at ${time}`,
  closedOpensOn: (day, time) => `Closed · opens ${day} at ${time}`,
  branchClosedHint: 'This branch is closed right now, so it cannot take orders.',
  branchClosedNotice: 'This branch is closed right now. You can browse the menu, but orders are not accepted until it opens.',
  shareTitle: (name) => `${name} menu`,
  linkCopied: 'Link copied',
  findUs: 'Find us',
  callUs: 'Call us',
  hotlineLabel: 'Hotline',
  whatsappUs: 'WhatsApp',
  contactMaps: 'Location',
  contactWebsite: 'Website',
  poweredBy: 'Powered by',
  searchMenu: 'Search the menu',
  searchPlaceholder: 'Search dishes or drinks',
  clearSearch: 'Clear search',
  noSearchResults: 'No menu items match your search.',
  searchResultsCount: (count) => (count === 1 ? '1 item found' : `${count} items found`),
  menuEmptyTitle: 'The menu is being prepared',
  customizable: 'Customizable',
  addToOrder: 'Add to order',
  addAria: (name) => `Add ${name}`,
  increaseAria: (name) => `Add one more ${name}`,
  decreaseAria: (name) => `Remove one ${name}`,
  removeAria: (name) => `Remove ${name} from your order`,
  quantity: 'Quantity',
  inOrderCount: (count) => `${count} in your order`,
  clearChoice: 'Clear',
  chooseBetween: (min, max) => `Choose ${min} to ${max}`,
  pickOne: 'Pick one',
  selectedOf: (count, max) => `${count} of ${max} selected`,
  viewOrder: 'View order',
  itemsCount: (count) => (count === 1 ? '1 item' : `${count} items`),
  yourItems: 'Your items',
  pickupHint: 'Collect it from the branch',
  deliveryHint: 'Brought to your door',
  yourDetails: 'Your details',
  deliveryAddressSection: 'Address',
  minimumShortfall: (amount, currency) => `Add ${amount} ${currency} more to place a delivery order.`,
  discountPercentOff: (percent) => `${percent}% OFF`,
  discountAmountOff: (amount, currency) => `Save ${amount} ${currency}`,
  discountLabel: 'Discount',
  originalPriceAria: 'Original price',
  discountedPriceAria: 'Price now',
  priceChangedError:
    'Prices changed while you were ordering. Your total has been updated: please review it and place your order again.',
  orderSummary: 'Order summary',
  selectBranchFirst: 'Choose a branch to see delivery areas.',
  notAvailableNow: 'Not available right now',
  placeOrderHintBlocked: 'Remove the unavailable items to continue.',
  tableOrderingClosedTitle: 'Ordering is closed for this table',
  tableOrderingClosedBody:
    'Ordering for this table is closed right now. Please ask a member of staff.',
  tableOrderingCheckAgain: 'Check again',
  tableOrderingChecking: 'Checking…',
  tableOrderingStillClosed: 'Still closed. Please ask a member of staff.',
  tableOrderingCheckFailed: 'Could not check right now. Please try again.',
  tableOrderingReopened: 'Ordering is open again. You can send your order now.',
  ourPicks: 'Our picks',
  completeYourMeal: 'Complete your meal',
  unavailableNow: 'Unavailable now',
  chooseOne: 'Choose 1',
  upTo: (max) => `Up to ${max}`,
  upToSelected: (max, selected) => `Up to ${max} · ${selected} selected`,
  tableDineIn: (table) => `Table ${table} · Dine in`,
  deliveringFrom: 'Delivering from',
  change: 'Change',
  minimumOrderOf: (amount) => `Minimum order ${amount}`,
  itemsSubtotal: 'Items subtotal',
  lightMode: 'Light mode',
  darkMode: 'Dark mode',
  verdeNavDiscover: 'Our picks',
  verdeNavMenu: 'Explore menu',
  verdeMenuSections: 'Menu sections',
  verdeViewMode: 'Menu view',
  verdeViewPhotos: 'Photos',
  verdeViewQuick: 'Quick list',
  verdeThemeSwitch: 'Switch colour theme',
  verdeSearchResults: 'Search results',
  verdeSearchEyebrow: 'FIND YOUR FAVORITE',
  verdeAcrossMenu: 'Across the whole menu',
  verdeItemsCount: (count) => (count === 1 ? '1 dish' : `${count} dishes`),
  verdeNoMatchTitle: 'No matching dishes',
  verdeNoMatchText: 'Try a different search or explore the categories.',
  verdeOpenCategory: (name) => `Open ${name}`,
  verdeBrandHome: 'Back to the top',
  verdeHeroPlate: 'Featured dish',
  sherbinyNavHome: 'Home',
  sherbinyNavFavorites: 'Favorites',
  sherbinyNavMenu: 'Menu',
  sherbinyNavContact: 'Find us',
  sherbinyPageLinks: 'Page links',
  sherbinyOpenLinks: 'Open page links',
  sherbinyAllSections: 'All sections',
  sherbinyListHint: (count) => `${count === 1 ? '1 dish' : `${count} dishes`} · tap a dish for sizes and extras`,
  sherbinyDetails: (name) => `Details of ${name}`,
  sherbinyAddressLabel: 'Address',
  sherbinyPhoneLabel: 'Phone',
  sherbinySectionsStat: 'Sections',
  makkbozNavMenu: 'Menu',
  makkbozNavStory: 'Our story',
  makkbozNavContact: 'Visit us',
  makkbozFavoritesShow: 'Show my favorites',
  makkbozFavoritesHide: 'Show the whole menu',
  makkbozFavoriteAdd: (name) => `Add ${name} to favorites`,
  makkbozFavoriteRemove: (name) => `Remove ${name} from favorites`,
  makkbozFavoriteAdded: 'Added to your favorites',
  makkbozFavoriteRemoved: 'Removed from favorites',
  makkbozNoFavoritesTitle: 'No favorites yet',
  makkbozNoFavoritesText: 'Tap the heart on any dish you like.',
  makkbozViewCards: 'Cards',
  makkbozViewList: 'List',
  makkbozViewMode: 'How dishes are shown',
  makkbozAll: 'All',
  makkbozSummaryAll: (count) => `${count} dishes made with love`,
  makkbozSummaryFavorites: (count) => `${count} of your favorites`,
  makkbozSummarySearch: (count) => `${count} search results`,
  makkbozShowAll: 'Show all dishes',
  makkbozChooseOptions: 'Choose',
  makkbozLinkCopied: 'Menu link copied',
  meatLoversNavSections: 'Sections',
  meatLoversNavMenu: 'Menu',
  meatLoversNavStory: 'The cut story',
  meatLoversNavContact: 'Find us',
  meatLoversAll: 'All selections',
  meatLoversFavorites: 'Favorites',
  meatLoversFavoriteAdd: (name) => `Add ${name} to favorites`,
  meatLoversFavoriteRemove: (name) => `Remove ${name} from favorites`,
  meatLoversFavoriteAdded: 'Added to your favorites',
  meatLoversFavoriteRemoved: 'Removed from favorites',
  meatLoversViewMode: 'How cuts are shown',
  meatLoversViewCards: 'Photo view',
  meatLoversViewList: 'List view',
  meatLoversResultCount: (count) => (count === 1 ? '1 item' : `${count} items`),
  meatLoversChooseWeight: 'Choose weight',
  meatLoversChooseWeightAria: (name) => `Choose the weight of ${name}`,
  meatLoversChoose: 'Choose',
  meatLoversPerKg: (unit) => `${unit} / kg`,
  meatLoversShowAll: 'Show all cuts',
  meatLoversBackTop: 'Back to top',
  slideOf: (index, count) => `Pick ${index} of ${count}`,
  orderingMode: 'How would you like your order?',
  stepOf: (step, total) => `Step ${step} of ${total}`,
  stepReview: 'Review your order',
  stepDetails: 'Order details',
  continueToDetails: 'Continue',
  back: 'Back',
  edit: 'Edit',
  editAria: (name) => `Edit ${name}`,
  updateOrder: 'Update order',
  deliveryFeeNextStep: 'The delivery fee is added in the next step.',
  reviewItemsHint: 'Review your items, then continue.',
};

const AR_COPY: PublicMenuCopy = {
  table: 'طاولة',
  featured: 'مميز',
  soldOut: 'نفد',
  categories: 'الأقسام',
  noItemsInCategory: 'لا توجد أصناف في هذا القسم حاليًا.',
  noItemsInMenu: 'لا توجد أصناف متاحة في القائمة حاليًا.',
  menuUnavailableTitle: 'القائمة غير متاحة',
  menuUnavailableMessage: 'قائمة المطعم غير متاحة حاليًا. يرجى المحاولة مرة أخرى لاحقًا.',
  menuPreparingTitle: 'المنيو قيد التجهيز',
  menuPreparingMessage: 'بنجهّز القائمة بكل عناية. عُد إلينا بعد قليل، يسعدنا استقبالك.',
  qrNotFoundTitle: 'رمز QR هذا غير متاح حاليًا.',
  qrNotFoundMessage: 'يرجى التواصل مع أحد أفراد طاقم المطعم للمساعدة.',
  add: 'إضافة',
  cart: 'السلة',
  viewCart: 'عرض السلة',
  yourOrder: 'طلبك',
  emptyCart: 'سلتك فارغة.',
  remove: 'إزالة',
  total: 'الإجمالي',
  placeOrder: 'إرسال الطلب',
  placingOrder: 'جارٍ إرسال الطلب…',
  removeToContinue: 'لم يعد متاحًا — يرجى الإزالة للمتابعة.',
  orderSent: 'تم إرسال الطلب',
  orderStatusPending: 'في انتظار موافقة المطعم على طلبك.',
  itemsUnavailableError: 'بعض الأصناف في سلتك لم تعد متاحة. يرجى مراجعة سلتك.',
  orderNetworkError: 'تعذر إرسال طلبك. تحقق من اتصالك وحاول مرة أخرى — أصنافك وبياناتك ما زالت محفوظة.',
  orderNotFoundError: 'رمز QR هذا غير متاح حاليًا. يرجى التواصل مع أحد أفراد طاقم المطعم للمساعدة.',
  close: 'إغلاق',
  backToMenu: 'العودة إلى القائمة',
  required: 'مطلوب',
  optional: 'اختياري',
  chooseSize: 'الحجم',
  fromPrice: 'من',
  moreSizes: (count) =>
    count === 1 ? '+ مقاس آخر' : count === 2 ? '+ مقاسان آخران' : count <= 10 ? `+ ${count} مقاسات أخرى` : `+ ${count} مقاسًا آخر`,
  chooseUpTo: 'اختر حتى',
  chooseExactly: 'اختر',
  addToCart: 'أضف إلى طلبي',
  cancel: 'إلغاء',
  selectionRequiredError: 'يرجى إكمال الاختيارات المطلوبة أعلاه.',
  pickup: 'استلام من الفرع',
  pickupFrom: 'الاستلام من',
  chooseBranch: 'اختر الفرع',
  customerName: 'الاسم',
  customerPhone: 'رقم الهاتف',
  customerNotes: 'ملاحظات (اختياري)',
  placePickupOrder: 'تأكيد طلب الاستلام',
  pickupOrderSent: 'تم إرسال طلب الاستلام',
  pickupOrderPending: 'في انتظار موافقة المطعم على طلب الاستلام.',
  pickupUnavailable: 'الطلب عبر القائمة غير متاح حاليًا. يمكنك تصفح القائمة.',
  pickupDetailsRequiredError: 'يرجى إدخال اسمك ورقم هاتفك.',
  pickupBranchError: 'يرجى اختيار فرع صالح للاستلام.',
  fulfillment: 'كيف تريد استلام طلبك؟',
  delivery: 'توصيل',
  deliveryFrom: 'التوصيل من',
  deliveryArea: 'منطقة التوصيل',
  chooseDeliveryArea: 'اختر منطقتك',
  deliveryAddress: 'العنوان',
  deliveryBuilding: 'المبنى (اختياري)',
  deliveryFloor: 'الطابق (اختياري)',
  deliveryApartment: 'الشقة (اختياري)',
  deliveryLandmark: 'علامة مميزة (اختياري)',
  subtotal: 'المجموع الفرعي',
  deliveryFee: 'رسوم التوصيل',
  minimumOrderLabel: 'الحد الأدنى',
  minimumOrderMessage: (zone, amount, currency) =>
    `الحد الأدنى للطلب في منطقة ${zone} هو ${amount} ${currency}.`,
  placeDeliveryOrder: 'تأكيد طلب التوصيل',
  deliveryOrderSent: 'تم إرسال طلب التوصيل',
  deliveryOrderPending: 'في انتظار موافقة المطعم على طلب التوصيل.',
  deliveryUnavailable: 'التوصيل غير متاح حاليًا.',
  deliveryDetailsRequiredError: 'يرجى إدخال اسمك ورقم هاتفك وعنوانك.',
  deliveryAreaError: 'يرجى اختيار منطقة توصيل صالحة.',
  deliveryTo: 'التوصيل إلى',
  dineIn: 'داخل المطعم',
  pickupOrDelivery: 'استلام أو توصيل',
  chooseAtCheckout: 'اختر عند إتمام الطلب',
  browseOnly: 'تصفح فقط',
  language: 'اللغة',
  share: 'مشاركة',
  sendOnWhatsapp: 'أرسل الطلب على واتساب',
  orderViaWhatsapp: 'أو أرسله على واتساب',
  preparingWhatsapp: 'جارٍ تجهيز رسالتك…',
  whatsappReadyTitle: 'أرسله على واتساب',
  whatsappReadyBody: 'طلبك مكتوب وجاهز. افتح واتساب واضغط إرسال ليصل الطلب إلى المطعم. لا يُعتبر الطلب مُرسلًا إلا بعد إرسال الرسالة.',
  whatsappOpen: 'افتح واتساب',
  whatsappCopy: 'انسخ الرسالة',
  whatsappCopied: 'تم نسخ الرسالة',
  whatsappMessageLabel: 'رسالة طلبك',
  whatsappUnavailable: 'الطلب عبر واتساب غير متاح الآن.',
  whatsappOnlyError: 'هذا المطعم يستقبل الطلبات الآن على واتساب. تم تحديث الصفحة: أرسل طلبك مرة أخرى.',
  trackOrder: 'تتبع الطلب',
  trackTitle: 'تتبع طلبك',
  trackThisDevice: 'طلباتك من هذا الجهاز',
  trackNoneOnDevice: 'لا توجد طلبات من هذا الجهاز بعد.',
  trackOtherDevice: 'طلبت من جهاز آخر؟',
  trackOtherDeviceHint: 'اكتب رقم الهاتف الذي استخدمته في الطلب لتعرف حالته (طلبات آخر 24 ساعة).',
  trackPhoneLabel: 'رقم الهاتف',
  trackFind: 'ابحث عن طلبي',
  trackFinding: 'جارٍ البحث…',
  trackNoneFound: 'لا توجد طلبات حديثة لهذا الرقم.',
  trackInvalidPhone: 'اكتب رقم الهاتف كاملًا كما استخدمته في الطلب.',
  trackError: 'تعذّر تحميل الحالة. تأكد من الاتصال وحاول مرة أخرى.',
  trackRefresh: 'تحديث',
  trackRef: (ref) => `طلب رقم ${ref}`,
  trackItems: (count) => (count === 1 ? 'صنف واحد' : count === 2 ? 'صنفان' : count <= 10 ? `${count} أصناف` : `${count} صنفًا`),
  trackTypeLabel: (type) => (type === 'DELIVERY' ? 'توصيل' : type === 'PICKUP' ? 'استلام' : 'داخل المطعم'),
  trackStatusLabel: (status, type) => {
    switch (status) {
      case 'PENDING':
        return 'تم استلام الطلب';
      case 'ACCEPTED':
        return 'تم قبول الطلب';
      case 'PREPARING':
        return 'قيد التحضير';
      case 'READY':
        return type === 'PICKUP' ? 'جاهز للاستلام' : 'جاهز';
      case 'OUT_FOR_DELIVERY':
        return 'في الطريق إليك';
      case 'SERVED':
        return type === 'DELIVERY' ? 'تم التوصيل' : type === 'PICKUP' ? 'تم الاستلام' : 'تم التقديم';
      case 'REJECTED':
        return 'لم يُقبل الطلب';
      case 'CANCELLED':
        return 'ملغي';
      default:
        return status;
    }
  },
  trackStatusHint: (status, type) => {
    switch (status) {
      case 'PENDING':
        return 'بانتظار قبول المطعم لطلبك.';
      case 'READY':
        return type === 'PICKUP'
          ? 'طلبك جاهز. تفضّل بالاستلام.'
          : type === 'DELIVERY'
            ? 'طلبك جاهز وسيكون في الطريق إليك قريبًا.'
            : null;
      case 'OUT_FOR_DELIVERY':
        return 'طلبك في الطريق إليك.';
      case 'REJECTED':
        return 'تعذّر على المطعم قبول هذا الطلب. من فضلك تواصل معه.';
      case 'CANCELLED':
        return 'تم إلغاء هذا الطلب.';
      default:
        return null;
    }
  },
  trackUpdatedAt: (time) => `آخر تحديث ${time}`,
  trackForget: 'إزالة من هذا الجهاز',
  announcementsLabel: 'الإعلانات',
  dismissAnnouncement: 'إخفاء',
  pauseAnnouncements: 'إيقاف التحريك',
  resumeAnnouncements: 'استئناف التحريك',
  openNow: 'مفتوح الآن',
  openUntil: (time) => `مفتوح الآن · حتى ${time}`,
  closedNow: 'مغلق',
  temporarilyClosed: 'مغلق مؤقتًا',
  closedOpensToday: (time) => `مغلق · يفتح اليوم الساعة ${time}`,
  closedOpensTomorrow: (time) => `مغلق · يفتح غدًا الساعة ${time}`,
  closedOpensOn: (day, time) => `مغلق · يفتح ${day} الساعة ${time}`,
  branchClosedHint: 'هذا الفرع مغلق الآن ولا يستقبل الطلبات.',
  branchClosedNotice: 'هذا الفرع مغلق الآن. يمكنك تصفح المنيو ولكن لا تُقبل الطلبات حتى يفتح.',
  shareTitle: (name) => `منيو ${name}`,
  linkCopied: 'تم نسخ الرابط',
  findUs: 'تواصل معنا',
  callUs: 'اتصل بنا',
  hotlineLabel: 'الخط الساخن',
  whatsappUs: 'واتساب',
  contactMaps: 'الموقع',
  contactWebsite: 'الموقع الإلكتروني',
  poweredBy: 'بدعم من',
  searchMenu: 'ابحث في القائمة',
  searchPlaceholder: 'ابحث عن طبق أو مشروب',
  clearSearch: 'مسح البحث',
  noSearchResults: 'لا توجد أصناف تطابق بحثك.',
  searchResultsCount: (count) => (count === 1 ? 'صنف واحد' : count === 2 ? 'صنفان' : count <= 10 ? `${count} أصناف` : `${count} صنفًا`),
  menuEmptyTitle: 'القائمة قيد التجهيز',
  customizable: 'قابل للتخصيص',
  addToOrder: 'أضف إلى طلبي',
  addAria: (name) => `إضافة ${name}`,
  increaseAria: (name) => `إضافة ${name} آخر`,
  decreaseAria: (name) => `إزالة واحد من ${name}`,
  removeAria: (name) => `إزالة ${name} من طلبك`,
  quantity: 'الكمية',
  inOrderCount: (count) => `${count} في طلبك`,
  clearChoice: 'مسح',
  chooseBetween: (min, max) => `اختر من ${min} إلى ${max}`,
  pickOne: 'اختر واحدًا',
  selectedOf: (count, max) => `تم اختيار ${count} من ${max}`,
  viewOrder: 'عرض الطلب',
  itemsCount: (count) => (count === 1 ? 'صنف واحد' : count === 2 ? 'صنفان' : count <= 10 ? `${count} أصناف` : `${count} صنفًا`),
  yourItems: 'أصنافك',
  pickupHint: 'استلمه من الفرع',
  deliveryHint: 'يصلك إلى بابك',
  yourDetails: 'بياناتك',
  deliveryAddressSection: 'العنوان',
  minimumShortfall: (amount, currency) => `أضف ${amount} ${currency} لإتمام طلب التوصيل.`,
  discountPercentOff: (percent) => `خصم ${percent}%`,
  discountAmountOff: (amount, currency) => `وفّر ${amount} ${currency}`,
  discountLabel: 'الخصم',
  originalPriceAria: 'السعر الأصلي',
  discountedPriceAria: 'السعر الآن',
  priceChangedError:
    'تغيّرت الأسعار أثناء طلبك. تم تحديث الإجمالي، يرجى مراجعته ثم إرسال الطلب مرة أخرى.',
  orderSummary: 'ملخص الطلب',
  selectBranchFirst: 'اختر الفرع لعرض مناطق التوصيل.',
  notAvailableNow: 'غير متاح حاليًا',
  placeOrderHintBlocked: 'أزل الأصناف غير المتاحة للمتابعة.',
  tableOrderingClosedTitle: 'الطلب مغلق لهذه الطاولة',
  tableOrderingClosedBody:
    'الطلب من هذه الطاولة مغلق حاليًا. من فضلك اسأل أحد الموظفين.',
  tableOrderingCheckAgain: 'تحقق مرة أخرى',
  tableOrderingChecking: 'جارٍ التحقق…',
  tableOrderingStillClosed: 'ما زال مغلقًا. من فضلك اسأل أحد الموظفين.',
  tableOrderingCheckFailed: 'تعذر التحقق الآن. من فضلك حاول مرة أخرى.',
  tableOrderingReopened: 'الطلب متاح مرة أخرى. يمكنك إرسال طلبك الآن.',
  ourPicks: 'مميز عندنا',
  completeYourMeal: 'كمّل وجبتك',
  unavailableNow: 'غير متاح الآن',
  chooseOne: 'اختر واحد',
  upTo: (max) => `حتى ${max}`,
  upToSelected: (max, selected) => `حتى ${max} · اخترت ${selected}`,
  tableDineIn: (table) => `طاولة ${table} · داخل المطعم`,
  deliveringFrom: 'التوصيل من',
  change: 'تغيير',
  minimumOrderOf: (amount) => `حد أدنى للطلب ${amount}`,
  itemsSubtotal: 'إجمالي الأصناف',
  lightMode: 'الوضع الفاتح',
  darkMode: 'الوضع الداكن',
  verdeNavDiscover: 'اختياراتنا',
  verdeNavMenu: 'اكتشف المنيو',
  verdeMenuSections: 'أقسام المنيو',
  verdeViewMode: 'طريقة العرض',
  verdeViewPhotos: 'صور',
  verdeViewQuick: 'سريع',
  verdeThemeSwitch: 'تغيير ألوان التصميم',
  verdeSearchResults: 'نتائج البحث',
  verdeSearchEyebrow: 'ابحث عن المفضل عندك',
  verdeAcrossMenu: 'في كل أقسام المنيو',
  verdeItemsCount: (count) => (count === 1 ? 'صنف واحد' : count === 2 ? 'صنفان' : count <= 10 ? `${count} أصناف` : `${count} صنفًا`),
  verdeNoMatchTitle: 'مفيش أصناف مطابقة',
  verdeNoMatchText: 'جرب اسم تاني أو امسح البحث وشوف الأقسام.',
  verdeOpenCategory: (name) => `افتح ${name}`,
  verdeBrandHome: 'العودة لأعلى الصفحة',
  verdeHeroPlate: 'طبق مميز',
  sherbinyNavHome: 'الرئيسية',
  sherbinyNavFavorites: 'المختارات',
  sherbinyNavMenu: 'المنيو',
  sherbinyNavContact: 'مكاننا',
  sherbinyPageLinks: 'روابط الصفحة',
  sherbinyOpenLinks: 'افتح روابط الصفحة',
  sherbinyAllSections: 'كل الأقسام',
  sherbinyListHint: (count) => `${count === 1 ? 'صنف واحد' : count === 2 ? 'صنفان' : count <= 10 ? `${count} أصناف` : `${count} صنفًا`} · اضغط على الصنف لعرض الأحجام والإضافات`,
  sherbinyDetails: (name) => `تفاصيل ${name}`,
  sherbinyAddressLabel: 'العنوان',
  sherbinyPhoneLabel: 'رقم التواصل',
  sherbinySectionsStat: 'الأقسام',
  makkbozNavMenu: 'المنيو',
  makkbozNavStory: 'حكايتنا',
  makkbozNavContact: 'زورنا',
  makkbozFavoritesShow: 'عرض أصنافي المفضلة',
  makkbozFavoritesHide: 'عرض كل المنيو',
  makkbozFavoriteAdd: (name) => `إضافة ${name} إلى المفضلة`,
  makkbozFavoriteRemove: (name) => `إزالة ${name} من المفضلة`,
  makkbozFavoriteAdded: 'اتضاف لمفضلاتك',
  makkbozFavoriteRemoved: 'اتشال من المفضلة',
  makkbozNoFavoritesTitle: 'لسه مفيش أصناف مفضلة',
  makkbozNoFavoritesText: 'دوس على القلب عند أي صنف عجبك.',
  makkbozViewCards: 'بالصور',
  makkbozViewList: 'قائمة',
  makkbozViewMode: 'طريقة عرض الأصناف',
  makkbozAll: 'الكل',
  makkbozSummaryAll: (count) => `${count} صنف معمولين بحب`,
  makkbozSummaryFavorites: (count) => `${count} صنف من مفضلاتك`,
  makkbozSummarySearch: (count) => `${count} نتيجة للبحث`,
  makkbozShowAll: 'عرض كل الأصناف',
  makkbozChooseOptions: 'اختار',
  makkbozLinkCopied: 'تم نسخ رابط المنيو',
  meatLoversNavSections: 'الأقسام',
  meatLoversNavMenu: 'المنيو',
  meatLoversNavStory: 'حكاية القطعة',
  meatLoversNavContact: 'العنوان',
  meatLoversAll: 'كل الأصناف',
  meatLoversFavorites: 'المفضلة',
  meatLoversFavoriteAdd: (name) => `إضافة ${name} إلى المفضلة`,
  meatLoversFavoriteRemove: (name) => `إزالة ${name} من المفضلة`,
  meatLoversFavoriteAdded: 'اتضاف لمفضلاتك',
  meatLoversFavoriteRemoved: 'اتشال من المفضلة',
  meatLoversViewMode: 'طريقة عرض الأصناف',
  meatLoversViewCards: 'عرض صور',
  meatLoversViewList: 'عرض قائمة',
  meatLoversResultCount: (count) => `${count} صنف`,
  meatLoversChooseWeight: 'اختار الوزن',
  meatLoversChooseWeightAria: (name) => `اختيار وزن ${name}`,
  meatLoversChoose: 'اختار',
  meatLoversPerKg: (unit) => `${unit} / كجم`,
  meatLoversShowAll: 'عرض كل الأصناف',
  meatLoversBackTop: 'العودة للأعلى',
  slideOf: (index, count) => `اختيار ${index} من ${count}`,
  orderingMode: 'كيف تريد استلام طلبك؟',
  stepOf: (step, total) => `الخطوة ${step} من ${total}`,
  stepReview: 'راجع طلبك',
  stepDetails: 'تفاصيل الطلب',
  continueToDetails: 'متابعة',
  back: 'رجوع',
  edit: 'تعديل',
  editAria: (name) => `تعديل ${name}`,
  updateOrder: 'تحديث الطلب',
  deliveryFeeNextStep: 'تُضاف رسوم التوصيل في الخطوة التالية.',
  reviewItemsHint: 'راجع أصنافك ثم تابع.',
};

/**
 * Resolves the public interface copy for a locale. Any non-`ar` value
 * (including the guest-status pages' own best-effort guess when the
 * Backend never resolved a real locale at all -- see `GuestStatusPage`)
 * safely defaults to English, mirroring the Backend's own default-locale
 * fallback spirit without needing to duplicate its Restaurant-scoped logic
 * here.
 */
export function getPublicMenuCopy(locale: string | null | undefined): PublicMenuCopy {
  return locale === 'ar' ? AR_COPY : EN_COPY;
}
