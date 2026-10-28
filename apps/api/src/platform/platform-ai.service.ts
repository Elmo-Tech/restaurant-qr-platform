import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiSettingsService,
  type AiKeyView,
  type AiSettingsPatch,
  type AiSettingsView,
} from '../ai-settings/ai-settings.service';
import type { EnvConfig } from '../config/env.schema';
import type { AiKeyStatus } from '../generated/prisma/client';
import { DEFAULT_CHAT_COMPLETIONS_URL } from '../menu-import/direct/gemini-menu-extractor';
import {
  classify,
  fetchTransport,
  type ModelTransport,
} from '../menu-import/direct/gemini-transport';
import { PlatformAuditService } from './platform-audit.service';
import type { PlatformAdminPrincipal } from './platform-auth.service';

export interface PlatformAiOverview {
  settings: AiSettingsView;
  keys: AiKeyView[];
}

/** What a key test found, in words the console can show. Never carries the key or the provider's raw answer. */
export type KeyTestResult =
  'OK' | 'LIMITED' | 'REJECTED' | 'UNAVAILABLE' | 'REQUEST_REFUSED';

export interface KeyTestView {
  result: KeyTestResult;
  model: string;
  /** The provider's HTTP status, when it answered at all. */
  httpStatus: number | null;
}

const TEST_TIMEOUT_MS = 20_000;

/**
 * The console's AI section (DEC-059): the Platform team reads and changes the engine, the model and the pool of
 * model keys, and every change is written to the platform audit log. Keys are never returned and never written to
 * the audit log (only a label and the last four characters).
 */
@Injectable()
export class PlatformAiService {
  /** Replaceable in tests, so no real provider is called. */
  transport: ModelTransport = fetchTransport;

  constructor(
    private readonly ai: AiSettingsService,
    private readonly audit: PlatformAuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async overview(): Promise<PlatformAiOverview> {
    const [settings, keys] = await Promise.all([
      this.ai.getSettings(),
      this.ai.listKeys(),
    ]);
    return { settings, keys };
  }

  async updateSettings(
    admin: PlatformAdminPrincipal,
    patch: AiSettingsPatch,
  ): Promise<AiSettingsView> {
    const before = await this.ai.getSettings();
    const after = await this.ai.updateSettings(patch);
    const changed: Record<string, { from: string | null; to: string | null }> =
      {};
    for (const field of ['engine', 'model', 'fallbackModel'] as const) {
      if (before[field] !== after[field]) {
        changed[field] = { from: before[field], to: after[field] };
      }
    }
    if (Object.keys(changed).length > 0) {
      await this.audit.record({
        admin,
        action: 'platform.ai_settings_updated',
        details: { changed },
      });
    }
    return after;
  }

  async addKey(
    admin: PlatformAdminPrincipal,
    input: { label: string; secret: string },
  ): Promise<AiKeyView> {
    const key = await this.ai.addKey(input);
    await this.audit.record({
      admin,
      action: 'platform.ai_key_added',
      details: { keyId: key.id, label: key.label, last4: key.last4 },
    });
    return key;
  }

  async updateKey(
    admin: PlatformAdminPrincipal,
    id: string,
    patch: { label?: string; status?: AiKeyStatus },
  ): Promise<AiKeyView> {
    const before = (await this.ai.listKeys()).find((key) => key.id === id);
    const after = await this.ai.updateKey(id, patch);
    const changed: Record<string, { from: string; to: string }> = {};
    if (before && before.label !== after.label) {
      changed.label = { from: before.label, to: after.label };
    }
    if (before && before.status !== after.status) {
      changed.status = { from: before.status, to: after.status };
    }
    if (Object.keys(changed).length > 0) {
      await this.audit.record({
        admin,
        action: 'platform.ai_key_updated',
        details: { keyId: after.id, last4: after.last4, changed },
      });
    }
    return after;
  }

  async deleteKey(admin: PlatformAdminPrincipal, id: string): Promise<void> {
    const before = (await this.ai.listKeys()).find((key) => key.id === id);
    await this.ai.deleteKey(id);
    await this.audit.record({
      admin,
      action: 'platform.ai_key_deleted',
      details: {
        keyId: id,
        label: before?.label ?? '',
        last4: before?.last4 ?? '',
      },
    });
  }

  /** One tiny request with this key and the chosen model: tells the team whether the key works before an import does. */
  async testKey(id: string): Promise<KeyTestView> {
    const key = await this.ai.keyForTest(id);
    const { model } = await this.ai.getSettings();
    const response = await this.transport({
      url:
        this.config.get('AI_CHAT_COMPLETIONS_URL', { infer: true }) ??
        DEFAULT_CHAT_COMPLETIONS_URL,
      apiKey: key.value,
      timeoutMs: TEST_TIMEOUT_MS,
      body: {
        model,
        max_tokens: 16,
        reasoning_effort: 'low',
        messages: [{ role: 'user', content: 'Reply with the word ok.' }],
      },
    });
    const outcome = classify(response);
    const httpStatus = response.status === 0 ? null : response.status;
    switch (outcome.kind) {
      case 'ok':
        return { result: 'OK', model, httpStatus };
      case 'limited':
        return { result: 'LIMITED', model, httpStatus };
      case 'badKey':
        return { result: 'REJECTED', model, httpStatus };
      case 'transient':
        return { result: 'UNAVAILABLE', model, httpStatus };
      case 'fatal':
        return { result: 'REQUEST_REFUSED', model, httpStatus };
    }
  }
}
