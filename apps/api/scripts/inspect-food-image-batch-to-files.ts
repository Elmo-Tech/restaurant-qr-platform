/**
 * Research-only photo pack from a fixed, UNAPPROVED CC0-claimed manifest.
 * Never touches DB, media uploads, Food Image Asset records, or tenant products.
 * Use only after source terms permit downloading; stop on 403/429 without bypass.
 *
 * Usage (from monorepo root, Node 24):
 * npm run inspect:food-images:pack --workspace=apps/api -- \
 *   --manifest docs/01-domain/food-image-premium-20-foodiefactor-UNAPPROVED.json \
 *   --out C:/Users/you/Downloads/WAYTA-New20-Review
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import {
  downloadApprovedPhoto,
  parseFoodImageImportManifest,
  prepareFoodImage,
} from '../src/platform/food-library/food-image-import-helpers';

const ROOT = resolve(__dirname, '..', '..', '..');
const DELAY_MS = 1250;

function args() {
  const raw = process.argv.slice(2);
  if (raw.length !== 4 || raw[0] !== '--manifest' || raw[2] !== '--out') {
    throw new Error('Usage: --manifest <relative-manifest.json> --out <absolute-external-review-dir>');
  }
  const manifest = resolve(ROOT, raw[1]);
  const out = raw[3];
  if (!isAbsolute(out)) throw new Error('Review output must be an absolute path.');
  const dest = resolve(out);
  const rel = relative(ROOT, dest);
  if (rel === '' || (rel !== '..' && !rel.startsWith('..' + sep))) {
    throw new Error('Review files must be outside the repository.');
  }
  return { manifest, out: dest };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function makeContactSheet(records: Array<{ id: string; filename: string }>, out: string) {
  if (!records.length) return;
  const width = 320;
  const height = 288;
  const cells: sharp.OverlayOptions[] = [];
  const columns = 4;
  for (const [i, item] of records.entries()) {
    const x = (i % columns) * width;
    const y = Math.floor(i / columns) * height;
    const thumb = await sharp(resolve(out, 'previews', item.filename))
      .resize(306, 232, { fit: 'cover', position: 'centre' }).toBuffer();
    cells.push({ input: thumb, left: x + 7, top: y + 7 });
    const label = escapeXml(String(i + 1).padStart(2, '0') + '  ' + item.id).slice(0, 140);
    const svg = Buffer.from(
      '<svg width="320" height="36"><text x="9" y="24" fill="#fff" font-size="14" font-family="Arial">'
      + label + '</text></svg>',
    );
    cells.push({ input: svg, left: x, top: y + 243 });
  }
  await sharp({
    create: {
      width: columns * width,
      height: Math.ceil(records.length / columns) * height,
      channels: 3,
      background: '#10151b',
    },
  }).composite(cells).webp({ quality: 86 }).toFile(resolve(out, 'contact-sheet.webp'));
}

async function main(): Promise<void> {
  const cfg = args();
  const raw = await readFile(cfg.manifest, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024) {
    throw new Error('Manifest exceeds the 1MB safety limit.');
  }
  const manifest = parseFoodImageImportManifest(JSON.parse(raw) as unknown);
  if (manifest.images.length !== 20 || manifest.images.some((image) => image.approved)) {
    throw new Error('Only the 20 unapproved research candidates are accepted. Never apply here.');
  }

  await mkdir(resolve(cfg.out, 'originals'), { recursive: true });
  await mkdir(resolve(cfg.out, 'previews'), { recursive: true });
  const results: Array<Record<string, unknown>> = [];
  const previews: Array<{ id: string; filename: string }> = [];
  const hashes = new Set<string>();
  let stop = false;
  for (const [index, item] of manifest.images.entries()) {
    if (stop) {
      results.push({ id: item.id, status: 'NOT_REQUESTED_AFTER_SOURCE_BLOCK' });
      continue;
    }
    try {
      const source = await downloadApprovedPhoto(item.sourceUrl);
      const prepared = await prepareFoodImage(source, item.expectedSha256);
      const originalHash = createHash('sha256').update(source).digest('hex');
      if (hashes.has(prepared.outputSha256)) {
        results.push({ id: item.id, status: 'REJECT_DUPLICATE', originalHash });
      } else {
        hashes.add(prepared.outputSha256);
        const originalName = item.id + extname(new URL(item.sourceUrl).pathname).toLowerCase();
        const previewName = item.id + '.webp';
        await writeFile(resolve(cfg.out, 'originals', originalName), source);
        await writeFile(resolve(cfg.out, 'previews', previewName), prepared.buffer);
        previews.push({ id: item.id, filename: previewName });
        results.push({
          id: item.id, status: 'TECHNICAL_PASS_ONLY_RIGHTS_AND_VISUAL_QA_PENDING',
          sourcePageUrl: item.sourcePageUrl,
          sourceSha256: prepared.sourceSha256,
          optimizedSha256: prepared.outputSha256,
          sourceBytes: source.length,
          optimizedBytes: prepared.buffer.length,
          width: prepared.width, height: prepared.height,
          proposedTagsNotReviewed: item.tagCodes,
          approved: false,
          imported: false,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id: item.id, status: 'FAILED_OR_BLOCKED', error: message });
      // A blocked/limited source must never be bypassed or retried in this job.
      if (/HTTP status: (403|429)/.test(message)) stop = true;
    }
    console.log((index + 1) + '/' + manifest.images.length + ' ' + item.id
      + ': ' + String(results[results.length - 1].status));
    if (!stop) await new Promise((done) => setTimeout(done, DELAY_MS));
  }
  const report = {
    kind: 'WAYTA_IMAGE_RESEARCH_ONLY_NOT_AN_IMPORT_APPROVAL',
    sourceManifest: cfg.manifest,
    photoCount: manifest.images.length,
    technicallyPrepared: previews.length,
    rightsApproved: 0, humanVisualApproved: 0,
    importedToWAYTA: 0, publishedToWAYTA: 0,
    reminder: 'Inspect every ORIGINAL visually; verify author, CC0 proof and crop 1:1/4:5. 9/10 in every quality dimension required before any DRAFT import.',
    results,
  };
  await writeFile(resolve(cfg.out, 'technical-report.json'), JSON.stringify(report, null, 2) + '\n');
  await makeContactSheet(previews, cfg.out);
  console.log('Research-only output: ' + cfg.out);
  if (results.some((item) => item.status !== 'TECHNICAL_PASS_ONLY_RIGHTS_AND_VISUAL_QA_PENDING')) {
    process.exitCode = 1;
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
