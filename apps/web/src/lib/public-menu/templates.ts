/**
 * Guest menu templates (DEC-044): different ways of laying out the SAME menu. A template only
 * changes presentation (the header at the top, how categories and product cards look); the
 * cart, prices, ordering rules and the checkout are shared by every template.
 *
 * - `classic`: the original look -- full hero, photo cards in an auto-fill grid.
 * - `list`: compact rows with a small photo; many dishes per screen.
 * - `gallery`: large photo tiles; the menu as a showcase.
 * - `menu`: a typographic printed menu -- name, dotted leader, price; no photos anywhere.
 * - `floating`: a slim cover with an info card floating over it (labelled contact buttons), and
 *   two-column photo tiles -- the delivery-app look.
 * - `centered`: a tall cover with the logo and name centred, photo cards, and centred headings.
 * - `compact`: a thin cover strip and a one-line info bar, so the menu starts at once.
 * - `editorial`: a photo-free menu with a prominent cover, balanced category panels, and clear ordering actions.
 * - `ember`: a cinematic food-first experience with a dramatic restaurant photo and dark editorial tiles.
 * - `bloom`: elegant pastel patisserie with expressive serif typography and dessert photography.
 */
export const MENU_TEMPLATES = [
  'classic',
  'list',
  'gallery',
  'menu',
  'floating',
  'centered',
  'compact',
  'editorial',
  'ember',
  'bloom',
] as const;

export type MenuTemplate = (typeof MENU_TEMPLATES)[number];

/** The same template as the API names it (the Restaurant setting). */
export type MenuTemplateApi = Uppercase<MenuTemplate>;

export const DEFAULT_MENU_TEMPLATE: MenuTemplate = 'classic';

/** The building blocks a template is made of. Each component reads the one choice that is its own. */
export interface TemplateLayout {
  /** The header at the top of the menu. */
  hero: 'classic' | 'floating' | 'centered' | 'compact' | 'editorial' | 'ember' | 'bloom';
  /** The product card. `tile-dense` is the two-column phone grid. */
  cards: 'classic' | 'row' | 'tile' | 'tile-dense' | 'line' | 'editorial' | 'ember';
  /** Category headings: a saffron bar at the start, or centred between two thin rules. */
  headings: 'bar' | 'centered' | 'editorial';
  /** The category strip: pills, squarer chips, or underlined text tabs. */
  chips: 'pill' | 'square' | 'tabs' | 'ember' | 'bloom';
  /** False = no product photo anywhere (cards, cart, product page, featured banners). */
  photos: boolean;
  /** Show the "Our picks" photo banners above the menu (they need photos, and push the menu down). */
  featured: boolean;
}

const LAYOUTS: Record<MenuTemplate, TemplateLayout> = {
  classic: { hero: 'classic', cards: 'classic', headings: 'bar', chips: 'pill', photos: true, featured: true },
  list: { hero: 'classic', cards: 'row', headings: 'bar', chips: 'square', photos: true, featured: true },
  gallery: { hero: 'classic', cards: 'tile', headings: 'bar', chips: 'pill', photos: true, featured: true },
  menu: { hero: 'classic', cards: 'line', headings: 'centered', chips: 'tabs', photos: false, featured: false },
  floating: { hero: 'floating', cards: 'tile-dense', headings: 'bar', chips: 'pill', photos: true, featured: true },
  centered: { hero: 'centered', cards: 'classic', headings: 'centered', chips: 'pill', photos: true, featured: true },
  compact: { hero: 'compact', cards: 'row', headings: 'bar', chips: 'tabs', photos: true, featured: false },
  ember: { hero: 'ember', cards: 'ember', headings: 'bar', chips: 'ember', photos: true, featured: false },
  bloom: { hero: 'bloom', cards: 'bloom', headings: 'bar', chips: 'bloom', photos: true, featured: false },
  editorial: {
    hero: 'editorial',
    cards: 'editorial',
    headings: 'editorial',
    chips: 'tabs',
    photos: false,
    featured: false,
  },
};

export function layoutOf(template: MenuTemplate): TemplateLayout {
  return LAYOUTS[template];
}

/** Anything that is not a known template falls back to the default (never throws). Case-insensitive: the API sends `GALLERY`. */
export function parseMenuTemplate(value: unknown): MenuTemplate {
  const key = typeof value === 'string' ? value.toLowerCase() : '';
  return (MENU_TEMPLATES as readonly string[]).includes(key)
    ? (key as MenuTemplate)
    : DEFAULT_MENU_TEMPLATE;
}
