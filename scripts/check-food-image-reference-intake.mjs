/** Validate that external image references remain non-importable until rights clear. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const input = path.resolve(root, 'docs/01-domain/food-image-pexels-reference-intake-b01.json');
const dataset = JSON.parse(readFileSync(input, 'utf8'));
const tagCatalog = readFileSync(
  path.resolve(root, 'apps/api/src/platform/food-library/food-tag-catalog.ts'),
  'utf8',
);
const allowedCodes = new Set(
  [...tagCatalog.matchAll(/^([A-Z][A-Z0-9_]*)\|/gm)].map((match) => match[1]),
);
function check(ok, message) {
  if (!ok) throw new Error('Food photo intake safety check: ' + message);
}
check(dataset.schemaVersion === 1 && dataset.notImportable === true, 'dataset must be non-importable');
check(dataset.status === 'RIGHTS_REVIEW_REQUIRED', 'rights release gate cannot be bypassed');
check(Array.isArray(dataset.entries) && dataset.entries.length === 8, 'expect 8 separately audited references');
const ids = new Set();
const urls = new Set();
const criteria = [
  'lighting', 'foodStyling', 'composition',
  'background', 'advertisingSuitability', 'productAccuracy',
];
for (const image of dataset.entries) {
  check(/^\d+$/.test(image.pexelsId), 'invalid Pexels ID');
  check(!ids.has(image.pexelsId), 'duplicate Pexels ID');
  ids.add(image.pexelsId);
  const u = new URL(image.sourcePageUrl);
  check(u.protocol === 'https:' && u.hostname === 'www.pexels.com' &&
    !u.username && !u.password && !u.port &&
    u.pathname.startsWith('/photo/') && u.pathname.endsWith('-' + image.pexelsId + '/'),
    'photo URL must be a verified Pexels page: ' + image.pexelsId);
  check(!urls.has(u.href), 'duplicate photo page');
  urls.add(u.href);
  check(image.licenseLabel === 'PEXELS_LICENSE_OR_CC0_UNCONFIRMED_PER_PHOTO',
    'license not individually verified');
  check(image.individualCC0Confirmed === false, 'CC0 must not be inferred');
  check(image.sharedLibraryDistributionApproved === false, 'shared distribution must remain blocked');
  check(image.visualApproval === 'PENDING_ORIGINAL_REVIEW' &&
    image.importStatus === 'BLOCKED_RIGHTS', 'image must remain unapproved');
  check(image.sourceHashSha256 === null, 'do not claim image bytes were inspected');
  check(!('sourceUrl' in image) && !('license' in image) && !('approved' in image),
    'reference record must not be usable as an import manifest');
  check(criteria.every((criterion) => image.visualScore?.[criterion] === null),
    'do not invent visual-quality scores');
  check(Array.isArray(image.tagCodesProposed), 'tags must be a list');
  check(new Set(image.tagCodesProposed).size === image.tagCodesProposed.length,
    'duplicate tag proposals');
  for (const code of image.tagCodesProposed) {
    check(allowedCodes.has(code), 'unknown canonical tag: ' + code);
  }
  check(image.tagCodesProposed.length > 0 || image.classificationNote,
    'unclassified photo must have reason');
  check(Array.isArray(image.sectorsProposed) &&
    image.sectorsProposed.every((s) =>
      ['RESTAURANT', 'CAFE', 'SWEETS', 'BUTCHER', 'HOME_FOOD'].includes(s)),
    'invalid sectors');
  check(image.presentationProposed === 'READY_TO_SERVE',
    'unexpected presentation must be manually reviewed');
}
console.log('PASS: 8 individually linked premium photo references remain blocked pending rights and quality approval; proposed canonical tags exist.');
