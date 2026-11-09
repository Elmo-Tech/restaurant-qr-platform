import {
  initialContractFields,
  legacyDefaultText,
  parseContract,
  parseLegacyContractText,
  serializeContract,
  updateContractField,
} from '../../apps/platform/src/lib/contract-document-model';
import type { ContractData } from '../../apps/platform/src/lib/api/billing';

const data: ContractData = {
  number: 'WAYTA-2026-0001',
  issuedAt: '2026-11-09T12:00:00.000Z',
  subscriptionId: 'test',
  isDraft: true,
  documentText: null,
  documentLocale: null,
  revision: 0,
  assets: { seal: null, signature: null },
  terms: {
    number: 'WAYTA-2026-0001',
    restaurant: {
      name: 'مخبوز',
      countryCode: 'EG',
      ownerEmails: [],
      ownerContact: { fullName: 'مسؤول', phone: '+201000000000' },
      menuUrl: 'https://makhboz.waytaapp.com',
    },
    package: { name: 'Pro', features: [] },
    period: 'YEARLY',
    startsAt: '2026-11-10',
    endsAt: '2027-11-10',
    pricing: {
      currencyCode: 'EGP',
      listPrice: '8000.00',
      finalPrice: '4000.00',
      offer: { label: null, percent: '50', amount: '4000.00' },
      discount: null,
    },
    graceDays: 7,
    notes: null,
    issuedBy: 'test@example.test',
  },
};

describe('contract document compatibility', () => {
  it('keeps edited values and exact monetary strings when saved and reopened', () => {
    const fields = initialContractFields(data, 'ar');
    fields.client = 'مخبوز — فرع جديد';
    fields.total = '3999.99 EGP';
    fields.statement = 'صياغة اتفق عليها العميل\nسطر ثانٍ';
    const saved = serializeContract(fields);
    expect(parseContract(saved)).toEqual(fields);
    expect(parseContract(saved)?.total).toBe('3999.99 EGP');
  });

  it('recognizes old unedited content without parsing away arbitrary saved text', () => {
    const original = legacyDefaultText(data, 'ar');
    expect(original).toContain('اسم المسؤول: مسؤول');
    expect(original).toContain('المبلغ المستحق: 4000.00 EGP');
    expect(parseContract(original)).toBeNull();
    expect(
      parseContract('{"format":"wayta-contract-v2","fields":{}}'),
    ).toBeNull();
    expect(`${original}\nشرط خاص`).not.toBe(original);
    const customized = `${original}\nشرط خاص`;
    const saved = serializeContract(
      initialContractFields(data, 'ar'),
      customized,
    );
    expect(parseLegacyContractText(saved)).toBe(customized);
    expect(parseContract(saved)?.client).toBe('مخبوز');
  });

  it('updates generated statements while retaining wording edited by the administrator', () => {
    const original = initialContractFields(data, 'ar');
    const renamed = updateContractField(
      original,
      'client',
      'مخبوز الجديد',
      'ar',
    );
    expect(renamed.statement).toContain('مخبوز الجديد');
    const customized = updateContractField(
      renamed,
      'statement',
      'صياغة خاصة',
      'ar',
    );
    const after = updateContractField(customized, 'client', 'اسم آخر', 'ar');
    expect(after.statement).toBe('صياغة خاصة');
  });
});
