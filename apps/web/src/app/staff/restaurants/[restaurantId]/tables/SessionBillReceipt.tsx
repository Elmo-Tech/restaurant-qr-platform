'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { SessionBillDocument } from '../../../../../lib/table-sessions/types';
import { useDurationLabel } from './SessionBadges';

export type BillPaper = 'receipt' | 'a4';

/**
 * Direction isolation, same convention as the Order receipt: free text that may
 * be Arabic (restaurant, branch, product and modifier names) is `<bdi dir="auto">`;
 * every number, price and date is `<bdi dir="ltr">`. Labels and values are
 * separate elements, so an Arabic name next to "+10.00" can never be reversed.
 */
function Text({ children }: { children: ReactNode }) {
  return <bdi dir="auto">{children}</bdi>;
}

function Num({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'font-bold' : ''}`}>
      <dt>{label}</dt>
      <dd className="whitespace-nowrap text-end">{value}</dd>
    </div>
  );
}

function Divider({ paper }: { paper: BillPaper }) {
  return (
    <hr
      className={`my-2 border-0 border-t ${
        paper === 'receipt' ? 'border-dashed border-black' : 'border-solid border-neutral-400'
      }`}
    />
  );
}

/**
 * The combined session bill, rendered EXACTLY from the Backend bill document:
 * no total, balance or payment status is calculated here. Used both for the
 * on-screen preview and (through `SessionBillPrintPortal`) for printing, so
 * what staff see is what is printed. Plain black on white, no icons required.
 */
export function SessionBillView({
  bill,
  paper,
  logoUrl,
}: {
  bill: SessionBillDocument;
  paper: BillPaper;
  logoUrl: string | null;
}) {
  const { t, locale, formatDateTime } = useStaffI18n();
  const durationLabel = useDurationLabel();
  const currency = bill.restaurant.currencyCode;
  const money = (amount: string) => (
    <Num>
      {amount} {currency}
    </Num>
  );
  const isReceipt = paper === 'receipt';
  const endMs = bill.session.closedAt
    ? new Date(bill.session.closedAt).getTime()
    : new Date(bill.generatedAt).getTime();
  const minutes = Math.max(
    0,
    Math.floor((endMs - new Date(bill.session.openedAt).getTime()) / 60_000),
  );
  const shortId = bill.session.id.replace(/^session-/, '').slice(0, 8).toUpperCase();

  return (
    <div
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      lang={locale}
      className={`mx-auto bg-white text-black leading-snug ${
        isReceipt ? 'w-[72mm] text-[12px]' : 'w-[190mm] max-w-full text-[13px]'
      }`}
      style={
        isReceipt
          ? { fontFamily: 'ui-monospace, "Courier New", monospace' }
          : { fontFamily: 'system-ui, "Segoe UI", Tahoma, Arial, sans-serif' }
      }
    >
      <header className="text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- print-only Staff-uploaded asset from a runtime-configured API origin.
          <img
            src={logoUrl}
            alt=""
            className="mx-auto mb-1 max-h-[16mm] max-w-[40mm] object-contain grayscale"
          />
        ) : null}
        <p className={`${isReceipt ? 'text-[15px]' : 'text-[20px]'} font-bold`}>
          <Text>{bill.restaurant.name}</Text>
        </p>
        <p>
          <Text>{bill.branch.name}</Text>
        </p>
      </header>

      <Divider paper={paper} />

      <section className="text-center">
        <p className={`${isReceipt ? 'text-[14px]' : 'text-[16px]'} font-bold uppercase`}>
          {t('sessions.print.title')}
        </p>
        <p className={`${isReceipt ? 'text-[16px]' : 'text-[18px]'} font-bold`}>
          {t('sessions.print.table')} <Text>{bill.table.tableNumber}</Text>
        </p>
      </section>

      <Divider paper={paper} />

      <dl className="flex flex-col gap-0.5">
        <Row label={t('sessions.print.session')} value={<Num>#{shortId}</Num>} />
        <Row
          label={t('sessions.print.opened')}
          value={<Num>{formatDateTime(bill.session.openedAt)}</Num>}
        />
        {bill.session.closedAt ? (
          <Row
            label={t('sessions.print.closed')}
            value={<Num>{formatDateTime(bill.session.closedAt)}</Num>}
          />
        ) : null}
        <Row label={t('sessions.detail.duration')} value={<Num>{durationLabel(minutes)}</Num>} />
        <Row
          label={t('sessions.print.printedAt')}
          value={<Num>{formatDateTime(bill.generatedAt)}</Num>}
        />
      </dl>

      {bill.session.status === 'OPEN' ? (
        <p className="mt-1 text-center font-bold">{t('sessions.print.openSessionNote')}</p>
      ) : null}

      <Divider paper={paper} />

      {bill.rounds.map((round) => (
        <section key={round.roundNumber} className="mb-2">
          <p className="flex justify-between gap-2 font-bold">
            <span>{t('sessions.print.order', { number: round.roundNumber })}</span>
            <span className="font-normal">
              <Num>{formatDateTime(round.createdAt)}</Num>
            </span>
          </p>
          <ul className="flex flex-col gap-1.5">
            {round.items.map((item, index) => (
              <li key={`${item.productId}-${index}`}>
                <div className="flex justify-between gap-2">
                  <span>
                    <Num>{item.quantity}×</Num> <Text>{item.productNameSnapshot}</Text>
                  </span>
                  <span className="whitespace-nowrap">
                    <Num>{item.lineTotal}</Num>
                  </span>
                </div>
                {item.modifiers.map((modifier, modifierIndex) => (
                  <p key={modifierIndex} className="flex justify-between gap-2 ps-3">
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
              </li>
            ))}
          </ul>
          <p className="mt-1 flex justify-between gap-2 border-t border-dotted border-neutral-500 pt-0.5 font-bold">
            <span>&nbsp;</span>
            <span>{money(round.totalAmount)}</span>
          </p>
        </section>
      ))}

      <Divider paper={paper} />

      <dl className="flex flex-col gap-0.5">
        <Row
          label={t('sessions.print.subtotal')}
          value={money(bill.totals.eligibleTotal)}
          strong
        />
      </dl>

      {bill.awaitingRounds.length > 0 ? (
        <>
          <Divider paper={paper} />
          <section className="opacity-90">
            <p className="font-bold">{t('sessions.print.awaitingTitle')}</p>
            {bill.awaitingRounds.map((round) => (
              <div key={round.roundNumber} className="mt-0.5">
                <p className="flex justify-between gap-2">
                  <span>{t('sessions.print.order', { number: round.roundNumber })}</span>
                  <span>{money(round.totalAmount)}</span>
                </p>
                {round.items.map((item, index) => (
                  <p key={index} className="ps-3">
                    <Num>{item.quantity}×</Num> <Text>{item.productNameSnapshot}</Text>
                  </p>
                ))}
              </div>
            ))}
          </section>
        </>
      ) : null}

      <Divider paper={paper} />

      <section>
        <p className="font-bold">{t('sessions.print.paymentsTitle')}</p>
        {bill.payments.length === 0 ? (
          <p>{t('sessions.print.noPayments')}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {bill.payments.map((payment, index) => (
              <li key={index} className="flex justify-between gap-2">
                <span>
                  {t(`sessions.payments.method.${payment.method}` as const)}{' '}
                  <span className="opacity-80">
                    <Num>{formatDateTime(payment.recordedAt)}</Num>
                  </span>
                </span>
                <span className="whitespace-nowrap">{money(payment.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {bill.voidedPaymentCount > 0 ? (
          <p className="mt-0.5 opacity-80">
            {bill.voidedPaymentCount === 1
              ? t('sessions.print.voidedNote.one', { count: bill.voidedPaymentCount })
              : t('sessions.print.voidedNote.other', { count: bill.voidedPaymentCount })}
          </p>
        ) : null}
      </section>

      <Divider paper={paper} />

      <dl className="flex flex-col gap-0.5">
        <Row label={t('sessions.print.totalPaid')} value={money(bill.totals.paidAmount)} />
        <Row
          label={t('sessions.print.balanceDue')}
          value={money(bill.totals.balance)}
          strong
        />
        <Row
          label={t('sessions.print.status')}
          value={t(`sessions.payment.${bill.totals.paymentStatus}` as const)}
          strong
        />
      </dl>

      <Divider paper={paper} />
      <p className="text-center">{t('sessions.print.thanks')}</p>
    </div>
  );
}

/**
 * Print-only copy, portalled directly into `document.body` (the established
 * receipt convention: a `display: none` ancestor can never print, so the
 * receipt must be a top-level sibling). In print every other body child is
 * hidden and the page size follows the selected paper. On screen it is never
 * displayed.
 */
export function SessionBillPrintPortal({
  bill,
  paper,
  logoUrl,
}: {
  bill: SessionBillDocument;
  paper: BillPaper;
  logoUrl: string | null;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div id="session-bill-root" className="hidden print:block">
      <style>{`
        @media print {
          @page { size: ${paper === 'receipt' ? '80mm auto' : 'A4'}; margin: ${
            paper === 'receipt' ? '3mm' : '12mm'
          }; }
          html, body { background: #fff !important; }
          body > *:not(#session-bill-root) { display: none !important; }
          #session-bill-root { display: block !important; }
        }
      `}</style>
      <SessionBillView bill={bill} paper={paper} logoUrl={logoUrl} />
    </div>,
    document.body,
  );
}
