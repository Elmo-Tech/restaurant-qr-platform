import { ModifierSizeSettingsService } from './modifier-size-settings.service';

describe('per-size Modifier settings (authoritative Restaurant + Product scope)', () => {
  const ids = {
    restaurantId: '11111111-1111-4111-8111-111111111111',
    productId: '22222222-2222-4222-8222-222222222222',
    groupId: '33333333-3333-4333-8333-333333333333',
    variantId: '44444444-4444-4444-8444-444444444444',
  };
  const group = {
    id: ids.groupId, status: 'ACTIVE', minimumSelections: 1,
    options: [
      { id: '55555555-5555-4555-8555-555555555555', status: 'ACTIVE' },
      { id: '66666666-6666-4666-8666-666666666666', status: 'ACTIVE' },
    ],
  };
  const input = {
    enabled: true,
    options: group.options.map(option => ({
      optionId: option.id, enabled: true, priceAdjustment: null as string | null,
    })),
  };
  function setup() {
    const db = {
      modifierGroup: { findFirst: jest.fn().mockResolvedValue(group) },
      productVariant: { findFirst: jest.fn().mockResolvedValue({ id: ids.variantId }) },
      modifierGroupSizeSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
      modifierOptionSizeSetting: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = { ...db, $transaction: jest.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)) };
    const service = new ModifierSizeSettingsService(prisma as never);
    return { db, prisma, service };
  }

  it('inherits Product/Preset defaults if size has no override rows', async () => {
    const { service, db } = setup();
    expect(await service.get(ids)).toEqual(input);
    expect(db.modifierGroup.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ids.groupId, productId: ids.productId, restaurantId: ids.restaurantId },
    }));
    expect(db.productVariant.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ids.variantId, productId: ids.productId, restaurantId: ids.restaurantId },
    }));
  });

  it('reads a disabled group and an explicit price (including 0) only for this size', async () => {
    const { db, service } = setup();
    db.modifierGroupSizeSetting.findUnique.mockResolvedValue({ enabled: false });
    db.modifierOptionSizeSetting.findMany.mockResolvedValue([{
      optionId: group.options[0].id, enabled: false, priceAdjustment: {
        toFixed: () => '0.00',
      },
    }]);
    expect(await service.get(ids)).toEqual({
      enabled: false, options: [
        { optionId: group.options[0].id, enabled: false, priceAdjustment: '0.00' },
        { optionId: group.options[1].id, enabled: true, priceAdjustment: null },
      ],
    });
  });

  it('refuses a foreign Product/Variant before modifying anything', async () => {
    const { db, service } = setup();
    db.productVariant.findFirst.mockResolvedValue(null);
    await expect(service.put(ids, input)).rejects.toThrow();
    expect(db.modifierGroupSizeSetting.deleteMany).not.toHaveBeenCalled();
    expect(db.modifierOptionSizeSetting.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses duplicated or foreign Options and impossible required Groups', async () => {
    const { service, db } = setup();
    await expect(service.put(ids, { enabled: true,
      options: [input.options[0], input.options[0]],
    })).rejects.toThrow();
    await expect(service.put(ids, { enabled: true,
      options: input.options.map(option => ({ ...option, enabled: false })),
    })).rejects.toThrow();
    expect(db.modifierOptionSizeSetting.createMany).not.toHaveBeenCalled();
    expect(db.modifierGroupSizeSetting.deleteMany).not.toHaveBeenCalled();
  });

  it('saves price and availability only on the selected size without changing Presets', async () => {
    const { service, db } = setup();
    const update = {
      enabled: true,
      options: [
        { optionId: group.options[0].id, enabled: true, priceAdjustment: '25.50' },
        { optionId: group.options[1].id, enabled: false, priceAdjustment: null },
      ],
    };
    expect(await service.put(ids, update)).toEqual(update);
    expect(db.modifierOptionSizeSetting.deleteMany).toHaveBeenCalledWith({
      where: { variantId: ids.variantId, optionId: { in: group.options.map(option => option.id) } },
    });
    const payload = db.modifierOptionSizeSetting.createMany.mock.calls[0]?.[0] as {
      data: {restaurantId:string;variantId:string;priceAdjustment:{toFixed:(n:number)=>string}|null}[];
    };
    expect(payload.data).toHaveLength(2);
    expect(payload.data[0].restaurantId).toBe(ids.restaurantId);
    expect(payload.data[0].variantId).toBe(ids.variantId);
    expect(payload.data[0].priceAdjustment?.toFixed(2)).toBe('25.50');
    expect(db.modifierGroupSizeSetting.create).not.toHaveBeenCalled();
  });

  it('disables a group in only one size and can reset to inheritance', async () => {
    const { db, service } = setup();
    await service.put(ids, { ...input, enabled: false });
    expect(db.modifierGroupSizeSetting.create).toHaveBeenCalledWith({
      data: { restaurantId: ids.restaurantId, groupId: ids.groupId,
        variantId: ids.variantId, enabled: false },
    });
    db.modifierGroupSizeSetting.create.mockClear();
    await service.put(ids, input);
    expect(db.modifierGroupSizeSetting.deleteMany).toHaveBeenCalledTimes(2);
    expect(db.modifierGroupSizeSetting.create).not.toHaveBeenCalled();
    expect(db.modifierOptionSizeSetting.createMany).not.toHaveBeenCalled();
  });
});
