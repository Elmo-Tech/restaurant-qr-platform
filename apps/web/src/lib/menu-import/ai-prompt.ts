/**
 * The instructions a restaurant pastes into any AI chat (ChatGPT, Claude, Gemini...) together with its menu photos, so
 * the chat prepares the Excel template (`public/templates/menu-import-template.xlsx`, MENU_IMPORT_SPEC.md #3A) for
 * the Import page. It is the manual fallback of the AI import, with no cost on our side: the Backend reads a template
 * file without any model.
 *
 * It is English on purpose (every chat follows English instructions best) and it tells the chat to keep the menu's
 * own languages. If the template columns change, change `TEMPLATE_COLUMNS` here as well.
 */
export const TEMPLATE_COLUMNS = [
  'category_ar',
  'category_en',
  'name_ar',
  'name_en',
  'description_ar',
  'description_en',
  'price',
  'size1_ar',
  'size1_en',
  'size1_price',
  'size2_ar',
  'size2_en',
  'size2_price',
  'size3_ar',
  'size3_en',
  'size3_price',
] as const;

export const MENU_AI_PROMPT = `You are helping a restaurant move its menu into a spreadsheet. I will attach photos (or a PDF) of the menu. Read every item and give me an Excel file (.xlsx) with ONE sheet.

The first row must be exactly these column names, in this order:
${TEMPLATE_COLUMNS.join(', ')}

One row per menu item:
- category_ar / category_en: the section the item is under (for example "Pizza"). Write the category only on the FIRST row of that section and leave it blank on the rows below it.
- name_ar / name_en: the item's name. Fill only the language(s) actually printed on the menu. Never translate: if the menu is Arabic only, leave name_en empty, and the other way round. Every row needs at least one name.
- description_ar / description_en: only if a description is printed on the menu. Never invent one. Otherwise leave empty.
- price: the price as a plain number, for example 85 or 12.5. No currency symbol, no words, a dot for decimals. Leave it EMPTY when the item has sizes.
- Sizes: when an item has several sizes or prices (for example Small / Medium / Large), leave price empty and fill size1_ar / size1_en / size1_price, then size2_..., then size3_.... The size label follows the same rule as names (only the printed language). Use at most 3 sizes per item.

Rules:
1. Include every item on every page, in the order they appear. Do not skip, merge or reorder items, and do not repeat an item.
2. Do not invent or guess anything. If a price or a word is unreadable, leave that cell empty.
3. Leave out add-ons and extras (for example "extra cheese +10"). If an item has more than 3 sizes, keep the first 3. Mention everything you left out in a short note after the file, so I can add it by hand.
4. Keep the original spelling of every name. Do not add emoji, quotes or extra spaces.

Give me the file to download. If you cannot create a file, give the same table as CSV in one code block, with the same first row, and nothing else inside the block. After that, write a short note with anything you were unsure about.`;
