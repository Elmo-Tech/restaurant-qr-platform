import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TAG = 'Wayta-Ref: ';
const TOKEN_PATTERN = /^WT1\.([0-9a-z]+)\.([a-f0-9]{18})\.([a-f0-9]{32})\.([0-9a-z]+)\.([A-Z]{3})\.([PD])\.([A-Za-z0-9_-]{22})$/;
const MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 60;

/** This is an actual received-message proof, not a click/wa.me redirect counter.
 * Only an exact, unedited Backend-priced WhatsApp message can be verified. */
export interface VerifiedWhatsappReference {
  reference: string;
  branchId: string;
  orderType: 'PICKUP' | 'DELIVERY';
  total: string;
  currencyCode: string;
}

const canonical = (value: string): string => value.replace(/\r\n?/g, '\n').trim();
const digest = (value: string): string => createHash('sha256').update(canonical(value), 'utf8').digest('hex');

function amountToCents(value: string): bigint {
  if (!/^(0|[1-9]\d{0,11})\.\d{2}$/.test(value)) throw new Error('Invalid money snapshot');
  const [whole, fraction] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction);
}
function centsToAmount(value: bigint): string {
  return (value / 100n).toString() + '.' + (value % 100n).toString().padStart(2, '0');
}
function signature(key: Buffer, restaurantId: string, payload: string, message: string): string {
  return createHmac('sha256', key)
    .update(restaurantId + '|' + payload + '|' + digest(message), 'utf8')
    .digest('base64url')
    .slice(0, 22);
}
export function decodeSigningKey(base64: string | undefined): Buffer | null {
  if (!base64 || !/^[A-Za-z0-9+/]{43}=$/.test(base64)) return null;
  const key = Buffer.from(base64, 'base64');
  return key.length === 32 && key.toString('base64') === base64 ? key : null;
}
export function issueWhatsappReference(input: {
  restaurantId: string;
  branchId: string;
  orderType: 'PICKUP' | 'DELIVERY';
  total: string;
  currencyCode: string;
  baseMessage: string;
  key: Buffer;
  now?: number;
}): { reference: string; message: string } {
  if (!/^[0-9a-f-]{36}$/i.test(input.branchId)) throw new Error('Invalid branch');
  if (!/^[A-Z]{3}$/.test(input.currencyCode)) throw new Error('Invalid currency');
  const issued = Math.floor((input.now ?? Date.now()) / 1000).toString(36);
  const nonce = randomBytes(9).toString('hex');
  const branch = input.branchId.toLowerCase().replace(/-/g, '');
  const cents = amountToCents(input.total).toString(36);
  const kind = input.orderType === 'DELIVERY' ? 'D' : 'P';
  const payload = 'WT1.' + [issued, nonce, branch, cents, input.currencyCode, kind].join('.');
  const reference = payload + '.' + signature(input.key, input.restaurantId, payload, input.baseMessage);
  return { reference, message: canonical(input.baseMessage) + '\n\n' + TAG + reference };
}
export function verifyWhatsappReference(input: {
  restaurantId: string;
  receivedMessage: string;
  key: Buffer;
  now?: number;
}): VerifiedWhatsappReference | null {
  if (input.receivedMessage.length > 12000) return null;
  const received = canonical(input.receivedMessage);
  const match = /\n\nWayta-Ref: (WT1\.[^\s]+)$/.exec(received);
  if (!match) return null;
  const token = match[1];
  const parts = TOKEN_PATTERN.exec(token);
  if (!parts) return null;
  const [, issuedString, , branch, centsString, currency, kind, mac] = parts;
  const issued = parseInt(issuedString, 36);
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  if (!Number.isSafeInteger(issued) || issued > now + MAX_FUTURE_SKEW_SECONDS ||
      issued < now - MAX_AGE_SECONDS) return null;
  const cents = BigInt(parseInt(centsString, 36));
  if (cents < 0n || cents > 99999999999999n) return null;
  const payload = token.slice(0, -(mac.length + 1));
  const body = received.slice(0, match.index);
  const expected = signature(input.key, input.restaurantId, payload, body);
  if (!timingSafeEqual(Buffer.from(mac, 'ascii'), Buffer.from(expected, 'ascii'))) return null;
  const branchId = [branch.slice(0,8), branch.slice(8,12), branch.slice(12,16), branch.slice(16,20), branch.slice(20)].join('-');
  return {
    reference: token,
    branchId,
    orderType: kind === 'D' ? 'DELIVERY' : 'PICKUP',
    total: centsToAmount(cents),
    currencyCode: currency,
  };
}
