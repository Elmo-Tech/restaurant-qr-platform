"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./premium-menu.module.css";

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
type CartItem = { id: string; name: string; detail: string; price: number; image: string; quantity: number };

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

const categories = ["مقبلات", "برجر", "بيتزا", "باستا", "مشويات", "حلويات", "مشروبات"];

function Icon({ name }: { name: "bag" | "plus" | "minus" | "close" | "arrow" | "check" }) {
  const p = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "bag") return <svg {...p}><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>;
  if (name === "plus") return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "minus") return <svg {...p}><path d="M5 12h14"/></svg>;
  if (name === "close") return <svg {...p}><path d="m6 6 12 12M18 6 6 18"/></svg>;
  if (name === "arrow") return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
  if (name === "check") return <svg {...p}><path d="m5 12 4 4L19 6"/></svg>;
  return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
}

function Money({ value }: { value: number }) {
  return <span className={styles.money}><bdi>{value}</bdi><small>ج.م</small></span>;
}

function ProductPortrait({ product, onOpen, compact = false }: { product: Product; onOpen: () => void; compact?: boolean }) {
  return (
    <button className={`${styles.productPortrait} ${compact ? styles.portraitCompact : ""}`} type="button" onClick={onOpen} aria-label={`عرض ${product.name}`}>
      <Image src={product.image} alt={product.name} fill sizes={compact ? "220px" : "520px"} className={styles.coverImage} />
      <span className={styles.portraitShade} />
      {product.badge ? <em>{product.badge}</em> : null}
      <span className={styles.portraitCopy}>
        <small>{product.englishName}</small>
        <b>{product.name}</b>
        <span>{product.sizes ? "يبدأ من" : ""} <Money value={product.price} /></span>
      </span>
    </button>
  );
}

