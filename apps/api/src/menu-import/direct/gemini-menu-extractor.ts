import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiSettingsService } from '../../ai-settings/ai-settings.service';
import type { EnvConfig } from '../../config/env.schema';
import {
  ExtractorUnavailableError,
  type ExtractionInput,
} from '../menu-import-extractor';
import { KeyPool } from './gemini-key-pool';
import {
  engineLimits,
  GeminiMenuEngine,
  type EngineConfig,
} from './gemini-menu-engine';
import { fetchTransport } from './gemini-transport';
import { systemPromptFor } from './menu-extraction-prompt';
import { mergePages } from './menu-model-output';
import { prepareWork } from './menu-work-items';

/** Gemini's OpenAI-compatible chat endpoint. `AI_CHAT_COMPLETIONS_URL` replaces it (a test server, another provider). */
export const DEFAULT_CHAT_COMPLETIONS_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MAX_OUTPUT_TOKENS = 32000;
const REASONING_EFFORT = 'low';

/**
 * Menu Import, DIRECT engine (DEC-059): the Backend itself asks the model to read the menu, with the keys and
 * model the Platform team set in the console. The answer is UNTRUSTED and still goes through `normalizeExtraction`
 * like the n8n engine's. No database transaction is open while the model is called.
 */
@Injectable()
export class GeminiMenuExtractor {
  private readonly logger = new Logger(GeminiMenuExtractor.name);
  // Which keys are resting lives for the whole process, so one import's 429 protects the next one.
  private readonly pool = new KeyPool();

  constructor(
    private readonly ai: AiSettingsService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async extract(input: ExtractionInput): Promise<unknown> {
    const keys = await this.ai.activeKeys();
    if (keys.length === 0) {
      throw new ExtractorUnavailableError('no usable model key');
    }
    const settings = await this.ai.getSettings();

    const work = await prepareWork(input);
    if (!work.ok) {
      return {
        schemaVersion: 1,
        status: 'FAILED',
        errorCode: work.code,
        model: settings.model,
      };
    }

    const timeoutSeconds = this.config.get('MENU_IMPORT_TIMEOUT_SECONDS', {
      infer: true,
    });
    const config: EngineConfig = {
      apiUrl:
        this.config.get('AI_CHAT_COMPLETIONS_URL', { infer: true }) ??
        DEFAULT_CHAT_COMPLETIONS_URL,
      model: settings.model,
      fallbackModel: settings.fallbackModel,
      systemPrompt: systemPromptFor(input.languageHint),
      reasoningEffort: REASONING_EFFORT,
      maxTokens: MAX_OUTPUT_TOKENS,
      ...engineLimits(timeoutSeconds),
    };

    const engine = new GeminiMenuEngine({
      transport: fetchTransport,
      pool: this.pool,
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      log: (message) => this.logger.warn(message),
    });
    const pages = await engine.run(work.items, keys, config);
    this.logger.log(
      `read ${pages.length} request(s) with ${keys.length} key(s): ${pages.filter((p) => p.ok).length} answered`,
    );
    return mergePages(pages, settings.model);
  }
}
