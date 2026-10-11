import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBranchDto } from '../branches/dto/create-branch.dto';
import { CreateDeliveryZoneDto } from '../delivery/dto/create-delivery-zone.dto';
import {
  planNameTranslations,
  resolveLocalizedName,
} from './name-translations';

describe('resolveLocalizedName', () => {
  const translations = [
    { locale: 'en', name: 'Downtown' },
    { locale: 'ar', name: 'وسط البلد' },
  ];

  it('prefers the requested locale', () => {
    expect(
      resolveLocalizedName({ requestedLocale: 'ar', defaultLocale: 'en', translations, legacyName: 'Legacy' }),
    ).toBe('وسط البلد');
  });

  it('falls back to the default locale, then to the legacy name', () => {
    expect(
      resolveLocalizedName({
        requestedLocale: 'ar',
        defaultLocale: 'en',
        translations: [{ locale: 'en', name: 'Downtown' }],
        legacyName: 'Legacy',
      }),
    ).toBe('Downtown');
    expect(
      resolveLocalizedName({ requestedLocale: 'ar', defaultLocale: 'en', translations: [], legacyName: 'Legacy' }),
    ).toBe('Legacy');
  });

  it('never returns a blank label', () => {
    expect(
      resolveLocalizedName({
        requestedLocale: 'ar',
        defaultLocale: 'en',
        translations: [{ locale: 'ar', name: '   ' }],
        legacyName: 'Legacy',
      }),
    ).toBe('Legacy');
  });
});

describe('planNameTranslations', () => {
  it('treats name as the default-locale value and upserts other locales', () => {
    const result = planNameTranslations({
      defaultLocale: 'en',
      name: 'Maadi',
      translations: [{ locale: 'ar', name: 'المعادي' }],
    });

    expect(result).toEqual({
      ok: true,
      plan: {
        name: 'Maadi',
        upserts: [
          { locale: 'ar', name: 'المعادي' },
          { locale: 'en', name: 'Maadi' },
        ],
        deleteLocales: [],
      },
    });
  });

  it('lets the default-locale translation win over name', () => {
    const result = planNameTranslations({
      defaultLocale: 'ar',
      name: 'ignored',
      translations: [{ locale: 'ar', name: 'المعادي' }],
    });

    expect(result.ok && result.plan.name).toBe('المعادي');
  });

  it('leaves name untouched when neither name nor a default translation is sent', () => {
    const result = planNameTranslations({
      defaultLocale: 'en',
      name: undefined,
      translations: [{ locale: 'ar', name: 'المعادي' }],
    });

    expect(result).toEqual({
      ok: true,
      plan: { name: undefined, upserts: [{ locale: 'ar', name: 'المعادي' }], deleteLocales: [] },
    });
  });

  it('an empty non-default name removes that locale; the default locale can never be removed', () => {
    const removal = planNameTranslations({
      defaultLocale: 'en',
      name: undefined,
      translations: [{ locale: 'ar', name: '' }],
    });
    expect(removal.ok && removal.plan).toEqual({ name: undefined, upserts: [], deleteLocales: ['ar'] });

    const blockedDefault = planNameTranslations({
      defaultLocale: 'en',
      name: 'Maadi',
      translations: [{ locale: 'en', name: '' }],
    });
    expect(blockedDefault).toEqual({ ok: false, reason: 'defaultNameRequired' });
  });

  it('is a no-op for a legacy client that sends nothing', () => {
    expect(planNameTranslations({ defaultLocale: 'en', name: undefined, translations: undefined })).toEqual({
      ok: true,
      plan: { name: undefined, upserts: [], deleteLocales: [] },
    });
  });
});

describe('translations DTO validation', () => {
  async function errorsFor(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateBranchDto, {
      name: 'Maadi',
      timezone: 'Africa/Cairo',
      ...payload,
    });
    return validate(dto);
  }

  it('accepts a normal bilingual payload and normalizes locale case/whitespace', async () => {
    const dto = plainToInstance(CreateBranchDto, {
      name: 'Maadi',
      timezone: 'Africa/Cairo',
      translations: [{ locale: ' AR ', name: '  المعادي ' }],
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.translations).toEqual([{ locale: 'ar', name: 'المعادي' }]);
  });

  it('accepts an empty name (remove) but rejects an unknown locale, a repeated locale and a long name', async () => {
    expect(await errorsFor({ translations: [{ locale: 'ar', name: '' }] })).toHaveLength(0);
    expect(await errorsFor({ translations: [{ locale: 'fr', name: 'Maadi' }] })).not.toHaveLength(0);
    expect(
      await errorsFor({
        translations: [
          { locale: 'ar', name: 'أ' },
          { locale: 'ar', name: 'ب' },
        ],
      }),
    ).not.toHaveLength(0);
    expect(await errorsFor({ translations: [{ locale: 'ar', name: 'x'.repeat(101) }] })).not.toHaveLength(0);
  });

  it('the Delivery zone DTO shares the same rules', async () => {
    const valid = plainToInstance(CreateDeliveryZoneDto, {
      name: 'University',
      deliveryFee: '25.00',
      minimumOrder: '100.00',
      translations: [{ locale: 'ar', name: 'الجامعة' }],
    });
    const invalid = plainToInstance(CreateDeliveryZoneDto, {
      name: 'University',
      deliveryFee: '25.00',
      minimumOrder: '100.00',
      translations: [{ locale: 'de', name: 'Uni' }],
    });

    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});
