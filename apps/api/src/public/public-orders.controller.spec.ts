import { PublicOrdersController } from './public-orders.controller';
import type { GuestOrderView } from './public-orders.service';

const SAMPLE_DATA: GuestOrderView = {
  id: 'order-1',
  status: 'PENDING',
  currencyCode: 'EGP',
  total: '100.00',
  createdAt: '2026-01-01T00:00:00.000Z',
  type: 'DINE_IN',
  table: { number: '7' },
  pickupBranch: null,
  delivery: null,
  subtotal: '100.00',
  deliveryFee: '0.00',
  items: [],
};

describe('PublicOrdersController', () => {
  let publicOrdersService: { createOrder: jest.Mock };
  let controller: PublicOrdersController;

  beforeEach(() => {
    publicOrdersService = { createOrder: jest.fn() };
    controller = new PublicOrdersController(publicOrdersService as never);
  });

  it('passes publicCode + DTO fields through unchanged', async () => {
    publicOrdersService.createOrder.mockResolvedValue({ outcome: 'created', data: SAMPLE_DATA });

    await controller.createOrder('code-1', {
      clientRequestId: 'req-1',
      items: [{ productId: 'product-1', quantity: 2 }],
    });

    expect(publicOrdersService.createOrder).toHaveBeenCalledWith({
      publicCode: 'code-1',
      clientRequestId: 'req-1',
      items: [{ productId: 'product-1', quantity: 2, modifierOptionIds: [] }],
    });
  });

  it('returns the data on success', async () => {
    publicOrdersService.createOrder.mockResolvedValue({ outcome: 'created', data: SAMPLE_DATA });

    const body = await controller.createOrder('code-1', { clientRequestId: 'req-1', items: [] });

    expect(body).toEqual({ data: SAMPLE_DATA });
  });

  it('maps qrNotFound to 404 QR_NOT_FOUND', async () => {
    publicOrdersService.createOrder.mockResolvedValue({ outcome: 'qrNotFound' });

    await expect(
      controller.createOrder('code-1', { clientRequestId: 'req-1', items: [] }),
    ).rejects.toMatchObject({
      response: { error: { code: 'QR_NOT_FOUND' } },
    });
  });

  it('maps itemsUnavailable to 409 ORDER_ITEM_UNAVAILABLE', async () => {
    publicOrdersService.createOrder.mockResolvedValue({ outcome: 'itemsUnavailable' });

    await expect(
      controller.createOrder('code-1', { clientRequestId: 'req-1', items: [] }),
    ).rejects.toMatchObject({
      response: { error: { code: 'ORDER_ITEM_UNAVAILABLE' } },
    });
  });

  it('maps duplicateItems to 400 VALIDATION_ERROR', async () => {
    publicOrdersService.createOrder.mockResolvedValue({ outcome: 'duplicateItems' });

    await expect(
      controller.createOrder('code-1', { clientRequestId: 'req-1', items: [] }),
    ).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR' } },
    });
  });
});
