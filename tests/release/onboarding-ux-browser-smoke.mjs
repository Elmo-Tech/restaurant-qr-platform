// Onboarding UX browser smoke (PO request 2026-11-23): mode first + DEMO short path, the AI prompt helper of the Menu
// step, and removing cases from the outer list. Runs only against a loopback API + Platform stack backed by a
// disposable database; setup is in docs/02-technical/ONBOARDING_API_AND_PERSISTENCE.md, section 6.
// It writes only through the real Platform API and UI (no direct database access).
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const playwrightPath = process.env.UX_PLAYWRIGHT_MODULE ?? 'playwright';
assert.ok(playwrightPath === 'playwright' || isAbsolute(playwrightPath), 'Use the absolute path of an isolated Playwright module');
const { chromium } = createRequire(import.meta.url)(playwrightPath);
const loopback = (value) => {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1', 'The onboarding UX smoke must stay on loopback');
  assert.ok(url.port);
  return url.origin;
};
const api = loopback(process.env.UX_API_ORIGIN ?? 'http://127.0.0.1:32240');
const platform = loopback(process.env.UX_PLATFORM_ORIGIN ?? 'http://127.0.0.1:32242');
const password = process.env.UX_ADMIN_PASSWORD;
assert.ok(password, 'UX_ADMIN_PASSWORD must be set for the disposable Platform operator');
const email = process.env.UX_ADMIN_EMAIL ?? 'operator@example.test';
const tag = randomUUID().slice(0, 8);
const base = `${api}/api/v1/platform`;
const cases = '/onboarding-cases';
// The list renders a card (small screens) and a table row (desktop); only the visible one is interactive.
const button = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
const stepHeading = (page, text) => page.locator('#onboarding-step-heading').filter({ hasText: new RegExp(`^${text}$`) });

async function data(response, status) {
  const json = await response.json().catch(() => null);
  const path = new URL(response.url()).pathname;
  assert.equal(response.status(), status, `HTTP ${path}: ${json?.error?.code ?? 'unexpected'} ${JSON.stringify(json?.error?.problems ?? [])}`);
  return json.data;
}
const control = (context, method, path, payload) =>
  context.request.fetch(`${base}${path}`, { method, headers: { origin: platform }, ...(payload === undefined ? {} : { data: payload }) });
const current = async (context, id) => data(await control(context, 'GET', `${cases}/${id}`), 200);
/** Waits for the autosave to reach the server (the authoritative state), not for a UI label. */
async function until(context, id, check, label) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const view = await current(context, id);
    if (check(view)) return view;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.fail(`Timed out waiting for ${label}`);
}
async function newCase(context, patch = {}, leadId) {
  const created = await data(await control(context, 'POST', cases, leadId ? { leadId } : {}), 201);
  if (Object.keys(patch).length === 0) return created;
  return data(await control(context, 'PATCH', `${cases}/${created.id}`, { revision: created.revision, ...patch }), 200);
}
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 25_000); })]);
  } finally {
    clearTimeout(timer);
  }
}
async function grantImport(context, onboardingCase) {
  return data(await control(context, 'POST', `${cases}/${onboardingCase.id}/menu-import/grant`, {
    revision: onboardingCase.revision, reason: 'Browser smoke fixture',
  }), 200);
}
async function login(context) {
  const page = await context.newPage();
  await page.goto(`${platform}/login`);
  await field(page, 'Email').fill(email);
  await field(page, 'Password').fill(password);
  await button(page, 'Sign in').click();
  await page.waitForURL(`${platform}/`);
  return page;
}
async function searchList(page, text) {
  await page.goto(`${platform}/onboarding`);
  await page.getByRole('searchbox', { name: 'Search' }).fill(text);
  await page.getByText(text, { exact: true }).filter({ visible: true }).first().waitFor();
}
const step1 = (name, owner) => ({
  restaurant: { name, businessType: 'CAFE', branchName: 'Main', countryCode: 'EG', currencyCode: 'EGP', timezone: 'Africa/Cairo', defaultLocale: 'ar', additionalLocales: ['en'] },
  owner: { fullName: 'Fixture Owner', phone: '+201000000001', email: owner },
  acquisition: { sourceType: 'PAID_AD', sourcePlatform: 'FACEBOOK', campaign: 'UX browser smoke' },
});

