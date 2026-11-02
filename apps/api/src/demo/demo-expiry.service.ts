import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { DemoService } from './demo.service';

/**
 * Locks demos that have ended and removes them after the grace period (DEC-060). Runs inside the API process like the
 * subscription sync (no scheduler dependency). Safe with several instances: a lock demo is a no-op the second time and
 * the purge takes a database advisory lock.
 */
@Injectable()
export class DemoExpiryService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DemoExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    private readonly demos: DemoService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  onApplicationBootstrap(): void {
    // Not during tests: the e2e suites boot the whole app and must not have a background deleter.
    if (process.env.NODE_ENV === 'test') return;
    const every = this.config.get('DEMO_SWEEP_SECONDS', { infer: true }) * 1000;
    void this.run();
    this.timer = setInterval(() => void this.run(), every);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const { locked, removed } = await this.demos.sweep();
      if (locked > 0 || removed > 0) {
        this.logger.log(`Demo sweep: ${locked} locked, ${removed} removed`);
      }
    } catch (error) {
      this.logger.error(
        `Demo sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.sweeping = false;
    }
  }
}
