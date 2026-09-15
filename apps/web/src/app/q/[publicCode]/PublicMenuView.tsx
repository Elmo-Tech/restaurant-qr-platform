import Link from 'next/link';
import { IconImage } from '../../../components/staff/icons';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import { getPublicMenuCopy, type PublicMenuCopy } from '../../../lib/public-menu/copy';
import type {
  PublicMenuCategory,
  PublicMenuData,
  PublicMenuProduct,
} from '../../../lib/public-menu/types';

/** Platform locales stay exactly `en`/`ar` (Section 8) -- no locale-name library needed for two fixed labels. */
const LOCALE_LABELS: Record<string, string> = { en: 'English', ar: 'العربية' };

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
 * FT-3/FT-3B: the read-only public Guest Menu -- Restaurant header,
 * language switcher, sticky Category chip nav, and Category/Product
 * sections. A Server Component: the language switcher is plain `<Link>`s
 * that carry `?lang=` (a real navigation, so the resolved language is
 * always shareable/refreshable), and Category selection is a plain anchor
 * jump -- neither needs client-side interactivity, so nothing here is
 * `'use client'`. `dir` is set on this component's own root, not on the
 * document `<html>` (the root layout is shared with Staff) -- everything
 * inside genuinely mirrors for Arabic since no physical-direction utility
 * (`text-left`/`mr-*`/`space-x-*`) is used anywhere below, only `gap` and
 * logical browser bidi/flex behavior.
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

      <main className={`${PAGE_CONTAINER} pt-6 pb-16`}>
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
              />
            ))}
          </div>
        )}
      </main>
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
}: {
  category: PublicMenuCategory;
  currency: string;
  copy: PublicMenuCopy;
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
          {category.products.map((product) => (
            <ProductCard key={product.id} product={product} currency={currency} copy={copy} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductCard({
  product,
  currency,
  copy,
}: {
  product: PublicMenuProduct;
  currency: string;
  copy: PublicMenuCopy;
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
      </div>
    </article>
  );
}
