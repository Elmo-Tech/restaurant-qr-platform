import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { issueWhatsappReference } from './signed-whatsapp-reference';
import { parseInboundEvolutionMessage, evolutionInstances, evolutionWebhookUrl,
  WhatsappTrackingService } from './whatsapp-tracking.service';
describe('Evolution ingress filter',()=>{
  const raw={ event:'messages.upsert', instance:'wayta-test',
    data:{ key:{ id:'ABCD12345',fromMe:false,remoteJid:'123@s.whatsapp.net' },
      message:{ conversation:'An actual order from Wayta with reference' } } };
  it('accepts inbound text only',()=>{
    expect(parseInboundEvolutionMessage(raw)).toEqual({
      id:'ABCD12345',text:'An actual order from Wayta with reference',
    });
  });
  it('ignores groups, outgoing messages, media, and other events',()=>{
    expect(parseInboundEvolutionMessage({ ...raw,event:'messages.update' })).toBeNull();
    expect(parseInboundEvolutionMessage({ ...raw,data:{
      ...raw.data,key:{ ...raw.data.key,fromMe:true },
    } })).toBeNull();
    expect(parseInboundEvolutionMessage({ ...raw,data:{
      ...raw.data,key:{ ...raw.data.key,remoteJid:'123@g.us' },
    } })).toBeNull();
    expect(parseInboundEvolutionMessage({ ...raw,data:{
      ...raw.data,message:{ audioMessage:{} },
    } })).toBeNull();
  });
});


