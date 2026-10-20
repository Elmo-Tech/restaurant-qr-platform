"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import styles from "./editorial-menu.module.css";

type Choice = { id: string; name: string; price: number; default?: boolean };
type Product = {
  id: string;
  name: string;
  englishName: string;
  description: string;
  price: number;
  image: string;
  category: string;
  badge?: string;
  sizes?: Choice[];
  extras?: Choice[];
};
type CartItem = { key: string; name: string; detail: string; price: number; quantity: number; image: string };

const products: Product[] = [
  {
    id: "loaded-fries",
    name: "بطاطس محملة",
    englishName: "Loaded fries",
    description: "بطاطس مقرمشة مع صوص الجبن وقطع اللحم المدخن.",
    price: 85,
    image: "/showcase/premium-menu/loaded-fries.jpg",
    category: "مقبلات",
    badge: "الأكثر طلبًا",
    extras: [
      { id: "jalapeno", name: "هالبينو", price: 10 },
      { id: "extra-cheese", name: "صوص جبنة إضافي", price: 20 },
    ],
  },
  {
    id: "classic-burger",
    name: "برجر لحم كلاسيك",
    englishName: "Classic beef burger",
    description: "قطعة لحم بقري 180 جم مع جبنة شيدر وخضار طازجة.",
    price: 140,
    image: "/showcase/premium-menu/burger.jpg",
    category: "برجر",
    extras: [
      { id: "cheddar", name: "شريحة شيدر", price: 20 },
      { id: "smoked-beef", name: "لحم مدخن", price: 35 },
    ],
  },
  {
    id: "pepperoni-pizza",
    name: "بيتزا بيبروني",
    englishName: "Pepperoni pizza",
    description: "شرائح بيبروني حارة على جبنة موزاريلا وصوص طماطم غني.",
    price: 145,
    image: "/showcase/premium-menu/pizza.jpg",
    category: "بيتزا",
    badge: "اختيارنا",
    sizes: [
      { id: "medium", name: "وسط", price: 145, default: true },
      { id: "large", name: "كبير", price: 185 },
    ],
    extras: [
      { id: "mozzarella", name: "موزاريلا إضافية", price: 25 },
      { id: "olives", name: "زيتون أسود", price: 15 },
      { id: "jalapeno", name: "هالبينو", price: 10 },
    ],
  },
  {
    id: "chicken-pasta",
    name: "فيتوتشيني ألفريدو بالدجاج",
    englishName: "Chicken fettuccine alfredo",
    description: "مكرونة بصوص الكريمة والبارميزان مع الدجاج المشوي.",
    price: 130,
    image: "/showcase/premium-menu/pasta.jpg",
    category: "باستا",
  },
];

const softDrink: Product = {
  id: "soft-drink",
  name: "مشروب غازي",
  englishName: "Soft drink",
  description: "اختيار من المشروبات الغازية الباردة.",
  price: 25,
  image: "/showcase/premium-menu/soft-drink.jpg",
  category: "مشروبات",
};

const categories = ["المقبلات", "البرجر", "البيتزا", "الباستا", "المشروبات"];

function Icon({ name }: { name: "arrow" | "plus" | "minus" | "bag" | "close" | "check" }) {
  const props = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "plus") return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "minus") return <svg {...props}><path d="M5 12h14" /></svg>;
  if (name === "bag") return <svg {...props}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>;
  if (name === "close") return <svg {...props}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  if (name === "check") return <svg {...props}><path d="m5 12 4 4L19 6" /></svg>;
  return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

function Money({ value }: { value: number }) {
  return <span className={styles.money}><bdi>{value}</bdi><small>ج.م</small></span>;
}

function SheetFrame({ index, variant, children }: { index: number; variant: "cover" | "menu" | "feature"; children: ReactNode }) {
  return (
    <article className={`${styles.sheet} ${styles[variant]}`}>
      <span className={styles.sheetNumber}>{String(index + 1).padStart(2, "0")}</span>
      <span className={styles.paperNoise} aria-hidden="true" />
      {children}
    </article>
  );
}

