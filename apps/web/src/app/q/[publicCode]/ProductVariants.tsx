'use client';

import { memo, useState } from 'react';
import { DishFallback } from '../../../components/guest/DishFallback';
import { DiscountedPrice, OriginalPrice } from '../../../components/guest/DiscountedPrice';
import { GuestIconPlus } from '../../../components/guest/icons';
import { Price } from '../../../components/guest/Price';
import { Stepper } from '../../../components/guest/Stepper';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type {EditorialPriceDisplay} from '../../../lib/public-menu/editorial-settings';
import { toMinorUnits } from '../../../lib/public-menu/money';
import type { PublicMenuProduct } from '../../../lib/public-menu/types';

/**
 * The product cards of the non-classic menu templates (DEC-044): `list` (compact row),
 * `gallery` (large photo tile), `menu` (typographic line), and `editorial` (photo-free
 * ordering row). They show exactly the same facts
 * as the classic card -- name, description, Backend price / discount / sizes, sold out, featured --
 * and use the same handlers, so ordering behaves identically in every template. Only the layout
 * differs. Each card keeps one real labelled control for opening the product (a stretched button
 * on the name) with the add control above it.
 */
export interface ProductVariantProps {
  product: PublicMenuProduct;
  currency: string;
  copy: PublicMenuCopy;
  canOrder: boolean;
  /** Only Editorial uses this rendering preference. Other templates ignore it. */
  editorialPriceDisplay?:EditorialPriceDisplay;
  /** Quantity of the no-selection line (only meaningful for a product without Modifier Groups). */
  simpleQuantity: number;
  /** Quantity across every line of this product. */
  totalQuantity: number;
  onOpen: (product: PublicMenuProduct) => void;
  onQuickAdd: (product: PublicMenuProduct) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
}

const FOCUS =
  'has-[[data-open]:focus-visible]:outline-2 has-[[data-open]:focus-visible]:outline-offset-2 has-[[data-open]:focus-visible]:outline-g-accent-text';

function useProductView(product: PublicMenuProduct, canOrder: boolean, simpleQuantity: number) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = resolveAssetUrl(product.primaryImageAssetPath);
  const isSoldOut = product.availability === 'SOLD_OUT';
  const sizes = product.variants ?? [];
  const hasSizes = sizes.length > 0;
  const hasModifiers = product.modifierGroups.length > 0 || hasSizes;
  const cheapest = hasSizes
    ? sizes.reduce((best, size) => {
        const price = (s: typeof size) => toMinorUnits(s.discountedPrice ?? s.price);
        return price(size) < price(best) ? size : best;
      })
    : null;
  const interactive = canOrder && !isSoldOut;
  return {
    imageUrl: imageUrl !== null && !imageFailed ? imageUrl : null,
    onImageError: () => setImageFailed(true),
    isSoldOut,
    sizes,
    cheapest,
    interactive,
    hasModifiers,
    showStepper: interactive && !hasModifiers && simpleQuantity > 0,
    discounted:
      (cheapest ? cheapest.discountedPrice !== null : product.discount !== null) && !isSoldOut,
    dimmed: isSoldOut ? 'opacity-50 grayscale' : '',
  };
}

type View = ReturnType<typeof useProductView>;

