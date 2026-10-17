'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import Link from 'next/link';
import { OpenGuestMenuButton } from '../../../../../components/menu/OpenGuestMenuButton';
import { MenuSectionTabs } from './MenuSectionTabs';
import * as menuApi from '../../../../../lib/menu/api';
import * as settingsApi from '../../../../../lib/settings/api';
import type { Category, Menu, Product } from '../../../../../lib/menu/types';
import { ALL_PRODUCTS } from '../../../../../lib/menu/all-products';
import type { RestaurantLocalesResponse } from '../../../../../lib/settings/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { MenuContextBar } from './MenuContextBar';
import { CategoryNavigation } from './CategoryNavigation';
import { ProductList } from './ProductList';

export interface MenuWorkspaceProps {
  restaurantId: string;
  restaurantName: string;
  currencyCode: string;
  /** `menu.manage` AND `allBranches === true` (Section 5). */
  canManage: boolean;
  /** `menu.manage` alone, regardless of Branch scope -- used only for the explanatory read-only note (Section 24). */
  hasMenuManagePermission: boolean;
  /** FT-1, Section 20: optional Menu/Category to select on first load, restoring context from the Product Editor's "Back to Menu" link. Ignored if either id no longer matches a loaded Menu/Category. */
  initialMenuId?: string;
  initialCategoryId?: string;
}

function pickInitialMenuId(menus: Menu[]): string | null {
  const primary = menus.find((menu) => menu.isPrimary);
  return primary ? primary.id : (menus[0]?.id ?? null);
}

/**
 * Top-level Menu Management workspace (Batch H, Section 8/9; corrected in
 * the targeted fix, Section 1). Owns all Menu/Category/Product state and
 * every fetch; panels call the mutation functions in `lib/menu/api.ts`
 * directly and report back through the callbacks passed here. No global
 * state/cache framework -- local React state only.
 *
 * Race safety (Section 1/1A/1B): `selectMenu`/`selectCategory` are the ONLY
 * two places that ever change `selectedMenuId`/`selectedCategoryId`. Every
 * caller -- direct User click, initial selection after Menus load,
 * post-Create selection, fallback selection after any refetch, and Category
 * move -- goes through one of these two functions, so the
 * clear-then-load-then-guard sequence below can never be bypassed. Each
 * function synchronously (within one React event/callback, batched into one
 * render) invalidates any in-flight load for that level and the level(s)
 * beneath it, clears the now-stale state, and only then starts the new
 * fetch -- so a User can never see a one-frame flash of the previous
 * Menu/Category's Categories/Products.
 *
 * `*RequestRef` counters + `selected*IdRef` (mirroring the state
 * synchronously, since a memoized `useCallback` would otherwise close over a
 * stale `selectedMenuId`/`selectedCategoryId`) are the explicit stale-
 * response guard Section 1B requires: a response is applied only if its own
 * request is still the latest one requested for that level AND its
 * `menuId`/`categoryId` still matches what is actually selected right now.
 * This does not depend on request timing/ordering at all -- an old request
 * that happens to resolve after a newer one is simply dropped.
 */
