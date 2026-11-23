// Local-only rendered gateway: same base image, environment filter and template as its Dockerfile.
// The upstream counts the bytes it actually received; it does not validate files or run extraction.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = new URL('../../', import.meta.url);
const dockerfile = readFileSync(new URL('infra/docker/Dockerfile.gateway', root), 'utf8');
const [, image] = /^FROM (\S+)/m.exec(dockerfile);
const [, filter] = /^ENV NGINX_ENVSUBST_FILTER='([^']+)'/m.exec(dockerfile);
const [, source, target] = /^COPY (\S+) (\S+)/m.exec(dockerfile);
const name = `wayta-a4-gateway-${randomUUID().slice(0, 8)}`;
const stub = `${name}-api`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const host = 'control.a4.example.test';
const path = '/api/v1/platform/onboarding-cases/00000000-0000-4000-8000-000000000000/menu-import';
const mib = 1024 ** 2;
const boundary = 'onboarding-a4-local-test';
const contentType = `multipart/form-data; boundary=${boundary}`;
const multipart = (sizes) => Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="revision"\r\n\r\n1\r\n`),
  ...sizes.flatMap((size, i) => [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="menu-${i}.png"\r\nContent-Type: image/png\r\n\r\n`),
    Buffer.alloc(size), Buffer.from('\r\n'),
  ]),
  Buffer.from(`--${boundary}--\r\n`),
]);
const upstream = `
  require('node:http').createServer(async (req, res) => {
    let bytes = 0;
    for await (const chunk of req) bytes += chunk.length;
    await new Promise(done => setTimeout(done, Number(req.headers['x-test-delay-ms'] || 0)));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ bytes }));
  }).listen(4000, '0.0.0.0');
`;

try {
  docker('network', 'create', name);
  docker('run', '--pull=never', '-d', '--name', stub, '--network', name, '--network-alias', 'api',
    'node:24.15.0-alpine', 'node', '-e', upstream);
  docker('run', '--pull=never', '-d', '--name', name, '--network', name, '-p', '127.0.0.1::8080',
    '-e', 'WEB_HOST=a4.example.test', '-e', `PLATFORM_HOST=${host}`, '-e', 'RESTAURANT_WILDCARD_HOST=*.a4.example.test',
    '-e', `NGINX_ENVSUBST_FILTER=${filter}`, '-v', `${fileURLToPath(new URL(source, root))}:${target}:ro`, image);
  const base = `http://${docker('port', name, '8080/tcp')}`;
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    ready = (await fetch(`${base}/gateway-health`).catch(() => null))?.ok ?? false;
    if (!ready) await delay(250);
  }
  assert.ok(ready, 'local gateway healthy');
  docker('exec', name, 'nginx', '-t');
  // Native HTTP keeps the virtual Host; Expect also captures 413 without racing an early socket close.
  const post = (body, wait = 0, targetPath = path) => new Promise((resolve, reject) => {
    const req = request(`${base}${targetPath}`, {
      method: 'POST',
      headers: { host, 'content-type': contentType, 'content-length': body.length,
        expect: '100-continue', 'x-test-delay-ms': String(wait) },
      signal: AbortSignal.timeout(135_000),
    }, async (res) => {
      try {
        const chunks = [];
        for await (const chunk of res) chunks.push(chunk);
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() });
      } catch (error) { reject(error); }
    });
    req.on('error', reject);
    req.on('continue', () => req.end(body));
    req.flushHeaders();
  });
  const overheadTwoFiles = multipart([0, 0]).length;
  const overheadFiveFiles = multipart([0, 0, 0, 0, 0]).length;
  // The upstream is a byte-counting stub; this test probes Nginx limits,
  // not Nest's separate 40 MiB file-data validation.
  for (const [label, sizes, expected] of [
    ['one max-size file', [10 * mib], 200],
    ['40 MiB file data', Array(4).fill(10 * mib), 200],
    ['body exactly 42 MiB', [10 * mib, 10 * mib, 10 * mib, 10 * mib, 2 * mib - overheadFiveFiles], 200],
    ['body one byte over 42 MiB', [10 * mib, 10 * mib, 10 * mib, 10 * mib, 2 * mib - overheadFiveFiles + 1], 413],
  ]) {
    const body = multipart(sizes);
    const response = await post(body);
    assert.equal(response.status, expected, label);
    if (expected === 200) assert.deepEqual(JSON.parse(response.body), { bytes: body.length });
    else assert.match(response.body, /413 Request Entity Too Large/);
    console.log(`PASS scoped ${label}: ${body.length} body bytes -> ${response.status}`);
  }
  const sibling = '/api/v1/platform/onboarding-cases/00000000-0000-4000-8000-000000000000/duplicates';
  for (const [label, sizes, expected] of [
    ['exactly 16 MiB', [10 * mib, 6 * mib - overheadTwoFiles], 200],
    ['one byte over 16 MiB', [10 * mib, 6 * mib - overheadTwoFiles + 1], 413],
  ]) {
    const body = multipart(sizes);
    const response = await post(body, 0, sibling);
    assert.equal(response.status, expected, `sibling ${label}`);
    console.log(`PASS sibling ${label}: ${body.length} body bytes -> ${response.status}`);
  }
  // Nginx's timeout measures upstream silence, not an absolute request deadline.
  const startImport = performance.now();
  const longImport = await post(multipart([1]), 123_000);
  const importSeconds = (performance.now() - startImport) / 1000;
  assert.equal(longImport.status, 200);
  assert.ok(importSeconds >= 123 && importSeconds < 133, `unexpected import duration: ${importSeconds}s`);
  console.log(`PASS import 123s silent upstream -> 200 at ${importSeconds.toFixed(2)}s`);

  const startSibling = performance.now();
  const siblingWait = await post(multipart([1]), 123_000, sibling);
  const siblingSeconds = (performance.now() - startSibling) / 1000;
  assert.equal(siblingWait.status, 504);
  assert.ok(siblingSeconds >= 119 && siblingSeconds < 123, `unexpected sibling timeout: ${siblingSeconds}s`);
  console.log(`PASS sibling 123s silent upstream -> 504 at ${siblingSeconds.toFixed(2)}s`);
} finally {
  for (const container of [name, stub]) {
    try { docker('rm', '-f', container); } catch { /* not started */ }
  }
  try { docker('network', 'rm', name); } catch { /* not created */ }
}