/** The "Add" control: a round plus button, or the saffron stepper once a simple product is in the order. */
function AddControl({
  product,
  copy,
  view,
  simpleQuantity,
  totalQuantity,
  onQuickAdd,
  onIncrement,
  onDecrement,
  shape,
}: Pick<
  ProductVariantProps,
  'product' | 'copy' | 'simpleQuantity' | 'totalQuantity' | 'onQuickAdd' | 'onIncrement' | 'onDecrement'
> & { view: View; shape: 'round' | 'pill' | 'editorial' | 'ember' | 'bloom' }) {
  if (view.isSoldOut) {
    return <span className="text-[12.5px] font-semibold text-g-text-3">{copy.unavailableNow}</span>;
  }
  if (!view.interactive) return null;
  if (view.showStepper) {
    return (
      <Stepper
        variant="accent"
        value={simpleQuantity}
        removesAtOne
        decrementLabel={
          simpleQuantity <= 1 ? copy.removeAria(product.name) : copy.decreaseAria(product.name)
        }
        incrementLabel={copy.increaseAria(product.name)}
        onDecrement={() => onDecrement(product.id)}
        onIncrement={() => onIncrement(product.id)}
        className="guest-anim-bump"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => onQuickAdd(product)}
      aria-label={copy.addAria(product.name)}
      className={
        shape === 'round'
          ? 'relative grid size-11 place-items-center rounded-full bg-g-accent text-g-on-accent transition-transform active:scale-90'
          : shape === 'ember'
            ? 'ember-v2-add relative grid size-10 shrink-0 place-items-center rounded-[7px] bg-g-accent text-g-on-accent transition-transform active:scale-90'
          : shape === 'bloom'
            ? 'bloom-v2-add relative grid size-10 shrink-0 place-items-center rounded-full bg-g-accent-soft text-g-accent-text transition-transform active:scale-90'
          : shape === 'editorial'
            ? 'group/add relative grid size-10 shrink-0 place-items-center rounded-full border border-g-accent bg-g-accent-soft text-sm font-bold text-g-text transition-colors hover:bg-g-accent hover:text-g-on-accent active:scale-95 sm:flex sm:h-10 sm:w-auto sm:gap-1.5 sm:px-3.5'
            : 'group/add relative flex h-10 items-center gap-1.5 rounded-full border border-g-accent bg-g-accent-soft px-4 text-sm font-bold text-g-text transition-colors hover:bg-g-accent hover:text-g-on-accent active:scale-95'
      }
    >
      <GuestIconPlus
        className={shape === 'round' || shape === 'bloom' ? 'size-5' : 'size-4 text-g-accent group-hover/add:text-g-on-accent'}
        strokeWidth={2.8}
      />
      {shape === 'pill' ? copy.add : null}
      {shape === 'editorial' ? <span className="hidden sm:inline">{copy.add}</span> : null}
      {totalQuantity > 0 ? (
        <span
          key={totalQuantity}
          className="g-num guest-anim-bump absolute -end-1.5 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-g-text px-1 text-[11px] text-g-bg ring-2 ring-g-surface"
        >
          {totalQuantity}
          <span className="sr-only"> · {copy.inOrderCount(totalQuantity)}</span>
        </span>
      ) : null}
    </button>
  );
}

/** The card's price: "From X" for a product with sizes, the struck original and badge when discounted. */
function PriceBlock({
  product,
  view,
  currency,
  copy,
  className,
  showFrom = true,
}: {
  product: PublicMenuProduct;
  view: View;
  currency: string;
  copy: PublicMenuCopy;
  className: string;
  showFrom?: boolean;
}) {
  const { cheapest } = view;
  return (
    <span className="block min-w-0">
      {cheapest && showFrom ? (
        <span className="block text-[11.5px] font-semibold text-g-text-3">{copy.fromPrice}</span>
      ) : null}
      <DiscountedPrice
        original={cheapest ? cheapest.price : product.basePrice}
        current={
          cheapest
            ? (cheapest.discountedPrice ?? cheapest.price)
            : product.discount
              ? product.discount.discountedPrice
              : product.basePrice
        }
        discounted={view.discounted}
        badge={view.discounted ? product.discount : null}
        currency={currency}
        copy={copy}
        className={`g-num [font-weight:800] ${view.isSoldOut ? 'text-g-text-3' : 'text-g-price'} ${className}`}
        currencyClassName="text-[0.62em] font-semibold"
        originalClassName="g-num text-[12.5px] font-semibold text-g-text-3"
      />
    </span>
  );
}

/** The product name: the one real control that opens the product page (stretched over the card). */
function ProductName({
  product,
  view,
  onOpen,
  className,
}: {
  product: PublicMenuProduct;
  view: View;
  onOpen: (product: PublicMenuProduct) => void;
  className: string;
}) {
  return (
    <h3 className={`${className} ${view.isSoldOut ? 'text-g-text-2' : 'text-g-text'}`}>
      {view.interactive ? (
        <button
          type="button"
          data-open
          onClick={() => onOpen(product)}
          className="text-start outline-none after:absolute after:inset-0 after:content-['']"
        >
          <bdi>{product.name}</bdi>
        </button>
      ) : (
        <bdi>{product.name}</bdi>
      )}
    </h3>
  );
}

