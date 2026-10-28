import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  AiExtractionEngine,
  AiKeyStatus,
} from '../generated/prisma/client';
import {
  AiSecretError,
  decryptSecret,
  encryptSecret,
  fingerprintOf,
  last4Of,
  parseEncryptionKey,
} from './ai-secret-crypto';
import {
  MAX_KEYS,
  normalizeApiKey,
  normalizeLabel,
  normalizeModelName,
} from './ai-settings-input';

/**
 * The AI settings the Platform team manages from the console (DEC-059): which engine reads a menu (n8n or the
 * Backend calling the model directly), the model and its fallback, and the pool of API keys. Keys are stored
 * encrypted (`ai-secret-crypto.ts`) and are NEVER returned by any method here except `activeKeys()`, which only the
 * extraction code calls. Platform-wide: no Restaurant is involved.
 */

export const DEFAULT_MODEL = 'gemini-3.8-flash';
const SETTINGS_ID = 'ai';
const KEYS_CACHE_MS = 30_000;

export type AiSettingsErrorCode =
  | 'ENCRYPTION_NOT_CONFIGURED'
  | 'KEY_INVALID'
  | 'KEY_DUPLICATE'
  | 'KEY_LIMIT'
  | 'KEY_NOT_FOUND'
  | 'LABEL_INVALID'
  | 'MODEL_INVALID'
  | 'KEYS_MISSING'
  | 'KEY_UNREADABLE';

/** A stable code the API layer turns into an HTTP answer. */
export class AiSettingsError extends Error {
  constructor(readonly code: AiSettingsErrorCode) {
    super(code);
    this.name = 'AiSettingsError';
  }
}

export interface AiSettingsView {
  engine: AiExtractionEngine;
  model: string;
  fallbackModel: string | null;
  /** False until `AI_KEYS_ENCRYPTION_KEY` is set on the server: keys cannot be saved and only n8n can be used. */
  encryptionConfigured: boolean;
  activeKeyCount: number;
  updatedAt: string;
}

