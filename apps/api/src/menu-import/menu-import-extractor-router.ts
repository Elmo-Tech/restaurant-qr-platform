import { Injectable, Logger } from '@nestjs/common';
import { AiSettingsService } from '../ai-settings/ai-settings.service';
import { GeminiMenuExtractor } from './direct/gemini-menu-extractor';
import {
  MenuImportExtractor,
  N8nMenuImportExtractor,
  type ExtractionInput,
} from './menu-import-extractor';

/**
 * Chooses the engine that reads a menu (DEC-059): the n8n webhook (the default and what Menu Import did before) or
 * the Backend calling the model itself. The Platform team switches it in the console, so no deployment is needed
 * to go either way. If the setting cannot be read at all, the import keeps using n8n instead of failing.
 */
@Injectable()
export class MenuImportExtractorRouter extends MenuImportExtractor {
  private readonly logger = new Logger(MenuImportExtractorRouter.name);

  constructor(
    private readonly n8n: N8nMenuImportExtractor,
    private readonly direct: GeminiMenuExtractor,
    private readonly ai: AiSettingsService,
  ) {
    super();
  }

  private async useDirect(): Promise<boolean> {
    try {
      return (await this.ai.getSettings()).engine === 'DIRECT';
    } catch {
      this.logger.warn('the AI settings could not be read: using n8n');
      return false;
    }
  }

  /** Whether the chosen engine can work right now (n8n has a URL, or the direct engine has encryption and a key). */
  async isConfigured(): Promise<boolean> {
    if (!(await this.useDirect())) return this.n8n.isConfigured();
    if (!this.ai.isEncryptionConfigured()) return false;
    return (await this.ai.getSettings()).activeKeyCount > 0;
  }

  async extract(input: ExtractionInput): Promise<unknown> {
    return (await this.useDirect())
      ? this.direct.extract(input)
      : this.n8n.extract(input);
  }
}
