import { isRestaurantLocaleActive } from './menu-translation.helper';

function buildTx(row: { isActive: boolean } | null) {
  const findUnique = jest.fn().mockResolvedValue(row);
  return { tx: { restaurantLocale: { findUnique } } as never, findUnique };
}

describe('isRestaurantLocaleActive', () => {
  it('returns true for an existing active row', async () => {
    const { tx } = buildTx({ isActive: true });

    await expect(
      isRestaurantLocaleActive(tx, 'restaurant-1', 'ar'),
    ).resolves.toBe(true);
  });

  it('returns false for an existing inactive row', async () => {
    const { tx } = buildTx({ isActive: false });

    await expect(
      isRestaurantLocaleActive(tx, 'restaurant-1', 'ar'),
    ).resolves.toBe(false);
  });

  it('returns false for a missing row -- never creates or repairs it', async () => {
    const { tx, findUnique } = buildTx(null);

    await expect(
      isRestaurantLocaleActive(tx, 'restaurant-1', 'ar'),
    ).resolves.toBe(false);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        restaurantId_locale: { restaurantId: 'restaurant-1', locale: 'ar' },
      },
      select: { isActive: true },
    });
  });
});
