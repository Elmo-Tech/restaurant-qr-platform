/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS test fixture. */
'use strict';
/**
 * Guest Menu hotfix browser fixture: an in-memory stand-in for the ONE Backend route the Guest Menu page needs
 * to render (`GET /api/v1/public/qr/:code/menu`). It exists only so the real Next.js Guest UI can be driven in a
 * browser across restaurant themes without a database. It is NOT evidence about the Backend: pricing, ordering
 * and quotes are never exercised here (the stub answers every other route with 404).
 *
 * The scenario is chosen by the QR code in the URL (`/q/<scenario>`):
 *   classic | list | gallery | menu | floating | centered | compact | editorial   stock templates
 *   ember-EMBER|NOIR|COPPER   bloom-ROSE|LILAC|PEACH   brew-FOREST|MOCHA|SAGE      stock templates with a palette
 *   verde | sherbiny | makkboz | meatlovers                                         exclusive designs
 * Append `+nocontact` to leave every contact field empty, `+phoneonly` for a call number only.
 * The Restaurant's own theme settings come from the app's real normalisers, so a palette gets its real defaults.
 */
const http = require('node:http');
const path = require('node:path');

const lib = path.resolve(__dirname, '../../src/lib/public-menu');
const settings = {
  ember: require(path.join(lib, 'ember-settings.ts')),
  bloom: require(path.join(lib, 'bloom-settings.ts')),
  brew: require(path.join(lib, 'brew-settings.ts')),
  verde: require(path.join(lib, 'verde-settings.ts')),
  sherbiny: require(path.join(lib, 'sherbiny-settings.ts')),
  makkboz: require(path.join(lib, 'makkboz-settings.ts')),
  meatlovers: require(path.join(lib, 'meat-lovers-settings.ts')),
};

const STOCK = ['classic', 'list', 'gallery', 'menu', 'floating', 'centered', 'compact', 'editorial', 'ember', 'bloom', 'brew'];
const EXCLUSIVE = {
  verde: 'VERDE_NAPOLI_V1',
  sherbiny: 'SHERBINY_FIRE_DOUGH_V1',
  makkboz: 'MAKKBOZ_HERITAGE_V1',
  meatlovers: 'MEAT_LOVERS_BUTCHER_V1',
};

const FULL_CONTACT = {
  phone: '+201001234567',
  whatsapp: '+201001234567',
  hotline: '16512',
  facebookUrl: 'https://www.facebook.com/wayta.test',
  instagramUrl: 'https://www.instagram.com/wayta.test',
  tiktokUrl: 'https://www.tiktok.com/@wayta.test',
  telegramUrl: 'https://t.me/wayta_test',
  youtubeUrl: 'https://www.youtube.com/@wayta.test',
  xUrl: 'https://x.com/wayta_test',
  snapchatUrl: 'https://www.snapchat.com/add/wayta.test',
  mapsUrl: 'https://maps.google.com/?q=wayta',
  websiteUrl: 'https://wayta.test',
};
const EMPTY_CONTACT = Object.fromEntries(Object.keys(FULL_CONTACT).map((key) => [key, null]));

const T = {
  en: {
    restaurant: 'Wayta Test Grill',
    menu: 'Main menu',
    cats: ['Starters', 'Mains', 'Desserts'],
    products: [
      ['Margherita', 'Tomato, mozzarella and basil.'],
      ['Garden salad', 'Crisp greens with lemon dressing.'],
      ['Chicken burger', 'Grilled chicken, pickles and sauce.'],
      ['Family pizza', 'One pizza, three sizes.'],
      ['Beef kofta', 'Charcoal-grilled kofta.'],
      ['Chocolate cake', 'Warm cake with a soft centre.'],
    ],
    modifierGroup: 'Extras',
    modifiers: ['Extra cheese', 'Bacon'],
    sizes: ['Small', 'Medium', 'Large'],
    branch: 'Main Branch',
  },
  ar: {
    restaurant: 'مطعم وايتا التجريبي',
    menu: 'القائمة الرئيسية',
    cats: ['المقبلات', 'الأطباق الرئيسية', 'الحلويات'],
    products: [
      ['مارجريتا', 'طماطم وموزاريلا وريحان.'],
      ['سلطة الحديقة', 'خضار طازجة مع صلصة الليمون.'],
      ['برجر الدجاج', 'دجاج مشوي ومخلل وصلصة.'],
      ['بيتزا عائلية', 'بيتزا واحدة بثلاثة أحجام.'],
      ['كفتة لحم', 'كفتة مشوية على الفحم.'],
      ['كيك الشوكولاتة', 'كيك دافئ بقلب سائل.'],
    ],
    modifierGroup: 'إضافات',
    modifiers: ['جبنة إضافية', 'لحم مقدد'],
    sizes: ['صغير', 'وسط', 'كبير'],
    branch: 'الفرع الرئيسي',
  },
};

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function parseScenario(raw) {
  const [name, ...flags] = decodeURIComponent(raw).split('+');
  const [base, variant] = name.split('-');
  return { base, variant, flags };
}

