import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import type { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  AiSettingsError,
  AiSettingsService,
  DEFAULT_MODEL,
  type AiSettingsErrorCode,
} from './ai-settings.service';

interface KeyRecord {
  id: string;
  label: string;
  secretEncrypted: string;
  fingerprint: string;
  last4: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
}
interface SettingsRecord {
  id: string;
  engine: 'N8N' | 'DIRECT';
  model: string;
  fallbackModel: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Only what the service uses, in memory. Like the real table: the same fingerprint twice is refused. */
function fakeDatabase() {
  const keys: KeyRecord[] = [];
  let settings: SettingsRecord | null = null;
  let sequence = 0;
  const known = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(code, {
      code,
      clientVersion: 'test',
    });
  const prisma = {
    platformAiSettings: {
      upsert: jest.fn(
        ({
          create,
        }: {
          create: { id: string; engine: 'N8N'; model: string };
        }) => {
          settings ??= {
            ...create,
            fallbackModel: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return Promise.resolve(settings);
        },
      ),
      update: jest.fn(({ data }: { data: Partial<SettingsRecord> }) => {
        settings = {
          ...(settings as SettingsRecord),
          ...data,
          updatedAt: new Date(),
        };
        return Promise.resolve(settings);
      }),
    },
    platformAiKey: {
      count: jest.fn((args?: { where?: { status?: string } }) =>
        Promise.resolve(
          keys.filter(
            (k) => !args?.where?.status || k.status === args.where.status,
          ).length,
        ),
      ),
      findMany: jest.fn((args?: { where?: { status?: string } }) =>
        Promise.resolve(
          keys.filter(
            (k) => !args?.where?.status || k.status === args.where.status,
          ),
        ),
      ),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(keys.find((k) => k.id === where.id) ?? null),
      ),
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<KeyRecord, 'id' | 'createdAt' | 'updatedAt'>;
        }) => {
          if (keys.some((k) => k.fingerprint === data.fingerprint))
            return Promise.reject(known('P2002'));
          sequence += 1;
          const row: KeyRecord = {
            id: `key-${sequence}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          keys.push(row);
          return Promise.resolve(row);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<KeyRecord>;
        }) => {
          const row = keys.find((k) => k.id === where.id);
          if (!row) return Promise.reject(known('P2025'));
          Object.assign(row, data, { updatedAt: new Date() });
          return Promise.resolve(row);
        },
      ),
      deleteMany: jest.fn(({ where }: { where: { id: string } }) => {
        const index = keys.findIndex((k) => k.id === where.id);
        if (index >= 0) keys.splice(index, 1);
        return Promise.resolve({ count: index >= 0 ? 1 : 0 });
      }),
    },
  };
  return { prisma, keys };
}

const SECRET_A = 'AIzaSyKeyAKeyAKeyAKeyAKeyAKeyA_aaaa';
const SECRET_B = 'AIzaSyKeyBKeyBKeyBKeyBKeyBKeyB_bbbb';

/** `encryptionKey` null = the server variable is not set; leaving it out gives a fresh valid key. */
function makeService(
  db = fakeDatabase(),
  encryptionKey: string | null = randomBytes(32).toString('base64'),
) {
  const config = {
    get: (name: string) =>
      name === 'AI_KEYS_ENCRYPTION_KEY'
        ? (encryptionKey ?? undefined)
        : undefined,
  };
  const service = new AiSettingsService(
    db.prisma as unknown as PrismaService,
    config as unknown as ConfigService<EnvConfig, true>,
  );
  return { service, db, encryptionKey };
}

async function codeOf(
  run: Promise<unknown>,
): Promise<AiSettingsErrorCode | 'NO_ERROR'> {
  try {
    await run;
  } catch (error) {
    if (error instanceof AiSettingsError) return error.code;
    throw error;
  }
  return 'NO_ERROR';
}

describe('AiSettingsService', () => {
  it('starts on n8n with the default model, and says whether keys can be saved', async () => {
    const withKey = makeService();
    expect(await withKey.service.getSettings()).toMatchObject({
      engine: 'N8N',
      model: DEFAULT_MODEL,
      fallbackModel: null,
      encryptionConfigured: true,
      activeKeyCount: 0,
    });
    const without = makeService(fakeDatabase(), null);
    expect((await without.service.getSettings()).encryptionConfigured).toBe(
      false,
    );
  });

  it('stores a key encrypted, shows only a label and the last four characters, and never the key', async () => {
    const { service, db } = makeService();
    const view = await service.addKey({
      label: '  Main   key ',
      secret: `  ${SECRET_A}\n`,
    });
    expect(view).toMatchObject({
      label: 'Main key',
      last4: 'aaaa',
      status: 'ACTIVE',
    });

    const stored = db.keys[0];
    expect(stored.secretEncrypted).not.toContain(SECRET_A);
    expect(stored.secretEncrypted.startsWith('v1:')).toBe(true);

    const everythingShown = JSON.stringify([
      view,
      await service.listKeys(),
      await service.getSettings(),
    ]);
    expect(everythingShown).not.toContain(SECRET_A);
    expect(everythingShown).not.toContain(stored.secretEncrypted);
    expect(everythingShown).not.toContain(stored.fingerprint);
    expect((await service.getSettings()).activeKeyCount).toBe(1);
  });

  it('cannot save a key without the encryption key, and refuses bad input, duplicates and too many keys', async () => {
    expect(
      await codeOf(
        makeService(fakeDatabase(), null).service.addKey({
          label: 'x',
          secret: SECRET_A,
        }),
      ),
    ).toBe('ENCRYPTION_NOT_CONFIGURED');

    const { service } = makeService();
    expect(await codeOf(service.addKey({ label: '', secret: SECRET_A }))).toBe(
      'LABEL_INVALID',
    );
    expect(await codeOf(service.addKey({ label: 'x', secret: 'short' }))).toBe(
      'KEY_INVALID',
    );
    expect(
      await codeOf(
        service.addKey({ label: 'x', secret: `${SECRET_A} two words` }),
      ),
    ).toBe('KEY_INVALID');
    await service.addKey({ label: 'one', secret: SECRET_A });
    expect(
      await codeOf(service.addKey({ label: 'again', secret: SECRET_A })),
    ).toBe('KEY_DUPLICATE');

    for (let i = 0; i < 19; i += 1) {
      await service.addKey({
        label: `k${i}`,
        secret: `AIzaSyFillerFillerFiller${String(i).padStart(4, '0')}_zz`,
      });
    }
    expect(
      await codeOf(service.addKey({ label: 'too many', secret: SECRET_B })),
    ).toBe('KEY_LIMIT');
  });

  it('gives the extraction code the usable keys, decrypted, and only the active ones', async () => {
    const { service } = makeService();
    const a = await service.addKey({ label: 'A', secret: SECRET_A });
    await service.addKey({ label: 'B', secret: SECRET_B });
    expect((await service.activeKeys()).map((k) => k.value)).toEqual([
      SECRET_A,
      SECRET_B,
    ]);

    await service.updateKey(a.id, { status: 'DISABLED' });
    expect((await service.activeKeys()).map((k) => k.value)).toEqual([
      SECRET_B,
    ]);
    await service.updateKey(a.id, { status: 'ACTIVE', label: 'Renamed' });
    expect((await service.listKeys()).find((k) => k.id === a.id)?.label).toBe(
      'Renamed',
    );
    expect(await service.activeKeys()).toHaveLength(2);
  });

  it('remembers the keys for a short while and forgets them as soon as one changes', async () => {
    const { service, db } = makeService();
    const first = await service.addKey({ label: 'A', secret: SECRET_A });
    await service.activeKeys();
    await service.activeKeys();
    expect(db.prisma.platformAiKey.findMany).toHaveBeenCalledTimes(1);
    await service.addKey({ label: 'B', secret: SECRET_B });
    expect(await service.activeKeys()).toHaveLength(2);
    await service.deleteKey(first.id);
    expect((await service.activeKeys()).map((k) => k.value)).toEqual([
      SECRET_B,
    ]);
  });

  it('skips a key it cannot decrypt (the encryption key changed) instead of failing the import', async () => {
    const db = fakeDatabase();
    const original = makeService(db);
    await original.service.addKey({ label: 'A', secret: SECRET_A });
    const changed = makeService(db, randomBytes(32).toString('base64'));
    expect(await changed.service.activeKeys()).toEqual([]);
    expect(makeService(db, null).service.isEncryptionConfigured()).toBe(false);
    expect(await makeService(db, null).service.activeKeys()).toEqual([]);
  });

  it('answers a missing key with a stable code', async () => {
    const { service } = makeService();
    expect(
      await codeOf(service.updateKey('nope', { status: 'DISABLED' })),
    ).toBe('KEY_NOT_FOUND');
    expect(await codeOf(service.deleteKey('nope'))).toBe('KEY_NOT_FOUND');
    expect(await codeOf(service.updateKey('nope', { label: '' }))).toBe(
      'LABEL_INVALID',
    );
  });

  it('changes the model and the fallback, validating both, and can clear the fallback', async () => {
    const { service } = makeService();
    expect(
      await service.updateSettings({
        model: ' gemini-x-flash ',
        fallbackModel: 'gemini-y-flash',
      }),
    ).toMatchObject({
      model: 'gemini-x-flash',
      fallbackModel: 'gemini-y-flash',
    });
    expect(await codeOf(service.updateSettings({ model: 'bad model' }))).toBe(
      'MODEL_INVALID',
    );
    expect(
      await codeOf(service.updateSettings({ fallbackModel: 'bad;model' })),
    ).toBe('MODEL_INVALID');
    expect(
      (await service.updateSettings({ fallbackModel: '' })).fallbackModel,
    ).toBeNull();
    expect(
      (await service.updateSettings({ model: 'gemini-z' })).fallbackModel,
    ).toBeNull(); // untouched fields stay
  });

  it('only lets the platform switch to the direct engine when it can work, and always lets it go back to n8n', async () => {
    const noEncryption = makeService(fakeDatabase(), null);
    expect(
      await codeOf(noEncryption.service.updateSettings({ engine: 'DIRECT' })),
    ).toBe('ENCRYPTION_NOT_CONFIGURED');

    const { service } = makeService();
    expect(await codeOf(service.updateSettings({ engine: 'DIRECT' }))).toBe(
      'KEYS_MISSING',
    );
    const key = await service.addKey({ label: 'A', secret: SECRET_A });
    await service.updateKey(key.id, { status: 'DISABLED' });
    expect(await codeOf(service.updateSettings({ engine: 'DIRECT' }))).toBe(
      'KEYS_MISSING',
    );
    await service.updateKey(key.id, { status: 'ACTIVE' });
    expect((await service.updateSettings({ engine: 'DIRECT' })).engine).toBe(
      'DIRECT',
    );
    expect((await service.updateSettings({ engine: 'N8N' })).engine).toBe(
      'N8N',
    );
  });

  it('keeps the direct engine working: the last active key cannot be disabled or deleted until the platform goes back to n8n', async () => {
    const { service } = makeService();
    const a = await service.addKey({ label: 'A', secret: SECRET_A });
    const b = await service.addKey({ label: 'B', secret: SECRET_B });
    await service.updateSettings({ engine: 'DIRECT' });

    await service.updateKey(a.id, { status: 'DISABLED' }); // B is still active
    expect(await codeOf(service.updateKey(b.id, { status: 'DISABLED' }))).toBe(
      'KEYS_MISSING',
    );
    expect(await codeOf(service.deleteKey(b.id))).toBe('KEYS_MISSING');
    await service.deleteKey(a.id); // a disabled key can always go
    await service.updateKey(b.id, { label: 'B renamed' }); // not a status change

    await service.updateSettings({ engine: 'N8N' });
    await service.updateKey(b.id, { status: 'DISABLED' });
    await service.deleteKey(b.id);
    expect(await service.listKeys()).toEqual([]);
  });

  it('gives one key to the console test, and says so when it cannot', async () => {
    const { service, db, encryptionKey } = makeService();
    const key = await service.addKey({ label: 'A', secret: SECRET_A });
    expect(await service.keyForTest(key.id)).toEqual({
      id: key.id,
      label: 'A',
      value: SECRET_A,
    });
    expect(await codeOf(service.keyForTest('nope'))).toBe('KEY_NOT_FOUND');
    expect(await codeOf(makeService(db, null).service.keyForTest(key.id))).toBe(
      'ENCRYPTION_NOT_CONFIGURED',
    );
    const other = makeService(db, randomBytes(32).toString('base64')).service;
    expect(await codeOf(other.keyForTest(key.id))).toBe('KEY_UNREADABLE');
    expect(encryptionKey).not.toBeNull();
  });
});