function CoverSheet() {
  return (
    <SheetFrame index={0} variant="cover">
      <span className={`${styles.foodOrb} ${styles.orbOne}`}><Image src={products[2].image} alt="" fill sizes="190px" /></span>
      <span className={`${styles.foodOrb} ${styles.orbTwo}`}><Image src={products[0].image} alt="" fill sizes="130px" /></span>
      <span className={`${styles.foodOrb} ${styles.orbThree}`}><Image src={products[3].image} alt="" fill sizes="120px" /></span>
      <div className={styles.coverLogo}><Image src="/showcase/premium-menu/logo.png" alt="شعار elmo cafe" fill sizes="82px" /></div>
      <div className={styles.coverCopy}>
        <span>THE EDITORIAL MENU</span>
        <h1>قائمة<br /><em>elmo cafe</em></h1>
        <p>اختيارات طازجة تُحضّر لك عند الطلب</p>
      </div>
      <ol className={styles.coverIndex}>
        {categories.map((category, index) => <li key={category}><span>{String(index + 1).padStart(2, "0")}</span><b>{category}</b></li>)}
      </ol>
    </SheetFrame>
  );
}

function MenuSheet({ onOpen }: { onOpen: (product: Product) => void }) {
  return (
    <SheetFrame index={1} variant="menu">
      <header className={styles.sheetHeader}>
        <div><span>مختاراتنا</span><h2>ابدأها صح</h2></div>
        <b>01</b>
      </header>
      <div className={styles.menuGrid}>
        {products.map((product) => (
          <button type="button" key={product.id} className={styles.menuItem} onClick={() => onOpen(product)}>
            <span className={styles.roundImage}><Image src={product.image} alt={product.name} fill sizes="180px" /></span>
            {product.badge ? <em>{product.badge}</em> : null}
            <span className={styles.itemCopy}>
              <small>{product.category}</small>
              <b>{product.name}</b>
              <span>{product.description}</span>
              <Money value={product.price} />
            </span>
          </button>
        ))}
      </div>
    </SheetFrame>
  );
}

function FeatureSheet({ onOpen, onAddDrink }: { onOpen: (product: Product) => void; onAddDrink: () => void }) {
  const featured = products[2];
  return (
    <SheetFrame index={2} variant="feature">
      <button type="button" className={styles.featureImage} onClick={() => onOpen(featured)} aria-label={`عرض ${featured.name}`}>
        <Image src={featured.image} alt={featured.name} fill sizes="420px" />
        <span><small>{featured.badge}</small><b>{featured.name}</b></span>
      </button>
      <div className={styles.featureCopy}>
        <span>{featured.englishName}</span>
        <div className={styles.featureTitle}><h2>{featured.name}</h2><Money value={featured.price} /></div>
        <p>{featured.description}</p>
        <button type="button" className={styles.detailButton} onClick={() => onOpen(featured)}>اختر الحجم والإضافات <Icon name="arrow" /></button>
        <div className={styles.pairing}>
          <span className={styles.pairingImage}><Image src={softDrink.image} alt={softDrink.name} fill sizes="75px" /></span>
          <div><small>يكمل وجبتك</small><b>{softDrink.name}</b><Money value={softDrink.price} /></div>
          <button type="button" onClick={onAddDrink} aria-label={`إضافة ${softDrink.name}`}><Icon name="plus" /></button>
        </div>
      </div>
    </SheetFrame>
  );
}