function Tag({ product, view, copy }: { product: PublicMenuProduct; view: View; copy: PublicMenuCopy }) {
  if (view.isSoldOut) {
    return (
      <span className="absolute start-2 top-2 rounded-full bg-[#111] px-[9px] py-[3px] text-[11px] font-bold text-white">
        {copy.soldOut}
      </span>
    );
  }
  if (product.featured) {
    return (
      <span className="absolute start-2 top-2 rounded-full bg-g-accent px-[9px] py-[3px] text-[11px] font-bold text-g-on-accent">
        {copy.featured}
      </span>
    );
  }
  return null;
}

/** `list`: a compact row -- 84px photo, name, one line of description, price, a round add button. */
function ProductRowImpl(props: ProductVariantProps) {
  const { product, currency, copy, canOrder, simpleQuantity, totalQuantity, onOpen } = props;
  const view = useProductView(product, canOrder, simpleQuantity);
  return (
    <article
      className={`guest-anim-rise group relative flex items-center gap-3 rounded-2xl border border-g-line bg-g-surface p-2.5 ${FOCUS}`}
    >
      <div className="relative size-[84px] shrink-0 overflow-hidden rounded-xl">
        {view.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
          <img
            src={view.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={view.onImageError}
            className={`size-full object-cover ${view.dimmed}`}
          />
        ) : (
          <DishFallback className={`size-full ${view.dimmed}`} iconClassName="size-8" />
        )}
        <Tag product={product} view={view} copy={copy} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ProductName
          product={product}
          view={view}
          onOpen={onOpen}
          className="text-[15.5px] font-bold leading-[1.35]"
        />
        {product.description ? (
          <p dir="auto" className="line-clamp-1 text-[12.5px] leading-[1.6] text-g-text-2">
            {product.description}
          </p>
        ) : null}
        <PriceBlock
          product={product}
          view={view}
          currency={currency}
          copy={copy}
          className="text-[17px]"
        />
      </div>
      <div className="relative z-10 shrink-0">
        <AddControl
          product={product}
          copy={copy}
          view={view}
          simpleQuantity={simpleQuantity}
          totalQuantity={totalQuantity}
          onQuickAdd={props.onQuickAdd}
          onIncrement={props.onIncrement}
          onDecrement={props.onDecrement}
          shape="round"
        />
      </div>
    </article>
  );
}

/** `gallery`: a large 4:3 photo tile with the name, description, price and a round add button below. */
function ProductTileImpl(props: ProductVariantProps & { dense?: boolean }) {
  const { product, currency, copy, canOrder, simpleQuantity, totalQuantity, onOpen, dense = false } = props;
  const view = useProductView(product, canOrder, simpleQuantity);
  const add = (
    <AddControl
      product={product}
      copy={copy}
      view={view}
      simpleQuantity={simpleQuantity}
      totalQuantity={totalQuantity}
      onQuickAdd={props.onQuickAdd}
      onIncrement={props.onIncrement}
      onDecrement={props.onDecrement}
      shape="round"
    />
  );
  return (
    <article
      className={`guest-anim-rise group relative flex flex-col overflow-hidden border border-g-line bg-g-surface transition-[transform,box-shadow] duration-300 ${
        dense ? 'rounded-[20px]' : 'rounded-[26px]'
      } ${view.interactive ? 'md:hover:-translate-y-[3px] md:hover:shadow-[var(--g-shadow)]' : ''} ${FOCUS}`}
    >
      <div className={`relative w-full overflow-hidden ${dense ? 'aspect-square' : 'aspect-[4/3]'}`}>
        {view.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable image.
          <img
            src={view.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={view.onImageError}
            className={`size-full object-cover transition-transform duration-500 ease-out md:group-hover:scale-105 ${view.dimmed}`}
          />
        ) : (
          <DishFallback className={`size-full ${view.dimmed}`} iconClassName={dense ? 'size-10' : 'size-14'} />
        )}
        <Tag product={product} view={view} copy={copy} />
        {dense && !view.isSoldOut ? (
          <div className="absolute bottom-2 end-2 z-10">{add}</div>
        ) : null}
      </div>
      <div className={`flex flex-1 items-end gap-3 ${dense ? 'p-3' : 'p-4'}`}>
        <div className={`flex min-w-0 flex-1 flex-col ${dense ? 'gap-1' : 'gap-1.5'}`}>
          <ProductName
            product={product}
            view={view}
            onOpen={onOpen}
            className={dense ? 'text-[14.5px] font-bold leading-[1.35]' : 'text-[18px] font-bold leading-[1.35]'}
          />
          {product.description && !dense ? (
            <p dir="auto" className="line-clamp-2 text-[13.5px] leading-[1.65] text-g-text-2">
              {product.description}
            </p>
          ) : null}
          <PriceBlock
            product={product}
            view={view}
            currency={currency}
            copy={copy}
            className={dense ? 'text-[16px]' : 'text-[21px]'}
          />
          {dense && view.isSoldOut ? add : null}
        </div>
        {dense ? null : <div className="relative z-10 shrink-0">{add}</div>}
      </div>
    </article>
  );
}