function buildMenu(code, lang) {
  const { base, variant, flags } = parseScenario(code);
  const t = T[lang] ?? T.en;
  const exclusiveKey = EXCLUSIVE[base] ?? null;
  const template = exclusiveKey ? 'classic' : STOCK.includes(base) ? base : 'classic';
  const contact = flags.includes('nocontact')
    ? EMPTY_CONTACT
    : flags.includes('phoneonly')
      ? { ...EMPTY_CONTACT, phone: FULL_CONTACT.phone }
      : FULL_CONTACT;

  const [simple, salad, burger, pizza, kofta, cake] = t.products;
  const product = (n, [name, description], price, extra = {}) => ({
    id: id(n), name, description, basePrice: price, discount: null, itemPromotion: null,
    primaryImageAssetPath: null, availability: 'AVAILABLE', featured: false, modifierGroups: [], ...extra,
  });
  const burgerGroup = {
    id: id(900), name: t.modifierGroup, helperText: null, minimumSelections: 0, maximumSelections: 2,
    options: t.modifiers.map((name, index) => ({ id: id(910 + index), name, priceAdjustment: '10.00' })),
  };
  const sizes = t.sizes.map((name, index) => ({
    id: id(800 + index), name, price: String(150 + index * 40) + '.00', discountedPrice: null, itemPromotion: null, isDefault: index === 0,
  }));
  const categories = [
    { id: id(100), name: t.cats[0], description: null, imageAssetPath: null,
      products: [product(1, simple, '120.00'), product(2, salad, '65.00')] },
    { id: id(101), name: t.cats[1], description: null, imageAssetPath: null,
      products: [product(3, burger, '140.00', { modifierGroups: [burgerGroup] }),
        product(4, pizza, '150.00', { variants: sizes }), product(5, kofta, '210.00')] },
    { id: id(102), name: t.cats[2], description: null, imageAssetPath: null, products: [product(6, cake, '85.00')] },
  ];

  const restaurant = {
    name: t.restaurant, currencyCode: 'EGP', countryCode: 'EG', logoAssetPath: null, coverAssetPath: null,
    menuTemplate: template.toUpperCase(), contact, shareCode: null, hours: null,
  };
  if (exclusiveKey) {
    restaurant.exclusiveRendererKey = exclusiveKey;
    restaurant.exclusiveInUse = true;
    const key = { verde: 'verdeSettings', sherbiny: 'sherbinySettings', makkboz: 'makkbozSettings', meatlovers: 'meatLoversSettings' }[base];
    const normalize = { verde: 'normalizeVerdeSettings', sherbiny: 'normalizeSherbinySettings', makkboz: 'normalizeMakkbozSettings', meatlovers: 'normalizeMeatLoversSettings' }[base];
    restaurant[key] = settings[base][normalize]({});
  }
  if (base === 'ember') restaurant.emberSettings = settings.ember.normalizeEmberTemplateSettings({ palette: variant ?? 'EMBER' });
  if (base === 'bloom') restaurant.bloomSettings = settings.bloom.normalizeBloomTemplateSettings({ palette: variant ?? 'ROSE' });
  if (base === 'brew') restaurant.brewSettings = settings.brew.normalizeBrewTemplateSettings({ palette: variant ?? 'FOREST' });

  return {
    context: {
      entry: { publicCode: code, redirectToSlug: null },
      platform: { poweredByUrl: 'https://wayta.test' },
      qrType: 'GENERIC',
      tableOrdering: null,
      restaurant,
      branch: { name: t.branch },
      table: null,
      announcements: [],
      offers: [],
      suggestions: false,
      tracking: false,
      templatesAllowed: true,
      allowedTemplates: STOCK.map((name) => name.toUpperCase()),
      ordering: { pickup: true, delivery: false, whatsapp: false },
      locations: [],
      pickupBranches: [{ id: id(50), name: t.branch, hours: null }],
      deliveryBranches: [],
    },
    locale: { requested: lang, resolved: lang, default: lang, available: ['ar', 'en'] },
    menu: { id: id(1), name: t.menu, description: null, categories },
  };
}

function start(port) {
  const unknown = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://stub');
    const headers = {
      'content-type': 'application/json',
      'access-control-allow-origin': req.headers.origin || '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': '*',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    const match = url.pathname.match(/^\/api\/v1\/public\/qr\/([^/]+)\/menu$/);
    if (req.method === 'GET' && match) {
      const lang = url.searchParams.get('lang') === 'ar' ? 'ar' : 'en';
      res.writeHead(200, headers);
      res.end(JSON.stringify({ data: buildMenu(decodeURIComponent(match[1]), lang) }));
      return;
    }
    unknown.push(`${req.method} ${url.pathname}`);
    res.writeHead(404, headers);
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'stub' } }));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, unknown })));
}

module.exports = { start, buildMenu };

if (require.main === module) {
  start(Number(process.env.STUB_API_PORT || 4415)).then(({ unknown }) => {
    process.on('SIGTERM', () => { if (unknown.length) console.log('Unanswered routes:', [...new Set(unknown)].join(', ')); process.exit(0); });
    console.log('Guest Menu stub API ready');
  });
}
