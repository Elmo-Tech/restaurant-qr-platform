import type { StaffLocale } from '../../lib/i18n/locale';

/** The features a Package can include (mirrors the Backend's FeatureKey), in the order the plan tickets list them. */
export const PLAN_FEATURES = [
  'MENU_TEMPLATES',
  'WHATSAPP_ORDERING',
  'ORDER_TRACKING',
  'SMART_SUGGESTIONS',
  'DASHBOARD_ORDERING',
  'TABLE_ORDERING',
  'KITCHEN',
  'OFFERS',
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export interface LandingCopy {
  meta: { title: string; description: string };
  nav: { how: string; features: string; designs: string; plans: string; faq: string; signIn: string; cta: string; menu: string; themeDark: string; themeLight: string };
  hero: {
    eyebrow: string;
    title: string[];
    lead: string;
    primary: string;
    secondary: string;
    note: string;
    demoLabel: string;
    designs: { classic: string; gallery: string; compact: string };
    premium: string;
    ticket: { kicker: string; table: string; item1: string; item2: string; status: string; total: string };
    scan: string;
  };
  strip: string[];
  how: {
    title: string;
    lead: string;
    steps: { title: string; text: string; tag: string }[];
  };
  features: {
    title: string;
    lead: string;
    items: { title: string; text: string }[];
  };
  designs: {
    title: string;
    lead: string;
    more: string;
    seasonsLabel: string;
    seasons: string[];
    note: string;
    cta: string;
  };
  plans: {
    title: string;
    lead: string;
    monthly: string;
    yearly: string;
    perMonth: string;
    perYear: string;
    save: string;
    offer: string;
    cta: string;
    premiumDesigns: string;
    unavailable: string;
    retry: string;
    featureNames: Record<PlanFeature, string>;
    basics: string[];
    currencyLabel: string;
    currencies: { EGP: string; USD: string };
    ticketNo: string;
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
    errors: {
      name: string;
      email: string;
      phone: string;
      network: string;
      rate: string;
      other: string;
    };
    done: { title: string; text: string; again: string };
  };
  lang: { label: string; ar: string; en: string };
}

const AR: LandingCopy = {
  meta: {
    title: 'ويتا — منيو QR وطلبات لحظية لمطعمك',
    description:
      'منيو رقمي بالعربي والإنجليزي، طلبات من الطاولة والاستلام والتوصيل وواتساب، وشاشة مطبخ تعرض كل طلب فور وصوله. جرّب ويتا مجانًا ١٥ يومًا.',
  },
  nav: {
    how: 'كيف يعمل',
    features: 'المزايا',
    designs: 'التصاميم',
    plans: 'الباقات',
    faq: 'أسئلة',
    signIn: 'دخول المطاعم',
    cta: 'ابدأ تجربة مجانية',
    menu: 'القائمة',
    themeDark: 'الوضع الداكن',
    themeLight: 'الوضع الفاتح',
  },
  hero: {
    eyebrow: 'منصة طلبات للمطاعم والكافيهات',
    title: ['العميل يمسح الكود،', 'والطلب يوصل المطبخ.'],
    lead:
      'حوّل منيو مطعمك إلى منيو رقمي بالعربي والإنجليزي، واستقبل طلبات الطاولات والاستلام والتوصيل، وشاهدها على شاشة المطبخ لحظة بلحظة. بدون تطبيق يحمّله العميل.',
    primary: 'ابدأ تجربة مجانية ١٥ يوم',
    secondary: 'شاهد الباقات',
    note: 'بدون بطاقة ائتمان. نتواصل معك ونجهّز حسابك.',
    demoLabel: 'منيو تجريبي',
    designs: { classic: 'كلاسيك', gallery: 'معرض', compact: 'مدمج' },
    premium: 'بريميوم',
    ticket: {
      kicker: 'طلب جديد',
      table: 'طاولة ٧',
      item1: '٢ × برجر مشوي',
      item2: '١ × بطاطس بالجبن',
      status: 'قيد التحضير',
      total: 'الإجمالي',
    },
    scan: 'امسح لتفتح المنيو',
  },
  strip: ['عربي وEnglish بدعم كامل لـ RTL', 'طاولات · استلام · توصيل · واتساب', 'شاشة مطبخ لحظية', 'صلاحيات للفريق'],
  how: {
    title: 'من الطاولة إلى المطبخ في ثلاث خطوات',
    lead: 'كل خطوة فيها تحدث لوحدها. فريقك يشتغل، مش يكتب الطلبات على ورقة.',
    steps: [
      {
        tag: 'العميل',
        title: 'يمسح الكود',
        text: 'كود QR على الطاولة يفتح منيو مطعمك مباشرة في المتصفح، باللغة التي يفضلها. لا تطبيق ولا تسجيل.',
      },
      {
        tag: 'العميل',
        title: 'يختار ويطلب',
        text: 'يختار الحجم والإضافات، ويرى السعر النهائي بدقة، ويرسل الطلب. ولو أراد يطلب جولة ثانية على نفس الطاولة، يضيفها بسهولة.',
      },
      {
        tag: 'فريقك',
        title: 'يستلمه المطبخ',
        text: 'يظهر الطلب فورًا على لوحة المطعم وشاشة المطبخ. الفريق يقبله ويحضّره، والعميل يتابع حالته من هاتفه.',
      },
    ],
  },
  features: {
    title: 'كل ما يحتاجه مطعم يبيع فعلًا',
    lead: 'ليست صفحة منيو وفقط. هي نظام تشغيل للطلبات، مبني للمطاعم العربية.',
    items: [
      {
        title: 'منيو بلغتين',
        text: 'اسم كل منتج ووصفه بالعربي والإنجليزي، والواجهة تنقلب RTL تلقائيًا. الأسعار تُحسب في الخادم، فلا يتلاعب بها أحد.',
      },
      {
        title: 'أربع طرق للطلب',
        text: 'من الطاولة، أو استلام من الفرع، أو توصيل بمناطق ورسوم، أو رسالة واتساب جاهزة. فعّل ما يناسب مطعمك.',
      },
      {
        title: 'لوحة مطبخ وفريق',
        text: 'قبول الطلب ثم تحضير ثم جاهز ثم تم التقديم. لكل شخص دور: مالك، مدير، كاشير، مطبخ، جرسون.',
      },
      {
        title: 'متابعة الطلب',
        text: 'العميل يرى حالة طلبه لحظيًا بدون ما يسأل الجرسون. يقل الزحام ويزيد الرضا.',
      },
      {
        title: 'اقتراحات تزود الفاتورة',
        text: 'عند إضافة برجر يقترح النظام البطاطس والمشروب. أنت تحدد الاقتراحات، أو يتركها النظام تتعلم من الطلبات.',
      },
      {
        title: 'استيراد المنيو الحالي',
        text: 'ارفع منيوك الحالي وتُجهّز لك مسودة بالمنتجات والأقسام. تراجعها وتنشرها، ولا تبدأ من الصفر.',
      },
    ],
  },
  designs: {
    title: 'منيو يليق بشخصية مطعمك',
    lead: 'تصاميم كتيرة تختار منها اللي يناسب شخصية مطعمك، وتبدّل شكل المنيو كل فترة.',
    more: 'وتصاميم أكتر كمان تختار من بينها',
    seasonsLabel: 'غيّره مع:',
    seasons: ['رمضان', 'الصيف', 'عرض الويك إند', 'العيد', 'الشتا'],
    note: 'بضغطة واحدة، وبياناتك وأسعارك كما هي. وتتوفر تصاميم مميزة في الباقات الأعلى.',
    cta: 'شاهد الباقات',
  },
  plans: {
    title: 'باقات واضحة، تدفع على قدر احتياجك',
    lead: 'الأسعار هنا هي الأسعار الحقيقية. لا رسوم خفية ولا عمولة على الطلبات.',
    monthly: 'شهري',
    yearly: 'سنوي',
    perMonth: 'في الشهر',
    perYear: 'في السنة',
    save: 'وفّر مع السنوي',
    offer: 'عرض',
    cta: 'اطلب هذه الباقة',
    premiumDesigns: 'وتصاميم بريميوم',
    unavailable: 'تعذّر تحميل الباقات الآن.',
    retry: 'حدّث الصفحة وحاول مرة أخرى، أو اطلب تجربة مجانية وسنرسل لك التفاصيل.',
    featureNames: {
      MENU_TEMPLATES: 'اختيار تصميم المنيو',
      WHATSAPP_ORDERING: 'الطلب عبر واتساب',
      ORDER_TRACKING: 'متابعة العميل لطلبه',
      SMART_SUGGESTIONS: 'اقتراحات ذكية في السلة',
      DASHBOARD_ORDERING: 'استلام الطلبات في اللوحة',
      TABLE_ORDERING: 'طلبات الطاولات',
      KITCHEN: 'شاشة المطبخ',
      OFFERS: 'العروض والباندل',
    },
    basics: ['منيو رقمي بلغتين', 'كود QR لمطعمك', 'لوحة تحكم لفريقك'],
    currencyLabel: 'العملة',
    currencies: { EGP: 'جنيه', USD: 'دولار' },
    ticketNo: 'باقة',
  },
  trial: {
    title: '١٥ يومًا لتجرّب ويتا على مطعمك الحقيقي',
    text: 'اترك بياناتك ونجهّز لك حساب تجربة بمنيو مطعمك. تجرّب الطلبات والمطبخ والتصاميم، ثم تقرر.',
    cta: 'اطلب التجربة المجانية',
    points: ['مجانية بالكامل', 'بدون بطاقة ائتمان', 'لا يتجدد تلقائيًا'],
  },
  faq: {
    title: 'أسئلة تتكرر',
    items: [
      {
        q: 'هل يحتاج العميل إلى تحميل تطبيق؟',
        a: 'لا. يمسح الكود فيفتح المنيو في المتصفح مباشرة، على أي هاتف.',
      },
      {
        q: 'هل أستطيع تعديل الأسعار والمنتجات بنفسي؟',
        a: 'نعم. من لوحة التحكم تضيف المنتجات وتعدّل الأسعار والتوفر في أي وقت، وتظهر التغييرات للزبائن فورًا.',
      },
      {
        q: 'كيف أدفع وماذا يحدث بعد التجربة؟',
        a: 'بعد طلبك نتواصل معك ونتفق على طريقة الدفع المناسبة. لا نسحب أي مبلغ تلقائيًا، وقبل نهاية التجربة نسألك إن كنت تريد المتابعة.',
      },
      {
        q: 'هل يعمل لأكثر من فرع؟',
        a: 'نعم. يمكنك إضافة فروع، ولكل فرع طاولاته وطلباته وفريقه.',
      },
      {
        q: 'هل أستطيع تغيير الباقة لاحقًا؟',
        a: 'في أي وقت. من صفحة «اشتراكي» في لوحتك ترى باقتك وتطلب الترقية أو التجديد.',
      },
    ],
  },
  footer: {
    tagline: 'منصة طلبات للمطاعم والكافيهات.',
    rights: 'جميع الحقوق محفوظة',
    signIn: 'دخول المطاعم',
    menu: 'روابط',
  },
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
    done: {
      title: 'وصلنا طلبك',
      text: 'سنتواصل معك قريبًا على الهاتف أو واتساب لتجهيز حسابك.',
      again: 'إرسال طلب آخر',
    },
  },
  lang: { label: 'اللغة', ar: 'العربية', en: 'English' },
};

