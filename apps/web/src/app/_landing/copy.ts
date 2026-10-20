import type { StaffLocale } from '../../lib/i18n/locale';

/** The features a Package can include (mirrors the Backend's FeatureKey), in the order the plan cards list them. */
export const PLAN_FEATURES = [
  'MENU_TEMPLATES',
  'WHATSAPP_ORDERING',
  'ORDER_TRACKING',
  'SMART_SUGGESTIONS',
  'DASHBOARD_ORDERING',
  'TABLE_ORDERING',
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

/** The menu designs the demo phone cycles through (illustrations of the product's real layouts). */
export const DESIGN_KEYS = ['classic', 'gallery', 'menu', 'floating', 'centered', 'compact', 'list'] as const;
export type DesignKey = (typeof DESIGN_KEYS)[number];

export interface LandingCopy {
  meta: { title: string; description: string };
  nav: { how: string; designs: string; features: string; plans: string; faq: string; signIn: string; cta: string; menu: string };
  hero: {
    eyebrow: string;
    title: string[];
    lead: string;
    primary: string;
    secondary: string;
    note: string;
    demoLabel: string;
    designNames: Record<DesignKey, string>;
    designLabel: string;
    orders: { kicker: string; line: string; status: string }[];
  };
  marquee: string[];
  journey: {
    eyebrow: string;
    title: string;
    steps: { tag: string; title: string; text: string }[];
    scan: string;
    scanHint: string;
    cart: string;
    addToCart: string;
    sent: string;
    sentHint: string;
    board: { title: string; cols: string[]; ticketTable: string; ticketItems: string; fresh: string };
  };
  wardrobe: {
    eyebrow: string;
    title: string;
    text: string;
    seasons: string[];
    note: string;
    cta: string;
  };
  features: {
    eyebrow: string;
    title: string;
    items: { title: string; text: string }[];
    channels: string[];
    roles: string[];
    suggest: { added: string; suggest: string };
    importLines: string[];
    track: string[];
    langA: string;
    langB: string;
  };
  plans: {
    eyebrow: string;
    title: string;
    lead: string;
    monthly: string;
    yearly: string;
    perMonth: string;
    perYear: string;
    offer: string;
    cta: string;
    unavailable: string;
    retry: string;
    featureNames: Record<PlanFeature, string>;
    premiumDesigns: string;
    basics: string[];
    currencyLabel: string;
    currencies: { EGP: string; USD: string };
  };
  trial: { title: string; text: string; cta: string; points: string[] };
  faq: { title: string; items: { q: string; a: string }[] };
  footer: { tagline: string; rights: string; signIn: string; menu: string };
  lead: {
    titleTrial: string;
    titleSubscribe: string;
    lead: string;
    kind: { trial: string; subscribe: string };
    package: string;
    packageNone: string;
    name: string;
    email: string;
    phone: string;
    restaurant: string;
    restaurantOptional: string;
    message: string;
    messageOptional: string;
    submit: string;
    submitting: string;
    close: string;
    privacy: string;
    errors: { name: string; email: string; phone: string; network: string; rate: string; other: string };
    done: { title: string; text: string; again: string };
  };
  lang: { label: string; ar: string; en: string };
}

const AR: LandingCopy = {
  meta: {
    title: 'ويتا — منيو QR وطلبات لحظية لمطعمك',
    description:
      'منيو رقمي بالعربي والإنجليزي بتصاميم كتيرة تغيّرها وقت ما تحب، وطلبات من الطاولة والاستلام والتوصيل وواتساب، وشاشة مطبخ لحظية. جرّب ويتا مجانًا ١٥ يومًا.',
  },
  nav: { how: 'كيف يعمل', designs: 'التصاميم', features: 'المزايا', plans: 'الباقات', faq: 'أسئلة', signIn: 'دخول المطاعم', cta: 'ابدأ تجربة مجانية', menu: 'القائمة' },
  hero: {
    eyebrow: 'منيو QR وطلبات لحظية',
    title: ['الزبون يمسح الكود،', 'والمطبخ يستلم الطلب.'],
    lead: 'منيو رقمي بالعربي والإنجليزي بشكل يشبه مطعمك، وطلبات من الطاولة والاستلام والتوصيل تظهر على شاشة المطبخ لحظة وصولها. الزبون لا يحمّل أي تطبيق.',
    primary: 'ابدأ تجربة مجانية',
    secondary: 'شاهد الباقات',
    note: 'بدون بطاقة ائتمان. نتواصل معك ونجهّز حسابك.',
    demoLabel: 'منيو تجريبي',
    designNames: {
      classic: 'كلاسيك',
      gallery: 'معرض',
      menu: 'منيو مطبوع',
      floating: 'بطاقة عائمة',
      centered: 'غلاف مركزي',
      compact: 'شريط مدمج',
      list: 'قائمة',
    },
    designLabel: 'التصميم الآن',
    orders: [
      { kicker: 'طلب جديد', line: 'طاولة ٧ · ٢ برجر', status: 'وصل للمطبخ' },
      { kicker: 'استلام', line: 'طلب #١١٢ · بيتزا', status: 'قيد التحضير' },
      { kicker: 'توصيل', line: 'مدينة نصر · باستا', status: 'جاهز' },
    ],
  },
  marquee: ['منيو بلغتين', 'طلبات الطاولة', 'استلام من الفرع', 'توصيل', 'واتساب', 'شاشة المطبخ', 'متابعة الطلب', 'اقتراحات ذكية', 'صلاحيات الفريق', 'تصاميم كتيرة'],
  journey: {
    eyebrow: 'كيف يعمل',
    title: 'من الطاولة للمطبخ، من غير ورقة ولا صريخ.',
    steps: [
      { tag: 'الزبون', title: 'يمسح الكود', text: 'كود QR على الطاولة يفتح منيو مطعمك في المتصفح بلغته المفضلة. لا تطبيق ولا تسجيل.' },
      { tag: 'الزبون', title: 'يختار ويطلب', text: 'يضيف الأصناف بحجمها وإضافاتها، ويرى السعر النهائي بدقة، ويرسل الطلب. وجولة ثانية على نفس الطاولة بضغطة.' },
      { tag: 'فريقك', title: 'المطبخ يستلم', text: 'يظهر الطلب فورًا على شاشة المطبخ ولوحة المطعم. الفريق يقبله ويحضّره، والزبون يتابع حالته من هاتفه.' },
    ],
    scan: 'وجّه الكاميرا نحو الكود',
    scanHint: 'يفتح المنيو مباشرة',
    cart: 'السلة',
    addToCart: 'أضف',
    sent: 'وصل طلبك',
    sentHint: 'قيد التحضير',
    board: { title: 'شاشة المطبخ', cols: ['جديد', 'قيد التحضير', 'جاهز'], ticketTable: 'طاولة ٧', ticketItems: '٢ برجر · ١ بطاطس', fresh: 'جديد' },
  },
  wardrobe: {
    eyebrow: 'التصاميم',
    title: 'منيو يغيّر ملابسه.',
    text: 'تصاميم كتيرة تختار منها اللي يناسب شخصية مطعمك، وتبدّل شكل المنيو كل فترة: مع الموسم، مع العرض، أو لمجرد إنك زهقت من القديم. كل التغيير بضغطة، وبياناتك وأسعارك كما هي.',
    seasons: ['رمضان', 'الصيف', 'عرض الويك إند', 'العيد', 'الشتا'],
    note: 'تتوفر تصاميم مميزة في الباقات الأعلى.',
    cta: 'شاهد الباقات',
  },
  features: {
    eyebrow: 'المزايا',
    title: 'كل اللي يحتاجه مطعم بيبيع فعلًا.',
    items: [
      { title: 'منيو بلغتين', text: 'كل منتج بالعربي والإنجليزي، والواجهة تنقلب RTL لوحدها. الأسعار تُحسب في الخادم فلا يتلاعب بها أحد.' },
      { title: 'أربع طرق للطلب', text: 'من الطاولة، استلام من الفرع، توصيل بمناطق ورسوم، أو رسالة واتساب جاهزة. فعّل ما يناسبك.' },
      { title: 'شاشة المطبخ والفريق', text: 'قبول، تحضير، جاهز، تم التقديم. ولكل شخص دور: مالك، مدير، كاشير، مطبخ، جرسون.' },
      { title: 'متابعة الطلب', text: 'الزبون يشوف حالة طلبه لحظيًا من غير ما يسأل الجرسون.' },
      { title: 'اقتراحات تزود الفاتورة', text: 'يضيف برجر؟ تقترح السلة بطاطس ومشروب. أنت تحدد الاقتراحات.' },
      { title: 'استيراد المنيو الحالي', text: 'ارفع منيوك الحالي واحصل على مسودة بالأصناف والأقسام. راجعها وانشرها وابدأ.' },
    ],
    channels: ['الطاولة', 'استلام', 'توصيل', 'واتساب'],
    roles: ['مالك', 'مدير', 'كاشير', 'مطبخ', 'جرسون'],
    suggest: { added: 'برجر مشوي', suggest: 'أضف بطاطس بالجبن؟' },
    importLines: ['برجر مشوي', 'بيتزا مارجريتا', 'باستا ألفريدو', 'سلطة سيزر'],
    track: ['تم الاستلام', 'قيد التحضير', 'جاهز'],
    langA: 'برجر مشوي',
    langB: 'Grilled burger',
  },
  plans: {
    eyebrow: 'الباقات',
    title: 'باقات واضحة. تدفع على قدر احتياجك.',
    lead: 'الأسعار هنا هي الأسعار الحقيقية. لا رسوم خفية ولا عمولة على الطلبات.',
    monthly: 'شهري',
    yearly: 'سنوي',
    perMonth: 'في الشهر',
    perYear: 'في السنة',
    offer: 'عرض',
    cta: 'اطلب هذه الباقة',
    unavailable: 'تعذّر تحميل الباقات الآن.',
    retry: 'حدّث الصفحة وحاول مرة أخرى، أو اطلب تجربة مجانية وسنرسل لك التفاصيل.',
    featureNames: {
      MENU_TEMPLATES: 'اختيار تصميم المنيو',
      WHATSAPP_ORDERING: 'الطلب عبر واتساب',
      ORDER_TRACKING: 'متابعة الزبون لطلبه',
      SMART_SUGGESTIONS: 'اقتراحات ذكية في السلة',
      DASHBOARD_ORDERING: 'استلام الطلبات في اللوحة',
      TABLE_ORDERING: 'طلبات الطاولات',
    },
    premiumDesigns: 'وتصاميم بريميوم',
    basics: ['منيو رقمي بلغتين', 'كود QR لمطعمك', 'لوحة تحكم لفريقك'],
    currencyLabel: 'العملة',
    currencies: { EGP: 'جنيه', USD: 'دولار' },
  },
  trial: {
    title: 'جرّب ويتا على مطعمك الحقيقي، ١٥ يومًا مجانًا.',
    text: 'اترك بياناتك ونجهّز لك حساب تجربة بمنيو مطعمك. جرّب الطلبات والمطبخ والتصاميم، ثم قرّر.',
    cta: 'اطلب التجربة المجانية',
    points: ['مجانية بالكامل', 'بدون بطاقة ائتمان', 'لا تتجدد تلقائيًا'],
  },
  faq: {
    title: 'أسئلة بتتكرر',
    items: [
      { q: 'هل يحتاج الزبون إلى تحميل تطبيق؟', a: 'لا. يمسح الكود فيفتح المنيو في المتصفح مباشرة، على أي هاتف.' },
      { q: 'هل أستطيع تعديل الأسعار والمنتجات بنفسي؟', a: 'نعم. من لوحة التحكم تضيف المنتجات وتعدّل الأسعار والتوفر في أي وقت، وتظهر التغييرات للزبائن فورًا.' },
      { q: 'هل أقدر أغيّر شكل المنيو بعدين؟', a: 'في أي وقت. تختار تصميمًا جديدًا من لوحتك وتشوفه قبل ما تحفظ، وبياناتك تفضل كما هي.' },
      { q: 'كيف أدفع وماذا يحدث بعد التجربة؟', a: 'بعد طلبك نتواصل معك ونتفق على طريقة الدفع المناسبة. لا نسحب أي مبلغ تلقائيًا، وقبل نهاية التجربة نسألك إن كنت تريد المتابعة.' },
      { q: 'هل يعمل لأكثر من فرع؟', a: 'نعم. تضيف فروعًا، ولكل فرع طاولاته وطلباته وفريقه.' },
    ],
  },
  footer: { tagline: 'منصة طلبات للمطاعم والكافيهات.', rights: 'جميع الحقوق محفوظة', signIn: 'دخول المطاعم', menu: 'روابط' },
  lead: {
    titleTrial: 'اطلب تجربتك المجانية',
    titleSubscribe: 'اطلب الاشتراك',
    lead: 'اترك بياناتك وسنتواصل معك على الهاتف أو واتساب لتجهيز حسابك.',
    kind: { trial: 'تجربة مجانية ١٥ يوم', subscribe: 'اشتراك' },
    package: 'الباقة',
    packageNone: 'لست متأكدًا بعد',
    name: 'اسمك',
    email: 'البريد الإلكتروني',
    phone: 'رقم الهاتف (واتساب)',
    restaurant: 'اسم المطعم',
    restaurantOptional: 'اختياري',
    message: 'ملاحظة',
    messageOptional: 'اختياري',
    submit: 'أرسل الطلب',
    submitting: 'جارٍ الإرسال...',
    close: 'إغلاق',
    privacy: 'نستخدم بياناتك للتواصل معك بخصوص طلبك فقط.',
    errors: {
      name: 'اكتب اسمك (حرفان على الأقل).',
      email: 'اكتب بريدًا إلكترونيًا صحيحًا.',
      phone: 'اكتب رقم هاتف صحيحًا، مثل 01012345678 أو ‎+20 100 000 0000.',
      network: 'تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.',
      rate: 'محاولات كثيرة. انتظر دقيقة ثم أعد الإرسال.',
      other: 'لم يصل الطلب. حاول مرة أخرى بعد قليل.',
    },
    done: { title: 'وصلنا طلبك', text: 'سنتواصل معك قريبًا على الهاتف أو واتساب لتجهيز حسابك.', again: 'إرسال طلب آخر' },
  },
  lang: { label: 'اللغة', ar: 'العربية', en: 'English' },
};

const EN: LandingCopy = {
  meta: {
    title: 'Wayta — QR menus and live orders for your restaurant',
    description:
      'A digital menu in Arabic and English with plenty of designs you can swap any time, orders from the table, pickup, delivery and WhatsApp, and a live kitchen screen. Try Wayta free for 15 days.',
  },
  nav: { how: 'How it works', designs: 'Designs', features: 'Features', plans: 'Plans', faq: 'FAQ', signIn: 'Restaurant sign in', cta: 'Start free trial', menu: 'Menu' },
  hero: {
    eyebrow: 'QR menus and live orders',
    title: ['Guests scan the code.', 'The kitchen gets the order.'],
    lead: 'A digital menu in Arabic and English that looks like your restaurant, and orders from the table, pickup and delivery landing on the kitchen screen the moment they are placed. Guests install nothing.',
    primary: 'Start a free trial',
    secondary: 'See the plans',
    note: 'No credit card. We contact you and set up your account.',
    demoLabel: 'Demo menu',
    designNames: {
      classic: 'Classic',
      gallery: 'Gallery',
      menu: 'Printed menu',
      floating: 'Floating card',
      centered: 'Centered cover',
      compact: 'Compact bar',
      list: 'List',
    },
    designLabel: 'Design now',
    orders: [
      { kicker: 'New order', line: 'Table 7 · 2 burgers', status: 'Sent to kitchen' },
      { kicker: 'Pickup', line: 'Order #112 · Pizza', status: 'Preparing' },
      { kicker: 'Delivery', line: 'Nasr City · Pasta', status: 'Ready' },
    ],
  },
  marquee: ['Two-language menu', 'Table orders', 'Pickup', 'Delivery', 'WhatsApp', 'Kitchen screen', 'Order tracking', 'Smart suggestions', 'Team roles', 'Plenty of designs'],
  journey: {
    eyebrow: 'How it works',
    title: 'From table to kitchen. No paper, no shouting.',
    steps: [
      { tag: 'Guest', title: 'Scans the code', text: 'The QR on the table opens your menu in the browser, in the language they prefer. No app, no sign-up.' },
      { tag: 'Guest', title: 'Picks and orders', text: 'They add items with size and extras, see the exact final price and send the order. A second round at the same table is one tap.' },
      { tag: 'Your team', title: 'Kitchen takes over', text: 'The order appears at once on the kitchen screen and the restaurant dashboard. Staff accept and prepare it while the guest follows its status.' },
    ],
    scan: 'Point the camera at the code',
    scanHint: 'Opens the menu instantly',
    cart: 'Cart',
    addToCart: 'Add',
    sent: 'Order received',
    sentHint: 'Preparing',
    board: { title: 'Kitchen screen', cols: ['New', 'Preparing', 'Ready'], ticketTable: 'Table 7', ticketItems: '2 burgers · 1 fries', fresh: 'New' },
  },
  wardrobe: {
    eyebrow: 'Designs',
    title: 'A menu that changes its clothes.',
    text: 'Plenty of designs to match your restaurant’s personality, and the freedom to swap the look every so often: with the season, with a promotion, or just because you got bored of the old one. One tap to change, and your data and prices stay exactly as they are.',
    seasons: ['Ramadan', 'Summer', 'Weekend offer', 'Eid', 'Winter'],
    note: 'Premium designs are available in the higher plans.',
    cta: 'See the plans',
  },
  features: {
    eyebrow: 'Features',
    title: 'Everything a restaurant that actually sells needs.',
    items: [
      { title: 'A two-language menu', text: 'Every product in Arabic and English, and the layout flips to RTL on its own. Prices are calculated on the server, so nobody can tamper with them.' },
      { title: 'Four ways to order', text: 'From the table, pickup from a branch, delivery with zones and fees, or a ready-made WhatsApp message. Switch on what suits you.' },
      { title: 'Kitchen and team screens', text: 'Accept, prepare, ready, served. And everyone has a role: owner, manager, cashier, kitchen, waiter.' },
      { title: 'Order tracking', text: 'Guests see their order status live without asking the waiter.' },
      { title: 'Suggestions that grow the bill', text: 'Add a burger and the cart suggests fries and a drink. You choose the suggestions.' },
      { title: 'Import your current menu', text: 'Upload the menu you already have and get a draft of items and categories. Review it, publish it, go.' },
    ],
    channels: ['Table', 'Pickup', 'Delivery', 'WhatsApp'],
    roles: ['Owner', 'Manager', 'Cashier', 'Kitchen', 'Waiter'],
    suggest: { added: 'Grilled burger', suggest: 'Add loaded fries?' },
    importLines: ['Grilled burger', 'Margherita pizza', 'Alfredo pasta', 'Caesar salad'],
    track: ['Received', 'Preparing', 'Ready'],
    langA: 'برجر مشوي',
    langB: 'Grilled burger',
  },
  plans: {
    eyebrow: 'Plans',
    title: 'Clear plans. Pay for what you need.',
    lead: 'These are the real prices. No hidden fees and no commission on orders.',
    monthly: 'Monthly',
    yearly: 'Yearly',
    perMonth: 'per month',
    perYear: 'per year',
    offer: 'Offer',
    cta: 'Request this plan',
    unavailable: 'The plans could not be loaded right now.',
    retry: 'Refresh the page and try again, or request a free trial and we will send you the details.',
    featureNames: {
      MENU_TEMPLATES: 'Choose your menu design',
      WHATSAPP_ORDERING: 'Orders on WhatsApp',
      ORDER_TRACKING: 'Guests track their order',
      SMART_SUGGESTIONS: 'Smart cart suggestions',
      DASHBOARD_ORDERING: 'Receive orders in the dashboard',
      TABLE_ORDERING: 'Table orders',
    },
    premiumDesigns: 'and premium designs',
    basics: ['Digital menu in two languages', 'A QR code for your restaurant', 'Dashboard for your team'],
    currencyLabel: 'Currency',
    currencies: { EGP: 'EGP', USD: 'USD' },
  },
  trial: {
    title: 'Try Wayta on your real restaurant. 15 days, free.',
    text: 'Leave your details and we set up a trial account with your menu. Try orders, the kitchen and the designs, then decide.',
    cta: 'Request the free trial',
    points: ['Completely free', 'No credit card', 'Never renews on its own'],
  },
  faq: {
    title: 'Questions we get a lot',
    items: [
      { q: 'Do guests need to download an app?', a: 'No. They scan the code and the menu opens in the browser, on any phone.' },
      { q: 'Can I change prices and products myself?', a: 'Yes. From the dashboard you add products and change prices and availability any time, and guests see it at once.' },
      { q: 'Can I change how the menu looks later?', a: 'Any time. Pick a new design from your dashboard and preview it before you save. Your data stays as it is.' },
      { q: 'How do I pay, and what happens after the trial?', a: 'After your request we contact you and agree on a payment method. We never charge anything automatically, and before the trial ends we ask whether you want to continue.' },
      { q: 'Does it work for more than one branch?', a: 'Yes. Add branches, each with its own tables, orders and team.' },
    ],
  },
  footer: { tagline: 'An ordering platform for restaurants and cafes.', rights: 'All rights reserved', signIn: 'Restaurant sign in', menu: 'Links' },
  lead: {
    titleTrial: 'Request your free trial',
    titleSubscribe: 'Request a subscription',
    lead: 'Leave your details and we will contact you by phone or WhatsApp to set up your account.',
    kind: { trial: '15-day free trial', subscribe: 'Subscription' },
    package: 'Plan',
    packageNone: 'Not sure yet',
    name: 'Your name',
    email: 'Email',
    phone: 'Phone (WhatsApp)',
    restaurant: 'Restaurant name',
    restaurantOptional: 'Optional',
    message: 'Note',
    messageOptional: 'Optional',
    submit: 'Send request',
    submitting: 'Sending...',
    close: 'Close',
    privacy: 'We use your details only to contact you about this request.',
    errors: {
      name: 'Enter your name (at least 2 characters).',
      email: 'Enter a valid email address.',
      phone: 'Enter a valid phone number, for example +20 100 000 0000.',
      network: 'Could not connect. Check your internet and try again.',
      rate: 'Too many attempts. Wait a minute, then send again.',
      other: 'The request did not go through. Try again in a moment.',
    },
    done: { title: 'We got your request', text: 'We will contact you soon by phone or WhatsApp to set up your account.', again: 'Send another request' },
  },
  lang: { label: 'Language', ar: 'العربية', en: 'English' },
};

export const LANDING_COPY: Record<StaffLocale, LandingCopy> = { ar: AR, en: EN };
