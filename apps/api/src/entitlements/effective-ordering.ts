import type { FeatureMap } from './features';

/** The Restaurant's own ordering switches and WhatsApp number, as stored. */
export interface OrderingSwitches {
  pickupEnabled: boolean | null | undefined;
  deliveryEnabled: boolean | null | undefined;
  tableOrderingEnabled: boolean | null | undefined;
  whatsappOrderingEnabled: boolean | null | undefined;
  whatsappNumber: string | null | undefined;
}

/**
 * What a Guest can actually do: each of the Restaurant's switches combined with what the platform
 * allows (DEC-043). One function for every place that decides it (menu, order creation), so the
 * menu never offers what the order endpoint would refuse.
 *
 * - `whatsapp`: WhatsApp ordering is allowed, switched on, and has a number to send to.
 * - `dashboardOrders`: Pickup / Delivery orders may be created in the dashboard (and none are
 *   while `whatsapp` is on: they go to WhatsApp instead).
 * - `pickup` / `delivery`: the type is offered at all: the Restaurant has it on, and there is
 *   somewhere for the order to go (the dashboard or WhatsApp).
 * - `table`: dine-in ordering from a Table QR.
 */
export function effectiveOrdering(
  switches: OrderingSwitches,
  features: FeatureMap,
): {
  whatsapp: boolean;
  dashboardOrders: boolean;
  pickup: boolean;
  delivery: boolean;
  table: boolean;
} {
  const whatsapp =
    features.WHATSAPP_ORDERING &&
    switches.whatsappOrderingEnabled === true &&
    !!switches.whatsappNumber;
  const hasDestination = features.DASHBOARD_ORDERING || whatsapp;
  return {
    whatsapp,
    dashboardOrders: features.DASHBOARD_ORDERING,
    pickup: switches.pickupEnabled !== false && hasDestination,
    delivery: switches.deliveryEnabled !== false && hasDestination,
    table: switches.tableOrderingEnabled !== false && features.TABLE_ORDERING,
  };
}
