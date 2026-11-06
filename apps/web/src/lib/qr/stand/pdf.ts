/**
 * A tiny PDF writer: one image per page, page size in millimetres. No library
 * is needed because a stand page is a single full-page picture. The caller
 * passes the already-compressed image data (`FlateDecode` raw RGB, or `DCTDecode`
 * JPEG), so this file is pure and runs the same in the browser and in node.
 */

export interface PdfImagePage {
  width: number;
  height: number;
  data: Uint8Array;
  filter: 'FlateDecode' | 'DCTDecode';
}

const MM_TO_PT = 72 / 25.4;

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function pt(mm: number): string {
  return (Math.round(mm * MM_TO_PT * 100) / 100).toString();
}

export function buildPdf(pages: readonly PdfImagePage[], pageWidthMm: number, pageHeightMm: number): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page.');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    length += chunk.length;
  };
  const object = (id: number, head: string, stream?: Uint8Array) => {
    offsets[id] = length;
    push(ascii(`${id} 0 obj\n${head}`));
    if (stream) {
      push(ascii('\nstream\n'));
      push(stream);
      push(ascii('\nendstream'));
    }
    push(ascii('\nendobj\n'));
  };

  push(ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  // Objects: 1 catalog, 2 pages, then (page, content, image) per page.
  const kids = pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

  const w = pt(pageWidthMm);
  const h = pt(pageHeightMm);
  pages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    object(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const content = ascii(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    object(contentId, `<< /Length ${content.length} >>`, content);
    object(
      imageId,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${page.filter} /Length ${page.data.length} >>`,
      page.data,
    );
  });

  const count = 3 + pages.length * 3;
  const xrefStart = length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(ascii(xref));
  push(ascii(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`));

  const out = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}
