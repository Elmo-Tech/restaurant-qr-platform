import assert from 'node:assert/strict';
import test from 'node:test';
import { createQrMatrix } from './qr-matrix.ts';
import {
  STAND_TEMPLATES,
  buildQrOnlySvg,
  buildStandSvg,
  defaultStandNames,
  inkOn,
  normalizeStandColor,
  qrPath,
  readableOn,
} from './stand-svg.ts';
import { allTablesFileName, fileNameSegment, standFileName } from './file-names.ts';
import { buildPdf } from './pdf.ts';

const URL_SAMPLE = 'https://wayta.example.com/q/el-sherbiny';
const matrix = createQrMatrix(URL_SAMPLE);

function options(over = {}) {
  return {
    template: 'classic',
    color: '#c2410c',
    captionLang: 'both',
    nameAr: 'مطعم الشربيني',
    nameEn: 'El Sherbiny',
    showLogo: true,
    logoDataUrl: null,
    tableNumber: null,
    matrix,
    ...over,
  };
}

test('the module matrix is square and has the finder patterns', () => {
  assert.ok(matrix.length >= 29 && matrix.length === matrix[0].length);
  for (let i = 0; i < 7; i += 1) {
    assert.equal(matrix[0][i], true);
    assert.equal(matrix[6][i], true);
    assert.equal(matrix[i][0], true);
  }
  assert.equal(matrix[3][3], true);
  assert.equal(matrix[1][1], false);
});

