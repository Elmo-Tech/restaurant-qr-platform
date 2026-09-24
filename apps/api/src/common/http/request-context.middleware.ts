import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * An incoming request id is only trusted if it is a short, boring token
 * (letters, digits, `.`, `_`, `-`; 8-64 chars) -- it ends up in logs and in a
 * response header, so anything else (spaces, newlines, control characters,
 * very long values) is discarded and a fresh UUID is generated instead.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/**
 * The route to log: the matched route PATTERN (`/api/v1/public/qr/:publicCode/orders`)
 * when Express resolved one -- never the concrete URL, so path parameters
 * (QR public codes, ids) and the query string do not end up in logs. An
 * unmatched request logs only the fixed label `unmatched`.
 */
export function routeLabel(req: Request): string {
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  return typeof routePath === 'string' ? `${req.baseUrl}${routePath}` : 'unmatched';
}

const logger = new Logger('HTTP');

/**
 * FT-9: minimal request correlation. Attaches a request id (accepted only
 * if safe, else generated), returns it as `X-Request-Id`, and logs ONE line
 * per finished request: method, route pattern, status, duration, request id.
 * It reads no cookie, no `Authorization` header, and no request/response
 * body, so credentials and customer data (address, phone, notes) can never
 * reach the log through this path.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
  res.setHeader('X-Request-Id', requestId);
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
    logger.log(
      `${req.method} ${routeLabel(req)} ${res.statusCode} ${durationMs}ms requestId=${requestId}`,
    );
  });

  next();
}
