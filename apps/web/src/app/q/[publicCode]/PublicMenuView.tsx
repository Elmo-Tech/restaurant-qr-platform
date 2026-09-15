import Link from 'next/link';
import { IconImage } from '../../../components/staff/icons';
import { resolveAssetUrl } from '../../../lib/media/asset-url';
import type {
  PublicMenuCategory,
  PublicMenuData,
  PublicMenuProduct,
} from '../../../lib/public-menu/types';

/** Platform locales stay exactly `en`/`ar` (Section 8) -- no locale-name library needed for two fixed labels. */
const LOCALE_LABELS: Record<string, string> = { en: 'English', ar: 'العربية' };

/**
 * FT-3: the read-only public Guest Menu -- Restaurant header, language
 * switcher, sticky Category chip nav, and Category/Product sections. A
 * Server Component: the language switcher is plain `<Link>`s that carry
 * `?lang=` (a real navigation, so the resolved language is always
 * shareable/refreshable), and Category selection is a plain anchor jump --
 * neither needs client-side interactivity, so nothing here is `'use
 * client'`. `dir` is set on this component's own root, not on the
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

  return (
    <div
      dir={dir}
      lang={data.locale.resolved}
      className="mx-auto min-h-screen max-w-2xl bg-[#FCFBF9] pb-16 text-[#1D1A18]"
    >
      <header className="sticky top-0 z-20 border-b border-[#E5DED6] bg-[#FCFBF9]/95 px-4 pt-5 pb-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-[#1D1A18]">
              {data.context.restaurant.name}
            </h1>
            {data.context.table ? (
              <p className="mt-0.5 text-sm text-[#655D56]">Table {data.context.table.number}</p>
            ) : null}
          </div>
          <LanguageSwitcher
            available={data.locale.available}
            resolved={data.locale.resolved}
            publicCode={publicCode}
          />
        </div>

        {data.menu.categories.length > 0 ? (
          <nav aria-label="Categories" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {data.menu.categories.map((category) => (
              <a
                key={category.id}
                href={`#category-${category.id}`}
                className="shrink-0 whitespace-nowrap rounded-full border border-[#E5DED6] bg-white px-3 py-1.5 text-sm text-[#302C29] hover:border-[#7A5138] hover:text-[#7A5138]"
              >
                {category.name}
              </a>
            ))}
          </nav>
        ) : null}
      </header>

      <main className="px-4 pt-4">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-[#1D1A18]">{data.menu.name}</h2>
          {data.menu.description ? (
            <p className="mt-1 text-sm text-[#655D56]">{data.menu.description}</p>
          ) : null}
        </div>

        {data.menu.categories.length === 0 ? (
          <p className="rounded-md border border-[#E5DED6] bg-white px-4 py-6 text-center text-sm text-[#655D56]">
            This menu doesn&rsquo;t have any items yet.
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {data.menu.categories.map((category) => (
              <CategorySection key={category.id} category={category} currency={currency} />
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
    <div className="flex shrink-0 gap-1 rounded-full border border-[#E5DED6] bg-white p-1 text-xs">
      {available.map((locale) => {
        const isActive = locale === resolved;
        return (
          <Link
            key={locale}
            href={`/q/${publicCode}?lang=${locale}`}
            aria-current={isActive ? 'true' : undefined}
            className={`rounded-full px-2.5 py-1 font-medium ${
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
}: {
  category: PublicMenuCategory;
  currency: string;
}) {
  const imageUrl = resolveAssetUrl(category.imageAssetPath);
  return (
    <section id={`category-${category.id}`} className="scroll-mt-32">
      <div className="mb-3 flex items-center gap-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Staff-uploaded asset from a runtime-configured API origin, not a Next.js-optimizable static/local image.
          <img
            src={imageUrl}
            alt=""
            className="h-11 w-11 flex-shrink-0 rounded-md border border-[#E5DED6] object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[#1D1A18]">{category.name}</h3>
          {category.description ? (
            <p className="mt-0.5 text-sm text-[#655D56]">{category.description}</p>
          ) : null}
        </div>
      </div>

      {category.products.length === 0 ? (
        <p className="text-sm text-[#AFA397]">No items in this category yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {category.products.map((product) => (
            <ProductCard key={product.id} product={product} currency={currency} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductCard({ product, currency }: { product: PublicMenuProduct; currency: string }) {
  const imageUrl = resolveAssetUrl(product.primaryImageAssetPath);
  const isSoldOut = product.availability === 'SOLD_OUT';

  return (
    <article
      className={`flex gap-3 rounded-lg border border-[#E5DED6] bg-white p-3 ${isSoldOut ? 'opacity-70' : ''}`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- see CategorySection above.
        <img
          src={imageUrl}
          alt=""
          className="h-20 w-20 flex-shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-md bg-[#F1ECE6] text-[#AFA397]">
          <IconImage className="h-6 w-6" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium text-[#1D1A18]">{product.name}</h4>
          {product.featured && !isSoldOut ? (
            <span className="shrink-0 rounded-full bg-[#F1ECE6] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#7A5138]">
              Featured
            </span>
          ) : null}
        </div>
        {product.description ? (
          <p className="text-xs text-[#655D56]">{product.description}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-sm font-semibold text-[#302C29]">
            {product.basePrice} {currency}
          </span>
          {isSoldOut ? (
            <span className="text-xs font-medium text-[#B3492B]">Sold out</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
