// Disposable, localhost-only Nginx probe. Tokens are inert markers, never working Demo links.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

const root = new URL('../../', import.meta.url);
const imageFile = readFileSync(new URL('infra/docker/Dockerfile.gateway', root), 'utf8');
const [, image] = /^FROM (\S+)/m.exec(imageFile);
const [, filter] = /^ENV NGINX_ENVSUBST_FILTER='([^']+)'/m.exec(imageFile);
const [, src, dest] = /^COPY (\S+) (\S+)/m.exec(imageFile);
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const session = 'wayta-demo-redaction-' + randomUUID().slice(0, 8);
const service = session + '-upstream';
const web = 'menu.qa.example.test';
const platform = 'control.qa.example.test';
const marker = 'qa-inert-' + randomUUID().replaceAll('-', '');
const refererMarker = 'qa-inert-referer-' + randomUUID().replaceAll('-', '');
let sequence = 0;

const upstream = [
  "const http = require('node:http');",
  "const handler = (req,res) => {",
  "  if (req.url.includes('fail=1')) {req.socket.destroy();return;}",
  "  res.statusCode=200;res.end('ok');",
  "};",
  "for (const p of [3000,3001,4000]) http.createServer(handler).listen(p,'0.0.0.0');",
].join('\n');

try {
  const config = readFileSync(new URL('apps/web/next.config.ts', root), 'utf8');
  assert.match(config, /source:\s*"\/demo\/:token"[\s\S]{0,100}Referrer-Policy",\s*value:\s*"no-referrer"/,
    'Demo page must override the generic same-origin referrer policy');

  docker('network', 'create', session);
  docker('run', '--pull=never', '-d', '--name', service, '--network', session,
    '--network-alias', 'web', '--network-alias', 'platform', '--network-alias', 'api',
    'node:24.15.0-alpine', 'node', '-e', upstream);
  docker('run', '--pull=never', '-d', '--name', session, '--network', session,
    '-p', '127.0.0.1::8080', '-e', 'WEB_HOST=' + web, '-e', 'PLATFORM_HOST=' + platform,
    '-e', 'RESTAURANT_WILDCARD_HOST=*.qa.example.test',
    '-e', 'NGINX_ENVSUBST_FILTER=' + filter,
    '-v', fileURLToPath(new URL(src, root)) + ':' + dest + ':ro', image);

  const address = 'http://' + docker('port', session, '8080/tcp');
  let ready = false;
  for (let n = 0; n < 40; n++) {
    if ((await fetch(address + '/gateway-health').catch(() => null))?.ok) {ready = true;break;}
    await pause(250);
  }
  assert.ok(ready, 'Nginx gateway did not start');
  docker('exec', session, 'nginx', '-t');

  const hit = (host, path, referer) => new Promise((resolve, reject) => {
    const id = 'safe-qa-' + ++sequence;
    const options = { method: 'GET', headers: { Host: host, 'X-Request-Id': id } };
    if (referer) options.headers.Referer = referer;
    const req = request(address + path, options, (res) => {
      res.resume();
      res.on('end', () => resolve({ id, status: res.statusCode }));
      res.on('error', reject);
    });
    req.on('error', (err) => {
      if (err.code === 'ECONNRESET') resolve({ id, status: 444 });
      else reject(err);
    });
    req.end();
  });

  const cases = [
    ['web document', web, '/demo/' + marker, 200],
    ['web upstream error', web, '/demo/' + marker + '?fail=1', 502],
    ['wildcard upstream error', 'r1.qa.example.test', '/demo/' + marker + '?fail=1', 502],
    ['platform document', platform, '/demo/' + marker, 200],
    ['platform upstream error', platform, '/demo/' + marker + '?fail=1', 502],
    ['legacy web redirect', 'wayta.elmotechsoft.online', '/demo/' + marker, 308],
    ['legacy platform redirect', 'wayta-control.elmotechsoft.online', '/demo/' + marker, 308],
    ['unknown host', 'unknown.invalid', '/demo/' + marker, 444],
    ['encoded demo segment', web, '/de%6do/' + marker, 200],
    ['ordinary control', web, '/demo-credits', 200],
    ['regular request Referer control', web, '/ordinary', 200],
    ['non-demo upstream error', web, '/unrelated-502?fail=1', 502],
  ];
  const ids = [];
  for (const [name, host, path, expected] of cases) {
    // A synthetic Referer verifies inherited nginx main logging is disabled.
    const referer = name === 'regular request Referer control'
      ? 'https://' + web + '/demo/' + refererMarker : undefined;
    const response = await hit(host, path, referer);
    assert.equal(response.status, expected, name + ' returned unexpected status');
    ids.push(response.id);
  }
  // docker logs emits Nginx access to stdout and Nginx error details to stderr.
  // Both streams must be inspected: dropping stderr would miss the 502 leak.
  const getLogs = () => {
    const result = spawnSync('docker', ['logs', session], { encoding: 'utf8' });
    assert.equal(result.status, 0, 'cannot retrieve disposable gateway logs');
    return result.stdout + '\n' + result.stderr;
  };
  let logs = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    logs = getLogs();
    if (logs.includes('req=' + ids.at(-1))) break;
    await pause(100);
  }
  assert.ok(!logs.includes(marker), 'Demo capability marker leaked into Nginx logs');
  assert.ok(!logs.includes(refererMarker), 'Demo Referer marker leaked into Nginx logs');
  for (const id of ids) {
    assert.equal(logs.split('req=' + id).length - 1, 1,
      'duplicate inherited main access log or missing request correlation: ' + id);
  }
  assert.ok(logs.includes('/demo/[redacted]'), 'Expected a redacted request path');
  assert.ok(logs.includes('/demo-credits'), 'Normal path must remain observable');
  assert.ok(logs.includes('/unrelated-502'), 'Unrelated upstream failures must remain observable');
  console.log('PASS: ' + cases.length + ' inert requests redacted, exactly one safe access event each; ordinary diagnostics retained.');
} finally {
  for (const name of [session, service]) {
    try { docker('rm', '-f', name); } catch { /* not created */ }
  }
  try { docker('network', 'rm', session); } catch { /* not created */ }
}