export function PremiumMenuShowcase() {
  const [spread, setSpread] = useState(0);
  const [flipping, setFlipping] = useState<"next" | "previous" | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const timers = useRef<number[]>([]);

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

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

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

  const addCartItem = (item: CartItem) => {
    setCart((current) => {
      const existing = current.find((entry) => entry.id === item.id && entry.detail === item.detail);
      return existing
        ? current.map((entry) => entry === existing ? { ...entry, quantity: entry.quantity + item.quantity } : entry)
        : [...current, item];
    });
  };

  const confirmProduct = () => {
    if (!selected) return;
    const detail = [chosenSize?.name, ...(selected.extras ?? []).filter((extra) => selectedExtras.includes(extra.id)).map((extra) => extra.name)].filter(Boolean).join(" · ");
    addCartItem({ id: selected.id, name: selected.name, detail, price: unitPrice, image: selected.image, quantity });
    setSelected(null);
  };

  const addDrink = () => {
    addCartItem({ id: softDrink.id, name: softDrink.name, detail: "", price: softDrink.price, image: softDrink.image, quantity: 1 });
  };

  const changeCartQuantity = (index: number, delta: number) => {
    setCart((current) => current.flatMap((item, itemIndex) => {
      if (index !== itemIndex) return [item];
      const next = item.quantity + delta;
      return next > 0 ? [{ ...item, quantity: next }] : [];
    }));
  };

  const turnPage = (direction: "next" | "previous") => {
    const target = spread + (direction === "next" ? 1 : -1);
    if (flipping || target < 0 || target > 2) return;
    setFlipping(direction);
    timers.current.push(window.setTimeout(() => setSpread(target), 340));
    timers.current.push(window.setTimeout(() => setFlipping(null), 760));
  };

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.atmosphere} aria-hidden="true">
        <span className={styles.inkWash} />
        <span className={styles.orbitOne} />
        <span className={styles.orbitTwo} />
        <span className={styles.lineArt} />
        <span className={styles.grain} />
      </div>

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span><Image src="/showcase/premium-menu/logo.png" alt="شعار elmo cafe" fill sizes="46px" /></span>
          <div><b>elmo cafe</b><small>Signature digital menu</small></div>
        </div>

        <button type="button" className={styles.cartButton} onClick={() => setCartOpen(true)} aria-label={`السلة، ${cartCount} أصناف`}><Icon name="bag" /><span>{cartCount}</span></button>
      </header>

      <section className={styles.bookExperience} aria-label="منيو elmo cafe">
          <div className={`${styles.bookStage} ${styles.stageOpen}`}>
            <button
              type="button"
              className={`${styles.pageTurnButton} ${styles.pageTurnPrevious}`}
              onClick={() => turnPage("previous")}
              disabled={spread === 0 || Boolean(flipping)}
              aria-label="الصفحة السابقة"
            >
              <Icon name="arrow" />
              <span>السابق</span>
            </button>

            <div className={styles.openBook}>
                <span className={styles.bookSpine} aria-hidden="true" />
                <article className={`${styles.paper} ${styles.paperLeft}`} dir="rtl">
                  {spread === 0 ? (
                    <div className={styles.contentsPage}>
                      <span className={styles.pageEyebrow}>فهرس القائمة</span>
                      <h2>كل ما تشتهيه<br/>في صفحات قليلة</h2>
                      <ol>{categories.map((category, index) => <li key={category}><span>{String(index + 1).padStart(2, "0")}</span><b>{category}</b><i /></li>)}</ol>
                    </div>
                  ) : spread === 1 ? (
                    <div className={styles.featurePage}>
                      <span className={styles.pageEyebrow}>بيتزا · 03</span>
                      <ProductPortrait product={products[2]} onOpen={() => openProduct(products[2])} />
                      <p>{products[2].description}</p>
                      <button type="button" className={styles.inkButton} onClick={() => openProduct(products[2])}>اختر الحجم والإضافات <Icon name="arrow" /></button>
                    </div>
                  ) : (
                    <div className={styles.closingPage}>
                      <span className={styles.pageEyebrow}>elmo cafe</span>
                      <span className={styles.closingMark}><Image src="/showcase/premium-menu/logo.png" alt="" fill sizes="90px" /></span>
                      <h2>اختيارك جاهز</h2>
                      <p>راجع طلبك وأضف اللمسة الأخيرة قبل المتابعة.</p>
                      <button type="button" onClick={() => setCartOpen(true)}><Icon name="bag" />عرض الطلب <Money value={cartTotal} /></button>
                    </div>
                  )}
                  <span className={styles.pageNumber}>{String(spread * 2 + 2).padStart(2, "0")}</span>
                </article>

                <article className={`${styles.paper} ${styles.paperRight}`} dir="rtl">
                  {spread === 0 ? (
                    <div className={styles.heroPage}>
                      <span className={styles.pageEyebrow}>اختيارنا · بيتزا</span>
                      <ProductPortrait product={products[2]} onOpen={() => openProduct(products[2])} />
                      <div><small>{products[2].englishName}</small><h2>{products[2].name}</h2><p>{products[2].description}</p><button type="button" className={styles.inkButton} onClick={() => openProduct(products[2])}>عرض التفاصيل <Icon name="arrow" /></button></div>
                    </div>
                  ) : spread === 1 ? (
                    <div className={styles.duoPage}>
                      <span className={styles.pageEyebrow}>مقبلات وبرجر</span>
                      <h2>ابدأها صح</h2>
                      <div>
                        <ProductPortrait product={products[0]} compact onOpen={() => openProduct(products[0])} />
                        <ProductPortrait product={products[1]} compact onOpen={() => openProduct(products[1])} />
                      </div>
                    </div>
                  ) : (
                    <div className={styles.duoPage}>
                      <span className={styles.pageEyebrow}>باستا ومشروبات</span>
                      <h2>آخر لمسة</h2>
                      <div>
                        <ProductPortrait product={products[3]} compact onOpen={() => openProduct(products[3])} />
                        <ProductPortrait product={softDrink} compact onOpen={() => openProduct(softDrink)} />
                      </div>
                    </div>
                  )}
                  <span className={styles.pageNumber}>{String(spread * 2 + 1).padStart(2, "0")}</span>
                </article>

                {flipping ? <span className={`${styles.turningPage} ${flipping === "next" ? styles.turnNext : styles.turnPrevious}`} aria-hidden="true"><i /><b>elmo cafe</b></span> : null}
            </div>

            <button
              type="button"
              className={`${styles.pageTurnButton} ${styles.pageTurnNext}`}
              onClick={() => turnPage("next")}
              disabled={spread === 2 || Boolean(flipping)}
              aria-label="الصفحة التالية"
            >
              <Icon name="arrow" />
              <span>التالي</span>
            </button>
          </div>

          <div className={styles.bookProgress} aria-live="polite" aria-label={`صفحة ${spread + 1} من 3`}>
            {[0, 1, 2].map((pageIndex) => <span key={pageIndex} className={pageIndex === spread ? styles.progressActive : ""} />)}
            <b>{spread + 1} / 3</b>
          </div>
      </section>

      {cartCount > 0 ? <button type="button" className={styles.floatingCart} onClick={() => setCartOpen(true)}><span>{cartCount}</span><b>عرض الطلب</b><Money value={cartTotal} /><i><Icon name="arrow" /></i></button> : null}

      {selected ? (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className={styles.productDialog} role="dialog" aria-modal="true" aria-labelledby="product-title">
            <div className={styles.dialogMedia}>
              <Image src={selected.image} alt={selected.name} fill sizes="(max-width: 720px) 100vw, 520px" className={styles.coverImage} />
              <span />
              <button type="button" onClick={() => setSelected(null)} aria-label="إغلاق"><Icon name="close" /></button>
              <div><small>{selected.englishName}</small><h2 id="product-title">{selected.name}</h2><Money value={chosenSize?.price ?? selected.price} /></div>
            </div>
            <div className={styles.dialogBody}>
              <p>{selected.description}</p>
              {selected.sizes ? (
                <fieldset className={styles.choices}>
                  <legend><span><b>اختر الحجم</b><small>اختر واحدًا</small></span><em>مطلوب</em></legend>
                  {selected.sizes.map((size) => {
                    const checked = selectedSize === size.id;
                    return <label key={size.id} className={checked ? styles.choiceActive : ""}><input type="radio" name="size" checked={checked} onChange={() => setSelectedSize(size.id)} /><i>{checked ? <Icon name="check" /> : null}</i><b>{size.name}</b><Money value={size.price} /></label>;
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
          <aside className={styles.cartDrawer} role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <header><div><small>YOUR ORDER</small><h2 id="cart-title">راجع طلبك</h2></div><button type="button" onClick={() => setCartOpen(false)} aria-label="إغلاق"><Icon name="close" /></button></header>
            <div className={styles.cartBody}>
              {cart.length === 0 ? <div className={styles.emptyCart}><Icon name="bag" /><h3>الكتاب مفتوح أمامك</h3><p>اختر ما يعجبك من الصفحات وأضفه إلى طلبك.</p></div> : (
                <>
                  <ul>{cart.map((item, index) => <li key={`${item.id}-${item.detail}`}><span><Image src={item.image} alt="" fill sizes="68px" /></span><div><b>{item.name}</b>{item.detail ? <small>{item.detail}</small> : null}<Money value={item.price * item.quantity} /></div><div><button type="button" onClick={() => changeCartQuantity(index, -1)} aria-label="تقليل"><Icon name="minus" /></button><b>{item.quantity}</b><button type="button" onClick={() => changeCartQuantity(index, 1)} aria-label="زيادة"><Icon name="plus" /></button></div></li>)}</ul>
                  <section className={styles.recommendation}><span>ترشيح مناسب لطلبك</span><h3>أكمل وجبتك</h3><article><span><Image src={softDrink.image} alt={softDrink.name} fill sizes="78px" /></span><div><b>{softDrink.name}</b><small>{softDrink.description}</small><Money value={softDrink.price} /></div><button type="button" onClick={addDrink} aria-label={`إضافة ${softDrink.name}`}><Icon name="plus" /></button></article></section>
                </>
              )}
            </div>
            {cart.length ? <footer><div><span>الإجمالي</span><Money value={cartTotal} /></div><button type="button">متابعة الطلب <Icon name="arrow" /></button></footer> : null}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
