import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Next Proxy routes tenant root through established QR Guest page and isolates Staff', () => {
  const proxy = read('proxy.ts');
  assert.ok(proxy.includes("restaurantSlugFromHost(request.headers.get('host'), baseDomain)"));
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

test('Tenant hosts cannot reach Staff APIs, realtime or provider webhooks through Nginx', () => {
  const gateway = read('../../../infra/docker/nginx/gateway.conf.template');
  const tenantStart = gateway.indexOf('# ------------------------------------------------------------------------------------------------ restaurant app');
  const platformStart = gateway.indexOf('# ------------------------------------------------------------------------------------------------ platform console', tenantStart);
  assert.ok(tenantStart !== -1 && platformStart > tenantStart);
  const tenant = gateway.slice(tenantStart, platformStart);
  assert.ok(tenant.includes('location ^~ /api/v1/public/qr/ {'));
  assert.ok(tenant.includes('location ^~ /media/ {'));
  assert.ok(tenant.includes('location ~* ^/api/v1/platform(?:/|$) {'));

  // Verify each security boundary by location, not by a brittle global count.
  // The Demo capability exchange now has its own exact-match, apex-only route
  // with restricted error logging; tenant subdomains must not reach it either.
  const apexOnlyRoutes = [
    ['WhatsApp tracking webhook', 'location ^~ /api/v1/whatsapp-tracking/webhook/ {'],
    ['Demo capability exchange', 'location = /api/v1/demo/enter {'],
    ['generic Staff/API', 'location /api/v1/ {'],
    ['Socket.IO', 'location ^~ /socket.io/ {'],
  ];
  for (const [label, startTag] of apexOnlyRoutes) {
    const start = tenant.indexOf(`    ${startTag}\n`);
    assert.ok(start >= 0, `${label}: missing location`);
    const end = tenant.indexOf('\n    }', start);
    assert.ok(end > start, `${label}: malformed location`);
    const route = tenant.slice(start, end);
    assert.ok(route.includes('if ($host != ${WEB_HOST}) { return 404; }'),
      `${label}: tenant hosts must return 404`);
  }

  const legacy = gateway.slice(0, tenantStart);
  assert.ok(legacy.includes('server_name wayta.elmotechsoft.online;'));
  assert.ok(legacy.includes('location ^~ /api/v1/whatsapp-tracking/webhook/ {'));
});

// Apex homepage -> landing site. Only `waytaapp.com` + exact `/` redirect, temporarily; nothing else moves.
const gatewayTemplate = () => read('../../../infra/docker/nginx/gateway.conf.template');
const tenantServer = (gateway) => {
  const start = gateway.indexOf('# ------------------------------------------------------------------------------------------------ restaurant app');
  const end = gateway.indexOf('# ------------------------------------------------------------------------------------------------ platform console', start);
  return gateway.slice(start, end);
};

test('Apex homepage redirect: literal waytaapp.com host, exact root path, temporary 302', () => {
  const gateway = gatewayTemplate();
  const tenant = tenantServer(gateway);
  const exactRoot = tenant.match(/location = \/ \{\n([\s\S]*?)\n    \}\n/);
  assert.ok(exactRoot, 'exact-match root location in the restaurant app server');
  assert.equal(
    exactRoot[1].trim(),
    [
      'if ($host = waytaapp.com) {',
      '            return 302 https://landing.waytaapp.com/$apex_landing_query;',
      '        }',
      '        proxy_pass $web_upstream;',
    ].join('\n'),
  );
  // Every other path (and every other host's root) still reaches Next.js unchanged.
  assert.match(tenant, /\n    location \/ \{\n        proxy_pass \$web_upstream;\n    \}\n/);
  // Exactly one landing redirect in the whole gateway, never permanent, never keyed on ${WEB_HOST}.
  assert.equal(gateway.split('landing.waytaapp.com').length - 1, 2, 'one redirect + its header comment');
  assert.doesNotMatch(gateway, /return 30[18] https:\/\/landing/);
  assert.doesNotMatch(gateway, /\$host = \$\{WEB_HOST\}/);
  assert.doesNotMatch(gateway, /return 30[12378] https:\/\/landing\.waytaapp\.com\$request_uri/);
  // Not on the platform console or legacy servers.
  const platform = gateway.slice(gateway.indexOf('server_name ${PLATFORM_HOST};'));
  assert.doesNotMatch(platform, /landing/);
  assert.doesNotMatch(gateway.slice(0, gateway.indexOf('# ------------------------------------------------------------------------------------------------ restaurant app')).split('# Variables in proxy_pass')[1], /landing\.waytaapp/);
});

