/**
 * Explicit, separate STAGING and PRODUCTION write gates for the reviewed
 * local food photo importer. Dry run is always read-only.
 *
 * This module cannot prove a backup exists or is restorable. An operator
 * MUST verify PostgreSQL AND the shared persistent uploads volume backup
 * off-server before supplying the production acknowledgement and references.
 */
export type LocalImportTarget = 'staging' | 'production';

export interface LocalImageImportOptions {
  manifest: string;
  baseDir: string;
  apply: boolean;
  target: LocalImportTarget;
  stagingBackupAcknowledged: boolean;
  productionBackupsAcknowledged: boolean;
  confirmProduction: string | null;
  databaseBackupRef: string | null;
  uploadsBackupRef: string | null;
  expectedDatabaseName: string | null;
}

const CONFIRM = 'WAYTA_PRODUCTION_FOOD_LIBRARY_DRAFT_ONLY';
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{8,179}$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;
const UPLOAD_VOLUME_DIR = '/var/lib/restaurant-qr/uploads';
const VALUE_FLAGS = new Set([
  '--manifest',
  '--base-dir',
  '--target',
  '--confirm-production',
  '--database-backup-ref',
  '--uploads-backup-ref',
  '--expected-database-name',
]);
const BOOLEAN_FLAGS = new Set([
  '--apply',
  '--ack-staging-backup',
  '--ack-production-backups',
]);

export function parseLocalImageImportArguments(
  args: string[],
): LocalImageImportOptions {
  const values = new Map<string, string>();
  const toggles = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (BOOLEAN_FLAGS.has(flag)) {
      if (toggles.has(flag)) throw new Error('Duplicate option ' + flag);
      toggles.add(flag);
      continue;
    }
    if (!VALUE_FLAGS.has(flag) || values.has(flag))
      throw new Error('Unknown or duplicate option ' + flag);
    const value = args[++i];
    if (!value || value.startsWith('--')) {
      throw new Error('Missing value for ' + flag);
    }
    values.set(flag, value);
  }
  if (!values.get('--manifest') || !values.get('--base-dir')) {
    throw new Error('--manifest and --base-dir are both required');
  }
  const apply = toggles.has('--apply');
  const target = values.get('--target') ?? 'staging';
  if (target !== 'staging' && target !== 'production')
    throw new Error('Unsupported import target: ' + target);

  const options: LocalImageImportOptions = {
    manifest: values.get('--manifest')!,
    baseDir: values.get('--base-dir')!,
    apply,
    target,
    stagingBackupAcknowledged: toggles.has('--ack-staging-backup'),
    productionBackupsAcknowledged: toggles.has('--ack-production-backups'),
    confirmProduction: values.get('--confirm-production') ?? null,
    databaseBackupRef: values.get('--database-backup-ref') ?? null,
    uploadsBackupRef: values.get('--uploads-backup-ref') ?? null,
    expectedDatabaseName: values.get('--expected-database-name') ?? null,
  };
  if (
    !apply &&
    (options.stagingBackupAcknowledged ||
      options.productionBackupsAcknowledged ||
      options.confirmProduction ||
      options.databaseBackupRef ||
      options.uploadsBackupRef ||
      options.expectedDatabaseName)
  ) {
    throw new Error('Approval and backup flags require --apply');
  }
  if (
    apply &&
    target === 'staging' &&
    (options.productionBackupsAcknowledged ||
      options.confirmProduction ||
      options.databaseBackupRef ||
      options.uploadsBackupRef ||
      options.expectedDatabaseName)
  ) {
    throw new Error('Production approval flags cannot be used on staging');
  }
  if (apply && target === 'production' && options.stagingBackupAcknowledged) {
    throw new Error('Staging backup acknowledgement cannot approve production');
  }
  return options;
}

export function assertLocalImageImportWriteGate(
  options: LocalImageImportOptions,
  env: NodeJS.ProcessEnv,
): void {
  if (!options.apply) return;

  if (options.target === 'staging') {
    if (
      !options.stagingBackupAcknowledged ||
      env.WAYTA_LOCAL_IMPORT_ENV !== 'staging' ||
      env.NODE_ENV === 'production' ||
      !env.DATABASE_URL ||
      !env.UPLOAD_LOCAL_DIR
    ) {
      throw new Error(
        'STAGING import blocked: verify an isolated staging database, media ' +
          'and both backups; provide --ack-staging-backup and staging env.',
      );
    }
    return;
  }

  if (
    !options.productionBackupsAcknowledged ||
    options.confirmProduction !== CONFIRM ||
    !options.databaseBackupRef ||
    !REF.test(options.databaseBackupRef) ||
    !options.uploadsBackupRef ||
    !REF.test(options.uploadsBackupRef) ||
    options.databaseBackupRef === options.uploadsBackupRef ||
    !options.expectedDatabaseName ||
    !NAME.test(options.expectedDatabaseName)
  ) {
    throw new Error(
      'PRODUCTION import blocked: require --ack-production-backups, ' +
        '--confirm-production ' +
        CONFIRM +
        ', distinct database/uploads backup references and expected DB name.',
    );
  }

  if (
    env.NODE_ENV !== 'production' ||
    env.WAYTA_LOCAL_IMPORT_ENV !== 'production' ||
    env.WAYTA_PRODUCTION_IMAGE_IMPORT_ALLOW !== 'DRAFT_ONLY' ||
    env.UPLOAD_LOCAL_DIR !== UPLOAD_VOLUME_DIR ||
    !env.DATABASE_URL
  ) {
    throw new Error(
      'PRODUCTION import blocked: require production NODE_ENV, explicit ' +
        'WAYTA_LOCAL_IMPORT_ENV=production and WAYTA_PRODUCTION_IMAGE_IMPORT_ALLOW=DRAFT_ONLY, ' +
        'configured PostgreSQL and shared persistent uploads mount.',
    );
  }

  let database: URL;
  try {
    database = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('PRODUCTION import blocked: DATABASE_URL is malformed');
  }
  const databaseName = decodeURIComponent(database.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.hostname !== 'postgres' ||
    (database.port !== '' && database.port !== '5432') ||
    databaseName !== options.expectedDatabaseName ||
    databaseName === 'template0' ||
    databaseName === 'template1'
  ) {
    throw new Error(
      'PRODUCTION import blocked: database host/name does not match ' +
        'the expected private Coolify Postgres service.',
    );
  }
}

export const PRODUCTION_IMPORT_CONFIRM_PHRASE = CONFIRM;
