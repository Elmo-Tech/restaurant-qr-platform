import { buildPdf, type PdfImagePage } from './pdf';
import { STAND_HEIGHT_MM, STAND_PNG_HEIGHT, STAND_PNG_WIDTH, STAND_WIDTH_MM } from './stand-svg';

/**
 * Browser-only export helpers for the QR stand: embeds the app's Arabic font
 * and the restaurant logo into the SVG (an SVG drawn as an image cannot load
 * external files), rasterises it to a PNG, and wraps pages into a real PDF.
 */

const ARABIC_RANGE = 'U+0600-06FF,U+0750-077F,U+0870-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC';
const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122';

const FONT_FILES = [
  { weight: 400, file: 'plex-arabic-400-arabic.woff2', range: ARABIC_RANGE },
  { weight: 400, file: 'plex-arabic-400-latin.woff2', range: LATIN_RANGE },
  { weight: 600, file: 'plex-arabic-600-arabic.woff2', range: ARABIC_RANGE },
  { weight: 600, file: 'plex-arabic-600-latin.woff2', range: LATIN_RANGE },
] as const;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

let fontCssPromise: Promise<string> | null = null;

/** `@font-face` rules with the Arabic/Latin font files inlined as data URLs (cached after the first load). */
export function loadStandFontCss(): Promise<string> {
  if (!fontCssPromise) {
    fontCssPromise = Promise.all(
      FONT_FILES.map(async (font) => {
        const response = await fetch(`/fonts/stand/${font.file}`);
        if (!response.ok) throw new Error('font failed');
        const dataUrl = await blobToDataUrl(await response.blob());
        return `@font-face{font-family:'IBM Plex Sans Arabic';font-weight:${font.weight};src:url(${dataUrl}) format('woff2');unicode-range:${font.range};}`;
      }),
    )
      .then((rules) => rules.join(''))
      .catch((error: unknown) => {
        fontCssPromise = null;
        throw error;
      });
  }
  return fontCssPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image failed'));
    image.src = src;
  });
}

const logoCache = new Map<string, Promise<string>>();

/**
 * The logo as a small PNG data URL (max 400 px), or rejects when it cannot be
 * read (offline, no CORS header). Cached per URL.
 */
export function loadLogoDataUrl(url: string): Promise<string> {
  let cached = logoCache.get(url);
  if (!cached) {
    cached = (async () => {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error('logo failed');
      const objectUrl = URL.createObjectURL(await response.blob());
      try {
        const image = await loadImage(objectUrl);
        const scale = Math.min(1, 400 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas unavailable');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    })();
    logoCache.set(url, cached);
    cached.catch(() => logoCache.delete(url));
  }
  return cached;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 60));
}

/** Draws an SVG document onto a white canvas of the given pixel size. */
export async function svgToCanvas(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    const paint = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
    };
    // Embedded fonts can finish decoding just after the first paint: paint again once they had a frame.
    paint();
    await nextFrame();
    paint();
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('export failed'))), type, quality);
  });
}

export async function standSvgToPngBlob(svg: string): Promise<Blob> {
  return canvasToBlob(await svgToCanvas(svg, STAND_PNG_WIDTH, STAND_PNG_HEIGHT), 'image/png');
}

export async function qrSvgToPngBlob(svg: string, px = 1024): Promise<Blob> {
  return canvasToBlob(await svgToCanvas(svg, px, px), 'image/png');
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One PDF page from a rendered canvas: lossless Flate RGB, or high-quality JPEG when compression is unavailable. */
async function canvasToPdfPage(canvas: HTMLCanvasElement): Promise<PdfImagePage> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  const { width, height } = canvas;
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  const packed = await deflate(rgb);
  if (packed) return { width, height, data: packed, filter: 'FlateDecode' };
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.95);
  return { width, height, data: new Uint8Array(await jpeg.arrayBuffer()), filter: 'DCTDecode' };
}

/** A print-ready A6 PDF, one page per stand SVG, built page by page so a long list stays light. */
export async function standSvgsToPdfBlob(
  svgs: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const pages: PdfImagePage[] = [];
  for (let index = 0; index < svgs.length; index += 1) {
    const canvas = await svgToCanvas(svgs[index], STAND_PNG_WIDTH, STAND_PNG_HEIGHT);
    pages.push(await canvasToPdfPage(canvas));
    onProgress?.(index + 1, svgs.length);
  }
  return new Blob([buildPdf(pages, STAND_WIDTH_MM, STAND_HEIGHT_MM) as Uint8Array<ArrayBuffer>], {
    type: 'application/pdf',
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Opens the browser print dialog for rendered stand pages (PNG data URLs), one A6 sheet each. */
export function printStandPages(pngDataUrls: readonly string[]): void {
  const style = document.createElement('style');
  style.setAttribute('data-stand-print', '');
  style.textContent = `
    @page { size: ${STAND_WIDTH_MM}mm ${STAND_HEIGHT_MM}mm; margin: 0; }
    @media print {
      body > *:not(#stand-print-root) { display: none !important; }
      #stand-print-root { display: block !important; }
      #stand-print-root img { display: block; width: ${STAND_WIDTH_MM}mm; height: ${STAND_HEIGHT_MM}mm; break-after: page; page-break-after: always; }
      #stand-print-root img:last-child { break-after: auto; page-break-after: auto; }
    }`;
  const root = document.createElement('div');
  root.id = 'stand-print-root';
  root.style.display = 'none';
  for (const src of pngDataUrls) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    root.appendChild(img);
  }
  document.head.appendChild(style);
  document.body.appendChild(root);
  const cleanup = () => {
    style.remove();
    root.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  void Promise.all(Array.from(root.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined))).then(
    () => window.print(),
  );
}
