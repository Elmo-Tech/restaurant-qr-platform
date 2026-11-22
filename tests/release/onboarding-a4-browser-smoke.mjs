// Run only against the dedicated loopback A4 stack; setup is in ONBOARDING_A4_VALIDATION.md.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { Client } from 'pg';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';

const playwrightPath = process.env.A4_PLAYWRIGHT_MODULE ?? 'playwright';
assert.ok(playwrightPath === 'playwright' || isAbsolute(playwrightPath), 'Use the absolute path of an isolated Playwright module');
const { chromium } = createRequire(import.meta.url)(playwrightPath);
const loopback = (value, protocol) => {
  const url = new URL(value);
  assert.equal(url.protocol, protocol);
  assert.equal(url.hostname, '127.0.0.1', 'A4 smoke must stay on loopback');
  assert.ok(url.port);
  return url;
};
const api = loopback(process.env.A4_API_ORIGIN ?? 'http://127.0.0.1:32140', 'http:').origin;
const web = loopback(process.env.A4_WEB_ORIGIN ?? 'http://127.0.0.1:32141', 'http:').origin;
const platform = loopback(process.env.A4_PLATFORM_ORIGIN ?? 'http://127.0.0.1:32142', 'http:').origin;
assert.ok(process.env.A4_BROWSER_DATABASE_URL, 'Set A4_BROWSER_DATABASE_URL to the dedicated disposable database');
const dbUrl = loopback(process.env.A4_BROWSER_DATABASE_URL, 'postgresql:');
assert.equal(dbUrl.pathname, '/wayta_a4_browser', 'The retry fault is only allowed in the dedicated disposable database');
const password = process.env.A4_ADMIN_PASSWORD;
assert.ok(password, 'A4_ADMIN_PASSWORD must be set for the disposable Platform operator');
const tag = randomUUID().slice(0, 8);
const ownerPassword = `temporary-a4-${tag}-only`;
const productName = `A4 Coffee ${tag}`;
const blockedMenu = `A4-Blocked-${tag}`;
const constraint = `a4_smoke_${tag}`;
const cases = '/onboarding-cases';
const base = `${api}/api/v1/platform`;
const login = '/login';
const bodyOf = (page) => page.locator('body').innerText();
const button = (page, name) => page.getByRole('button', { name, exact: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
const routeFor = (id, action) => `${base}${cases}/${id}/${action}`;

async function data(response, status) {
  const json = await response.json().catch(() => null);
  const { code, problems } = json?.error ?? {};
  const path = new URL(response.url()).pathname;
  assert.equal(response.status(), status, `HTTP ${path}: ${code ?? 'unexpected response'} ${JSON.stringify(problems ?? [])}`);
  assert.ok(json && Object.hasOwn(json, 'data'), `Expected a JSON data envelope from ${path}`);
  return json.data;
}
async function control(context, method, path, payload) {
  return context.request.fetch(`${base}${path}`, {
    method, headers: { origin: platform }, ...(payload === undefined ? {} : { data: payload }),
  });
}
const current = async (context, c) => data(await control(context, 'GET', `${cases}/${c.id}`), 200);
async function leadStatus(context, c, status) {
  const leads = await data(await control(context, 'GET', '/leads?filter=all'), 200);
  assert.equal(leads.find((lead) => lead.id === c.leadId)?.status, status);
}
const translations = (name) => [{ locale: 'ar', name }];
async function prepare(context, mode, packageId) {
  const kind = `${mode.toLowerCase()}-${randomUUID().slice(0, 8)}`;
  const email = `${kind}@example.test`;
  const name = `A4 Bistro ${kind}`;
  const lead = await context.request.post(`${api}/api/v1/public/landing/leads`, {
    data: { kind: 'TRIAL', name: 'Fixture Owner', email, phone: '+201000000001', restaurantName: name, locale: 'en' },
  });
  await data(lead, 201);
  const leads = await data(await control(context, 'GET', '/leads'), 200);
  const leadId = leads.find((item) => item.email === email)?.id;
  assert.ok(leadId);
  const created = await data(await control(context, 'POST', cases, { leadId }), 201);
  const demo = mode === 'DEMO';
  const saved = await data(await control(context, 'PATCH', `${cases}/${created.id}`, {
    revision: created.revision, mode,
    details: {
      restaurant: { name, businessType: 'CAFE', branchName: 'Main', countryCode: 'EG', currencyCode: 'EGP',
        timezone: 'Africa/Cairo', defaultLocale: 'ar', additionalLocales: ['en'] },
      owner: { fullName: 'Fixture Owner', phone: '+201000000001', email },
      acquisition: { sourceType: 'PAID_AD', sourcePlatform: 'FACEBOOK', campaign: 'A4 browser smoke' },
    },
    modeConfig: demo ? { demoKind: 'cafe', demoHours: 24 } : { packageId, ...(mode === 'TRIAL' ? { trialDays: 14 } : {}) },
    ...(!demo ? { menuDraft: { menus: [{ translations: translations(mode === 'TRIAL' ? blockedMenu : 'A4 Menu'),
      categories: [{ translations: translations('Coffee'), products: [{ translations: translations(productName), price: '12.00', variants: [], modifierGroups: [] }] }],
    }] } } : {}),
  }), 200);
  const reviewed = await data(await control(context, 'POST', `${cases}/${created.id}/submit-for-review`, { revision: saved.revision }), 200);
  assert.equal(reviewed.status, 'READY_FOR_REVIEW');
  assert.equal(reviewed.handoff, null);
  return { ...reviewed, leadId };
}
async function action(page, c, actionName, buttonName) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url() === routeFor(c.id, actionName) && r.request().method() === 'POST'),
    button(page, buttonName).click(),
  ]);
  return { view: await data(response, 200), sent: response.request().postDataJSON() };
}
async function reloadCase(page, c, expectedStatus) {
  await page.reload();
  // Playwright can lose captured Chromium response bodies during navigation; read the persisted state separately.
  assert.equal((await current(page.context(), c)).status, expectedStatus);
}
async function openCase(page, c, buttonName) {
  await page.goto(`${platform}/onboarding/${c.id}`);
  await button(page, buttonName).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Download QR PNG' }).count(), 0, 'no QR before readiness');
}
// Check actual downloaded and preview PNG pixels against the expected module grid, not just PNG branding.
function assertQr(pngBytes, url) {
  const png = PNG.sync.read(pngBytes);
  assert.equal(png.width, 960);
  assert.equal(png.height, 960);
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const scale = png.width / (modules.size + 8);
  for (let row = -4; row < modules.size + 4; row++) {
    for (let col = -4; col < modules.size + 4; col++) {
      const x = Math.floor((col + 4.5) * scale);
      const y = Math.floor((row + 4.5) * scale);
      const inCode = row >= 0 && col >= 0 && row < modules.size && col < modules.size;
      const color = inCode && modules.get(row, col) ? 0 : 255;
      assert.equal(png.data[(y * png.width + x) * 4], color, `QR module at (${row}, ${col})`);
    }
  }
}
async function confirm(page, context, c, ready, expectedLead) {
  const submit = button(page, 'Confirm delivery');
  await submit.waitFor();
  assert.ok(await submit.isDisabled(), 'delivery requires explicit confirmation');
  await leadStatus(context, c, 'NEW');
  await page.getByRole('checkbox', { name: /I’ve shared/ }).check();
  const delivered = await action(page, c, 'deliver', 'Confirm delivery');
  assert.deepEqual(delivered.sent, { revision: ready.revision });
  assert.equal(delivered.view.status, 'DELIVERED');
  await page.getByText(/^Delivery confirmed on /).waitFor();
  await leadStatus(context, c, expectedLead);
}

