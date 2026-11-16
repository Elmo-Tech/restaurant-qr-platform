import {
  assertLocalImageImportWriteGate,
  parseLocalImageImportArguments,
  PRODUCTION_IMPORT_CONFIRM_PHRASE,
} from './local-food-image-import-write-gate';

const productionArgs = () => [
  '--manifest',
  '/import/OWNER_ACCEPTED_PILOT_10_IMPORT_MANIFEST.json',
  '--base-dir',
  '/import',
  '--target',
  'production',
  '--apply',
  '--ack-production-backups',
  '--confirm-production',
  PRODUCTION_IMPORT_CONFIRM_PHRASE,
  '--database-backup-ref',
  'offsite-db-20261116-verified',
  '--uploads-backup-ref',
  'offsite-uploads-20261116-verified',
  '--expected-database-name',
  'restaurant_qr_platform',
];

const productionEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  WAYTA_LOCAL_IMPORT_ENV: 'production',
  WAYTA_PRODUCTION_IMAGE_IMPORT_ALLOW: 'DRAFT_ONLY',
  DATABASE_URL:
    'postgresql://wayta:private-password@postgres:5432/restaurant_qr_platform',
  UPLOAD_LOCAL_DIR: '/var/lib/restaurant-qr/uploads',
});

describe('production food image importer write-gate', () => {
  it('allows read-only dry-run without any production credentials or backup flags', () => {
    const options = parseLocalImageImportArguments([
      '--manifest',
      '/import/pilot.json',
      '--base-dir',
      '/import',
    ]);
    expect(options.apply).toBe(false);
    expect(() => assertLocalImageImportWriteGate(options, {})).not.toThrow();
  });

  it('requires all explicit production flags and exact private Docker DB/volume settings', () => {
    const options = parseLocalImageImportArguments(productionArgs());
    expect(options.target).toBe('production');
    expect(() =>
      assertLocalImageImportWriteGate(options, productionEnvironment()),
    ).not.toThrow();
  });

  it('preserves the existing staging-only gate for staging apply', () => {
    const stage = parseLocalImageImportArguments([
      '--manifest',
      '/import/pilot.json',
      '--base-dir',
      '/import',
      '--apply',
      '--ack-staging-backup',
    ]);
    expect(() =>
      assertLocalImageImportWriteGate(stage, {
        NODE_ENV: 'development',
        WAYTA_LOCAL_IMPORT_ENV: 'staging',
        DATABASE_URL: 'postgresql://staging:password@postgres:5432/stagingdb',
        UPLOAD_LOCAL_DIR: '/var/lib/staging/uploads',
      }),
    ).not.toThrow();
    expect(() =>
      assertLocalImageImportWriteGate(stage, productionEnvironment()),
    ).toThrow('STAGING import blocked');
  });

  it('refuses a production environment for default or staging target', () => {
    const options = parseLocalImageImportArguments([
      '--manifest',
      '/import/pilot.json',
      '--base-dir',
      '/import',
      '--apply',
      '--ack-staging-backup',
    ]);
    expect(() =>
      assertLocalImageImportWriteGate(options, productionEnvironment()),
    ).toThrow('STAGING import blocked');
  });

  it('refuses missing production backup acknowledgement or confirmation', () => {
    for (const flag of ['--ack-production-backups', '--confirm-production']) {
      const args = productionArgs();
      const index = args.indexOf(flag);
      args.splice(index, flag === '--confirm-production' ? 2 : 1);
      const options = parseLocalImageImportArguments(args);
      expect(() =>
        assertLocalImageImportWriteGate(options, productionEnvironment()),
      ).toThrow('PRODUCTION import blocked');
    }
  });

  it('refuses unidentifiable or duplicated backup references', () => {
    for (const args of [
      productionArgs().map((part) =>
        part === 'offsite-db-20261116-verified' ? 'x' : part,
      ),
      productionArgs().map((part) =>
        part === 'offsite-uploads-20261116-verified'
          ? 'offsite-db-20261116-verified'
          : part,
      ),
    ]) {
      const options = parseLocalImageImportArguments(args);
      expect(() =>
        assertLocalImageImportWriteGate(options, productionEnvironment()),
      ).toThrow('PRODUCTION import blocked');
    }
  });

  it('refuses incorrect production environment or upload mount', () => {
    const options = parseLocalImageImportArguments(productionArgs());
    const changes = [
      { NODE_ENV: 'development' },
      { WAYTA_LOCAL_IMPORT_ENV: 'staging' },
      { WAYTA_PRODUCTION_IMAGE_IMPORT_ALLOW: '' },
      { UPLOAD_LOCAL_DIR: '/tmp/uploads' },
      { DATABASE_URL: '' },
    ];
    for (const change of changes) {
      expect(() =>
        assertLocalImageImportWriteGate(options, {
          ...productionEnvironment(),
          ...change,
        }),
      ).toThrow('PRODUCTION import blocked');
    }
  });

  it('refuses unexpected database names, hosts and ports', () => {
    const options = parseLocalImageImportArguments(productionArgs());
    const urls = [
      'postgresql://wayta:p@localhost:5432/restaurant_qr_platform',
      'postgresql://wayta:p@postgres:6432/restaurant_qr_platform',
      'postgresql://wayta:p@postgres:5432/staging',
      'postgresql://wayta:p@postgres:5432/template1',
      'mysql://wayta:p@postgres:5432/restaurant_qr_platform',
      'malformed-url',
    ];
    for (const url of urls) {
      expect(() =>
        assertLocalImageImportWriteGate(options, {
          ...productionEnvironment(),
          DATABASE_URL: url,
        }),
      ).toThrow('PRODUCTION import blocked');
    }
  });

  it('rejects staging approval mixed with production mode', () => {
    expect(() =>
      parseLocalImageImportArguments([...productionArgs(), '--ack-staging-backup']),
    ).toThrow('Staging backup acknowledgement');
  });

  it('rejects unexpected, duplicate or incomplete command flags', () => {
    const args = productionArgs();
    expect(() =>
      parseLocalImageImportArguments([...args, '--apply']),
    ).toThrow('Duplicate option');
    expect(() =>
      parseLocalImageImportArguments([...args, '--no-logs']),
    ).toThrow('Unknown or duplicate option');
    expect(() =>
      parseLocalImageImportArguments(['--manifest', '/import/a']),
    ).toThrow('--manifest and --base-dir');
    expect(() =>
      parseLocalImageImportArguments(['--manifest', '--apply', '--base-dir', '/import']),
    ).toThrow('Missing value');
  });

  it('rejects any backup or approval flags on read-only mode', () => {
    expect(() =>
      parseLocalImageImportArguments([
        '--manifest',
        '/import/a',
        '--base-dir',
        '/import',
        '--ack-production-backups',
      ]),
    ).toThrow('Approval and backup flags require --apply');
  });

  it('does not let STAGING mode accept production approval inputs', () => {
    const args = [
      '--manifest',
      '/import/a',
      '--base-dir',
      '/import',
      '--apply',
      '--ack-staging-backup',
      '--confirm-production',
      PRODUCTION_IMPORT_CONFIRM_PHRASE,
    ];
    expect(() => parseLocalImageImportArguments(args)).toThrow(
      'Production approval flags cannot be used on staging',
    );
  });
});
