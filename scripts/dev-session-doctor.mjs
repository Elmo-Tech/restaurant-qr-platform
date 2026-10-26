/**
 * Safe local read-only diagnosis: Next SSR -> API -> auth/DB.
 * No cookies or credentials are sent, and no secret .env keys are printed.
 * An unauthenticated /auth/me probe MUST return HTTP 401 when healthy.
 * Run from the repository root: npm run dev:doctor
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let localEnv = '';
try { localEnv = readFileSync(path.join(repoRoot, '.env'), 'utf8'); }
catch {
  console.error('ERROR: repository root .env does not exist.');
  process.exitCode = 1;
}

function setting(key, fallback = '') {
  if (process.env[key]) return process.env[key].trim();
  const line = localEnv.split(/\r?\n/).find(row => new RegExp('^\\s*' + key + '\\s*=').test(row));
  if (!line) return fallback;
  const raw = line.slice(line.indexOf('=') + 1).trim().replace(/\s+#.*$/, '').trim();
  return raw.replace(/^["']|["']$/g, '') || fallback;
}
function safeOrigin(raw) {
  if (!raw) return '(not set)';
  try {
    const url = new URL(raw);
    return url.origin; // never print userinfo, query strings, or credentials
  } catch { return '(invalid URL)'; }
}
function isLocal(host) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
}

const apiPort = Number(setting('API_PORT', '4000'));
const apiPrefix = '/' + setting('NEXT_PUBLIC_API_BASE_PATH', '/api/v1').replace(/^\/+|\/+$/g, '');
const browserApi = setting('NEXT_PUBLIC_API_URL');
const internalApi = setting('API_INTERNAL_URL');
const corsOrigin = setting('CORS_ORIGIN');

console.log('\nWayta - read-only local session diagnostics');
console.log('Configured API_PORT:', Number.isInteger(apiPort) ? apiPort : '(invalid)');
console.log('NEXT_PUBLIC_API_URL:', safeOrigin(browserApi));
console.log('API_INTERNAL_URL:', internalApi ? safeOrigin(internalApi) + ' (overrides SSR)' : '(not set; SSR uses NEXT_PUBLIC_API_URL)');
console.log('NEXT_PUBLIC_API_BASE_PATH:', apiPrefix);
console.log('CORS_ORIGIN:', safeOrigin(corsOrigin));
let misconfigured = false;
for (const [name, raw] of [['NEXT_PUBLIC_API_URL', browserApi], ['API_INTERNAL_URL', internalApi]]) {
  if (!raw) {
    if (name === 'NEXT_PUBLIC_API_URL') {
      console.error('ERROR: NEXT_PUBLIC_API_URL must be set.');
      misconfigured = true;
    }
    continue;
  }
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw Error('Wrong protocol');
    if (isLocal(url.hostname) && url.port !== String(apiPort)) {
      console.error('ERROR: ' + name + ' points to port ' + (url.port || '(default)') +
        ', but API_PORT is ' + apiPort + '. These must match for native local dev.');
      misconfigured = true;
    }
    if (name === 'API_INTERNAL_URL' && !isLocal(url.hostname)) {
      console.warn('NOTE: non-local API_INTERNAL_URL overrides SSR. Remove it if running natively in Windows (not Docker).');
    }
  } catch {
    console.error('ERROR: ' + name + ' must be a valid http(s) URL.');
    misconfigured = true;
  }
}

async function probe(base, suffix, expectedStatus) {
  let address;
  try { address = new URL(suffix, base.replace(/\/+$/, '') + '/'); }
  catch {
    console.error('FAIL: invalid probe URL configuration.');
    return null;
  }
  const target = address.origin + address.pathname;
  try {
    const response = await fetch(address, {
      method: 'GET', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(5000),
    });
    console.log((response.status === expectedStatus ? 'OK   ' : 'CHECK') +
      ' ' + target + ' -> HTTP ' + response.status + ' (expected ' + expectedStatus + ')');
    return response.status;
  } catch (error) {
    console.log('FAIL ' + target + ' -> ' + (error?.cause?.code ?? error?.name ?? 'connection failed'));
    return null;
  }
}

if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
  console.error('ERROR: invalid API_PORT.');
  process.exitCode = 1;
} else {
  const local = 'http://127.0.0.1:' + apiPort;
  console.log('\nDirect backend checks from Node.js (no cookies sent):');
  const health = await probe(local, '/health', 200);
  const readiness = await probe(local, '/ready', 200);
  const auth = await probe(local, apiPrefix + '/auth/me', 401);
  if (health !== 200) {
    console.error('NEXT: API port is closed or responding with the wrong service. Inspect the API terminal and port.');
    process.exitCode = 1;
  } else if (readiness !== 200) {
    console.error('NEXT: API is alive but PostgreSQL is not ready. Inspect the database and API logs.');
    process.exitCode = 1;
  } else if (auth !== 401) {
    console.error('NEXT: /auth/me failed even without cookies. Check API/auth service logs for 5xx, 404 or 429.');
    process.exitCode = 1;
  }

  const nextTarget = internalApi || browserApi;
  if (nextTarget) {
    console.log('\nNext.js server-side route from Node.js (no cookies sent):');
    const reached = await probe(nextTarget, apiPrefix + '/auth/me', 401);
    if (reached !== 401) {
      console.error('NEXT: Next.js server cannot reach the expected API endpoint. Check port, localhost/IPv6, API_INTERNAL_URL and prefix.');
      process.exitCode = 1;
    }
  }
}
if (misconfigured) process.exitCode = 1;
console.log('\nHTTP 401 from /auth/me is SUCCESSFUL for this diagnostic (it deliberately sends no session cookie).');
console.log('If both auth probes are 401 but /staff still fails, inspect API server logs with the real session and restart the Next.js process.\n');
