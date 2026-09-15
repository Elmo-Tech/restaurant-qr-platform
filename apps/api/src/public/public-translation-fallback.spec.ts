import { resolvePublicField } from './public-translation-fallback';

const DEFAULT_ROW = { locale: 'en', name: 'Burger', description: 'Beef burger with cheese.' };

describe('resolvePublicField', () => {
  it('uses the requested-locale name and description when both are present', () => {
    const requested = { locale: 'ar', name: 'برجر', description: 'برجر لحم بالجبنة.' };

    expect(resolvePublicField(requested, DEFAULT_ROW)).toEqual({
      name: 'برجر',
      description: 'برجر لحم بالجبنة.',
    });
  });

  it('falls back to the default-locale description when the requested-locale description is null', () => {
    const requested = { locale: 'ar', name: 'برجر', description: null };

    expect(resolvePublicField(requested, DEFAULT_ROW)).toEqual({
      name: 'برجر',
      description: 'Beef burger with cheese.',
    });
  });

  it('falls back to the default-locale description when the requested-locale description is an empty string', () => {
    const requested = { locale: 'ar', name: 'برجر', description: '' };

    expect(resolvePublicField(requested, DEFAULT_ROW)).toEqual({
      name: 'برجر',
      description: 'Beef burger with cheese.',
    });
  });

  it('falls back to the default-locale name and description when no requested-locale row exists at all', () => {
    expect(resolvePublicField(undefined, DEFAULT_ROW)).toEqual({
      name: 'Burger',
      description: 'Beef burger with cheese.',
    });
  });

  it('resolves description to null when neither the requested nor the default row has one', () => {
    const noDescriptionDefault = { locale: 'en', name: 'Water', description: null };

    expect(resolvePublicField(undefined, noDescriptionDefault)).toEqual({
      name: 'Water',
      description: null,
    });
  });
});
