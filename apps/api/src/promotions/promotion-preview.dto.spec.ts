import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PromotionPreviewDto } from './promotion-preview.dto';

const UUID = '0b3a5ed4-8c3c-4c2f-bf3f-6a3a8c2a1111';
const draft = {
  internalName: 'Cart',
  scope: 'CART',
  discountType: 'PERCENTAGE',
  value: '10.00',
  minimumSubtotal: '200.00',
  translations: [{ locale: 'en', title: 'Cart' }],
};
const base = { draft, branchId: UUID, orderType: 'PICKUP' };

async function errors(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(PromotionPreviewDto, body);
  return (await validate(dto, { whitelist: true })).map(
    ({ property }) => property,
  );
}

describe('PromotionPreviewDto (DEC-077 B3 opt-in contract)', () => {
  it('without `contract` the pre-B3 validation applies: items are required', async () => {
    expect(await errors({ ...base, items: [] })).toEqual([]);
    expect(await errors(base)).toEqual(['items']);
    // contextual fields are not validated (nor used) without the contract
    expect(
      await errors({
        ...base,
        items: [],
        requestId: 'x',
        sampleProductId: 'nope',
      }),
    ).toEqual([]);
  });

  it('with CONTEXTUAL_V1 items are optional and the extra fields are strict', async () => {
    const contextual = { ...base, contract: 'CONTEXTUAL_V1' };
    expect(await errors(contextual)).toEqual([]);
    expect(
      await errors({
        ...contextual,
        requestId: 'abcd1234',
        sampleProductId: UUID,
      }),
    ).toEqual([]);
    expect(await errors({ ...contextual, requestId: 'short' })).toEqual([
      'requestId',
    ]);
    expect(await errors({ ...contextual, requestId: 'has a space!' })).toEqual([
      'requestId',
    ]);
    expect(await errors({ ...contextual, requestId: 'x'.repeat(65) })).toEqual([
      'requestId',
    ]);
    expect(await errors({ ...contextual, sampleProductId: 'nope' })).toEqual([
      'sampleProductId',
    ]);
    // an explicit basket is still validated
    expect(
      await errors({
        ...contextual,
        items: [{ productId: UUID, quantity: 0 }],
      }),
    ).toEqual(['items']);
  });

  it('only CONTEXTUAL_V1 is a known contract', async () => {
    expect(
      await errors({ ...base, items: [], contract: 'CONTEXTUAL_V2' }),
    ).toEqual(['contract']);
    expect(await errors({ ...base, items: [], contract: null })).toEqual([
      'contract',
    ]);
  });
});
