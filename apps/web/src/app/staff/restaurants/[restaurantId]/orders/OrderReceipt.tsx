'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { OrderDetail } from '../../../../../lib/orders/types';
import { orderStatusLabel } from './StatusBadge';
import { orderTypeLabel } from './OrderTypeBadge';

/**
 * FT-8: the printable Order receipt. Mounted as a portal directly into
 * `document.body` -- a TOP-LEVEL sibling of the whole Staff app, never nested
 * inside the on-screen dialog. That is the fix for the print bug found in
 * Tables & QR (`QrPreviewDialog`): a `display: none` ancestor can never let a
 * descendant print, so the receipt must not live under anything hidden. In
 * print, every other `body` child is `display: none` (so the Staff shell,
 * Orders grid, filters, dialog and backdrop take no space and cause no blank
 * pages), and the receipt flows normally, across pages if it is long. On
 * screen it is never displayed.
 *
 * Content is ONLY the Order's own snapshots (Product/Modifier names and
 * prices, customer and delivery fields, the stored money breakdown) -- never
 * a live Product/Modifier lookup. Sized for an ~80mm thermal roll, plain
 * black on white, no icons or colour needed to read it.
 *
 * Mixed-direction text: the receipt as a whole is NOT forced RTL or LTR.
 * Instead every dynamic value is direction-isolated: free text that may be
 * Arabic (names, addresses, notes, Product/Modifier names) is wrapped by
 * `<Text>` (`<bdi dir="auto">`, so it takes its own natural direction and can
 * never reorder its neighbours), and every number/price/currency/date is
 * wrapped by `<Num>` (`<bdi dir="ltr">`). Labels and numbers are separate
 * elements, never one concatenated string, so an Arabic modifier name next
 * to "+10.00" cannot be visually reversed.
 */
function Text({ children }: { children: ReactNode }) {
  return <bdi dir="auto">{children}</bdi>;
}

function Num({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

export function OrderReceipt({ order }: { order: OrderDetail }) {
  if (typeof document === 'undefined') return null;

  const isDelivery = order.type === 'DELIVERY';
  const isDineIn = order.type === 'DINE_IN';
  const money = (amount: string) => (
    <Num>
      {amount} {order.currencyCode}
    </Num>
  );

  return createPortal(
    <div id="order-receipt-root" className="hidden print:block">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 3mm; }
          html, body { background: #fff !important; }
          body > *:not(#order-receipt-root) { display: none !important; }
          #order-receipt-root { display: block !important; }
        }
      `}</style>
      <div
        className="mx-auto w-[72mm] text-[12px] leading-snug text-black"
        style={{ fontFamily: 'ui-monospace, "Courier New", monospace' }}
      >
        <header className="text-center">
          <p className="text-[15px] font-bold">
            <Text>{order.restaurant.name}</Text>
          </p>
          <p>
            <Text>{order.branch.name}</Text>
          </p>
        </header>

        <Divider />

        <section className="text-center">
          <p className="text-[16px] font-bold uppercase">{orderTypeLabel(order.type)}</p>
          {isDineIn && order.table ? (
            <p className="text-[16px] font-bold">
              Table <Text>{order.table.tableNumber}</Text>
            </p>
          ) : null}
        </section>

        <Divider />

        <dl className="flex flex-col gap-0.5">
          <Row label="Date" value={<Num>{new Date(order.createdAt).toLocaleString()}</Num>} />
          <Row label="Status" value={orderStatusLabel(order.status, order.type)} />
        </dl>

        {order.customer ? (
          <>
            <Divider />
            <dl className="flex flex-col gap-0.5">
              <Row label="Customer" value={<Text>{order.customer.name}</Text>} />
              <Row label="Phone" value={<Num>{order.customer.phone}</Num>} />
              {isDelivery && order.delivery ? (
                <>
                  <Row label="Area" value={<Text>{order.delivery.zoneName}</Text>} />
                  <Row label="Address" value={<Text>{order.delivery.address}</Text>} />
                  {order.delivery.building ? (
                    <Row label="Building" value={<Text>{order.delivery.building}</Text>} />
                  ) : null}
                  {order.delivery.floor ? (
                    <Row label="Floor" value={<Text>{order.delivery.floor}</Text>} />
                  ) : null}
                  {order.delivery.apartment ? (
                    <Row label="Apartment" value={<Text>{order.delivery.apartment}</Text>} />
                  ) : null}
                  {order.delivery.landmark ? (
                    <Row label="Landmark" value={<Text>{order.delivery.landmark}</Text>} />
                  ) : null}
                </>
              ) : null}
              {order.customer.notes ? (
                <Row label="Notes" value={<Text>{order.customer.notes}</Text>} />
              ) : null}
            </dl>
          </>
        ) : null}

        <Divider />

        <ul className="flex flex-col gap-2">
          {order.items.map((item, index) => (
            <li key={`${item.productId}-${index}`}>
              <div className="flex justify-between gap-2 font-bold">
                <span>
                  <Num>{item.quantity}×</Num> <Text>{item.productNameSnapshot}</Text>
                </span>
                <span className="whitespace-nowrap">
                  <Num>{item.lineTotal}</Num>
                </span>
              </div>
              <div className="ps-3">
                <p>
                  {money(item.unitPrice)} each
                </p>
                {item.modifiers.map((modifier, modifierIndex) => (
                  <p key={modifierIndex} className="flex justify-between gap-2">
                    <span>
                      + <Text>{modifier.groupName}</Text>: <Text>{modifier.optionName}</Text>
                    </span>
                    {modifier.priceAdjustment !== '0.00' ? (
                      <span className="whitespace-nowrap">
                        <Num>+{modifier.priceAdjustment}</Num>
                      </span>
                    ) : null}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <Divider />

        <dl className="flex flex-col gap-0.5">
          {isDelivery ? (
            <>
              <Row label="Subtotal" value={money(order.subtotalAmount)} />
              <Row label="Delivery fee" value={money(order.deliveryFee)} />
            </>
          ) : null}
          <div className="flex items-baseline justify-between gap-2 pt-1 text-[16px] font-bold">
            <dt>TOTAL</dt>
            <dd>{money(order.totalAmount)}</dd>
          </div>
        </dl>

        <Divider />
        <p className="text-center text-[10px]">
          Printed <Num>{new Date().toLocaleString()}</Num>
        </p>
      </div>
    </div>,
    document.body,
  );
}

function Divider() {
  return <hr className="my-2 border-0 border-t border-dashed border-black" />;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="flex-shrink-0">{label}</dt>
      <dd className="text-end font-bold">{value}</dd>
    </div>
  );
}