const EN: LandingCopy = {
  meta: {
    title: 'Wayta — QR menus and live orders for your restaurant',
    description:
      'A digital menu in Arabic and English, orders from the table, pickup, delivery and WhatsApp, and a kitchen screen that shows each order the moment it arrives. Try Wayta free for 15 days.',
  },
  nav: {
    how: 'How it works',
    features: 'Features',
    designs: 'Designs',
    plans: 'Plans',
    faq: 'FAQ',
    signIn: 'Restaurant sign in',
    cta: 'Start free trial',
    menu: 'Menu',
    themeDark: 'Dark mode',
    themeLight: 'Light mode',
  },
  hero: {
    eyebrow: 'Ordering platform for restaurants and cafes',
    title: ['Guests scan.', 'The kitchen gets the order.'],
    lead:
      'Turn your menu into a digital one in Arabic and English, take orders from tables, pickup and delivery, and watch them land on the kitchen screen live. Guests install nothing.',
    primary: 'Start a 15-day free trial',
    secondary: 'See the plans',
    note: 'No credit card. We contact you and set up your account.',
    demoLabel: 'Demo menu',
    designs: { classic: 'Classic', gallery: 'Gallery', compact: 'Compact' },
    premium: 'Premium',
    ticket: {
      kicker: 'New order',
      table: 'Table 7',
      item1: '2 × Grilled burger',
      item2: '1 × Loaded fries',
      status: 'Preparing',
      total: 'Total',
    },
    scan: 'Scan to open the menu',
  },
  strip: ['Arabic and English, true RTL', 'Table · Pickup · Delivery · WhatsApp', 'Live kitchen screen', 'Roles for your team'],
  how: {
    title: 'From table to kitchen in three steps',
    lead: 'Each step happens on its own. Your team works instead of writing orders on paper.',
    steps: [
      {
        tag: 'Guest',
        title: 'Scans the code',
        text: 'The QR on the table opens your menu in the browser, in the language they prefer. No app, no sign-up.',
      },
      {
        tag: 'Guest',
        title: 'Picks and orders',
        text: 'They choose size and extras, see the exact final price and send the order. A second round at the same table is one tap away.',
      },
      {
        tag: 'Your team',
        title: 'Kitchen takes over',
        text: 'The order shows up at once on the restaurant dashboard and kitchen screen. Staff accept and prepare it while the guest follows its status on their phone.',
      },
    ],
  },
  features: {
    title: 'Everything a restaurant that actually sells needs',
    lead: 'Not just a menu page. An order system built for restaurants in the region.',
    items: [
      {
        title: 'A menu in two languages',
        text: 'Every product name and description in Arabic and English, with the layout flipping to RTL on its own. Prices are calculated on the server, so nobody can tamper with them.',
      },
      {
        title: 'Four ways to order',
        text: 'From the table, pickup from a branch, delivery with zones and fees, or a ready-made WhatsApp message. Switch on what suits you.',
      },
      {
        title: 'Kitchen and team screens',
        text: 'Accept, prepare, ready, served. Everyone has a role: owner, manager, cashier, kitchen, waiter.',
      },
      {
        title: 'Order tracking',
        text: 'Guests see their order status live without asking the waiter. Fewer interruptions, happier tables.',
      },
      {
        title: 'Suggestions that grow the bill',
        text: 'Add a burger and the cart suggests fries and a drink. You set the suggestions, or let the system learn from orders.',
      },
      {
        title: 'Import your current menu',
        text: 'Upload the menu you already have and get a draft of products and categories. Review it, publish it, skip the blank page.',
      },
    ],
  },
  designs: {
    title: 'A menu that fits your restaurant’s personality',
    lead: 'Plenty of designs to choose from to match your restaurant’s personality, and swap the look of your menu every so often.',
    more: 'and many more designs to choose from',
    seasonsLabel: 'Change it with:',
    seasons: ['Ramadan', 'Summer', 'Weekend offer', 'Eid', 'Winter'],
    note: 'One tap, and your data and prices stay as they are. Premium designs are available in the higher plans.',
    cta: 'See the plans',
  },
  plans: {
    title: 'Clear plans. Pay for what you need.',
    lead: 'These are the real prices. No hidden fees and no commission on orders.',
    monthly: 'Monthly',
    yearly: 'Yearly',
    perMonth: 'per month',
    perYear: 'per year',
    save: 'Save with yearly',
    offer: 'Offer',
    cta: 'Request this plan',
    premiumDesigns: 'and premium designs',
    unavailable: 'The plans could not be loaded right now.',
    retry: 'Refresh the page and try again, or request a free trial and we will send you the details.',
    featureNames: {
      MENU_TEMPLATES: 'Choose your menu design',
      WHATSAPP_ORDERING: 'Orders on WhatsApp',
      ORDER_TRACKING: 'Guests track their order',
      SMART_SUGGESTIONS: 'Smart cart suggestions',
      DASHBOARD_ORDERING: 'Receive orders in the dashboard',
      TABLE_ORDERING: 'Table orders',
      KITCHEN: 'Kitchen screen',
      OFFERS: 'Offers and bundles',
    },
    basics: ['Digital menu in two languages', 'A QR code for your restaurant', 'Dashboard for your team'],
    currencyLabel: 'Currency',
    currencies: { EGP: 'EGP', USD: 'USD' },
    ticketNo: 'Plan',
  },
  trial: {
    title: '15 days to try Wayta on your real restaurant',
    text: 'Leave your details and we set up a trial account with your menu. Try orders, the kitchen and the designs, then decide.',
    cta: 'Request the free trial',
    points: ['Completely free', 'No credit card', 'Never renews on its own'],
  },
  faq: {
    title: 'Questions we get a lot',
    items: [
      {
        q: 'Do guests need to download an app?',
        a: 'No. They scan the code and the menu opens in the browser, on any phone.',
      },
      {
        q: 'Can I change prices and products myself?',
        a: 'Yes. From the dashboard you add products and change prices and availability any time, and guests see it at once.',
      },
      {
        q: 'How do I pay, and what happens after the trial?',
        a: 'After your request we contact you and agree on a payment method. We never charge anything automatically, and before the trial ends we ask whether you want to continue.',
      },
      {
        q: 'Does it work for more than one branch?',
        a: 'Yes. Add branches, each with its own tables, orders and team.',
      },
      {
        q: 'Can I change plan later?',
        a: 'Any time. On the My subscription page of your dashboard you see your plan and request an upgrade or renewal.',
      },
    ],
  },
  footer: {
    tagline: 'An ordering platform for restaurants and cafes.',
    rights: 'All rights reserved',
    signIn: 'Restaurant sign in',
    menu: 'Links',
  },
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
    done: {
      title: 'We got your request',
      text: 'We will contact you soon by phone or WhatsApp to set up your account.',
      again: 'Send another request',
    },
  },
  lang: { label: 'Language', ar: 'العربية', en: 'English' },
};

export const LANDING_COPY: Record<StaffLocale, LandingCopy> = { ar: AR, en: EN };