export function MenuWorkspace({
  restaurantId,
  currencyCode,
  canManage,
  hasMenuManagePermission,
  initialMenuId,
  initialCategoryId,
}: MenuWorkspaceProps) {
  const { t } = useStaffI18n();
  const [menus, setMenus] = useState<Menu[] | null>(null);
  const [menusError, setMenusError] = useState<string | null>(null);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  // Per-Category product counts for the rail. A display aid only: it is read once for the
  // whole Restaurant and refreshed after ordering; it never gates anything.
  const [productCounts, setProductCounts] = useState<Record<string, number> | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Restaurant Languages (FT-1, Section 4): the sole authority for which
  // secondary-locale translation tabs the Menu/Category editors show. Loaded
  // once here and passed down -- never hardcoded, and no separate fetch
  // duplicated in each editor. A load failure simply leaves this `null`,
  // which the editors treat as "no secondary languages yet" rather than
  // surfacing a second error banner for a non-critical concern.
  const [locales, setLocales] = useState<RestaurantLocalesResponse | null>(
    null,
  );

  // Mirrors `categories` synchronously: the "All products" load needs the current Menu's
  // Category ids and order at the moment it starts, before React has re-rendered.
  const categoriesRef = useRef<Category[] | null>(null);
  const selectedMenuIdRef = useRef<string | null>(null);
  const selectedCategoryIdRef = useRef<string | null>(null);
  const menusRequestRef = useRef(0);
  const categoriesRequestRef = useRef(0);
  const productsRequestRef = useRef(0);

  const loadProducts = useCallback(
    async (categoryId: string) => {
      // Fix, Section 2: a pre-flight identity check BEFORE incrementing the
      // counter. Without this, a mutation callback started under an old
      // Category (e.g. `onUpdated`/`onCreated` closures captured while that
      // Category was still selected) that resolves after the User has since
      // switched Category would still bump `productsRequestRef` here,
      // invalidating the CURRENT, valid in-flight request for the
      // now-selected Category -- even though this stale call's own response
      // was always going to be discarded anyway by the post-await check
      // below. A stale caller must never get to invalidate anything.
      if (selectedCategoryIdRef.current !== categoryId) {
        return;
      }
      const requestId = ++productsRequestRef.current;
      try {
        let data: Product[];
        if (categoryId === ALL_PRODUCTS) {
          // Every Product of the SELECTED Menu: the Restaurant-wide list narrowed to this
          // Menu's Categories, in Category order and then product order.
          const all = await menuApi.listProducts(restaurantId);
          const order = new Map(
            (categoriesRef.current ?? []).map((category, index) => [category.id, index] as const),
          );
          data = all
            .filter((product) => order.has(product.categoryId))
            .sort(
              (a, b) =>
                (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) ||
                a.displayOrder - b.displayOrder,
            );
        } else {
          data = await menuApi.listProducts(restaurantId, categoryId);
        }
        if (
          productsRequestRef.current !== requestId ||
          selectedCategoryIdRef.current !== categoryId
        ) {
          return; // superseded by a newer selection/request -- discard.
        }
        setProducts(data);
        setProductsError(null);
      } catch (error) {
        if (
          productsRequestRef.current !== requestId ||
          selectedCategoryIdRef.current !== categoryId
        ) {
          return;
        }
        if (isUnauthenticatedError(error)) {
          redirectToLogin();
          return;
        }
        setProductsError(describeError(error));
      }
    },
    [restaurantId],
  );

  /**
   * Section 1A: the only path that changes `selectedCategoryId`. Invalidates
   * any in-flight Product load, then clears/sets state in one call (React
   * batches these into a single render) before starting the new load.
   */
  const selectCategory = useCallback(
    (categoryId: string | null) => {
      productsRequestRef.current += 1;
      selectedCategoryIdRef.current = categoryId;
      setSelectedCategoryId(categoryId);
      setProducts(null);
      setProductsError(null);
      if (categoryId) {
        void loadProducts(categoryId);
      }
    },
    [loadProducts],
  );

  const loadCategories = useCallback(
    async (menuId: string, selectId?: string) => {
      // Fix, Section 2: same pre-flight identity guard as loadProducts,
      // one level up -- a stale caller (a mutation callback resolving after
      // the User has since switched Menu) must never invalidate the current
      // request for the now-selected Menu.
      if (selectedMenuIdRef.current !== menuId) {
        return;
      }
      const requestId = ++categoriesRequestRef.current;
      try {
        const data = await menuApi.listCategories(restaurantId, menuId);
        if (
          categoriesRequestRef.current !== requestId ||
          selectedMenuIdRef.current !== menuId
        ) {
          return;
        }
        categoriesRef.current = data;
        setCategories(data);
        setCategoriesError(null);
        const nextCategoryId =
          selectId && data.some((category) => category.id === selectId)
            ? selectId
            : selectedCategoryIdRef.current === ALL_PRODUCTS && data.length > 0
              ? ALL_PRODUCTS
              : selectedCategoryIdRef.current &&
                  data.some(
                    (category) => category.id === selectedCategoryIdRef.current,
                  )
                ? selectedCategoryIdRef.current
                : data.length > 0
                  ? ALL_PRODUCTS
                  : null;
        if (nextCategoryId !== selectedCategoryIdRef.current) {
          selectCategory(nextCategoryId);
        }
      } catch (error) {
        if (
          categoriesRequestRef.current !== requestId ||
          selectedMenuIdRef.current !== menuId
        ) {
          return;
        }
        if (isUnauthenticatedError(error)) {
          redirectToLogin();
          return;
        }
        setCategoriesError(describeError(error));
      }
    },
    [restaurantId, selectCategory],
  );

  /**
   * Section 1A: the only path that changes `selectedMenuId`. Invalidates any
   * in-flight Category load AND any in-flight Product load (Products are
   * nested beneath Categories, so a Menu change must invalidate both
   * levels), clears every level's state in one call, then starts the new
   * Categories load.
   */
  const selectMenu = useCallback(
    (menuId: string | null, categorySelectId?: string) => {
      categoriesRequestRef.current += 1;
      productsRequestRef.current += 1;
      selectedMenuIdRef.current = menuId;
      selectedCategoryIdRef.current = null;
      categoriesRef.current = null;
      setSelectedMenuId(menuId);
      setCategories(null);
      setCategoriesError(null);
      setSelectedCategoryId(null);
      setProducts(null);
      setProductsError(null);
      if (menuId) {
        void loadCategories(menuId, categorySelectId);
      }
    },
    [loadCategories],
  );

  /**
   * Micro-fix, Section 1: `menusRequestRef` mirrors the same request-
   * generation guard already used for Categories/Products, one level up.
   * There is no "parent id" to also check here (Menu list has no parent),
   * so the generation counter alone is the whole guard: a stale Menu-list
   * response must never overwrite a newer Menu list, its primary
   * indicators, or trigger fallback selection from an older snapshot, and
   * a stale failure must never surface over a since-succeeded newer
   * request.
   */
  const loadMenus = useCallback(
    async (selectId?: string, categorySelectId?: string) => {
      const requestId = ++menusRequestRef.current;
      try {
        const data = await menuApi.listMenus(restaurantId);
        if (menusRequestRef.current !== requestId) {
          return; // superseded by a newer Menu-list request -- discard.
        }
        setMenus(data);
        setMenusError(null);
        const nextMenuId =
          selectId && data.some((menu) => menu.id === selectId)
            ? selectId
            : selectedMenuIdRef.current &&
                data.some((menu) => menu.id === selectedMenuIdRef.current)
              ? selectedMenuIdRef.current
              : pickInitialMenuId(data);
        if (nextMenuId !== selectedMenuIdRef.current) {
          selectMenu(nextMenuId, categorySelectId);
        }
      } catch (error) {
        if (menusRequestRef.current !== requestId) {
          return;
        }
        if (isUnauthenticatedError(error)) {
          redirectToLogin();
          return;
        }
        setMenusError(describeError(error));
      }
    },
    [restaurantId, selectMenu],
  );

  useEffect(() => {
    // `queueMicrotask` here is purely to satisfy eslint-plugin-react-hooks'
    // `set-state-in-effect` rule, which traces into `loadMenus` and flags a
    // direct call as a potential cascading-render footgun -- this has
    // nothing to do with the race-safety guarantees above (those live in
    // the requestId/ref checks in loadMenus/loadCategories/loadProducts,
    // not in timing). This is the one-time "fetch on mount" call; every
    // other Menu load already goes through selectMenu/loadMenus explicitly.
    queueMicrotask(() => {
      void loadMenus(initialMenuId, initialCategoryId);
    });
    // `initialMenuId`/`initialCategoryId` are only meaningful for this one
    // mount-time restore -- intentionally excluded from deps so a later
    // Restaurant-Language or other prop change never re-triggers Menu
    // re-selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMenus]);

  useEffect(() => {
    queueMicrotask(() => {
      settingsApi
        .getRestaurantLocales(restaurantId)
        .then(setLocales)
        .catch(() => {
          // Non-critical for this workspace: editors simply show only the
          // default-locale fields until this succeeds on a future render.
        });
    });
  }, [restaurantId]);

  const loadProductCounts = useCallback(async () => {
    try {
      const all = await menuApi.listProducts(restaurantId);
      const counts: Record<string, number> = {};
      for (const product of all) {
        counts[product.categoryId] = (counts[product.categoryId] ?? 0) + 1;
      }
      setProductCounts(counts);
    } catch {
      // Counts are a convenience: without them the rail simply shows no numbers.
    }
  }, [restaurantId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadProductCounts();
    });
  }, [loadProductCounts, categories]);

  /** Optimistic: the new order shows immediately, is saved, and the list is reloaded if saving fails. */
  async function handleReorderCategories(categoryIds: string[]) {
    if (!selectedMenuId || !categories) return;
    const byId = new Map(categories.map((category) => [category.id, category]));
    const reordered = categoryIds
      .map((id) => byId.get(id))
      .filter((category): category is Category => category !== undefined);
    categoriesRef.current = reordered;
    setCategories(reordered);
    setOrderError(null);
    try {
      await menuApi.reorderCategories(restaurantId, selectedMenuId, categoryIds);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setOrderError(t('menu.reorder.failed'));
      void loadCategories(selectedMenuId);
    }
  }

  async function handleReorderProducts(productIds: string[]) {
    if (!selectedCategoryId || !products) return;
    const byId = new Map(products.map((product) => [product.id, product]));
    setProducts(
      productIds
        .map((id) => byId.get(id))
        .filter((product): product is Product => product !== undefined),
    );
    setOrderError(null);
    try {
      await menuApi.reorderProducts(restaurantId, selectedCategoryId, productIds);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setOrderError(t('menu.reorder.failed'));
      void loadProducts(selectedCategoryId);
    }
  }

  function handleCategoryMoved(movedCategory: Category) {
    if (movedCategory.menuId === selectedMenuId) {
      // Defensive: the "move to" control excludes the current Menu, so this
      // should not happen in practice, but a same-Menu "move" is a no-op --
      // just reselect it without forcing a redundant reload.
      selectCategory(movedCategory.id);
      return;
    }
    selectMenu(movedCategory.menuId, movedCategory.id);
  }

  if (menusError && !menus) {
    return (
      <Alert variant="error">
        <div className="flex items-center justify-between gap-4">
          <span>{menusError}</span>
          <Button variant="secondary" size="sm" onClick={() => void loadMenus()}>
            {t('common.retry')}
          </Button>
        </div>
      </Alert>
    );
  }

  const isAllProducts = selectedCategoryId === ALL_PRODUCTS;
  const selectedCategory = categories?.find((category) => category.id === selectedCategoryId);
  const categoryNames: Record<string, string> = {};
  for (const category of categories ?? []) {
    categoryNames[category.id] = category.translation.name;
  }
  const selectedMenu = menus?.find((menu) => menu.id === selectedMenuId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('menu.title')}
        description={t('menu.subtitle')}
        actions={
          <>
            {canManage ? (
              <Button asChild variant="secondary">
                <Link href={`/staff/restaurants/${restaurantId}/menu/import`}>{t('import.entry')}</Link>
              </Button>
            ) : null}
            <OpenGuestMenuButton restaurantId={restaurantId} />
          </>
        }
      />

      <MenuSectionTabs restaurantId={restaurantId} active="products" />

      {!canManage && hasMenuManagePermission ? (
        <Alert variant="info">{t('menu.needsFullScope')}</Alert>
      ) : null}

      <MenuContextBar
        menus={menus}
        error={menusError}
        selectedMenuId={selectedMenuId}
        onSelectMenu={(menuId) => selectMenu(menuId)}
        onRetry={() => void loadMenus()}
        canManage={canManage}
        restaurantId={restaurantId}
        locales={locales}
        onCreated={(created) => void loadMenus(created.id)}
        onUpdated={() => void loadMenus()}
        onPrimaryChanged={() => void loadMenus()}
        onMenuNotFound={() => void loadMenus()}
      />

      {orderError ? <Alert variant="error">{orderError}</Alert> : null}

      {/* Responsive fix: the Category rail + Product workspace split waits
          for `xl` (1280px), not `lg` (1024px) -- `lg` is also where the
          Staff Sidebar itself becomes persistent (RestaurantSidebar.tsx),
          and the *remaining* content area at exactly that width (viewport
          minus the ~264px Sidebar and page gutters) is too narrow for the
          Product table's real minimum content width, which was causing
          genuine document-level horizontal overflow at ~1024-1150px
          viewports. Below `xl`, Categories/Products keep using the
          mobile/tablet chip+card pattern regardless of whether the
          Sidebar happens to already be persistent. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[260px_1fr]">
        {/* Section 1C: keying by the selected Menu forces a fresh
            CategoryNavigation instance (fresh local form state) whenever
            the Menu changes -- an Edit/Create form left open under the
            previous Menu cannot survive underneath the new one. */}
        <CategoryNavigation
          key={`menu-${selectedMenuId ?? 'none'}`}
          restaurantId={restaurantId}
          menuId={selectedMenuId}
          menus={menus ?? []}
          categories={categories}
          error={categoriesError}
          locales={locales}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={(categoryId) => selectCategory(categoryId)}
          onRetry={() => {
            if (selectedMenuId) void loadCategories(selectedMenuId);
          }}
          canManage={canManage}
          onCreated={(created) => {
            if (selectedMenuId) void loadCategories(selectedMenuId, created.id);
          }}
          onUpdated={(updated) => {
            if (selectedMenuId) void loadCategories(selectedMenuId, updated.id);
          }}
          onMoved={handleCategoryMoved}
          onCategoryNotFound={() => {
            if (selectedMenuId) void loadCategories(selectedMenuId);
          }}
          onMenuNotFound={() => void loadMenus()}
          productCounts={productCounts}
          onReorder={(categoryIds) => void handleReorderCategories(categoryIds)}
        />
        {/* Section 1C: same reasoning, keyed by the selected Category. */}
        <ProductList
          key={`category-${selectedCategoryId ?? 'none'}`}
          restaurantId={restaurantId}
          categoryId={isAllProducts ? null : selectedCategoryId}
          isAllProducts={isAllProducts}
          categoryNames={categoryNames}
          categoryName={selectedCategory?.translation.name}
          menuName={selectedMenu?.translation.name}
          products={products}
          error={productsError}
          onRetry={() => {
            if (selectedCategoryId) void loadProducts(selectedCategoryId);
          }}
          canManage={canManage}
          currencyCode={currencyCode}
          onAvailabilityChanged={() => {
            if (selectedCategoryId) void loadProducts(selectedCategoryId);
          }}
          onProductNotFound={() => {
            if (selectedCategoryId) void loadProducts(selectedCategoryId);
          }}
          onReorder={(productIds) => void handleReorderProducts(productIds)}
        />
      </div>
    </div>
  );
}