test('the QR path fits its box with a four-module quiet zone', () => {
  const box = 60;
  const cell = box / (matrix.length + 8);
  const path = qrPath(matrix, 10, 20, box);
  const starts = [...path.matchAll(/M([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(Math.min(...starts.map((s) => s[0])) >= 10 + 4 * cell - 0.01);
  assert.ok(Math.min(...starts.map((s) => s[1])) >= 20 + 4 * cell - 0.01);
  assert.ok(Math.max(...starts.map((s) => s[0])) < 10 + box - 4 * cell);
});

for (const template of STAND_TEMPLATES) {
  test(`${template}: A6 millimetre SVG with name, caption, QR and the fixed Wayta footer`, () => {
    const svg = buildStandSvg(options({ template, tableNumber: '7' }));
    assert.match(svg, /^<svg [^>]*viewBox="0 0 105 148"[^>]*width="105mm" height="148mm"/);
    assert.ok(svg.includes('مطعم الشربيني') && svg.includes('El Sherbiny'));
    assert.ok(svg.includes('امسح الكود لتصفح المنيو') && svg.includes('Scan to view the menu'));
    assert.ok(svg.includes('مدعوم من') && svg.includes('ويتا') && svg.includes('Powered by') && svg.includes('Wayta'));
    assert.ok(svg.includes('طاولة ٧'));
    assert.ok(svg.includes('fill="#000000" shape-rendering="crispEdges"'));
    assert.ok(!svg.includes('NaN') && !svg.includes('undefined'));
  });
}

test('caption language and fluid sizing', () => {
  const ar = buildStandSvg(options({ captionLang: 'ar', sizing: 'fluid' }));
  assert.ok(ar.includes('امسح الكود لتصفح المنيو') && !ar.includes('Scan to view the menu'));
  assert.ok(!ar.includes('width="105mm"'));
  assert.ok(!ar.includes('El Sherbiny'));
  const en = buildStandSvg(options({ captionLang: 'en', tableNumber: '12' }));
  assert.ok(en.includes('Scan to view the menu') && !en.includes('امسح الكود'));
  assert.ok(en.includes('Table 12') && !en.includes('مطعم الشربيني'));
});

test('without a table number there is no tag, and a real logo is embedded as an image', () => {
  assert.ok(!buildStandSvg(options()).includes('طاولة'));
  const logo = buildStandSvg(options({ logoDataUrl: 'data:image/png;base64,AAAA', idPrefix: 'a1' }));
  assert.ok(logo.includes('<image href="data:image/png;base64,AAAA"') && logo.includes('id="a1logo"'));
  const none = buildStandSvg(options({ showLogo: false, logoDataUrl: 'data:image/png;base64,AAAA' }));
  assert.ok(!none.includes('<image'));
});

test('names are XML-escaped and long names shrink to fit', () => {
  const svg = buildStandSvg(options({ nameEn: 'Tom & <Jerry> "Cafe"', captionLang: 'en' }));
  assert.ok(svg.includes('Tom &amp; &lt;Jerry&gt; &quot;Cafe&quot;'));
  assert.ok(!svg.includes('<Jerry>'));
  const long = buildStandSvg(options({ nameAr: 'مطعم '.repeat(14).trim(), captionLang: 'ar' }));
  const size = Number(/font-size="([\d.]+)" font-weight="600" fill="#1f2937"/.exec(long)[1]);
  assert.ok(size < 8);
});

test('the embedded font css is placed in defs; colours stay readable; the QR is always black on white', () => {
  assert.ok(
    buildStandSvg(options({ fontCss: '@font-face{font-family:X}' })).includes(
      '<defs><style>@font-face{font-family:X}</style></defs>',
    ),
  );
  assert.equal(normalizeStandColor('nonsense'), '#C2410C');
  assert.equal(normalizeStandColor('#abcdef'), '#ABCDEF');
  assert.equal(inkOn('#ffff00'), '#14100c');
  assert.equal(inkOn('#111827'), '#ffffff');
  assert.notEqual(readableOn('#111827', '#14100c'), '#111827');
  assert.notEqual(readableOn('#fde68a', '#ffffff'), '#fde68a');
  assert.equal(readableOn('#166534', '#ffffff'), '#166534');
  const svg = buildStandSvg(options({ template: 'dark', color: '#14100c' }));
  assert.ok(svg.includes('fill="#000000"') && svg.includes('rx="7" fill="#ffffff"'));
});

test('QR-only svg: quiet zone included, optional transparent background', () => {
  const total = matrix.length + 8;
  const solid = buildQrOnlySvg(matrix);
  assert.ok(solid.includes(`viewBox="0 0 ${total} ${total}"`));
  assert.ok(solid.includes(`<rect width="${total}" height="${total}" fill="#ffffff"/>`));
  const clear = buildQrOnlySvg(matrix, { transparent: true });
  assert.ok(!clear.includes('<rect'));
  assert.ok(clear.includes('fill="#000000"'));
});

test('default names go to the slot of their script', () => {
  assert.deepEqual(defaultStandNames('مطعم الشربيني'), { nameAr: 'مطعم الشربيني', nameEn: '' });
  assert.deepEqual(defaultStandNames(' Verde '), { nameAr: '', nameEn: 'Verde' });
});

test('file names keep Arabic letters and are safe', () => {
  assert.equal(fileNameSegment('مطعم الشربيني!'), 'مطعم-الشربيني');
  assert.equal(fileNameSegment('///', 'x'), 'x');
  assert.equal(
    standFileName({ restaurantName: 'El Sherbiny', kind: 'stand', ext: 'png', template: 'dark' }),
    'el-sherbiny-stand-dark.png',
  );
  assert.equal(
    standFileName({ restaurantName: 'El Sherbiny', kind: 'stand', ext: 'pdf', template: 'bold', tableNumber: 'A 7' }),
    'el-sherbiny-table-a-7-stand-bold.pdf',
  );
  assert.equal(standFileName({ restaurantName: 'El Sherbiny', kind: 'qr', ext: 'svg' }), 'el-sherbiny-qr.svg');
  assert.equal(allTablesFileName('El Sherbiny', 'classic'), 'el-sherbiny-tables-stand-classic.pdf');
});

test('the PDF is well formed: A6 pages, one image each, a correct xref', () => {
  const page = { width: 2, height: 2, data: new Uint8Array([1, 2, 3, 4]), filter: 'FlateDecode' };
  const pdf = buildPdf([page, page], 105, 148);
  const text = Buffer.from(pdf).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 297\.64 419\.53\]/);
  assert.equal((text.match(/\/Subtype \/Image/g) ?? []).length, 2);
  const startxref = Number(/startxref\n(\d+)/.exec(text)[1]);
  const lines = text.slice(startxref).split('\n');
  const count = Number(lines[1].split(' ')[1]);
  for (let id = 1; id < count; id += 1) {
    const offset = Number(lines[2 + id].slice(0, 10));
    assert.ok(text.slice(offset).startsWith(`${id} 0 obj`), `object ${id}`);
  }
  assert.throws(() => buildPdf([], 105, 148));
});