test('Apex homepage redirect keeps API, media, Socket.IO, webhook and legacy routing intact', () => {
  const gateway = gatewayTemplate();
  const tenant = tenantServer(gateway);
  for (const block of [
    'location ~* ^/api/v1/platform(?:/|$) {\n        return 404;',
    'location ^~ /api/v1/whatsapp-tracking/webhook/ {',
    'location ^~ /api/v1/public/qr/ {\n        proxy_pass $api_upstream;',
    'location /api/v1/ {',
    'location ^~ /media/ {\n        proxy_pass $api_upstream;',
    'location ^~ /socket.io/ {',
  ]) assert.ok(tenant.includes(block), 'missing: ' + block);
  assert.ok(gateway.includes('return 308 https://waytaapp.com$request_uri;'));
  assert.ok(gateway.includes('return 308 https://control.waytaapp.com$request_uri;'));
  assert.ok(gateway.includes('server_name ${WEB_HOST} ${RESTAURANT_WILDCARD_HOST};'));
});

test('Apex homepage redirect forwards only plain UTM campaign queries to the landing origin', () => {
  const gateway = gatewayTemplate();
  const map = gateway.match(/map \$args \$apex_landing_query \{\n    default "";\n    "~(.+)" "\?\$args";\n\}/);
  assert.ok(map, 'allow-list map with an empty default');
  const allowed = new RegExp(map[1]); // the same PCRE subset is valid JavaScript
  const forwarded = (args) => (args === '' ? '' : allowed.test(args) ? `?${args}` : '');
  assert.equal(forwarded(''), '');
  assert.equal(forwarded('utm_source=instagram'), '?utm_source=instagram');
  assert.equal(
    forwarded('utm_source=fb&utm_medium=paid&utm_campaign=launch-2026&utm_term=qr%20menu&utm_content=a.b_c~d+e'),
    '?utm_source=fb&utm_medium=paid&utm_campaign=launch-2026&utm_term=qr%20menu&utm_content=a.b_c~d+e',
  );
  for (const unsafe of [
    'token=abc', 'utm_source=x&token=abc', 'token=abc&utm_source=x', 'next=/staff', 'code=123',
    'utm_source=x&session=1', 'utm_source=a=b', 'utm_source=<script>', 'utm_source=x&', '&utm_source=x',
    'utm_id=1', 'gclid=abc', 'fbclid=abc', 'UTM_SOURCE=x', 'utm_source=x#frag',
    'utm_source=' + 'a'.repeat(201),
    'utm_source=a&utm_medium=b&utm_campaign=c&utm_term=d&utm_content=e&utm_source=f',
  ]) assert.equal(forwarded(unsafe), '', 'must not forward: ' + unsafe);
});

test('Production tenant wildcard routers (HTTP and HTTPS) never claim control, www or the landing site', () => {
  const prod = read('../../../infra/docker/compose.coolify.prod.prebuilt.yml');
  const label = (key) => {
    const found = prod.match(new RegExp(`- '${key.replaceAll('.', '\\.')}=(.*)'\\n`));
    assert.ok(found, 'missing label ' + key);
    return found[1];
  };
  const wildcard = 'HostRegexp(`^[a-z0-9]+(?:-[a-z0-9]+)*[.]waytaapp[.]com\\z`)';
  const expectedRule = `${wildcard} && !Host(\`control.waytaapp.com\`) && !Host(\`www.waytaapp.com\`) && !Host(\`landing.waytaapp.com\`)`;
  for (const router of ['wayta-tenants-https', 'wayta-tenants-http']) {
    const p = `traefik.http.routers.${router}`;
    assert.equal(label(`${p}.rule`), expectedRule, router);
    assert.equal(label(`${p}.priority`), '20', router);
    assert.equal(label(`${p}.service`), 'wayta-tenants-gateway', router);
  }
  assert.equal(label('traefik.http.routers.wayta-tenants-https.entrypoints'), 'https');
  assert.equal(label('traefik.http.routers.wayta-tenants-https.tls'), 'true');
  assert.equal(label('traefik.http.routers.wayta-tenants-http.entrypoints'), 'http');
  assert.equal(label('traefik.http.routers.wayta-tenants-http.middlewares'), 'wayta-tenants-redirect-https');
  assert.equal(label('traefik.http.services.wayta-tenants-gateway.loadbalancer.server.port'), '8080');
  // Exactly these two tenant routers; no landing router is defined in this repository (separate app).
  assert.equal((prod.match(/traefik\.http\.routers\.[a-z-]+\.rule=/g) ?? []).length, 2);
  assert.equal(prod.split('landing.waytaapp.com').length - 1, 3, 'two exclusions + the explaining comment');
  // The CI assertion on the resolved production Compose requires the same exclusion.
  const workflow = read('../../../.github/workflows/wayta-publish-ghcr-production.yml');
  assert.ok(workflow.includes("assert.ok(rule.includes('!Host(`landing.waytaapp.com`)')"));
  assert.ok(workflow.includes("assert.equal(rule, labels[prefix + 'http.rule']);"));
});
