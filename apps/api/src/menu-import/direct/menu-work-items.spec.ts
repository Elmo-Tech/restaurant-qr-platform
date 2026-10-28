import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractionFile } from '../menu-import-extractor';
import { XLSX_MIME } from '../menu-import-file';
import { prepareWork, readSheetAsText } from './menu-work-items';

const fixture = (name: string): Buffer =>
  readFileSync(
    join(__dirname, '..', '..', '..', 'test', 'fixtures', 'menu-import', name),
  );

const file = (
  mimeType: string,
  content: string | Buffer,
  fileName = 'f',
): ExtractionFile => ({
  buffer: Buffer.isBuffer(content) ? content : Buffer.from(content),
  mimeType,
  fileName,
});

describe('prepareWork', () => {
  it('makes one request per image, in upload order, each told which page it is', async () => {
    const work = await prepareWork({
      files: [
        file('image/png', 'one'),
        file('image/jpeg', 'two'),
        file('image/webp', 'three'),
      ],
      languageHint: 'auto',
    });
    expect(work.ok).toBe(true);
    if (!work.ok) return;
    expect(work.items).toHaveLength(3);
    const urls = work.items.map((item) => {
      const image = item.content.find((part) => part.type === 'image_url');
      return image && image.type === 'image_url' ? image.image_url.url : null;
    });
    expect(urls).toEqual([
      `data:image/png;base64,${Buffer.from('one').toString('base64')}`,
      `data:image/jpeg;base64,${Buffer.from('two').toString('base64')}`,
      `data:image/webp;base64,${Buffer.from('three').toString('base64')}`,
    ]);
    const note = (index: number) => {
      const text = work.items[index].content[0];
      return text.type === 'text' ? text.text : '';
    };
    expect(note(0)).not.toBe(note(1)); // each page carries its own number
  });

  it('sends a single image without a page note', async () => {
    const work = await prepareWork({
      files: [file('image/png', 'x')],
      languageHint: 'ar',
    });
    expect(work.ok && work.items).toHaveLength(1);
  });

  it('sends a PDF as one request', async () => {
    const work = await prepareWork({
      files: [file('application/pdf', '%PDF-1.4')],
      languageHint: 'en',
    });
    expect(work.ok).toBe(true);
    if (!work.ok) return;
    expect(work.items).toHaveLength(1);
    expect(JSON.stringify(work.items[0])).toContain(
      'data:application/pdf;base64,',
    );
  });

  it('sends a spreadsheet that is not the template as a text table in one request', async () => {
    const work = await prepareWork({
      files: [file(XLSX_MIME, fixture('menu-other-layout.xlsx'))],
      languageHint: 'auto',
    });
    expect(work.ok).toBe(true);
    if (!work.ok) return;
    expect(work.items).toHaveLength(1);
    expect(work.items[0].content.every((part) => part.type === 'text')).toBe(
      true,
    );
    expect(JSON.stringify(work.items[0])).toContain(' | ');
  });

  it('refuses what it cannot read: a broken spreadsheet, an old .xls, or nothing', async () => {
    expect(
      await prepareWork({
        files: [file(XLSX_MIME, 'not a zip')],
        languageHint: 'auto',
      }),
    ).toEqual({
      ok: false,
      code: 'UNSUPPORTED_FILE',
    });
    expect(
      await prepareWork({
        files: [file('application/vnd.ms-excel', 'old')],
        languageHint: 'auto',
      }),
    ).toEqual({ ok: false, code: 'UNSUPPORTED_FILE' });
    expect(await prepareWork({ files: [], languageHint: 'auto' })).toEqual({
      ok: false,
      code: 'UNSUPPORTED_FILE',
    });
  });
});

describe('readSheetAsText', () => {
  it('turns rows into lines of cells and drops empty rows', async () => {
    const read = await readSheetAsText(fixture('menu-other-layout.xlsx'));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const lines = read.text.split('\n');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.replace(/[\s|]/g, '') !== '')).toBe(true);
  });

  it('refuses a file that only looks like a spreadsheet', async () => {
    expect(await readSheetAsText(Buffer.from('PK nothing real'))).toEqual({
      ok: false,
      code: 'UNSUPPORTED_FILE',
    });
  });
});
