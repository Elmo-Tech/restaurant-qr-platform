/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS test fixture. */
'use strict';
/**
 * Kitchen K2 browser fixture: a tiny in-memory stand-in for the three Backend routes the Kitchen Board uses
 * (`GET /auth/me`, `GET /restaurants/:id/kitchen/orders`, `PATCH /restaurants/:id/orders/:id/status`).
 * It exists only so the real Next.js Kitchen UI can be driven in a browser without a database. It is NOT
 * evidence about the Backend: sorting, scoping and transitions are still owned by the API and its own tests.
 * Like the real route it returns tickets oldest-CREATED first, so any ordering seen in the UI is the UI's own.
 */
const http = require('node:http');

const RESTAURANT_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_MAIN = { id: '22222222-2222-4222-8222-222222222222', name: 'Main Branch', translations: [{ locale: 'ar', name: 'الفرع الرئيسي' }], status: 'ACTIVE' };
const BRANCH_OTHER = { id: '33333333-3333-4333-8333-333333333333', name: 'Garden Branch', translations: [{ locale: 'ar', name: 'فرع الحديقة' }], status: 'ACTIVE' };

const ALL_FEATURES = {
  WHATSAPP_ORDERING: true, ORDER_TRACKING: true, SMART_SUGGESTIONS: true, MENU_TEMPLATES: true,
  DASHBOARD_ORDERING: true, TABLE_ORDERING: true, KITCHEN: true, OFFERS: true, MENU_IMPORT: false, PROMOTIONS: false,
};

function authContext(permissions, branches) {
  return {
    user: { id: '44444444-4444-4444-8444-444444444444', email: 'kitchen@example.test', preferredLocale: null },
    memberships: [{
      id: '55555555-5555-4555-8555-555555555555', role: 'KITCHEN', roleId: '66666666-6666-4666-8666-666666666666',
      roleName: 'Kitchen', allBranches: false, permissions, branches,
      restaurant: {
        id: RESTAURANT_ID, name: 'Wayta Test Kitchen', status: 'ACTIVE', currencyCode: 'EGP', defaultLocale: 'en',
        logoAssetPath: null, coverAssetPath: null, pickupEnabled: true, deliveryEnabled: true, tableOrderingEnabled: true,
        whatsappOrderingEnabled: false, menuTemplate: 'CLASSIC', features: ALL_FEATURES,
        contact: {
          phone: null, whatsapp: null, hotline: null, facebookUrl: null, instagramUrl: null, tiktokUrl: null,
          telegramUrl: null, youtubeUrl: null, xUrl: null, snapchatUrl: null, mapsUrl: null, websiteUrl: null,
        },
        qrStyle: { foregroundColor: '#000000', backgroundColor: '#ffffff', showLogo: false, showName: false },
      },
    }],
  };
}

const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

/** A ticket whose current stage began `stageMinutes` ago and which was created `createdMinutes` ago. */
function ticket(overrides) {
  const { stageMinutes, createdMinutes, ...rest } = overrides;
  return {
    id: rest.id,
    status: 'ACCEPTED',
    type: 'DINE_IN',
    roundNumber: 1,
    createdAt: iso(createdMinutes ?? stageMinutes),
    statusSince: iso(stageMinutes),
    branch: { id: BRANCH_MAIN.id, name: BRANCH_MAIN.name },
    table: null,
    customerName: null,
    notes: null,
    items: [],
    ...rest,
  };
}

/**
 * @param {{ permissions?: string[], branches?: object[], tickets?: object[], patch?: (req: object) => { status: number, body: object } }} initial
 */
function createStub(initial = {}) {
  const state = {
    permissions: initial.permissions ?? ['kitchen.view', 'kitchen.update', 'orders.view'],
    branches: initial.branches ?? [BRANCH_MAIN],
    tickets: initial.tickets ?? [],
    patch: initial.patch ?? null,
    patchCalls: [],
    listCalls: [],
    unknown: [],
  };
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    const url = new URL(req.url, 'http://stub');
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

    if (url.pathname === '/api/v1/auth/me') return send(200, { data: authContext(state.permissions, state.branches) });

    if (req.method === 'GET' && url.pathname === `/api/v1/restaurants/${RESTAURANT_ID}/kitchen/orders`) {
      const branchId = url.searchParams.get('branchId');
      state.listCalls.push(branchId);
      // Same scope rule as the Backend: only authorized branches; a foreign branchId can only narrow.
      const allowed = new Set(state.branches.map((branch) => branch.id));
      const rows = state.tickets
        .filter((row) => allowed.has(row.branch.id) && (!branchId || row.branch.id === branchId))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
      return send(200, { data: rows });
    }

    const patchMatch = req.method === 'PATCH' && url.pathname.match(new RegExp(`^/api/v1/restaurants/${RESTAURANT_ID}/orders/([^/]+)/status$`));
    if (patchMatch) {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        const body = JSON.parse(raw || '{}');
        state.patchCalls.push({ id: patchMatch[1], ...body });
        const custom = state.patch ? state.patch({ id: patchMatch[1], ...body }) : null;
        if (custom) return send(custom.status, custom.body);
        const row = state.tickets.find((candidate) => candidate.id === patchMatch[1]);
        if (!row || row.status !== body.expectedStatus) {
          return send(409, { error: { code: 'ORDER_STATUS_CHANGED', message: 'Changed', details: { currentStatus: row?.status } } });
        }
        row.status = body.status;
        row.statusSince = new Date().toISOString();
        return send(200, { data: { id: row.id, status: row.status } });
      });
      return undefined;
    }

    state.unknown.push(`${req.method} ${url.pathname}`);
    return send(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
  return {
    state,
    listen: (port) => new Promise((resolve) => server.listen(port, '127.0.0.1', resolve)),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { createStub, ticket, authContext, RESTAURANT_ID, BRANCH_MAIN, BRANCH_OTHER };
