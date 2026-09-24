import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../database/prisma.service';

/** Never rate-limited: load balancers and uptime monitors poll these. */
const SKIP_ALL_THROTTLES = { default: true, login: true, publicOrder: true };

/** Readiness gives up on the DB probe after this long -- a hung database must read as "not ready", not hang the probe. */
const READINESS_TIMEOUT_MS = 2000;

/**
 * FT-9: operability probes, mounted OUTSIDE the `/api/v1` prefix
 * (`GET /health`, `GET /ready` -- see `main.ts`), unauthenticated, and
 * deliberately minimal: no version, no DB URL, no internal topology, no error
 * detail. Health = the process is alive. Ready = PostgreSQL is actually
 * reachable right now (a trivial `SELECT 1`); a failure is a bare 503.
 */
@Controller()
@SkipThrottle(SKIP_ALL_THROTTLES)
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ready' }> {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('timeout')), READINESS_TIMEOUT_MS).unref();
        }),
      ]);
      return { status: 'ready' };
    } catch {
      // Intentionally no cause in the response or the body -- never leak infrastructure detail.
      throw new HttpException({ status: 'unavailable' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
