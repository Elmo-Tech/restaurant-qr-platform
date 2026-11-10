import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer, request as httpRequest } from 'node:http';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITE = 'restaurant-a.waytaapp.com';
const PORT = 3210;
const LOGO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/1xkAAAAASUVORK5CYII=', 'base64');
const sample = {
  context: {
    qrType: 'GENERIC',
    entry: { publicCode: 'opaque-public-code', redirectToSlug: null },
    restaurant: {
      shareCode: 'restaurant-a',
      name: 'مطعم النيل',
      logoAssetPath: '/media/logo.png',
      coverAssetPath: '/media/cover.png',
    },
  },
  locale: { resolved: 'ar', default: 'ar', available: ['ar'] },
  menu: { name: 'Menu A', description: 'قائمة مطعم النيل مع وجبات طازجة وأسعار واضحة.' },
};

const requestHosts = [];
const api = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/media/logo.png' || path === '/media/cover.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(LOGO);
    return;
  }
  if (path === '/api/v1/public/qr/restaurant-a/menu') {
    requestHosts.push(req.headers.host);
    if (req.headers.host !== SITE) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'QR_NOT_FOUND' } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: sample }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'QR_NOT_FOUND' } }));
});
await new Promise((resolve, reject) => {
  api.once('error', reject);
  api.listen(0, '127.0.0.1', resolve);
});
const apiPort = api.address().port;
const web = spawn('npm', ['run', 'dev', '--workspace=apps/web', '--', '--port', String(PORT), '--webpack'], {
  cwd: ROOT,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    NEXT_PUBLIC_API_URL: 'http://127.0.0.1:' + apiPort,
    NEXT_PUBLIC_API_BASE_PATH: '/api/v1',
    API_INTERNAL_URL: 'http://127.0.0.1:' + apiPort,
    RESTAURANT_BASE_DOMAIN: 'waytaapp.com',
  },
  detached: process.platform !== 'win32', // isolate Next and npm for reliable CI cleanup
  stdio: ['ignore', 'pipe', 'pipe'],
});
let webLogs = '';
web.on('exit', (code, signal) => { webLogs += '\nNext process exit: code=' + code + ' signal=' + signal + '\n'; });
for (const stream of [web.stdout, web.stderr]) {
  stream?.on('data', chunk => { webLogs = (webLogs + chunk.toString()).slice(-13000); });
}
// Undici fetch may replace a caller-provided Host with 127.0.0.1:PORT.
// Use native HTTP to exercise the actual Nginx host-forwarding contract.
function url(path, host) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method: 'GET',
      timeout: 30000,
      headers: { Host: host, 'X-Forwarded-Host': host, 'X-Forwarded-Proto': 'https' },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const responseHeaders = new Headers();
        for (const [key, val] of Object.entries(res.headers)) {
          if (typeof val === 'string') responseHeaders.set(key, val);
        }
        resolve(new Response(Buffer.concat(chunks), {
          status: res.statusCode ?? 500, headers: responseHeaders,
        }));
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Next smoke request timed out')));
    req.on('error', reject);
    req.end();
  });
}

try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (web.exitCode !== null) throw new Error('Next dev exited: ' + web.exitCode);
    try {
      const result = await url('/sitemap.xml', 'waytaapp.com');
      if (result.status === 200) { await result.body?.cancel(); ready = true; break; }
      await result.body?.cancel();
    } catch { /* Server is starting */ }
    await delay(1000);
  }
  assert.equal(ready, true, 'Next dev did not become ready');

  // Next dev may close a warm-up socket while compiling the image route.
  // Retry connection failures twice; HTTP failures must still fail assertions.
  let image;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { image = await url('/share-card', SITE); break; }
    catch (error) {
      if (attempt === 2 || web.exitCode !== null) throw error;
      await delay(700);
    }
  }
  if (!image) throw new Error('No share-card response');
  assert.equal(image.status, 200, 'active restaurant share image should render');
  assert.match(image.headers.get('content-type') ?? '', /image\/png/);
  const png = Buffer.from(await image.arrayBuffer());
  assert.ok(png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'valid PNG header');
  assert.equal(png.readUInt32BE(16), 1200, 'share card width');
  assert.equal(png.readUInt32BE(20), 630, 'share card height');

  const sitemap = await url('/sitemap.xml', SITE);
  assert.equal(sitemap.status, 200);
  const sitemapText = await sitemap.text();
  assert.match(sitemapText, /https:\/\/restaurant-a.waytaapp.com\//);
  assert.doesNotMatch(sitemapText, /restaurant-b/);

  const robots = await url('/robots.txt', SITE);
  assert.equal(robots.status, 200);
  const robotsText = await robots.text();
  assert.match(robotsText, /restaurant-a.waytaapp.com\/sitemap.xml/);
  assert.doesNotMatch(robotsText, /Disallow: \/share-card/);

  const unknown = await url('/share-card', 'restaurant-b.waytaapp.com');
  assert.equal(unknown.status, 404, 'unknown tenant cannot get a restaurant preview');
  await unknown.body?.cancel();

  const unknownRobots = await url('/robots.txt', 'restaurant-b.waytaapp.com');
  assert.match(await unknownRobots.text(), /Disallow: \//);

  const rootCard = await url('/share-card', 'waytaapp.com');
  assert.equal(rootCard.status, 200, 'Wayta platform image remains independently available');
  await rootCard.body?.cancel();

  assert.ok(requestHosts.length >= 3, 'backend mock called for tenant menu resolution');
  assert.ok(requestHosts.every(host => host === SITE), 'all real tenant calls carry the scoped Host');
  console.log('SEO smoke: tenant 1200x630 PNG, scoped Host, per-host robots/sitemap, 404 unknown and Wayta image OK');
} catch (error) {
  console.error('SEO runtime smoke failed:', error);
  console.error('Next dev logs:\n' + webLogs);
  process.exitCode = 1;
} finally {
  // npm spawns a Next child process; killing only npm leaves that child alive
  // and can hang server.close() on an outstanding keepalive connection.
  if (web.pid && process.platform !== 'win32') {
    try { process.kill(-web.pid, 'SIGTERM'); } catch { /* already exited */ }
  } else {
    web.kill('SIGTERM');
  }
  api.closeAllConnections();
  await Promise.race([
    new Promise(resolve => api.close(resolve)),
    delay(3000),
  ]);
}