/** What the console may show about a key: a label and the last four characters, never the key. */
export interface AiKeyView {
  id: string;
  label: string;
  last4: string;
  status: AiKeyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AiSettingsPatch {
  engine?: AiExtractionEngine;
  model?: string;
  /** null or an empty string removes the fallback model. */
  fallbackModel?: string | null;
}

export interface DecryptedAiKey {
  id: string;
  label: string;
  value: string;
}

type KeyRow = {
  id: string;
  label: string;
  last4: string;
  status: AiKeyStatus;
  createdAt: Date;
  updatedAt: Date;
};

const toKeyView = (row: KeyRow): AiKeyView => ({
  id: row.id,
  label: row.label,
  last4: row.last4,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const KEY_VIEW_SELECT = {
  id: true,
  label: true,
  last4: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class AiSettingsService {
  private readonly logger = new Logger(AiSettingsService.name);
  private cache: { at: number; keys: DecryptedAiKey[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private encryptionKey(): Buffer | null {
    return parseEncryptionKey(
      this.config.get('AI_KEYS_ENCRYPTION_KEY', { infer: true }),
    );
  }

  isEncryptionConfigured(): boolean {
    return this.encryptionKey() !== null;
  }

  private forget(): void {
    this.cache = null;
  }

  // ---------------------------------------------------------------- settings

  async getSettings(): Promise<AiSettingsView> {
    const row = await this.prisma.platformAiSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, engine: 'N8N', model: DEFAULT_MODEL },
      update: {},
    });
    return {
      engine: row.engine,
      model: row.model,
      fallbackModel: row.fallbackModel,
      encryptionConfigured: this.isEncryptionConfigured(),
      activeKeyCount: await this.prisma.platformAiKey.count({
        where: { status: 'ACTIVE' },
      }),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateSettings(patch: AiSettingsPatch): Promise<AiSettingsView> {
    const current = await this.getSettings();

    let model = current.model;
    if (patch.model !== undefined) {
      const checked = normalizeModelName(patch.model);
      if (checked === null) throw new AiSettingsError('MODEL_INVALID');
      model = checked;
    }

    let fallbackModel = current.fallbackModel;
    if (patch.fallbackModel !== undefined) {
      const raw = patch.fallbackModel;
      if (raw === null || raw.trim() === '') {
        fallbackModel = null;
      } else {
        const checked = normalizeModelName(raw);
        if (checked === null) throw new AiSettingsError('MODEL_INVALID');
        fallbackModel = checked;
      }
    }

    const engine = patch.engine ?? current.engine;
    if (engine === 'DIRECT') {
      // Never leave the platform pointing at an engine that cannot work.
      if (!current.encryptionConfigured) {
        throw new AiSettingsError('ENCRYPTION_NOT_CONFIGURED');
      }
      if (current.activeKeyCount === 0)
        throw new AiSettingsError('KEYS_MISSING');
    }

    await this.prisma.platformAiSettings.update({
      where: { id: SETTINGS_ID },
      data: { engine, model, fallbackModel },
    });
    return this.getSettings();
  }

  // -------------------------------------------------------------------- keys

  async listKeys(): Promise<AiKeyView[]> {
    const rows = await this.prisma.platformAiKey.findMany({
      orderBy: { createdAt: 'asc' },
      select: KEY_VIEW_SELECT,
    });
    return rows.map(toKeyView);
  }

  async addKey(input: { label: unknown; secret: unknown }): Promise<AiKeyView> {
    const encryptionKey = this.encryptionKey();
    if (encryptionKey === null) {
      throw new AiSettingsError('ENCRYPTION_NOT_CONFIGURED');
    }
    const label = normalizeLabel(input.label);
    if (label === null) throw new AiSettingsError('LABEL_INVALID');
    const secret = normalizeApiKey(input.secret);
    if (secret === null) throw new AiSettingsError('KEY_INVALID');
    if ((await this.prisma.platformAiKey.count()) >= MAX_KEYS) {
      throw new AiSettingsError('KEY_LIMIT');
    }

    try {
      const row = await this.prisma.platformAiKey.create({
        data: {
          label,
          secretEncrypted: encryptSecret(secret, encryptionKey),
          fingerprint: fingerprintOf(secret),
          last4: last4Of(secret),
          status: 'ACTIVE',
        },
        select: KEY_VIEW_SELECT,
      });
      this.forget();
      return toKeyView(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new AiSettingsError('KEY_DUPLICATE');
      throw error;
    }
  }

  async updateKey(
    id: string,
    patch: { label?: unknown; status?: AiKeyStatus },
  ): Promise<AiKeyView> {
    const data: { label?: string; status?: AiKeyStatus } = {};
    if (patch.label !== undefined) {
      const label = normalizeLabel(patch.label);
      if (label === null) throw new AiSettingsError('LABEL_INVALID');
      data.label = label;
    }
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.status === 'DISABLED') await this.assertDirectKeepsAKey(id);
    try {
      const row = await this.prisma.platformAiKey.update({
        where: { id },
        data,
        select: KEY_VIEW_SELECT,
      });
      this.forget();
      return toKeyView(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new AiSettingsError('KEY_NOT_FOUND');
      }
      throw error;
    }
  }

  /**
   * While the direct engine is chosen, the last active key cannot be disabled or deleted: the imports would all
   * fail. The Platform team switches to n8n first (that is always allowed).
   */
  private async assertDirectKeepsAKey(id: string): Promise<void> {
    if ((await this.getSettings()).engine !== 'DIRECT') return;
    const active = await this.prisma.platformAiKey.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    if (active.some((key) => key.id === id) && active.length === 1) {
      throw new AiSettingsError('KEYS_MISSING');
    }
  }

  /**
   * One key decrypted, ONLY so the console can test it against the provider. The value is used for that one
   * request and is never returned by an API.
   */
  async keyForTest(id: string): Promise<DecryptedAiKey> {
    const encryptionKey = this.encryptionKey();
    if (encryptionKey === null) {
      throw new AiSettingsError('ENCRYPTION_NOT_CONFIGURED');
    }
    const row = await this.prisma.platformAiKey.findUnique({
      where: { id },
      select: { id: true, label: true, secretEncrypted: true },
    });
    if (!row) throw new AiSettingsError('KEY_NOT_FOUND');
    try {
      return {
        id: row.id,
        label: row.label,
        value: decryptSecret(row.secretEncrypted, encryptionKey),
      };
    } catch {
      throw new AiSettingsError('KEY_UNREADABLE');
    }
  }

  async deleteKey(id: string): Promise<void> {
    await this.assertDirectKeepsAKey(id);
    const removed = await this.prisma.platformAiKey.deleteMany({
      where: { id },
    });
    if (removed.count === 0) throw new AiSettingsError('KEY_NOT_FOUND');
    this.forget();
  }

  /**
   * The usable keys, decrypted, for the extraction code ONLY (never for an API answer). Cached for a short time so
   * a change made in the console reaches the next import within seconds. A key that cannot be decrypted (the
   * encryption key changed, or the value was damaged) is skipped and reported by id, never by value.
   */
  async activeKeys(): Promise<DecryptedAiKey[]> {
    const encryptionKey = this.encryptionKey();
    if (encryptionKey === null) return [];
    const now = Date.now();
    if (this.cache && now - this.cache.at < KEYS_CACHE_MS) {
      return this.cache.keys;
    }
    const rows = await this.prisma.platformAiKey.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, label: true, secretEncrypted: true },
    });
    const keys: DecryptedAiKey[] = [];
    for (const row of rows) {
      try {
        keys.push({
          id: row.id,
          label: row.label,
          value: decryptSecret(row.secretEncrypted, encryptionKey),
        });
      } catch (error) {
        this.logger.warn(
          `ai key ${row.id} was skipped: ${error instanceof AiSecretError ? error.message : 'unreadable'}`,
        );
      }
    }
    this.cache = { at: now, keys };
    return keys;
  }
}
