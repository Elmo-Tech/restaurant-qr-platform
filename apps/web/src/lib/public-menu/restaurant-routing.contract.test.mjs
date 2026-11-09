import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Next Proxy routes tenant root through established QR Guest page and isolates Staff', () => {
  const proxy = read('proxy.ts');
  assert.ok(proxy.includes('restaurantSlugFromHost(request.headers.get(\'host\'), baseDomain)'));
  assert.ok(proxy.includes('rewritten.pathname = `/q/${slug}`'));
  assert.ok(proxy.includes('return NextResponse.rewrite(rewritten)'));
  assert.ok(proxy.includes('return NextResponse.redirect(apex)'));
  assert.ok(proxy.includes("pathname.startsWith('/api/v1/')"));
});

test('Browser Guest API is same-origin only for trusted tenant subdomains', () => {
  const api = read('lib/api/client.ts');
  assert.ok(api.includes('restaurantSlugFromHost(window.location.host, process.env.NEXT_PUBLIC_RESTAURANT_BASE_DOMAIN)'));
  assert.ok(api.includes('return `${window.location.origin}${API_BASE_PATH}`'));
  assert.ok(api.includes('return API_BASE_URL;'));
});

test('Gateway wildcard is opt-in and existing platform host remains exact', () => {
  const gateway = read('../../../infra/docker/nginx/gateway.conf.template');
  assert.ok(gateway.includes('server_name ${WEB_HOST} ${RESTAURANT_WILDCARD_HOST};'));
  assert.ok(gateway.includes('server_name ${PLATFORM_HOST};'));
  const prod = read('../../../infra/docker/compose.coolify.prod.prebuilt.yml');
  assert.ok(prod.includes('RESTAURANT_BASE_DOMAIN: ${RESTAURANT_BASE_DOMAIN:-}'));
  assert.ok(prod.includes('RESTAURANT_WILDCARD_HOST: ${RESTAURANT_WILDCARD_HOST:-}'));
});
