import { isWellFormedMoneyDecimalString } from './money-decimal';

describe('isWellFormedMoneyDecimalString', () => {
  it.each(['0', '0.00', '10', '10.5', '10.50', '250.00', '999999999999.99'])(
    'accepts %s',
    (value) => {
      expect(isWellFormedMoneyDecimalString(value)).toBe(true);
    },
  );

  it.each([
    '-1',
    '-0.01',
    'NaN',
    'Infinity',
    '1e10',
    '1E10',
    '',
    'abc',
    '10.505',
    '1000000000000',
    '1000000000000.00',
    '10.',
    '.5',
    ' 10.00',
    '10.00 ',
    '10,00',
  ])('rejects %s', (value) => {
    expect(isWellFormedMoneyDecimalString(value)).toBe(false);
  });

  it('rejects a JavaScript number, never treating it as authoritative', () => {
    expect(isWellFormedMoneyDecimalString(10)).toBe(false);
  });
});
