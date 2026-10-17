import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';

export interface ExtractionInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  /** 'auto' | 'ar' | 'en' */
  languageHint: string;
}

/** The extraction service could not be reached or answered with something that is not JSON. */
export class ExtractorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractorUnavailableError';
  }
}

/**
 * Port to the menu extraction service (n8n). Kept abstract so the import can be
 * tested with a fake and so AI failure stays isolated (CLAUDE.md #43). The answer
 * is UNTRUSTED -- it goes through `normalizeExtraction` before anything is stored.
 */
export abstract class MenuImportExtractor {
  abstract isConfigured(): boolean;
  abstract extract(input: ExtractionInput): Promise<unknown>;
}

@Injectable()
export class N8nMenuImportExtractor extends MenuImportExtractor {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    super();
  }

  isConfigured(): boolean {
    return Boolean(this.config.get('N8N_MENU_IMPORT_URL', { infer: true }));
  }

  async extract(input: ExtractionInput): Promise<unknown> {
    const url = this.config.get('N8N_MENU_IMPORT_URL', { infer: true });
    const secret = this.config.get('N8N_MENU_IMPORT_SECRET', { infer: true });
    if (!url) throw new ExtractorUnavailableError('not configured');
    const timeoutMs =
      this.config.get('MENU_IMPORT_TIMEOUT_SECONDS', { infer: true }) * 1000;

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }),
      input.fileName,
    );
    form.append('languageHint', input.languageHint);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // No database transaction is open while this call runs (CLAUDE.md #48).
      const response = await fetch(url, {
        method: 'POST',
        // The secret is optional: without it the webhook must be protected another way.
        headers: secret ? { 'X-Service-Secret': secret } : {},
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ExtractorUnavailableError(`status ${response.status}`);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof ExtractorUnavailableError) throw error;
      throw new ExtractorUnavailableError(
        error instanceof Error ? error.name : 'unknown',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
