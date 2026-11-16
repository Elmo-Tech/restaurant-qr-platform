/**
 * Read-only image inspection followed by local creation of two import JSONs.
 * There are NO database, HTTP, uploads or deployment operations in this tool.
 *
 * Existing unapproved source metadata is never overwritten. Both outputs
 * preserve true source license states and clearly use owner attestation.
 */
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  inspectLocalFoodImage,
  type LocalFoodImageManifest,
} from '../src/platform/food-library/local-food-image-import';
import { prepareOwnerAcceptedFoodImageManifest } from '../src/platform/food-library/prepare-owner-approved-food-images';

const SOURCE_NAME = '00_DEDUPED_69_MANIFEST_UNAPPROVED.json';
const ALL_NAME = 'OWNER_ACCEPTED_69_IMPORT_MANIFEST.json';
const PILOT_NAME = 'OWNER_ACCEPTED_PILOT_10_IMPORT_MANIFEST.json';

async function saveWithoutOverwrite(
  directory: string,
  name: string,
  manifest: LocalFoodImageManifest,
): Promise<void> {
  const target = path.join(directory, name);
  const content = JSON.stringify(manifest, null, 2) + '\n';
  try {
    await writeFile(target, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    console.log('CREATED ' + target);
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
      throw error;
    }
    const existing = await readFile(target, 'utf8');
    if (existing !== content) {
      throw new Error('Refusing to overwrite changed owner manifest: ' + target);
    }
    console.log('UNCHANGED ' + target);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (
    args.length !== 2 ||
    args[0] !== '--base-dir' ||
    !args[1] ||
    args[1].startsWith('--')
  ) {
    throw new Error(
      'Usage: npm run prepare:owner-food-images --workspace=apps/api -- --base-dir <69-photo-directory>',
    );
  }
  const directory = await realpath(path.resolve(args[1]));
  const sourceText = await readFile(path.join(directory, SOURCE_NAME), 'utf8');
  if (Buffer.byteLength(sourceText, 'utf8') > 1024 * 1024) {
    throw new Error('Source manifest exceeds 1 MiB.');
  }
  const source: unknown = JSON.parse(sourceText);
  const all = prepareOwnerAcceptedFoodImageManifest(source, 'all');
  const pilot = prepareOwnerAcceptedFoodImageManifest(source, 'pilot');

  // Verify every image, including all photos not selected for the pilot,
  // before writing either output manifest.
  for (const item of all.images) {
    await inspectLocalFoodImage(directory, item);
  }
  await saveWithoutOverwrite(directory, ALL_NAME, all);
  await saveWithoutOverwrite(directory, PILOT_NAME, pilot);

  console.log(
    'PREPARED: 69 source-distinct owner-accepted images and 10-image pilot; ' +
      'Pexels and claimed-CC0 license labels unchanged. ' +
      'This operation did not upload, publish or contact a database.',
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
