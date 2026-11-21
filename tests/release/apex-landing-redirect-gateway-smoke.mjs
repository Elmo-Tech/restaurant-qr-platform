#!/usr/bin/env node
// Runtime check of the apex homepage -> landing redirect on real nginx built from the gateway
// definition (infra/docker/Dockerfile.gateway: its base image, its NGINX_ENVSUBST_FILTER and the
// template mounted where the Dockerfile copies it), using production host values and stub upstreams
// that echo which service (web / api / platform) received the request. Requires a local
// Docker daemon; touches no live host, DNS, TLS, Coolify or database.
//
//   node tests/release/apex-landing-redirect-gateway-smoke.mjs [results.json]
import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const id = randomBytes(4).toString('hex');
const net = `wayta-apex-qa-${id}`;
const stub = `wayta-apex-qa-stub-${id}`;
const gateways = { prod: { name: `wayta-apex-qa-gw-prod-${id}`, port: 18080 }, dev: { name: `wayta-apex-qa-gw-dev-${id}`, port: 18081 } };
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
// Mirror Dockerfile.gateway without `docker build` (no builder state needed): same FROM, ENV and COPY target.
const dockerfile = readFileSync(`${repoRoot}infra/docker/Dockerfile.gateway`, 'utf8');
const baseImage = /^FROM (\S+)/m.exec(dockerfile)[1];
const envsubstFilter = /^ENV NGINX_ENVSUBST_FILTER='([^']+)'/m.exec(dockerfile)[1];
const [, templateSrc, templateDst] = /^COPY (\S+) (\S+)/m.exec(dockerfile);
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const STUB_CONF = `
server { listen 3000; location / { default_type text/plain; return 200 "upstream=web host=$host uri=$request_uri\\n"; } }
server { listen 3001; location / { default_type text/plain; return 200 "upstream=platform host=$host uri=$request_uri\\n"; } }
server { listen 4000; location / { default_type text/plain; return 200 "upstream=api host=$host uri=$request_uri\\n"; } }
`;

const LANDING = 'https://landing.waytaapp.com/';
const web = { status: 200, upstream: 'web' };
const api = { status: 200, upstream: 'api' };
const redirect = (location = LANDING) => ({ status: 302, location });

// [gateway, host, path, expectation, note]
const cases = [
  ['prod', 'waytaapp.com', '/', redirect(), 'apex root'],
  ['prod', 'WaytaApp.com', '/', redirect(), 'host is case-insensitive'],
  ['prod', 'waytaapp.com.', '/', redirect(), 'trailing-dot FQDN'],
  ['prod', 'waytaapp.com:443', '/', redirect(), 'explicit port'],
  ['prod', 'waytaapp.com', '/?utm_source=instagram&utm_campaign=launch', redirect(`${LANDING}?utm_source=instagram&utm_campaign=launch`), 'UTM-only query kept'],
  ['prod', 'waytaapp.com', '/?utm_source=x&token=secret', redirect(), 'mixed query dropped entirely'],
  ['prod', 'waytaapp.com', '/?token=secret', redirect(), 'non-UTM query dropped'],
  ['prod', 'waytaapp.com', '/?next=%2Fstaff', redirect(), 'next= dropped'],
  ['prod', 'waytaapp.com', '/staff', web, ''],
  ['prod', 'waytaapp.com', '/staff/restaurants/00000000-0000-0000-0000-000000000000/settings/profile', web, ''],
  ['prod', 'waytaapp.com', '/login', web, ''],
  ['prod', 'waytaapp.com', '/forgot-password', web, ''],
  ['prod', 'waytaapp.com', '/reset-password?token=qa-not-a-real-token', web, ''],
  ['prod', 'waytaapp.com', '/q/test-code', web, ''],
  ['prod', 'waytaapp.com', '/demo/start', web, ''],
  ['prod', 'waytaapp.com', '/_next/static/chunks/main.js', web, ''],
  ['prod', 'waytaapp.com', '/share-card', web, ''],
  ['prod', 'waytaapp.com', '/robots.txt', web, ''],
  ['prod', 'waytaapp.com', '/index.html', web, 'not the exact root'],
  ['prod', 'waytaapp.com', '//', redirect(), 'nginx merge_slashes normalizes // to the homepage'],
  ['prod', 'waytaapp.com', '/api/v1/auth/me', api, ''],
  ['prod', 'waytaapp.com', '/api/v1/public/qr/test-code', api, ''],
  ['prod', 'waytaapp.com', '/api/v1/platform/overview', { status: 404 }, 'platform API stays blocked on apex'],
  ['prod', 'waytaapp.com', '/api/v1/whatsapp-tracking/webhook/qa', api, ''],
  ['prod', 'waytaapp.com', '/media/products/qa.webp', api, ''],
  ['prod', 'waytaapp.com', '/socket.io/?EIO=4&transport=polling', api, ''],
  ['prod', 'control.waytaapp.com', '/', { status: 200, upstream: 'platform' }, 'platform console root'],
  ['prod', 'cafe-qa.waytaapp.com', '/', web, 'restaurant subdomain root -> Next (rewritten to /q/<slug> there)'],
  ['prod', 'cafe-qa.waytaapp.com', '/api/v1/auth/me', { status: 404 }, 'tenant host API isolation unchanged'],
  ['prod', 'landing.waytaapp.com', '/', web, 'if ever routed here: no self-redirect / loop'],
  ['prod', 'www.waytaapp.com', '/', web, 'www not redirected by this change'],
  ['prod', 'wayta.elmotechsoft.online', '/', { status: 308, location: 'https://waytaapp.com/' }, 'legacy host unchanged'],
  ['prod', 'wayta.elmotechsoft.online', '/q/test-code', { status: 308, location: 'https://waytaapp.com/q/test-code' }, 'legacy QR unchanged'],
  ['prod', 'wayta.elmotechsoft.online', '/api/v1/whatsapp-tracking/webhook/qa', api, 'legacy webhook still proxied'],
  ['prod', 'wayta-control.elmotechsoft.online', '/', { status: 308, location: 'https://control.waytaapp.com/' }, 'legacy control unchanged'],
  ['prod', 'localhost', '/', { status: 444 }, 'unknown host: connection closed, as before'],
  ['prod', 'evil.example', '/', { status: 444 }, 'unknown host: connection closed, as before'],
  ['dev', 'wayta-dev.example.com', '/', web, 'non-production WEB_HOST root is NOT redirected'],
  ['dev', 'waytaapp.com', '/', { status: 444 }, 'dev gateway does not serve the prod apex'],
];