const browser = await chromium.launch({ channel: process.env.A4_BROWSER_CHANNEL || undefined });
const db = new Client({ connectionString: dbUrl.href });
try {
  await db.connect();
  const context = await browser.newContext({ locale: 'en-US', acceptDownloads: true });
  context.setDefaultTimeout(25_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: platform });
  const page = await context.newPage();
  await page.goto(`${platform}${login}`);
  await field(page, 'Email').fill(process.env.A4_ADMIN_EMAIL ?? 'operator@example.test');
  await field(page, 'Password').fill(password);
  await button(page, 'Sign in').click();
  await page.waitForURL(`${platform}/`);
  const pkg = await data(await control(context, 'POST', '/packages', {
    nameAr: `باقة تجربة ${tag}`, nameEn: `A4 Browser ${tag}`, features: ['DASHBOARD_ORDERING'],
  }), 201);
  await data(await control(context, 'PUT', '/settings/trial', { enabled: true, defaultDays: 14, defaultPackageId: pkg.id }), 200);

  for (const mode of ['REAL', 'TRIAL']) {
    const c = await prepare(context, mode, pkg.id);
    await openCase(page, c, 'Provision restaurant');
    await field(page, 'Initial owner password').fill(ownerPassword);
    let provisioned;
    if (mode === 'TRIAL') {
      // Scope the real DB fault to this fixture, after its tenant and Generic QR commit but before menu readiness.
      await db.query(`ALTER TABLE menus ADD CONSTRAINT ${constraint} CHECK (name_internal <> '${blockedMenu}') NOT VALID`);
      try {
        await page.route(routeFor(c.id, 'provision'), async (route) => {
          // Let the genuine response complete at the API, then simulate losing it on the browser connection.
          await route.fetch();
          await route.abort('connectionreset');
        }, { times: 1 });
        await Promise.all([page.waitForEvent('requestfailed', (r) => r.url() === routeFor(c.id, 'provision')), button(page, 'Provision restaurant').click()]);
        provisioned = await current(context, c);
        assert.equal(provisioned.status, 'FAILED');
        assert.equal(provisioned.lastErrorCode, 'ONBOARDING_MENU_PUBLISH_FAILED');
        assert.equal(provisioned.handoff, null);
        assert.equal((await db.query("SELECT 1 FROM qr_codes WHERE restaurant_id = $1 AND type = 'GENERIC' AND status = 'ACTIVE'", [provisioned.restaurantId])).rowCount, 1);
      } finally {
        await db.query(`ALTER TABLE menus DROP CONSTRAINT ${constraint}`);
      }
      await reloadCase(page, c, 'FAILED');
      await button(page, 'Retry provisioning').waitFor();
      assert.equal(await field(page, 'Initial owner password').count(), 0, 'post-commit retry must not re-request password');
      assert.equal(await page.getByRole('link', { name: 'Download QR PNG' }).count(), 0);
      const retry = await action(page, c, 'retry', 'Retry provisioning');
      assert.deepEqual(retry.sent, { revision: provisioned.revision, provisioningKey: provisioned.provisioningKey });
      assert.equal(retry.view.restaurantId, provisioned.restaurantId);
      provisioned = retry.view;
    } else {
      provisioned = (await action(page, c, 'provision', 'Provision restaurant')).view;
    }
    assert.equal(provisioned.status, 'READY');
    assert.ok(!JSON.stringify(provisioned).includes(ownerPassword));
    const { guestMenuUrl, staffLoginUrl } = provisioned.handoff;
    assert.equal(new URL(guestMenuUrl).origin, web);
    assert.equal(staffLoginUrl, `${web}/login`);
    const preview = page.getByRole('img', { name: 'Generic QR for the Guest Menu' });
    await preview.waitFor();
    assert.equal(await field(page, 'Guest Menu link').inputValue(), guestMenuUrl);
    assert.equal(await field(page, 'Staff login link').inputValue(), staffLoginUrl);
    assert.equal(await page.locator('input[type=password]').count(), 0);
    await button(page, 'Copy Guest Menu link').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), guestMenuUrl);
    for (const language of ['English', 'Arabic']) {
      await button(page, `Copy ${language} message`).click();
      const message = await page.evaluate(() => navigator.clipboard.readText());
      assert.ok(message.includes(guestMenuUrl) && message.includes(staffLoginUrl) && !message.includes(ownerPassword));
      if (language === 'Arabic') assert.match(message, /\p{Script=Arabic}/u);
    }
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download QR PNG' }).click()]);
    assert.equal(download.suggestedFilename(), 'guest-menu-qr.png');
    const png = await readFile(await download.path());
    assert.equal(png.toString('base64'), (await preview.getAttribute('src')).split(',')[1]);
    assertQr(png, guestMenuUrl);
    const guest = await browser.newContext({ locale: 'ar-EG' });
    try {
      const menu = await guest.newPage();
      const response = await menu.goto(guestMenuUrl);
      assert.equal(response?.status(), 200);
      await menu.getByText(productName, { exact: true }).first().waitFor({ timeout: 30_000 });
    } finally { await guest.close(); }
    await confirm(page, context, c, provisioned, 'DONE');
    await reloadCase(page, c, 'DELIVERED');
    await page.getByText(/^Delivery confirmed on /).waitFor();
    await preview.waitFor();
    console.log(`PASS ${mode}: real Guest Menu, exact QR PNG, share copy, confirmed delivery${mode === 'TRIAL' ? ', lost response / reload / checkpoint retry without password' : ''}`);

    if (mode === 'REAL') {
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ar-EG' });
      try {
        await mobile.addCookies((await context.cookies()).filter((cookie) => cookie.name === 'platform_session'));
        const mobilePage = await mobile.newPage();
        await mobilePage.goto(`${platform}/onboarding/${c.id}`);
        await mobilePage.getByRole('img', { name: 'رمز QR العام لمنيو الضيوف' }).waitFor();
        assert.equal(await mobilePage.locator('html').getAttribute('dir'), 'rtl');
        assert.equal(await mobilePage.locator('html').getAttribute('lang'), 'ar');
        assert.equal(await field(mobilePage, 'رابط منيو الضيوف').getAttribute('dir'), 'ltr');
        assert.equal(await mobilePage.getByRole('link', { name: 'نزّل رمز QR بصيغة PNG' }).isVisible(), true);
        assert.ok(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow on 390px RTL');
      } finally { await mobile.close(); }
      console.log('PASS Arabic RTL at 390px: links LTR, QR/download usable, no horizontal page overflow');
    }
  }

  const demo = await prepare(context, 'DEMO', pkg.id);
  await openCase(page, demo, 'Provision demo');
  assert.equal(await field(page, 'Initial owner password').count(), 0);
  const created = await action(page, demo, 'provision', 'Provision demo');
  assert.equal(created.view.status, 'READY');
  assert.equal(created.view.handoff, null);
  assert.equal(created.view.demoHistory.kind, 'cafe');
  assert.equal(Object.hasOwn(created.sent, 'ownerPassword'), false);
  const demoLink = created.view.demoLink;
  assert.ok(typeof demoLink === 'string');
  assert.equal(new URL(demoLink).origin, web);
  await field(page, 'Private demo link').waitFor();
  assert.ok((await field(page, 'Private demo link').inputValue()) === demoLink, 'created demo link is shown');
  await button(page, 'Copy private demo link').click();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())) === demoLink, 'exact private link is copied');
  assert.ok(!(await bodyOf(page)).includes(ownerPassword));
  const prospect = await browser.newContext({ locale: 'en-US' });
  try {
    const prospectPage = await prospect.newPage();
    const [enter] = await Promise.all([
      prospectPage.waitForResponse((r) => r.url() === `${api}/api/v1/demo/enter` && r.request().method() === 'POST'),
      prospectPage.goto(demoLink).catch(() => { throw new Error('Private demo page could not open'); }),
    ]);
    const session = await data(enter, 200);
    assert.match(session.redirectTo, /^\/staff\/restaurants\//);
    await prospectPage.waitForURL(`${web}${session.redirectTo}`);
    await prospectPage.getByRole('heading', { name: 'Dashboard', exact: true }).first().waitFor();
  } finally { await prospect.close(); }
  const firstRead = await current(context, demo);
  assert.equal(Object.hasOwn(firstRead, 'demoLink'), false);
  assert.ok(!JSON.stringify(firstRead).includes(demoLink));
  assert.equal(await page.getByRole('link', { name: 'Download QR PNG' }).count(), 0);
  const unauthorized = await browser.newContext();
  try {
    const anonymousPage = await unauthorized.newPage();
    await anonymousPage.goto(`${platform}/onboarding/${demo.id}`);
    await anonymousPage.waitForURL(`${platform}/login**`);
    assert.equal((await control(unauthorized, 'GET', `${cases}/${demo.id}`)).status(), 401);
    assert.equal((await control(unauthorized, 'POST', `${cases}/${demo.id}/deliver`, { revision: firstRead.revision })).status(), 401);
  } finally { await unauthorized.close(); }
  await leadStatus(context, demo, 'NEW');
  await reloadCase(page, demo, 'READY');
  await page.getByText('This private demo link is no longer shown. It cannot be retrieved or regenerated from this case.', { exact: true }).waitFor();
  assert.equal(await field(page, 'Private demo link').count(), 0);
  const replay = await data(await control(context, 'POST', `${cases}/${demo.id}/retry`, {
    revision: firstRead.revision, provisioningKey: firstRead.provisioningKey,
  }), 200);
  assert.equal(replay.status, 'READY');
  assert.deepEqual(replay.demoHistory, firstRead.demoHistory);
  assert.equal(Object.hasOwn(replay, 'demoLink'), false);
  await confirm(page, context, demo, firstRead, 'CONTACTED');
  await reloadCase(page, demo, 'DELIVERED');
  await page.getByText(/^Delivery confirmed on /).waitFor();
  assert.equal(await field(page, 'Private demo link').count(), 0);
  console.log('PASS DEMO: link once, no QR/password, unauthorized read/delivery rejected, reload and replay do not recover link, explicit delivery moves lead to CONTACTED');
} finally {
  await browser.close();
  await db.end();
}