describe('Evolution instance recovery without destructive reconnect', () => {
  const restaurantId = '95d0e44a-9eee-4fcb-811e-bc1e62e41643';
  const instanceName = 'wayta-95d0e44a9eee4fcb811ebc1e62e41643';
  const restaurant = { whatsappNumber: '+201000000000', whatsappOrderingEnabled: true };
  const key = Buffer.alloc(32, 42).toString('base64');

  function createSubject(pairingCodeEnabled = false) {
    const db = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
      whatsappConnection: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn((input: unknown) => Promise.resolve(input)),
      },
    };
    const config = { get: jest.fn((name: string) => ({
      EVOLUTION_API_URL: 'https://evolution.example.com',
      EVOLUTION_API_KEY: 'test-provider-key',
      WAYTA_API_PUBLIC_URL: 'https://menu.example.com',
      WHATSAPP_ORDER_SIGNING_KEY: key,
      WHATSAPP_PAIRING_CODE_ENABLED: pairingCodeEnabled,
    })[name as 'EVOLUTION_API_URL' | 'EVOLUTION_API_KEY' | 'WAYTA_API_PUBLIC_URL' | 'WHATSAPP_ORDER_SIGNING_KEY' | 'WHATSAPP_PAIRING_CODE_ENABLED']) };
    const entitlements = { isEnabled: jest.fn().mockResolvedValue(true) };
    const service = new WhatsappTrackingService(db as never, config as never, entitlements as never);
    const provider = jest.spyOn(service as unknown as {
      fetchProvider: (path: string, method?: string, data?: Record<string, unknown>) => Promise<unknown>;
    }, 'fetchProvider');
    return { db, provider, service };
  }

  it('understands a null webhook response without a TypeError', () => {
    expect(evolutionWebhookUrl(null)).toBeNull();
    expect(evolutionWebhookUrl({ webhook: null })).toBeNull();
    expect(evolutionWebhookUrl({ webhook: { webhook: { url: 'https://menu.example.com/callback' } } }))
      .toBe('https://menu.example.com/callback');
    expect(evolutionWebhookUrl({ enabled: true })).toBeUndefined();
    expect(evolutionInstances([{ instance: { instanceName } }])).toHaveLength(1);
    expect(evolutionInstances({ response: [{ name: instanceName }] })).toHaveLength(1);
    expect(evolutionInstances({ bogus: true })).toBeNull();
  });

  it('creates a missing restaurant instance when another tenant instance exists', async () => {
    const { provider, service, db } = createSubject();
    let created = false;
    provider.mockImplementation((path: string) => {
      if (path === '/instance/fetchInstances') {
        const foreign = { name: 'wayta-other-restaurant', ownerJid: '20999999999@s.whatsapp.net' };
        return Promise.resolve(created ? [foreign, { name: instanceName }] : [foreign]);
      }
      if (path.startsWith('/instance/create')) {
        created = true;
        return Promise.resolve({ instance: { instanceName } });
      }
      if (path.startsWith('/webhook/find')) return Promise.resolve(null);
      if (path.startsWith('/webhook/set')) return Promise.resolve({});
      if (path.startsWith('/instance/connect')) return Promise.resolve({ qrcode: { code: 'new-qr' } });
      return Promise.reject(new Error('Unexpected provider call: ' + path));
    });

    const result = await service.connect(restaurantId);
    expect(result.qrText).toBe('new-qr');
    expect(provider).toHaveBeenCalledWith('/instance/create', 'POST', {
      instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true,
    });
    expect(provider.mock.calls.filter(([path]) => path === '/instance/create')).toHaveLength(1);
    expect(provider.mock.calls.some(([path]) => path.includes('?instanceName='))).toBe(false);
    expect(db.whatsappConnection.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not create an instance when the unfiltered list response is invalid', async () => {
    const { provider, service, db } = createSubject();
    provider.mockResolvedValue({ unexpected: true });
    await expect(service.connect(restaurantId)).rejects.toThrow('WHATSAPP_INSTANCE_LOOKUP_UNEXPECTED');
    expect(provider.mock.calls.some(([path]) => path === '/instance/create')).toBe(false);
    expect(db.whatsappConnection.upsert).not.toHaveBeenCalled();
  });

  it('uses an exact matching instance in an unfiltered provider list', async () => {
    const { provider, service } = createSubject();
    provider.mockImplementation((path: string) => {
      if (path === '/instance/fetchInstances') return Promise.resolve([
        { name: 'wayta-' + restaurantId.replace(/-/g, '') + '-unrelated' },
        { instance: { instanceName } },
      ]);
      if (path.startsWith('/webhook/find')) return Promise.resolve(null);
      if (path.startsWith('/webhook/set')) return Promise.resolve({});
      if (path.startsWith('/instance/connect')) return Promise.resolve({ code: 'paired-qr' });
      return Promise.reject(new Error('Unexpected provider call: ' + path));
    });
    expect((await service.connect(restaurantId)).qrText).toBe('paired-qr');
    expect(provider.mock.calls.some(([path]) => path === '/instance/create')).toBe(false);
    expect(provider.mock.calls.some(([path]) => path.includes('?instanceName='))).toBe(false);
  });

  it('verifies the exact provider owner without a name-filtered lookup', async () => {
    const { provider, service, db } = createSubject();
    db.whatsappConnection.findUnique.mockResolvedValue({ restaurantId, instanceName });
    db.restaurant.findUnique.mockResolvedValue({ ...restaurant, status: 'ACTIVE' });
    provider.mockImplementation((path: string) => {
      if (path.startsWith('/instance/connectionState')) {
        return Promise.resolve({ instance: { state: 'open' } });
      }
      if (path === '/instance/fetchInstances') return Promise.resolve([
        { name: 'wayta-foreign', ownerJid: '20999999999@s.whatsapp.net' },
        { instance: { instanceName, ownerJid: '201000000000@s.whatsapp.net' } },
      ]);
      return Promise.reject(new Error('Unexpected provider call: ' + path));
    });
    const state = await service.state(restaurantId);
    expect(state.state).toBe('CONNECTED');
    expect(state.number).toBe('201000000000');
    expect(provider.mock.calls.some(([path]) => path.includes('?instanceName='))).toBe(false);
  });

  it('does not verify a foreign owner or a missing linked instance', async () => {
    const { provider, service, db } = createSubject();
    db.whatsappConnection.findUnique.mockResolvedValue({ restaurantId, instanceName });
    db.restaurant.findUnique.mockResolvedValue({ ...restaurant, status: 'ACTIVE' });
    provider.mockImplementation((path: string) => {
      if (path.startsWith('/instance/connectionState')) return Promise.resolve({ instance: { state: 'open' } });
      if (path === '/instance/fetchInstances') return Promise.resolve([
        { name: instanceName, ownerJid: '20999999999@s.whatsapp.net' },
      ]);
      return Promise.reject(new Error('Unexpected provider call: ' + path));
    });
    expect((await service.state(restaurantId)).state).toBe('NOT_CONNECTED');
    provider.mockImplementation((path: string) => {
      if (path.startsWith('/instance/connectionState')) return Promise.resolve({ instance: { state: 'open' } });
      if (path === '/instance/fetchInstances') return Promise.resolve([{ name: 'wayta-foreign' }]);
      return Promise.reject(new Error('Unexpected provider call: ' + path));
    });
    expect((await service.state(restaurantId)).state).toBe('NOT_CONNECTED');
  });

  it('adopts the expected orphaned instance without creating or deleting it', async () => {
    const { provider, service, db } = createSubject();
    provider.mockImplementation((path: string) => {
      if (path.startsWith('/instance/fetchInstances')) {
        return Promise.resolve([{ instance: { instanceName } }]);
      }
      if (path.startsWith('/webhook/find')) return Promise.resolve(null);
      if (path.startsWith('/webhook/set')) return Promise.resolve({ webhook: {} });
      if (path.startsWith('/instance/connect')) return Promise.resolve({ qrcode: { code: 'test-qr-payload' } });
      return Promise.reject(new Error('Unexpected provider call: ' + path));
    });

    const result = await service.connect(restaurantId);
    expect(result.connected).toBe(false);
    expect(result.qrText).toBe('test-qr-payload');
    expect(provider).not.toHaveBeenCalledWith('/instance/create', 'POST', expect.anything());
    const webhookRequest = provider.mock.calls.find(x => x[0].startsWith('/webhook/set'));
    // Enforce the *actual* Evolution 2.3.7 schema, not the flattened API docs.
    const webhookBody: unknown = webhookRequest?.[2];
    expect(webhookBody).toMatchObject({
      webhook: {
        enabled: true,
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    });
    expect(Object.keys(webhookBody as Record<string, unknown>)).toEqual(['webhook']);
    const envelope = (webhookBody as { webhook: { url: string } }).webhook;
    expect(envelope.url).toMatch(/^https:\/\/menu\.example\.com\/api\/v1\/whatsapp-tracking\/webhook\/[a-f0-9]{64}$/);
    const savedAssociation: unknown = db.whatsappConnection.upsert.mock.calls[0]?.[0];
    expect(savedAssociation).toMatchObject({
      where: { restaurantId },
      create: { restaurantId, instanceName },
    });
  });

  it('refuses to hijack a webhook belonging to another service', async () => {
    const { provider, service, db } = createSubject();
    provider.mockImplementation((path: string) => {
      if (path.startsWith('/instance/fetchInstances')) return Promise.resolve([{ name: instanceName }]);
      if (path.startsWith('/webhook/find')) return Promise.resolve({
        enabled: true, url: 'https://another-project.example.com/incoming',
      });
      return Promise.reject(new Error('Unexpected provider call: ' + path));
    });
    await expect(service.connect(restaurantId)).rejects.toBeInstanceOf(ConflictException);
    expect(provider.mock.calls.some(x => x[0].startsWith('/webhook/set'))).toBe(false);
    expect(db.whatsappConnection.upsert).not.toHaveBeenCalled();
  });

  it('refuses to adopt an instance linked to a different phone', async () => {
    const { provider, service, db } = createSubject();
    provider.mockResolvedValue([{ name: instanceName, ownerJid: '20999999999@s.whatsapp.net' }]);
    await expect(service.connect(restaurantId)).rejects.toBeInstanceOf(ConflictException);
    expect(db.whatsappConnection.upsert).not.toHaveBeenCalled();
  });

  it('keeps pairing by code disabled by default without any provider side effects', async () => {
    const { provider, service, db } = createSubject();
    await expect(service.connect(restaurantId, 'CODE')).rejects.toThrow('WHATSAPP_PAIRING_CODE_DISABLED');
    expect(provider).not.toHaveBeenCalled();
    expect(db.whatsappConnection.upsert).not.toHaveBeenCalled();
    expect((await service.state(restaurantId)).pairingCodeEnabled).toBe(false);
  });

  it('requests an ephemeral code for the stored restaurant number only when operator-enabled', async () => {
    const { provider, service, db } = createSubject(true);
    provider.mockImplementation((path: string) => {
      if (path === '/instance/fetchInstances') return Promise.resolve([{ name: instanceName }]);
      if (path.startsWith('/webhook/find')) return Promise.resolve(null);
      if (path.startsWith('/webhook/set')) return Promise.resolve({});
      if (path === '/instance/connect/' + instanceName + '?number=201000000000') {
        return Promise.resolve({ qrcode: { pairingCode: 'a1b2c3d4', code: 'qr-is-private' } });
      }
      return Promise.reject(new Error('Unexpected provider call'));
    });
    const result = await service.connect(restaurantId, 'CODE');
    expect(result).toMatchObject({
      state: 'NOT_CONNECTED', pairingCode: 'A1B2C3D4', pairingCodeEnabled: true,
      qrCode: null, qrText: null,
    });
    expect(provider).toHaveBeenCalledWith('/instance/connect/' + instanceName + '?number=201000000000');
    expect(db.whatsappConnection.upsert).toHaveBeenCalledTimes(1);
    const status = await service.state(restaurantId);
    expect(status.pairingCodeEnabled).toBe(true);
    expect(status).not.toHaveProperty('pairingCode');
  });

  it('fails closed when Evolution returns no valid pairing code and keeps QR flow available', async () => {
    const { provider, service } = createSubject(true);
    provider.mockImplementation((path: string) => {
      if (path === '/instance/fetchInstances') return Promise.resolve([{ name: instanceName }]);
      if (path.startsWith('/webhook/find')) return Promise.resolve(null);
      if (path.startsWith('/webhook/set')) return Promise.resolve({});
      if (path.includes('?number=')) return Promise.resolve({ pairingCode: null, code: 'still-a-qr' });
      if (path === '/instance/connect/' + instanceName) return Promise.resolve({ qrcode: { code: 'qr-still-works' } });
      return Promise.reject(new Error('Unexpected provider call'));
    });
    await expect(service.connect(restaurantId, 'CODE')).rejects.toThrow('WHATSAPP_PAIRING_CODE_UNAVAILABLE');
    expect((await service.connect(restaurantId)).qrText).toBe('qr-still-works');
  });

  it('rejects an invalid stored phone before provider or webhook mutations', async () => {
    const { provider, service, db } = createSubject(true);
    db.restaurant.findUnique.mockResolvedValue({
      whatsappNumber: 'bad', whatsappOrderingEnabled: true,
    });
    await expect(service.connect(restaurantId, 'CODE')).rejects.toThrow('WHATSAPP_PAIRING_NUMBER_INVALID');
    expect(provider).not.toHaveBeenCalled();
    expect(db.whatsappConnection.upsert).not.toHaveBeenCalled();
  });

  it('refuses provider pairing for a foreign linked device even when code is enabled', async () => {
    const { provider, service, db } = createSubject(true);
    provider.mockResolvedValue([{ name: instanceName, ownerJid: '20999999999@s.whatsapp.net' }]);
    await expect(service.connect(restaurantId, 'CODE')).rejects.toBeInstanceOf(ConflictException);
    expect(provider.mock.calls.some(([path]) => path.includes('?number='))).toBe(false);
    expect(db.whatsappConnection.upsert).not.toHaveBeenCalled();
  });

  it('recovers a concurrent creation when an exact matching instance appears', async () => {
    const { provider, service, db } = createSubject();
    let searches = 0;
    provider.mockImplementation((path: string) => {
      if (path.startsWith('/instance/fetchInstances')) {
        searches += 1;
        return Promise.resolve(searches === 1 ? [] : [{ name: instanceName }]);
      }
      if (path.startsWith('/instance/create')) return Promise.reject(new Error('Concurrent conflict'));
      if (path.startsWith('/webhook/find')) return Promise.resolve(null);
      if (path.startsWith('/webhook/set')) return Promise.resolve({});
      if (path.startsWith('/instance/connect')) return Promise.resolve({ qrcode: { code: 'qr-text' } });
      return Promise.reject(new Error('Unexpected provider call'));
    });
    expect((await service.connect(restaurantId)).qrText).toBe('qr-text');
    expect(db.whatsappConnection.upsert).toHaveBeenCalledTimes(1);
  });
});