function send(port, method, host, path) {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host, 'x-forwarded-proto': 'https' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode, location: res.headers.location ?? null, hsts: res.headers['strict-transport-security'] ?? null, cacheControl: res.headers['cache-control'] ?? null, upstream: /upstream=(\w+)/.exec(body)?.[1] ?? null }),
      );
    });
    req.on('error', () => resolve({ status: 444, location: null, hsts: null, cacheControl: null, upstream: null })); // nginx 444 closes without a response
    req.setTimeout(5000, () => req.destroy());
    req.end();
  });
}

async function waitFor(port) {
  for (let i = 0; i < 50; i++) {
    const r = await send(port, 'GET', 'gateway', '/gateway-health');
    if (r.status === 200) return;
    await new Promise((ok) => setTimeout(ok, 200));
  }
  throw new Error(`gateway on ${port} did not become healthy`);
}

const results = [];
let failed = 0;
try {
  docker('network', 'create', net);
  docker('run', '-d', '--name', stub, '--network', net, '--network-alias', 'web', '--network-alias', 'api', '--network-alias', 'platform',
    baseImage, 'sh', '-c', `printf '%s' '${STUB_CONF}' > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'`);
  const env = {
    prod: ['-e', 'WEB_HOST=waytaapp.com', '-e', 'PLATFORM_HOST=control.waytaapp.com', '-e', 'RESTAURANT_WILDCARD_HOST=*.waytaapp.com'],
    dev: ['-e', 'WEB_HOST=wayta-dev.example.com', '-e', 'PLATFORM_HOST=wayta-control-dev.example.com'],
  };
  for (const [key, gw] of Object.entries(gateways)) {
    docker('run', '-d', '--name', gw.name, '--network', net, '-p', `127.0.0.1:${gw.port}:8080`, ...env[key], '-e', `NGINX_ENVSUBST_FILTER=${envsubstFilter}`,
      '-v', `${repoRoot}${templateSrc}:${templateDst}:ro`, baseImage);
    await waitFor(gw.port);
    // `nginx -t` against the rendered template inside the running container.
    const syntax = execFileSync('docker', ['exec', gw.name, 'nginx', '-t'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    results.push({ check: `nginx -t (${key})`, ok: true, output: syntax.trim() || 'syntax is ok' });
  }
  for (const [gw, host, path, expected, note] of cases) {
    for (const method of ['GET', 'HEAD']) {
      const observed = await send(gateways[gw].port, method, host, path);
      const ok = observed.status === expected.status &&
        (!('location' in expected) || observed.location === expected.location) &&
        (!('upstream' in expected) || method === 'HEAD' || observed.upstream === expected.upstream);
      if (!ok) failed++;
      results.push({ gateway: gw, method, host, path, note, expected, observed, ok });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${gw} ${method.padEnd(4)} ${host}${path} -> ${observed.status}${observed.location ? ' ' + observed.location : ''}${observed.upstream ? ' [' + observed.upstream + ']' : ''}`);
    }
  }
  // HTTPS expectations on the redirect itself: HSTS still sent (shared add_header), no caching header.
  const r = await send(gateways.prod.port, 'GET', 'waytaapp.com', '/');
  const httpsOk = r.hsts === 'max-age=31536000; includeSubDomains' && r.cacheControl === null && r.location.startsWith('https://');
  if (!httpsOk) failed++;
  results.push({ check: 'redirect keeps HSTS, https Location, no Cache-Control', ok: httpsOk, observed: r });
  console.log(`${httpsOk ? 'PASS' : 'FAIL'} redirect headers: HSTS=${r.hsts} Cache-Control=${r.cacheControl}`);
} finally {
  for (const name of [gateways.prod.name, gateways.dev.name, stub]) {
    try { docker('rm', '-f', name); } catch { /* not started */ }
  }
  try { docker('network', 'rm', net); } catch { /* not created */ }
}

if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll gateway checks passed.');
process.exit(failed ? 1 : 0);