/**
 * `menu`: a printed-menu line, no photo -- the name, a dotted leader and the price on one baseline,
 * the description below; with two or more sizes each size gets its own leader line.
 */
function ProductLineImpl(props: ProductVariantProps) {
  const { product, currency, copy, canOrder, simpleQuantity, totalQuantity, onOpen } = props;
  const view = useProductView(product, canOrder, simpleQuantity);
  const showSizeList = view.sizes.length >= 2;
  return (
    <article
      className={`guest-anim-rise group relative border-b border-dashed border-g-line py-4 last:border-b-0 ${FOCUS}`}
    >
      <div className={`flex items-baseline gap-2 ${view.isSoldOut ? 'opacity-60' : ''}`}>
        <ProductName
          product={product}
          view={view}
          onOpen={onOpen}
          className="min-w-0 text-[17px] font-bold leading-[1.4]"
        />
        {product.featured && !view.isSoldOut ? (
          <span className="shrink-0 rounded-full bg-g-accent-soft px-2 py-0.5 text-[11px] font-bold text-g-accent-text">
            {copy.featured}
          </span>
        ) : null}
        {view.isSoldOut ? (
          <span className="shrink-0 rounded-full bg-g-surface-2 px-2 py-0.5 text-[11px] font-bold text-g-text-2">
            {copy.soldOut}
          </span>
        ) : null}
        {!showSizeList ? (
          <>
            <span
              aria-hidden="true"
              className="min-w-4 flex-1 translate-y-[-4px] border-b-2 border-dotted border-g-line"
            />
            <PriceBlock
              product={product}
              view={view}
              currency={currency}
              copy={copy}
              className="text-[18px]"
              showFrom={false}
            />
          </>
        ) : null}
      </div>
      {product.description ? (
        <p dir="auto" className="mt-1 text-[13.5px] leading-[1.7] text-g-text-2">
          {product.description}
        </p>
      ) : null}
      {showSizeList ? (
        <ul className={`mt-2 flex flex-col gap-1 ${view.isSoldOut ? 'opacity-60' : ''}`}>
          {view.sizes.slice(0, 4).map((size) => (
            <li key={size.id} className="flex items-baseline gap-2 text-sm">
              <span className="min-w-0 truncate font-semibold text-g-text-2">
                <bdi>{size.name}</bdi>
              </span>
              <span
                aria-hidden="true"
                className="min-w-3 flex-1 translate-y-[-3px] border-b border-dotted border-g-line"
              />
              <span className="flex shrink-0 items-baseline gap-1.5">
                {size.discountedPrice !== null ? (
                  <OriginalPrice
                    amount={size.price}
                    currency={currency}
                    copy={copy}
                    className="g-num text-[12px] font-semibold text-g-text-3"
                  />
                ) : null}
                <Price
                  amount={size.discountedPrice ?? size.price}
                  currency={currency}
                  className={`g-num text-[15.5px] [font-weight:800] ${view.isSoldOut ? 'text-g-text-3' : 'text-g-price'}`}
                  currencyClassName="text-[11px] font-semibold"
                />
              </span>
            </li>
          ))}
          {view.sizes.length > 4 ? (
            <li className="text-[12px] font-semibold text-g-text-3">
              {copy.moreSizes(view.sizes.length - 4)}
            </li>
          ) : null}
        </ul>
      ) : null}
      {view.interactive ? (
        <div className="relative z-10 mt-2.5 flex justify-end">
          <AddControl
            product={product}
            copy={copy}
            view={view}
            simpleQuantity={simpleQuantity}
            totalQuantity={totalQuantity}
            onQuickAdd={props.onQuickAdd}
            onIncrement={props.onIncrement}
            onDecrement={props.onDecrement}
            shape="pill"
          />
        </div>
      ) : null}
    </article>
  );
}

