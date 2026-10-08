/**
 * FT-13A: a money value as one stable, left-to-right unit ("185.00 EGP") in both
 * English and Arabic -- `<bdi dir="ltr">` isolates it from the surrounding RTL
 * bidi context so digits and currency never reorder. The amount is always the
 * Backend's exact decimal string (or an exact BigInt-derived display string);
 * nothing here parses or recalculates it.
 */
export function Price({
  amount,
  currency,
  className = '',
  currencyClassName = 'text-[0.72em] font-medium opacity-70',
  prefix = '',
}: {
  amount: string;
  currency: string;
  className?: string;
  currencyClassName?: string;
  /** e.g. "+" for a modifier's price adjustment. */
  prefix?: string;
}) {
  return (
    <bdi dir="ltr" className={`whitespace-nowrap tabular-nums ${className}`}>
      {prefix}
      {amount} <span className={currencyClassName}>{currency}</span>
    </bdi>
  );
}
