import QRCode from 'qrcode';

export interface QrImageOptions {
  /** The exact Guest Menu URL to encode. */
  url: string;
  foregroundColor: string;
  backgroundColor: string;
  /** Absolute URL of the logo to draw in the center; omit for a plain code. */
  logoUrl?: string | null;
  /** Text printed under the code (restaurant name, "Scan to view our menu"). */
  title?: string | null;
  subtitle?: string | null;
  /** Width of the code area in pixels (the image is exactly this wide). */
  size?: number;
}

export interface QrImageResult {
  dataUrl: string;
  /** The logo was requested but could not be loaded, so it was left out. */
  logoFailed: boolean;
}

/** Quiet zone, in modules, required around a QR code. */
const QUIET_ZONE_MODULES = 4;
/** Width of the logo box relative to the code (kept small; error correction is level H). */
const LOGO_RATIO = 0.22;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // The Backend serves /media with a CORS read header, so the canvas stays exportable.
    image.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => reject(new Error('logo timeout')), 8000);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('logo failed'));
    };
    image.src = url;
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const ARABIC_RANGE = /[֐-ࣿ]/;

/** Draws one centered line, shrinking the font until it fits `maxWidth`. */
function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baselineY: number,
  maxWidth: number,
  weight: number,
  startSize: number,
  family: string,
): void {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size > startSize * 0.5) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.direction = ARABIC_RANGE.test(text) ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.fillText(text, centerX, baselineY);
}

/**
 * Renders a scannable, styled QR image as a PNG data URL: square modules (best
 * for scanners), error correction level H, a 4-module quiet zone, optional
 * centered logo on a background-colored plate, optional caption lines.
 * Everything is drawn on one canvas, so the preview, the download and the
 * print are the same picture.
 */
export async function renderQrImage(options: QrImageOptions): Promise<QrImageResult> {
  const qr = QRCode.create(options.url, { errorCorrectionLevel: 'H' });
  const count = qr.modules.size;
  const total = count + QUIET_ZONE_MODULES * 2;
  const cell = Math.max(2, Math.floor((options.size ?? 960) / total));
  const side = cell * total;

  const lines = [options.title, options.subtitle].filter(
    (line): line is string => typeof line === 'string' && line.trim() !== '',
  );
  const titleSize = Math.round(side * 0.062);
  const subtitleSize = Math.round(side * 0.04);
  const captionHeight =
    lines.length === 0
      ? 0
      : Math.round(
          side * 0.03 +
            (options.title?.trim() ? titleSize * 1.7 : 0) +
            (options.subtitle?.trim() ? subtitleSize * 1.9 : 0),
        );

  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side + captionHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  ctx.fillStyle = options.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = options.foregroundColor;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.modules.get(row, col)) {
        ctx.fillRect(
          (col + QUIET_ZONE_MODULES) * cell,
          (row + QUIET_ZONE_MODULES) * cell,
          cell,
          cell,
        );
      }
    }
  }

  let logoFailed = false;
  if (options.logoUrl) {
    try {
      const logo = await loadImage(options.logoUrl);
      const box = Math.floor(count * cell * LOGO_RATIO);
      const pad = Math.max(4, Math.round(box * 0.1));
      const plate = box + pad * 2;
      const x = Math.round((side - plate) / 2);
      ctx.fillStyle = options.backgroundColor;
      roundedRect(ctx, x, x, plate, plate, Math.round(plate * 0.16));
      ctx.fill();
      const scale = Math.min(box / logo.naturalWidth, box / logo.naturalHeight);
      const w = Math.round(logo.naturalWidth * scale);
      const h = Math.round(logo.naturalHeight * scale);
      ctx.drawImage(logo, x + pad + Math.round((box - w) / 2), x + pad + Math.round((box - h) / 2), w, h);
    } catch {
      logoFailed = true;
    }
  }

  if (lines.length > 0) {
    if (typeof document !== 'undefined' && document.fonts) {
      try {
        await document.fonts.ready;
      } catch {
        /* the system fallback font is fine */
      }
    }
    const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
    ctx.fillStyle = options.foregroundColor;
    let y = side - cell * 1.5 + side * 0.03;
    if (options.title?.trim()) {
      y += titleSize;
      drawFittedText(ctx, options.title.trim(), side / 2, y, side * 0.88, 700, titleSize, family);
      y += titleSize * 0.45;
    }
    if (options.subtitle?.trim()) {
      y += subtitleSize * 1.15;
      ctx.globalAlpha = 0.78;
      drawFittedText(ctx, options.subtitle.trim(), side / 2, y, side * 0.88, 500, subtitleSize, family);
      ctx.globalAlpha = 1;
    }
  }

  return { dataUrl: canvas.toDataURL('image/png'), logoFailed };
}
