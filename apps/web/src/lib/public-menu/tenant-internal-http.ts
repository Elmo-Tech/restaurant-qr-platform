import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const MAX_PUBLIC_MENU_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * Node/Undici fetch silently replaces a caller-specified Host with the URL
 * hostname (e.g. "api:4000"). The Nest tenant guard MUST see the verified
 * visitor hostname even when Next calls the private Docker API. Node's native
 * http.request honors an explicit Host header and keeps this call internal.
 *
 * Never pass unvalidated user Host or cookies: callers construct tenantHost
 * only via restaurantSlugFromHost() and the configured base domain.
 */
export function fetchTenantPublicMenuWithHost(
  url: string,
  tenantHost: string,
  safeHeaders: Record<string, string>,
): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return Promise.reject(new Error('Unsupported internal public menu API protocol'));
  }
  if (
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(tenantHost) ||
    tenantHost.length > 253 ||
    target.username ||
    target.password
  ) {
    return Promise.reject(new Error('Invalid internal public menu request'));
  }

  return new Promise<Response>((resolve, reject) => {
    const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
      target,
      {
        method: 'GET',
        timeout: UPSTREAM_TIMEOUT_MS,
        headers: {
          ...safeHeaders,
          Host: tenantHost,
          Accept: 'application/json',
        },
      },
      (upstream) => {
        const parts: Buffer[] = [];
        let bytes = 0;
        upstream.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_PUBLIC_MENU_BYTES) {
            upstream.destroy(new Error('Public menu response exceeded size limit'));
            return;
          }
          parts.push(chunk);
        });
        upstream.on('end', () => {
          const status = upstream.statusCode ?? 502;
          if (status < 200 || status > 599) {
            reject(new Error('Unexpected public menu response status'));
            return;
          }
          const body = [204, 205, 304].includes(status) ? null : Buffer.concat(parts);
          resolve(new Response(body, {
            status,
            headers: { 'Content-Type': 'application/json' },
          }));
        });
        upstream.on('aborted', () => reject(new Error('Public menu response aborted')));
        upstream.on('error', reject);
      },
    );
    request.on('timeout', () => request.destroy(new Error('Internal public menu request timed out')));
    request.on('error', reject);
    request.end();
  });
}