/**
 * `editorial`: a dense, photo-free ordering row. It keeps long menus readable without
 * losing descriptions, effective prices, sold-out state, modifiers, or quick ordering.
 */
function ProductEditorialImpl(props: ProductVariantProps) {
  const { product, currency, copy, canOrder, simpleQuantity, totalQuantity, onOpen } = props;
  const view = useProductView(product, canOrder, simpleQuantity);
  const showAllSizes = props.editorialPriceDisplay === 'ALL_VARIANTS' && view.sizes.length >= 2;

  return (
    <article
      className={`guest-anim-rise group relative flex ${showAllSizes ? 'items-start' : 'items-center'} gap-2.5 border-b border-g-line/80 py-3.5 last:border-b-0 sm:gap-3.5 ${FOCUS}`}
    >
      <div className={`min-w-0 flex-1 ${view.isSoldOut ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          <ProductName
            product={product}
            view={view}
            onOpen={onOpen}
            className="min-w-0 text-[15.5px] font-bold leading-[1.4] sm:text-[16.5px]"
          />
          {product.featured && !view.isSoldOut ? (
            <span className="shrink-0 rounded-full bg-g-accent-soft px-2 py-0.5 text-[10.5px] font-bold text-g-accent-text">
              {copy.featured}
            </span>
          ) : null}
          {view.isSoldOut ? (
            <span className="shrink-0 rounded-full bg-g-surface-2 px-2 py-0.5 text-[10.5px] font-bold text-g-text-2">
              {copy.soldOut}
            </span>
          ) : null}
        </div>
        {product.description ? (
          <p dir="auto" className="mt-0.5 line-clamp-2 text-[12px] leading-[1.55] text-g-text-2 sm:text-[12.5px]">
            {product.description}
          </p>
        ) : null}
        {showAllSizes ? (
          <ul aria-label={product.name} className="mt-2.5 flex min-w-0 max-w-[380px] flex-col gap-1.5">
            {view.sizes.map(size=>(
              <li key={size.id} className="flex min-w-0 items-baseline gap-2 text-[12px] sm:text-[13px]">
                <span dir="auto" className="min-w-0 break-words font-semibold leading-5 text-g-text-2">
                  {size.name}
                </span>
                <span aria-hidden="true" className="min-w-2 flex-1 border-b border-dotted border-g-line"/>
                <span className="flex shrink-0 flex-wrap items-baseline justify-end gap-1 text-end">
                  {size.discountedPrice !== null ? (
                    <OriginalPrice amount={size.price} currency={currency} copy={copy}
                      className="g-num text-[10.5px] font-semibold text-g-text-3"/>
                  ) : null}
                  <Price amount={size.discountedPrice ?? size.price} currency={currency}
                    className={`g-num text-[13px] font-extrabold sm:text-[14px] ${view.isSoldOut ? 'text-g-text-3' : 'text-g-price'}`}
                    currencyClassName="text-[10px] font-semibold"/>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {!showAllSizes ? <div className={`w-[68px] shrink-0 text-end sm:w-[82px] ${view.isSoldOut ? 'opacity-60' : ''}`}>
        <PriceBlock
          product={product}
          view={view}
          currency={currency}
          copy={copy}
          className="text-[15px] sm:text-[17px]"
        />
      </div> : null}

      <div className="relative z-10 shrink-0">
        <AddControl
          product={product}
          copy={copy}
          view={view}
          simpleQuantity={simpleQuantity}
          totalQuantity={totalQuantity}
          onQuickAdd={props.onQuickAdd}
          onIncrement={props.onIncrement}
          onDecrement={props.onDecrement}
          shape="editorial"
        />
      </div>
    </article>
  );
}

/**
 * EMBER-specific cinematic poster card: full food photography, compact copy,
 * and an orange square action like the accepted design reference. The exact
 * existing price/discount/variant/sold-out logic and AddControl are reused.
 */
function ProductEmberImpl(props: ProductVariantProps) {
  const { product, currency, copy, canOrder, simpleQuantity, totalQuantity, onOpen } = props;
  const view = useProductView(product, canOrder, simpleQuantity);

  return (
    <article className={`ember-v2-card guest-anim-rise group relative flex min-w-0 flex-col overflow-hidden border border-g-line bg-g-surface ${FOCUS}`}>
      <div className="ember-v2-card-photo relative overflow-hidden">
        {view.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Staff-uploaded image from the configured API origin.
          <img
            src={view.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={view.onImageError}
            className={`size-full object-cover ${view.dimmed}`}
          />
        ) : (
          <DishFallback className={`size-full ${view.dimmed}`} iconClassName="size-14" />
        )}
        <Tag product={product} view={view} copy={copy} />
        <div className="ember-v2-card-photo-shade" aria-hidden="true" />
      </div>
      <div className="ember-v2-card-body flex min-h-0 flex-1 flex-col">
        <div className="ember-v2-card-kicker" dir="ltr">
          {product.featured ? (copy.featured || 'FEATURED') : (product.variants?.length ? 'SIGNATURE SELECTION' : 'FRESHLY PREPARED')}
        </div>
        <ProductName
          product={product}
          view={view}
          onOpen={onOpen}
          className="ember-v2-card-title min-w-0 font-bold leading-[1.35]"
        />
        {product.description ? (
          <p dir="auto" className="ember-v2-card-description mt-1 line-clamp-2 text-g-text-2">
            {product.description}
          </p>
        ) : null}
        <div className="ember-v2-card-bottom relative z-10 mt-auto flex items-end justify-between gap-2 pt-3">
          <PriceBlock product={product} view={view} currency={currency} copy={copy} className="ember-v2-price" />
          <AddControl
            product={product}
            copy={copy}
            view={view}
            simpleQuantity={simpleQuantity}
            totalQuantity={totalQuantity}
            onQuickAdd={props.onQuickAdd}
            onIncrement={props.onIncrement}
            onDecrement={props.onDecrement}
            shape="ember"
          />
        </div>
      </div>
    </article>
  );
}

/** Reference-faithful BLOOM sweets card; shared product prices and ordering stay authoritative. */
function ProductBloomImpl(props: ProductVariantProps) {
  const { product, currency, copy, canOrder, simpleQuantity, totalQuantity, onOpen } = props;
  const view = useProductView(product, canOrder, simpleQuantity);
  return (
    <article className={`bloom-v2-card guest-anim-rise group relative flex min-w-0 flex-col ${FOCUS}`}>
      <div className="bloom-v2-card-photo relative overflow-hidden">
        {view.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Staff-uploaded product photography.
          <img src={view.imageUrl} alt="" loading="lazy" decoding="async"
            onError={view.onImageError} className={`size-full object-cover ${view.dimmed}`} />
        ) : (
          <DishFallback className={`size-full ${view.dimmed}`} iconClassName="size-14" />
        )}
        <button
          type="button"
          aria-label={product.name}
          onClick={() => onOpen(product)}
          className="absolute inset-0 z-[1] cursor-pointer"
        />
        <Tag product={product} view={view} copy={copy} />
      </div>
      <div className="bloom-v2-card-body flex min-h-0 flex-1 flex-col">
        <div className="bloom-v2-card-kicker" dir="ltr">
          {product.featured ? (copy.featured || 'FEATURED') : 'MADE WITH LOVE'}
        </div>
        <ProductName product={product} view={view} onOpen={onOpen}
          className="bloom-v2-card-title min-w-0 font-bold leading-[1.35]" />
        {product.description ? (
          <p dir="auto" className="bloom-v2-card-description mt-1 line-clamp-2 text-g-text-2">
            {product.description}
          </p>
        ) : null}
        <div className="relative z-10 mt-auto flex items-end justify-between gap-2 pt-3">
          <PriceBlock product={product} view={view} currency={currency}
            copy={copy} className="bloom-v2-price" />
          <AddControl product={product} copy={copy} view={view}
            simpleQuantity={simpleQuantity} totalQuantity={totalQuantity}
            onQuickAdd={props.onQuickAdd}
            onIncrement={props.onIncrement}
            onDecrement={props.onDecrement}
            shape="bloom"
          />
        </div>
      </div>
    </article>
  );
}

export const ProductBloom = memo(ProductBloomImpl);

export const ProductEmber = memo(ProductEmberImpl);

export const ProductRow = memo(ProductRowImpl);
export const ProductTile = memo(ProductTileImpl);
/** The two-column phone grid version of the tile (`floating` template). */
function ProductTileDenseImpl(props: ProductVariantProps) {
  return <ProductTileImpl {...props} dense />;
}
export const ProductTileDense = memo(ProductTileDenseImpl);
export const ProductLine = memo(ProductLineImpl);
export const ProductEditorial = memo(ProductEditorialImpl);