export function EditorialMenuShowcase() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const pointerStart = useRef<number | null>(null);

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const chosenSize = selected?.sizes?.find((size) => size.id === selectedSize) ?? null;
  const unitPrice = selected
    ? (chosenSize?.price ?? selected.price) + (selected.extras ?? []).filter((extra) => selectedExtras.includes(extra.id)).reduce((sum, extra) => sum + extra.price, 0)
    : 0;

  useEffect(() => {
    document.body.style.overflow = selected || cartOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selected, cartOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setCartOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openProduct = (product: Product) => {
    setSelected(product);
    setSelectedSize(product.sizes?.find((size) => size.default)?.id ?? product.sizes?.[0]?.id ?? null);
    setSelectedExtras([]);
    setQuantity(1);
  };

  const addCartItem = (item: Omit<CartItem, "key">) => {
    const key = `${item.name}-${item.detail}`;
    setCart((current) => {
      const found = current.find((entry) => entry.key === key);
      return found
        ? current.map((entry) => entry.key === key ? { ...entry, quantity: entry.quantity + item.quantity } : entry)
        : [...current, { ...item, key }];
    });
  };

  const confirmProduct = () => {
    if (!selected) return;
    const detail = [chosenSize?.name, ...(selected.extras ?? []).filter((extra) => selectedExtras.includes(extra.id)).map((extra) => extra.name)].filter(Boolean).join(" · ");
    addCartItem({ name: selected.name, detail, price: unitPrice, quantity, image: selected.image });
    setSelected(null);
  };

  const addDrink = () => addCartItem({ name: softDrink.name, detail: "", price: softDrink.price, quantity: 1, image: softDrink.image });
  const movePage = (direction: -1 | 1) => setPage((current) => Math.max(0, Math.min(2, current + direction)));

  const renderSheet = (sheetIndex: number) => {
    if (sheetIndex === 0) return <CoverSheet />;
    if (sheetIndex === 1) return <MenuSheet onOpen={openProduct} />;
    return <FeatureSheet onOpen={openProduct} onAddDrink={addDrink} />;
  };

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.tableScene} aria-hidden="true"><span /><span /><span /></div>

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span><Image src="/showcase/premium-menu/logo.png" alt="شعار elmo cafe" fill sizes="44px" /></span>
          <div><b>elmo cafe</b><small>القائمة الرقمية</small></div>
        </div>
        <div className={styles.pageStatus}><i>{String(page + 1).padStart(2, "0")}</i><span /><b>03</b></div>
        <button type="button" className={styles.cartButton} onClick={() => setCartOpen(true)} aria-label={`السلة، ${cartCount} أصناف`}>
          <Icon name="bag" /><span>{cartCount}</span>
        </button>
      </header>

      <section
        className={styles.catalogStage}
        aria-label="منيو elmo cafe التفاعلي"
        onPointerDown={(event) => { pointerStart.current = event.clientX; }}
        onPointerUp={(event) => {
          if (pointerStart.current === null) return;
          const distance = event.clientX - pointerStart.current;
          pointerStart.current = null;
          if (Math.abs(distance) < 52) return;
          movePage(distance > 0 ? 1 : -1);
        }}
      >
        <div className={styles.desktopDeck}>
          <CoverSheet />
          <MenuSheet onOpen={openProduct} />
          <FeatureSheet onOpen={openProduct} onAddDrink={addDrink} />
        </div>

        <div className={styles.mobileDeck} key={page}>{renderSheet(page)}</div>

        <button type="button" className={`${styles.navButton} ${styles.navNext}`} onClick={() => movePage(1)} disabled={page === 2} aria-label="الصفحة التالية"><Icon name="arrow" /></button>
        <button type="button" className={`${styles.navButton} ${styles.navPrevious}`} onClick={() => movePage(-1)} disabled={page === 0} aria-label="الصفحة السابقة"><Icon name="arrow" /></button>
      </section>

      <nav className={styles.pageDots} aria-label="صفحات المنيو">
        {[0, 1, 2].map((pageIndex) => <button type="button" key={pageIndex} className={pageIndex === page ? styles.dotActive : ""} onClick={() => setPage(pageIndex)} aria-label={`صفحة ${pageIndex + 1}`} />)}
      </nav>

      {cartCount > 0 ? <button type="button" className={styles.floatingCart} onClick={() => setCartOpen(true)}><span>{cartCount}</span><b>عرض الطلب</b><Money value={cartTotal} /><Icon name="arrow" /></button> : null}

      {selected ? (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className={styles.productDialog} role="dialog" aria-modal="true" aria-labelledby="editorial-product-title">
            <div className={styles.dialogMedia}>
              <Image src={selected.image} alt={selected.name} fill sizes="(max-width: 720px) 100vw, 480px" />
              <span />
              <button type="button" onClick={() => setSelected(null)} aria-label="إغلاق"><Icon name="close" /></button>
              <div><small>{selected.englishName}</small><h2 id="editorial-product-title">{selected.name}</h2><Money value={chosenSize?.price ?? selected.price} /></div>
            </div>
            <div className={styles.dialogBody}>
              <p>{selected.description}</p>
              {selected.sizes ? (
                <fieldset className={styles.choices}>
                  <legend><span><b>اختر الحجم</b><small>اختر واحدًا</small></span><em>مطلوب</em></legend>
                  {selected.sizes.map((size) => {
                    const checked = selectedSize === size.id;
                    return <label key={size.id} className={checked ? styles.choiceActive : ""}><input type="radio" name="editorial-size" checked={checked} onChange={() => setSelectedSize(size.id)} /><i>{checked ? <Icon name="check" /> : null}</i><b>{size.name}</b><Money value={size.price} /></label>;
                  })}
                </fieldset>
              ) : null}
              {selected.extras?.length ? (
                <fieldset className={styles.choices}>
                  <legend><span><b>الإضافات</b><small>يمكنك اختيار أكثر من إضافة</small></span><em className={styles.optional}>اختياري</em></legend>
                  {selected.extras.map((extra) => {
                    const checked = selectedExtras.includes(extra.id);
                    return <label key={extra.id} className={checked ? styles.choiceActive : ""}><input type="checkbox" checked={checked} onChange={() => setSelectedExtras((current) => checked ? current.filter((id) => id !== extra.id) : [...current, extra.id])} /><i>{checked ? <Icon name="check" /> : null}</i><b>{extra.name}</b><span>+ <Money value={extra.price} /></span></label>;
                  })}
                </fieldset>
              ) : null}
              <footer className={styles.dialogFooter}>
                <div><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="تقليل الكمية"><Icon name="minus" /></button><b>{quantity}</b><button type="button" onClick={() => setQuantity((value) => value + 1)} aria-label="زيادة الكمية"><Icon name="plus" /></button></div>
                <button type="button" onClick={confirmProduct}><span>أضف إلى الطلب</span><Money value={unitPrice * quantity} /></button>
              </footer>
            </div>
          </section>
        </div>
      ) : null}

      {cartOpen ? (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
          <aside className={styles.cartDrawer} role="dialog" aria-modal="true" aria-labelledby="editorial-cart-title">
            <header><div><small>YOUR ORDER</small><h2 id="editorial-cart-title">طلبك</h2></div><button type="button" onClick={() => setCartOpen(false)} aria-label="إغلاق"><Icon name="close" /></button></header>
            <div className={styles.cartBody}>
              {cart.length === 0 ? <div className={styles.emptyCart}><Icon name="bag" /><h3>اختياراتك ستظهر هنا</h3><p>اضغط على أي طبق لعرض الأحجام والإضافات.</p></div> : (
                <ul>{cart.map((item, index) => <li key={item.key}><span><Image src={item.image} alt="" fill sizes="68px" /></span><div><b>{item.name}</b>{item.detail ? <small>{item.detail}</small> : null}<Money value={item.price * item.quantity} /></div><div><button type="button" onClick={() => setCart((current) => current.flatMap((entry, entryIndex) => entryIndex === index ? (entry.quantity > 1 ? [{ ...entry, quantity: entry.quantity - 1 }] : []) : [entry]))} aria-label="تقليل"><Icon name="minus" /></button><b>{item.quantity}</b><button type="button" onClick={() => setCart((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: entry.quantity + 1 } : entry))} aria-label="زيادة"><Icon name="plus" /></button></div></li>)}</ul>
              )}
            </div>
            {cart.length ? <footer><div><span>الإجمالي</span><Money value={cartTotal} /></div><button type="button">متابعة الطلب <Icon name="arrow" /></button></footer> : null}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