const browser = await chromium.launch({ channel: process.env.UX_BROWSER_CHANNEL || undefined });
try {
  const context = await browser.newContext({ locale: 'en-US', acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  context.setDefaultTimeout(25_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: platform });
  const page = await login(context);
  const pkg = await data(await control(context, 'POST', '/packages', {
    nameAr: `باقة واجهة ${tag}`, nameEn: `UX Browser ${tag}`, features: ['DASHBOARD_ORDERING', 'MENU_IMPORT'],
  }), 201);

  // ---------------------------------------------------------------- 1. mode first, DEMO short path
  await page.goto(`${platform}/onboarding`);
  await button(page, 'New onboarding').click();
  await page.waitForURL(/\/onboarding\/[0-9a-f-]{36}$/);
  const demoId = page.url().split('/').at(-1);
  await page.getByText('Step 1 of 5', { exact: true }).waitFor();
  await stepHeading(page, 'Onboarding type').waitFor();
  await page.getByRole('radio', { name: 'Temporary demo' }).check();
  await page.getByText('Step 1 of 3', { exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation', { name: /steps/i }).getByRole('listitem').count(), 3, 'DEMO path: mode, review, handoff');
  const demoLabel = `UX demo ${tag}`;
  await field(page, 'Demo name (internal)').fill(demoLabel);
  await field(page, 'Business type').selectOption('sweets');
  await field(page, 'Lasts').selectOption('4');
  assert.equal(await field(page, 'Owner e-mail').count(), 0, 'no customer contact field on the DEMO path');
  await button(page, 'Continue').click();
  await stepHeading(page, 'Review').waitFor();
  await page.getByText(demoLabel, { exact: true }).first().waitFor();
  const [submitted] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`${cases}/${demoId}/submit-for-review`)),
    button(page, 'Submit for review').click(),
  ]);
  assert.equal((await data(submitted, 200)).status, 'READY_FOR_REVIEW');
  const reviewed = await current(context, demoId);
  assert.deepEqual(reviewed.completedSteps, ['mode']);
  assert.equal(reviewed.details.owner.email, null, 'no fake customer data');
  assert.equal(reviewed.details.acquisition, null);
  const [provisioned] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`${cases}/${demoId}/provision`)),
    button(page, 'Provision demo').click(),
  ]);
  const ready = await data(provisioned, 200);
  assert.equal(ready.status, 'READY');
  assert.equal(ready.demoHistory.label, demoLabel);
  console.log('PASS mode first: DEMO chosen first, 3-step path, no customer fields, submitted and provisioned without customer data');

  // ---------------------------------------------------------------- 2. mode switching never carries the package silently
  const switching = await newCase(context);
  await page.goto(`${platform}/onboarding/${switching.id}`);
  await page.getByRole('radio', { name: 'Paying customer' }).check();
  await page.getByRole('radio', { name: `UX Browser ${tag}` }).check();
  await until(context, switching.id, (view) => view.mode === 'REAL' && view.modeConfig.packageId === pkg.id, 'the REAL package save');
  await page.getByRole('radio', { name: 'Temporary demo' }).check();
  await page.getByText(/the package you picked before was cleared/).waitFor();
  assert.ok(await page.getByRole('radio', { name: 'No package (every feature)' }).isChecked());
  await until(context, switching.id, (view) => view.mode === 'DEMO' && view.modeConfig.packageId === null && view.package === null, 'the DEMO switch clearing the package');
  await page.getByRole('radio', { name: 'Paying customer' }).check();
  await button(page, 'Continue').click();
  await page.getByText('Choose a package.', { exact: true }).first().waitFor();
  assert.equal(await page.getByText('Step 1 of 5', { exact: true }).count(), 1, 'Continue stays on the incomplete mode step');
  console.log('PASS mode switching: package cleared with a visible notice, REAL requires choosing it again');

  // ---------------------------------------------------------------- 3. AI prompt helper and AI-prepared Excel import
  const real = await grantImport(context, await newCase(context, { mode: 'REAL', modeConfig: { packageId: pkg.id }, details: step1(`UX menu ${tag}`, `ux-menu-${tag}@example.test`) }));
  await page.goto(`${platform}/onboarding/${real.id}`);
  await page.getByRole('navigation', { name: /steps/i }).getByRole('button', { name: /^Menu/ }).click();
  await stepHeading(page, 'Menu').waitFor();
  const writes = [];
  page.on('request', (request) => {
    if (request.url().startsWith(api) && request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`);
  });
  await page.getByText('Prepare your menu with ChatGPT or another AI', { exact: true }).click();
  const prompt = field(page, 'Instructions for the AI chat');
  const promptText = await prompt.inputValue();
  assert.ok(promptText.includes('category_ar, category_en, name_ar, name_en'), 'canonical template columns');
  await button(page, 'Copy the instructions').click();
  await page.getByText('Copied. Paste them into the AI chat with your menu photos.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), promptText);
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('blocked')); });
  await button(page, 'Copy the instructions').click();
  await page.getByText(/^Could not copy automatically\./).waitFor();
  assert.deepEqual(await prompt.evaluate((el) => [el.selectionStart, el.selectionEnd]), [0, promptText.length], 'text selected for a manual copy');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download the Excel template' }).click()]);
  const downloaded = await readFile(await download.path());
  const template = await readFile(join(root, 'apps', 'web', 'public', 'templates', 'menu-import-template.xlsx'));
  assert.equal(createHash('sha256').update(downloaded).digest('hex'), createHash('sha256').update(template).digest('hex'));
  assert.deepEqual(writes, [], 'opening, copying and downloading never call the API');
  assert.equal((await current(context, real.id)).importAttempts, 0, 'no import attempt used before an upload');
  await field(page, 'Menu files').setInputFiles(join(root, 'apps', 'api', 'test', 'fixtures', 'menu-import', 'menu-ai-generated-openpyxl.xlsx'));
  const [staged] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`${cases}/${real.id}/menu-import`) && r.request().method() === 'POST'),
    button(page, 'Extract draft').click(),
  ]);
  const imported = await data(staged, 200);
  assert.equal(imported.importAttempts, 1);
  assert.equal(imported.menuDraft.menus[0].categories.length, 3);
  console.log('PASS AI prompt: canonical prompt copied (and manual fallback), template downloaded byte-identical, no API call until upload, AI-prepared .xlsx imported');

  // A real edit immediately before import must be saved before the action consumes its revision. Hold the
  // PATCH and then the actual import request before they reach the server to exercise both windows.
  const race = await grantImport(context, await newCase(context, { mode: 'REAL', modeConfig: { packageId: pkg.id }, details: step1(`UX race ${tag}`, `ux-race-${tag}@example.test`) }));
  const raceUrl = `${api}/api/v1/platform${cases}/${race.id}`;
  let releasePatch, patchStarted, releaseImport, importStarted;
  const patchGate = new Promise((resolve) => { releasePatch = resolve; });
  const patchSeen = new Promise((resolve) => { patchStarted = resolve; });
  const importGate = new Promise((resolve) => { releaseImport = resolve; });
  const importSeen = new Promise((resolve) => { importStarted = resolve; });
  await page.route(raceUrl, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patchStarted();
    await patchGate;
    await route.continue();
  });
  await page.route(`${raceUrl}/menu-import`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    importStarted();
    await importGate;
    await route.continue();
  });
  await page.goto(`${platform}/onboarding/${race.id}`);
  const steps = page.getByRole('navigation', { name: /steps/i });
  await steps.getByRole('button', { name: /^Customer & restaurant/ }).click();
  const raceName = `UX unsaved ${tag}`;
  await field(page, 'Restaurant name').fill(raceName);
  assert.notEqual((await current(context, race.id)).details.restaurant.name, raceName, 'edit starts genuinely unsaved');
  await steps.getByRole('button', { name: /^Menu/ }).click();
  await bounded(patchSeen, 'the edit PATCH');
  await field(page, 'Menu files').waitFor();
  assert.ok(await field(page, 'Menu files').isDisabled(), 'import cannot start while the edit PATCH is in flight');
  assert.notEqual((await current(context, race.id)).details.restaurant.name, raceName, 'held PATCH has not reached the server');
  releasePatch();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('input[type="file"]')).some((input) => !input.disabled));
  await field(page, 'Menu files').setInputFiles(join(root, 'apps', 'api', 'test', 'fixtures', 'menu-import', 'menu-ai-generated-openpyxl.xlsx'));
  await button(page, 'Extract draft').click();
  await bounded(importSeen, 'the import request');
  assert.equal((await current(context, race.id)).details.restaurant.name, raceName, 'edit saved before the import');
  assert.ok(await steps.getByRole('button', { name: /^Customer & restaurant/ }).isDisabled(), 'navigation is locked while import is in flight');
  assert.ok(await field(page, 'Menu files').isDisabled(), 'file selection is locked during import');
  assert.equal(await button(page, 'Add menu').count(), 0, 'menu editing is unavailable during import');
  const raceResponse = page.waitForResponse((r) => r.url() === `${raceUrl}/menu-import` && r.request().method() === 'POST');
  releaseImport();
  await data(await raceResponse, 200);
  await page.getByText('Imported draft needs review', { exact: true }).waitFor();
  assert.ok(await button(page, 'Add menu').isEnabled(), 'menu editing is restored after import');
  assert.ok(await field(page, 'Menu files').isEnabled(), 'file selection is restored after import');
  await steps.getByRole('button', { name: /^Customer & restaurant/ }).click();
  assert.equal(await field(page, 'Restaurant name').inputValue(), raceName, 'the saved edit remains visible after import');
  await until(context, race.id, (view) => view.details.restaurant.name === raceName, 'the edit after import');
  await page.unroute(raceUrl);
  await page.unroute(`${raceUrl}/menu-import`);
  console.log('PASS import ordering: an unsaved edit flushes before import, controls lock while the request is held, and the edit survives');

  await page.goto(`${platform}/onboarding/${real.id}`);
  await page.getByRole('navigation', { name: /steps/i }).getByRole('button', { name: /^Menu/ }).click();
  await page.getByText('Imported draft needs review', { exact: true }).waitFor();
  // A1 compatibility: the current backend no longer issues this package refusal here, so inject the legacy
  // envelope at the network boundary and verify that the wizard still keeps its staged draft and explains it.
  const realImportUrl = `${api}/api/v1/platform${cases}/${real.id}/menu-import`;
  let releaseRefusal, refusalStarted;
  const refusalGate = new Promise((resolve) => { releaseRefusal = resolve; });
  const refusalSeen = new Promise((resolve) => { refusalStarted = resolve; });
  await page.route(realImportUrl, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    refusalStarted();
    await refusalGate;
    await route.fulfill({ status: 403, headers: { 'access-control-allow-origin': platform, 'access-control-allow-credentials': 'true' }, json: { error: { code: 'FEATURE_NOT_AVAILABLE', message: 'Feature not available' } } });
  });
  await field(page, 'Menu files').setInputFiles(join(root, 'apps', 'api', 'test', 'fixtures', 'menu-import', 'menu-ai-generated-openpyxl.xlsx'));
  await button(page, 'Extract draft').click();
  await button(page, 'Extract draft').last().click();
  await bounded(refusalSeen, 'the replacement import request');
  assert.equal(await button(page, 'Add menu').count(), 0, 'menu editing is unavailable while replacement is in flight');
  assert.ok(await field(page, 'Menu files').isDisabled(), 'file selection is locked while replacement is in flight');
  const refusalResponse = page.waitForResponse((r) => r.url() === realImportUrl && r.request().method() === 'POST');
  releaseRefusal();
  const refused = await refusalResponse;
  assert.equal(refused.status(), 403);
  assert.equal((await refused.json()).error.code, 'FEATURE_NOT_AVAILABLE');
  await page.getByText(/This is a package setting, not a missing permission/).waitFor();
  await stepHeading(page, 'Menu').waitFor();
  assert.ok(await button(page, 'Add menu').isEnabled(), 'menu editing is restored after refusal');
  assert.ok(await field(page, 'Menu files').isEnabled(), 'file selection is restored after refusal');
  const afterRefusal = await current(context, real.id);
  assert.deepEqual(afterRefusal.menuDraft, imported.menuDraft, 'refusal must preserve the staged draft');
  assert.equal(afterRefusal.importAttempts, imported.importAttempts);
  await page.unroute(realImportUrl);
  console.log('PASS injected legacy FEATURE_NOT_AVAILABLE: the wizard explains the refusal and preserves the staged draft');

  // Revoking the case-specific authorization preserves the staged draft and prevents a replacement in the UI.
  await field(page, 'Reason').fill('Browser smoke revocation');
  const [revocation] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`${cases}/${real.id}/menu-import/revoke`) && r.request().method() === 'POST'),
    button(page, 'Revoke authorization').click(),
  ]);
  assert.equal((await data(revocation, 200)).importGrant.status, 'REVOKED');
  await button(page, 'Grant authorization').waitFor();
  await field(page, 'Menu files').setInputFiles(join(root, 'apps', 'api', 'test', 'fixtures', 'menu-import', 'menu-ai-generated-openpyxl.xlsx'));
  assert.ok(await button(page, 'Extract draft').isDisabled(), 'revocation blocks replacement in the UI');
  const afterRevocation = await current(context, real.id);
  assert.deepEqual(afterRevocation.menuDraft, imported.menuDraft, 'revocation must preserve the staged draft');
  assert.equal(afterRevocation.importAttempts, imported.importAttempts);
  console.log('PASS import authorization: revocation preserves the staged draft and blocks replacement');

  // ---------------------------------------------------------------- 4. removing cases from the outer list
  const routineName = `UX routine ${tag}`;
  const routine = await newCase(context, { details: { restaurant: { name: routineName } } });
  await searchList(page, routineName);
  await button(page, `Remove ${routineName} from the list`).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: 'Remove this draft?' }).waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await button(page, `Remove ${routineName} from the list`).click();
  const [removedResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`${cases}/${routine.id}/remove`)),
    dialog.getByRole('button', { name: 'Remove draft' }).click(),
  ]);
  assert.deepEqual(removedResponse.request().postDataJSON(), { revision: routine.revision, acknowledgedImpacts: [] });
  await page.getByText('The case was removed from the list. You can find it in the Archive.', { exact: true }).waitFor();
  await page.getByText(routineName, { exact: true }).first().waitFor({ state: 'detached' });
  assert.equal((await current(context, routine.id)).status, 'CANCELLED', 'removed = cancelled + archived, never deleted');
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await button(page, `Restore ${routineName} to the list`).click();
  await page.getByText('The case is back in the list.', { exact: true }).waitFor();
  assert.equal((await current(context, routine.id)).archivedAt, null);

  const lead = await context.request.post(`${api}/api/v1/public/landing/leads`, {
    data: { kind: 'TRIAL', name: 'Fixture Owner', email: `ux-lead-${tag}@example.test`, phone: '+201000000002', restaurantName: `UX lead ${tag}`, locale: 'en' },
  });
  await data(lead, 201);
  const leads = await data(await control(context, 'GET', '/leads'), 200);
  const leadId = leads.find((item) => item.email === `ux-lead-${tag}@example.test`).id;
  const linked = await newCase(context, {}, leadId);
  await searchList(page, `UX lead ${tag}`);
  await button(page, `Remove UX lead ${tag} from the list`).click();
  await dialog.getByRole('heading', { name: 'Remove this case from the list?' }).waitFor();
  await dialog.getByText(/It is linked to a request\./).waitFor();
  const confirm = dialog.getByRole('button', { name: 'Remove from list' });
  assert.ok(await confirm.isDisabled(), 'explicit acknowledgement required');
  await dialog.getByRole('checkbox', { name: 'I understand what will change.' }).check();
  assert.ok(await confirm.isEnabled());
  // Someone else edits the case while the dialog is open: the stale removal changes nothing.
  await data(await control(context, 'PATCH', `${cases}/${linked.id}`, { revision: linked.revision, details: { restaurant: { branchName: 'Changed' } } }), 200);
  await confirm.click();
  await page.getByText('This case changed in the meantime. The list was refreshed: check it and try again.', { exact: true }).waitFor();
  assert.equal((await current(context, linked.id)).status, 'DRAFT');
  await button(page, `Remove UX lead ${tag} from the list`).click();
  await dialog.getByRole('checkbox', { name: 'I understand what will change.' }).check();
  await Promise.all([page.waitForResponse((r) => r.url().endsWith(`${cases}/${linked.id}/remove`) && r.status() === 200), confirm.click()]);
  assert.equal((await data(await control(context, 'GET', '/leads?filter=all'), 200)).find((item) => item.id === leadId).status, 'NEW', 'lead untouched');

  await searchList(page, demoLabel);
  await button(page, `Remove ${demoLabel} from the list`).click();
  await dialog.getByRole('heading', { name: 'This case can’t be removed now' }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Remove from list' }).count(), 0, 'no remove action for a live demo awaiting handoff');
  await dialog.getByRole('button', { name: 'Back' }).click();
  assert.equal((await current(context, demoId)).status, 'READY');
  console.log('PASS removal: routine draft removed + restored, lead impact acknowledged, stale revision refused, live demo protected');

  // ---------------------------------------------------------------- 5. mobile, Arabic RTL
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US' });
  mobile.setDefaultTimeout(25_000);
  const phone = await login(mobile);
  await mobile.addCookies([{ name: 'platform_ui_locale', value: 'ar', url: platform }]);
  const arName = `UX mobile ${tag}`;
  await newCase(mobile, { details: { restaurant: { name: arName } } });
  await phone.goto(`${platform}/onboarding`);
  assert.equal(await phone.locator('html').getAttribute('dir'), 'rtl');
  await phone.getByRole('searchbox').fill(arName);
  await button(phone, `إزالة ${arName} من القائمة`).click();
  await phone.getByRole('dialog').getByRole('heading', { name: 'تشيل المسودة دي؟' }).waitFor();
  await phone.getByRole('dialog').getByRole('button', { name: 'شيل المسودة' }).click();
  await phone.getByText('الملف اتشال من القائمة. هتلاقيه في «الأرشيف».', { exact: true }).waitFor();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow at 390 px');
  await phone.goto(`${platform}/onboarding/${(await newCase(mobile)).id}`);
  await stepHeading(phone, 'طريقة البدء').waitFor();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'wizard fits 390 px');
  await mobile.close();
  console.log('PASS mobile Arabic: RTL list removal at 390 px and the mode-first wizard without horizontal overflow');
} finally {
  await browser.close();
}
