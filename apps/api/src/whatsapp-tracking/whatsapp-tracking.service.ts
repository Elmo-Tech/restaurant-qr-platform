import { createHash, createHmac } from 'node:crypto';
import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { decodeSigningKey, issueWhatsappReference, verifyWhatsappReference } from './signed-whatsapp-reference';
import type { OrderQuote } from '../public/public-orders.service';

type JsonMap = Record<string, unknown>;
const record = (value: unknown): JsonMap => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonMap : {};
const digits = (value: string): string => value.replace(/\D/g, '');
const hash = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Provider responses differ by Evolution version. Never accept a fuzzy name match. */
export function evolutionInstances(payload: unknown): JsonMap[] | null {
  if (Array.isArray(payload)) return payload.map(record);
  const value = record(payload);
  if (Array.isArray(value.response)) return value.response.map(record);
  if (Array.isArray(value.data)) return value.data.map(record);
  if (Array.isArray(value.instances)) return value.instances.map(record);
  return null;
}
function instanceNameOf(value: JsonMap): string | null {
  const nested = record(value.instance);
  const result = value.instanceName ?? value.name ?? nested.instanceName ?? nested.name;
  return typeof result === 'string' ? result : null;
}
function instanceOwnerOf(value: JsonMap): string | null {
  const nested = record(value.instance);
  const owner = value.ownerJid ?? nested.ownerJid;
  return typeof owner === 'string' ? owner : null;
}
/** null means no webhook was configured; unfamiliar non-null shapes fail closed. */
export function evolutionWebhookUrl(payload: unknown): string | null | undefined {
  if (payload === null) return null;
  if (typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const envelope = record(payload);
  const first = envelope.webhook === null ? null : record(envelope.webhook);
  const second = first && first.webhook === null ? null : record(first?.webhook);
  for (const item of [second, first, envelope]) {
    if (typeof item?.url === 'string') return item.url;
  }
  if ([envelope, first, second].some(x => x?.enabled === true)) return undefined;
  // Some Evolution releases return an empty object instead of null.
  return Object.keys(envelope).length === 0 || envelope.webhook === null ? null : undefined;
}

function safeBase(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)); }
  catch { return false; }
}
export function parseInboundEvolutionMessage(raw: unknown): { id: string; text: string } | null {
  const event = record(raw);
  if (!['messages.upsert','MESSAGES_UPSERT'].includes(String(event.event))) return null;
  const data = record(event.data);
  const key = record(data.key);
  if (key.fromMe !== false || typeof key.id !== 'string' || key.id.length < 2 || key.id.length > 160) return null;
  const remote = key.remoteJid;
  if (typeof remote !== 'string' || !/@(s\.whatsapp\.net|lid)$/.test(remote)) return null;
  const message = record(data.message);
  const text = typeof message.conversation === 'string' ? message.conversation : record(message.extendedTextMessage).text;
  return typeof text === 'string' && text.length <= 12000 ? { id: key.id, text } : null;
}
export interface ConnectionView { connected: boolean; state: 'NOT_CONFIGURED' | 'NOT_CONNECTED' | 'CONNECTED' | 'UNAVAILABLE'; number: string | null; qrCode: string | null; qrText: string | null }
@Injectable()
export class WhatsappTrackingService {
  private readonly logger = new Logger(WhatsappTrackingService.name);
  constructor(private readonly db: PrismaService, private readonly cfg: ConfigService,
    private readonly features: EntitlementsService) {}
  private settings() {
    const base = String(this.cfg.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
    const apiKey = String(this.cfg.get('EVOLUTION_API_KEY') ?? '');
    const callback = String(this.cfg.get('WAYTA_API_PUBLIC_URL') ?? '').replace(/\/+$/, '');
    const signingKey = decodeSigningKey(this.cfg.get<string>('WHATSAPP_ORDER_SIGNING_KEY'));
    return safeBase(base) && safeBase(callback) && apiKey && signingKey ? { base, apiKey, callback, signingKey } : null;
  }
  private async fetchProvider(path: string, method = 'GET', body?: JsonMap): Promise<unknown> {
    const s = this.settings();
    if (!s) throw new ServiceUnavailableException('WHATSAPP_TRACKING_NOT_CONFIGURED');
    // Deliberately log only a finite operation label: no webhook URL, callback token,
    // request/response body, customer details or credentials.
    const operation = path.startsWith('/instance/create') ? 'instance-create' :
      path.startsWith('/instance/fetchInstances') ? 'instance-lookup' :
      path.startsWith('/webhook/find') ? 'webhook-lookup' :
      path.startsWith('/webhook/set') ? 'webhook-register' :
      path.startsWith('/instance/connect') ? 'instance-connect' : 'connection-state';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(s.base + path, { method,
        headers: { apikey: s.apiKey, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
      if (!response.ok) {
        this.logger.warn('Evolution ' + operation + ' HTTP ' + response.status);
        throw new ServiceUnavailableException('WHATSAPP_PROVIDER_UNAVAILABLE');
      }
      // GET /webhook/find may legitimately return JSON null.
      if (response.status === 204) return null;
      return await response.json();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn('Evolution ' + operation + ' failed (' +
        (error instanceof Error ? error.name : 'unknown') + ')');
      throw new ServiceUnavailableException('WHATSAPP_PROVIDER_UNAVAILABLE');
    } finally { clearTimeout(timer); }
  }

  private async findExactInstance(instanceName: string): Promise<JsonMap | null> {
    // Evolution v2.3.7 returns HTTP 404 for a missing name-filtered instance.
    // List the instances and match only the exact name; absence means "create".
    const payload = await this.fetchProvider('/instance/fetchInstances');
    const instances = evolutionInstances(payload);
    if (!instances) throw new ServiceUnavailableException('WHATSAPP_INSTANCE_LOOKUP_UNEXPECTED');
    return instances.find(item => instanceNameOf(item) === instanceName) ?? null;
  }
  /** Fail closed if the linked device number differs from the restaurant's configured WhatsApp. */
  private async verified(restaurantId: string) {
    const link = await this.db.whatsappConnection.findUnique({ where: { restaurantId } });
    if (!link) return null;
    const restaurant = await this.db.restaurant.findUnique({ where: { id: restaurantId },
      select: { whatsappNumber: true, whatsappOrderingEnabled: true, status: true } });
    if (!restaurant || restaurant.status !== 'ACTIVE' || !restaurant.whatsappOrderingEnabled ||
      !restaurant.whatsappNumber || !(await this.features.isEnabled(restaurantId,'WHATSAPP_ORDERING'))) return null;
    const state = record(await this.fetchProvider('/instance/connectionState/' + encodeURIComponent(link.instanceName)));
    if ((record(state.instance).state ?? state.state) !== 'open') return null;
    const providerInstance = await this.findExactInstance(link.instanceName);
    if (!providerInstance) return null;
    const owner = instanceOwnerOf(providerInstance);
    if (typeof owner !== 'string' || !owner.includes('@')) return null;
    const number = digits(owner.split('@')[0].split(':')[0]);
    if (!number || number !== digits(restaurant.whatsappNumber)) return null;
    return { link, number };
  }
  async state(restaurantId: string): Promise<ConnectionView> {
    if (!this.settings()) return { connected:false, state:'NOT_CONFIGURED', number:null, qrCode:null, qrText:null };
    const exists = await this.db.whatsappConnection.findUnique({ where: { restaurantId }, select:{ restaurantId:true } });
    if (!exists) return { connected:false, state:'NOT_CONNECTED', number:null, qrCode:null, qrText:null };
    try {
      const ok = await this.verified(restaurantId);
      return ok ? { connected:true, state:'CONNECTED', number:ok.number, qrCode:null, qrText:null } :
        { connected:false, state:'NOT_CONNECTED', number:null, qrCode:null, qrText:null };
    } catch { return { connected:false, state:'UNAVAILABLE', number:null, qrCode:null, qrText:null }; }
  }
  async connect(restaurantId: string): Promise<ConnectionView> {
    const s = this.settings();
    if (!s) throw new ServiceUnavailableException('WHATSAPP_TRACKING_NOT_CONFIGURED');
    const restaurant = await this.db.restaurant.findUnique({ where:{ id: restaurantId },
      select:{ whatsappOrderingEnabled:true, whatsappNumber:true } });
    if (!restaurant?.whatsappNumber || !restaurant.whatsappOrderingEnabled ||
        !(await this.features.isEnabled(restaurantId,'WHATSAPP_ORDERING')))
      throw new ServiceUnavailableException('WHATSAPP_ORDERING_UNAVAILABLE');
    const existing = await this.db.whatsappConnection.findUnique({ where:{ restaurantId } });
    const instanceName = existing?.instanceName ?? 'wayta-' + restaurantId.replace(/-/g, '');
    let providerInstance = await this.findExactInstance(instanceName);
    if (!providerInstance) {
      try {
        await this.fetchProvider('/instance/create', 'POST', {
          instanceName, integration:'WHATSAPP-BAILEYS', qrcode:true,
        });
      } catch (error) {
        // A concurrent click may have created it already. Recheck *exactly*
        // instead of treating any other failure as a successful create.
        providerInstance = await this.findExactInstance(instanceName);
        if (!providerInstance) throw error;
      }
      providerInstance = providerInstance ?? await this.findExactInstance(instanceName);
      if (!providerInstance) throw new ServiceUnavailableException('WHATSAPP_INSTANCE_NOT_FOUND');
    }
    // Never attach a pre-existing device that belongs to a different WhatsApp number.
    const owner = instanceOwnerOf(providerInstance);
    if (owner && digits(owner.split('@')[0].split(':')[0]) !== digits(restaurant.whatsappNumber)) {
      throw new ConflictException('WHATSAPP_INSTANCE_NUMBER_MISMATCH');
    }

    if (!existing) {
      const currentWebhook = await this.fetchProvider(
        '/webhook/find/' + encodeURIComponent(instanceName));
      const previousUrl = evolutionWebhookUrl(currentWebhook);
      const expectedPrefix = s.callback + '/api/v1/whatsapp-tracking/webhook/';
      if (previousUrl === undefined ||
          (previousUrl !== null && previousUrl !== '' &&
            (!previousUrl.startsWith(expectedPrefix) ||
             !/^[a-f0-9]{64}$/.test(previousUrl.slice(expectedPrefix.length))))) {
        // An existing unrelated webhook is *never* overwritten automatically.
        throw new ConflictException('WHATSAPP_EXISTING_INSTANCE_WEBHOOK_CONFLICT');
      }
    }

    // Deterministic per-restaurant 256-bit capability token. This lets an
    // interrupted setup safely retry without losing its callback secret.
    // Domain-separated from the message-signing HMAC; do not log or return it.
    const secret = createHmac('sha256', s.signingKey)
      .update('wayta-evolution-webhook-v1|' + restaurantId + '|' + instanceName)
      .digest('hex');
    // Evolution v2.3.7's webhook.schema.ts requires a nested 'webhook' object.
    // The properties inside it are named 'byEvents' and 'base64', not the
    // flattened API-guide aliases 'webhookByEvents'/'webhookBase64'.
    await this.fetchProvider('/webhook/set/' + encodeURIComponent(instanceName), 'POST', {
      webhook: {
        enabled: true,
        url: s.callback + '/api/v1/whatsapp-tracking/webhook/' + secret,
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    });
    await this.db.whatsappConnection.upsert({
      where:{ restaurantId },
      create:{ restaurantId, instanceName, webhookSecretHash:hash(secret) },
      update:{ webhookSecretHash:hash(secret) },
    });
    const current = await this.state(restaurantId);
    if (current.connected) return current;
    const payload = record(await this.fetchProvider('/instance/connect/' + encodeURIComponent(instanceName)));
    const qr = record(payload.qrcode);
    const image = typeof payload.base64 === 'string' ? payload.base64 :
      typeof qr.base64 === 'string' ? qr.base64 : null;
    const qrCode = image?.startsWith('data:image/png;base64,') ? image :
      image && /^[A-Za-z0-9+/=]+$/.test(image) && image.length < 200000 ?
        'data:image/png;base64,' + image : null;
    const qrTextCandidate = typeof payload.code === 'string' ? payload.code : qr.code;
    const qrText = typeof qrTextCandidate === 'string' && qrTextCandidate.length < 5000 ? qrTextCandidate : null;
    return { ...current, qrCode, qrText };
  }
  /** Never writes abandoned attempts. */
  async prepare(restaurantId: string, branchId: string, quote: OrderQuote, baseMessage: string) {
    const s = this.settings();
    if (!s) return null;
    let link;
    try { link = await this.verified(restaurantId); } catch { return null; }
    if (!link || link.number !== digits(quote.whatsappNumber)) return null;
    if (quote.orderType !== 'PICKUP' && quote.orderType !== 'DELIVERY') return null;
    return issueWhatsappReference({ restaurantId, branchId, orderType:quote.orderType, total:quote.total,
      currencyCode:quote.currencyCode, baseMessage, key:s.signingKey });
  }
  /**
   * An allowlisted *disposition only* is safe to log. Never log the callback
   * capability, event JSON, chat JID, message content, order reference or MAC.
   * The 200 webhook response also covers intentionally ignored events.
   */
  private ingressDisposition(reason: string): void {
    this.logger.log('WhatsApp webhook disposition=' + reason);
  }
  /** Webhook body is validated transiently and NEVER persisted or logged. */
  async ingest(secret: string, payload: unknown): Promise<void> {
    // Invalid capability tokens may be internet noise: do not emit attacker-triggered logs.
    if (!/^[a-f0-9]{64}$/.test(secret)) return;
    const s = this.settings();
    if (!s) { this.ingressDisposition('configuration-unavailable'); return; }
    const link = await this.db.whatsappConnection.findUnique({ where:{ webhookSecretHash:hash(secret) } });
    if (!link) return; // Do not log guessed secrets.
    if (record(payload).instance !== link.instanceName) {
      this.ingressDisposition('instance-mismatch');
      return;
    }
    const event = record(payload).event;
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      this.ingressDisposition('non-message-event');
      return;
    }
    const inbound = parseInboundEvolutionMessage(payload);
    if (!inbound) {
      const data = record(record(payload).data);
      const key = record(data.key);
      const reason = key.fromMe !== false ? 'not-inbound-message' :
        typeof key.remoteJid !== 'string' ||
          !(key.remoteJid.endsWith('@s.whatsapp.net') || key.remoteJid.endsWith('@lid')) ?
          'non-individual-chat' : 'unsupported-message-shape';
      this.ingressDisposition(reason);
      return;
    }
    // Do not log a non-order chat as if it were an order; never log its text.
    if (!inbound.text.includes('Wayta-Ref:')) {
      this.ingressDisposition('no-order-reference');
      return;
    }
    const verified = verifyWhatsappReference({ restaurantId:link.restaurantId, receivedMessage:inbound.text,
      key:s.signingKey,
      onReject: reason => this.ingressDisposition('reference-' + reason),
    });
    if (!verified) return;
    let current;
    try { current = await this.verified(link.restaurantId); }
    catch { this.ingressDisposition('connection-verification-error'); return; }
    if (!current || current.link.instanceName !== link.instanceName) {
      this.ingressDisposition('connection-not-verified');
      return;
    }
    const branch = await this.db.branch.findFirst({ where:{
      id:verified.branchId, restaurantId:link.restaurantId, status:'ACTIVE' }, select:{ id:true } });
    if (!branch) {
      this.ingressDisposition('branch-not-active');
      return;
    }
    try {
      await this.db.whatsappOrderReceipt.create({ data:{
        restaurantId:link.restaurantId, branchId:branch.id, reference:verified.reference,
        providerMessageId:inbound.id, totalAmount:verified.total,
        currencyCode:verified.currencyCode, orderType:verified.orderType,
      } });
      this.ingressDisposition('receipt-created');
    } catch(error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.ingressDisposition('duplicate-receipt');
        return;
      }
      throw error;
    }
  }
  async today(restaurantId: string) {
    const now = new Date(), from = new Date(now);
    from.setUTCHours(0,0,0,0);
    const rows = await this.db.whatsappOrderReceipt.findMany({
      where:{ restaurantId, receivedAt:{ gte:from, lt:new Date(from.getTime()+86400000) } },
      select:{ totalAmount:true, currencyCode:true } });
    const restaurant = await this.db.restaurant.findUnique({ where:{ id:restaurantId }, select:{ currencyCode:true } });
    return { count:rows.length, total:rows.reduce((sum,row)=>sum.plus(row.totalAmount),new Prisma.Decimal(0)).toFixed(2),
      currencyCode:restaurant?.currencyCode ?? 'EGP' };
  }
}