describe('WhatsApp webhook receipt ingress (no customer data in logs)', () => {
  const restaurantId = '95d0e44a-9eee-4fcb-811e-bc1e62e41643';
  const branchId = '22222222-2222-4222-8222-222222222222';
  const instanceName = 'wayta-95d0e44a9eee4fcb811ebc1e62e41643';
  const key = Buffer.alloc(32, 42);
  const secret = 'f'.repeat(64);
  const secretHash = createHash('sha256').update(secret).digest('hex');

  function subject() {
    const link = { restaurantId, instanceName, webhookSecretHash: secretHash };
    const db = {
      whatsappConnection: { findUnique: jest.fn().mockResolvedValue(link) },
      restaurant: { findUnique: jest.fn().mockResolvedValue({
        whatsappNumber: '+201000000000', whatsappOrderingEnabled: true, status: 'ACTIVE',
      }) },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: branchId }) },
      whatsappOrderReceipt: { create: jest.fn((data: unknown) => Promise.resolve(data)) },
    };
    const config = { get: jest.fn((name: string) => ({
      EVOLUTION_API_URL: 'https://evolution.example.com',
      EVOLUTION_API_KEY: 'fake-key',
      WAYTA_API_PUBLIC_URL: 'https://menu.example.com',
      WHATSAPP_ORDER_SIGNING_KEY: key.toString('base64'),
    })[name as 'EVOLUTION_API_URL' | 'EVOLUTION_API_KEY' | 'WAYTA_API_PUBLIC_URL' | 'WHATSAPP_ORDER_SIGNING_KEY']) };
    const service = new WhatsappTrackingService(db as never, config as never, {
      isEnabled: jest.fn().mockResolvedValue(true),
    } as never);
    jest.spyOn(service as unknown as { fetchProvider: (path: string) => Promise<unknown> }, 'fetchProvider')
      .mockImplementation((path: string) => {
        if (path.startsWith('/instance/connectionState')) return Promise.resolve({ instance: { state: 'open' } });
        if (path.startsWith('/instance/fetchInstances')) return Promise.resolve([{
          instanceName, ownerJid: '201000000000@s.whatsapp.net',
        }]);
        return Promise.reject(new Error('Unexpected provider operation'));
      });
    const dispositions: string[] = [];
    jest.spyOn(service as unknown as { ingressDisposition: (reason: string) => void }, 'ingressDisposition')
      .mockImplementation((reason: string) => { dispositions.push(reason); });
    const signed = issueWhatsappReference({
      restaurantId, branchId, orderType: 'PICKUP',
      currencyCode: 'EGP', total: '120.50',
      baseMessage: '*Test order*\nTotal: 120.50 EGP', key,
    });
    const event = (message = signed.message): unknown => ({
      event: 'messages.upsert', instance: instanceName,
      data: { key: { fromMe: false, id: 'message-for-testing', remoteJid: '111@s.whatsapp.net' },
        message: { conversation: message } },
    });
    return { db, service, signed, event, dispositions };
  }

  it('stores a verified Evolution v2.3.7 message and emits a minimal receipt-created disposition', async () => {
    const { service, db, event, signed, dispositions } = subject();
    await service.ingest(secret, event());
    expect(db.whatsappOrderReceipt.create).toHaveBeenCalledTimes(1);
    const input: unknown = db.whatsappOrderReceipt.create.mock.calls[0]?.[0];
    expect(input).toMatchObject({ data: {
      restaurantId, branchId, reference: signed.reference,
      totalAmount: '120.50', currencyCode: 'EGP', orderType: 'PICKUP',
    } });
    expect(dispositions).toEqual(['receipt-created']);
  });

  it('distinguishes other events, outgoing messages, missing refs and tampered refs', async () => {
    const { service, db, event, signed, dispositions } = subject();
    await service.ingest(secret, { event: 'connection.update', instance: instanceName, data: { state: 'open' } });
    const normal = event('hello') as {event: string; instance: string; data: {key: {fromMe: boolean}; message: unknown}};
    await service.ingest(secret, normal);
    await service.ingest(secret, { ...normal,
      data: { ...normal.data, key: { ...normal.data.key, fromMe: true } },
    });
    await service.ingest(secret, event(signed.message.replace('Test order', 'Test orders')));
    expect(dispositions).toEqual([
      'non-message-event', 'no-order-reference', 'not-inbound-message', 'reference-signature-mismatch',
    ]);
    expect(db.whatsappOrderReceipt.create).not.toHaveBeenCalled();
  });

  it('reports connection and branch rejection without storing orders or leaking text', async () => {
    const { service, db, event, dispositions } = subject();
    const provider = jest.spyOn(service as unknown as { fetchProvider: (path: string) => Promise<unknown> }, 'fetchProvider');
    provider.mockResolvedValue({ instance: { state: 'close' } });
    await service.ingest(secret, event());
    expect(dispositions).toEqual(['connection-not-verified']);
    provider.mockImplementation((path: string) =>
      path.includes('connectionState')
        ? Promise.resolve({ instance: { state: 'open' } })
        : Promise.resolve([{ instanceName, ownerJid: '201000000000@s.whatsapp.net' }]));
    db.branch.findFirst.mockResolvedValue(null);
    await service.ingest(secret, event());
    expect(dispositions).toEqual(['connection-not-verified', 'branch-not-active']);
    expect(db.whatsappOrderReceipt.create).not.toHaveBeenCalled();
  });
});
