import { randomBytes } from 'node:crypto';
import { decodeSigningKey, issueWhatsappReference, verifyWhatsappReference } from './signed-whatsapp-reference';

const key = randomBytes(32);
const restaurantId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const base = '🧾 *New order*\nBurger x 2\nTotal: 120.50 EGP\nSent from Wayta';
function issue(now = Date.UTC(2026, 10, 5, 12)) {
  return issueWhatsappReference({ restaurantId, branchId, orderType: 'PICKUP',
    currencyCode: 'EGP', total: '120.50', baseMessage: base, key, now });
}
describe('stateless WhatsApp order receipt authentication', () => {
  it('verifies unmodified order and recovers exact decimal-safe metadata', () => {
    const now = Date.UTC(2026, 10, 5, 12);
    const result = issue(now);
    expect(verifyWhatsappReference({ restaurantId, key, receivedMessage: result.message, now }))
      .toEqual({ reference: result.reference, branchId, total: '120.50', currencyCode: 'EGP', orderType: 'PICKUP' });
  });
  it('ignores opening WhatsApp, messages without a token, and tampered text', () => {
    const now = Date.UTC(2026, 10, 5, 12);
    const message = issue(now).message;
    expect(verifyWhatsappReference({ restaurantId, key, receivedMessage: base, now })).toBeNull();
    expect(verifyWhatsappReference({ restaurantId, key, receivedMessage: message.replace('Burger x 2', 'Burger x 20'), now })).toBeNull();
    expect(verifyWhatsappReference({ restaurantId: branchId, key, receivedMessage: message, now })).toBeNull();
    expect(verifyWhatsappReference({ restaurantId, key: randomBytes(32), receivedMessage: message, now })).toBeNull();
  });
  it('rejects expired and future tokens, including appended garbage', () => {
    const now = Date.UTC(2026, 10, 5, 12);
    const message = issue(now).message;
    expect(verifyWhatsappReference({ restaurantId, key, receivedMessage: message, now: now + 25 * 3600_000 })).toBeNull();
    expect(verifyWhatsappReference({ restaurantId, key, receivedMessage: message, now: now - 120_000 })).toBeNull();
    expect(verifyWhatsappReference({ restaurantId, key, receivedMessage: message + ' hacked', now })).toBeNull();
  });
  it('requires a canonical 32-byte secret', () => {
    const secret = randomBytes(32).toString('base64');
    expect(decodeSigningKey(secret)?.length).toBe(32);
    expect(decodeSigningKey('test')).toBeNull();
  });
});
