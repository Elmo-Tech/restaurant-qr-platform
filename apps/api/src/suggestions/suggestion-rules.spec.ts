import {
  MAX_SUGGESTIONS_SHOWN,
  mergeSuggestions,
  usesAutomatic,
  usesManualRules,
} from './suggestion-rules';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('suggestion rules', () => {
  it('puts manual rules before automatic ones and keeps their order', () => {
    const all = new Set(ids(10));
    expect(
      mergeSuggestions({
        cart: ['p1'],
        manual: ['p5', 'p3'],
        automatic: ['p4', 'p2'],
        eligible: all,
      }),
    ).toEqual(['p5', 'p3', 'p4', 'p2']);
  });

  it('never suggests what is already in the cart, a repeat, or an ineligible product', () => {
    expect(
      mergeSuggestions({
        cart: ['p1', 'p2'],
        manual: ['p2', 'p3', 'p3', 'p9'],
        automatic: ['p1', 'p4', 'p3'],
        eligible: new Set(['p1', 'p2', 'p3', 'p4']),
      }),
    ).toEqual(['p3', 'p4']);
  });

  it('stops at the limit', () => {
    const result = mergeSuggestions({
      cart: [],
      manual: ids(10),
      automatic: [],
      eligible: new Set(ids(10)),
    });
    expect(result).toHaveLength(MAX_SUGGESTIONS_SHOWN);
    expect(result).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(
      mergeSuggestions({
        cart: [],
        manual: ids(10),
        automatic: [],
        eligible: new Set(ids(10)),
        limit: 2,
      }),
    ).toEqual(['p1', 'p2']);
  });

  it('answers nothing when nothing qualifies', () => {
    expect(
      mergeSuggestions({
        cart: [],
        manual: [],
        automatic: [],
        eligible: new Set(),
      }),
    ).toEqual([]);
  });

  it('maps each mode to its sources', () => {
    expect([usesManualRules('OFF'), usesAutomatic('OFF')]).toEqual([
      false,
      false,
    ]);
    expect([usesManualRules('MANUAL'), usesAutomatic('MANUAL')]).toEqual([
      true,
      false,
    ]);
    expect([usesManualRules('AUTO'), usesAutomatic('AUTO')]).toEqual([
      false,
      true,
    ]);
    expect([usesManualRules('BOTH'), usesAutomatic('BOTH')]).toEqual([
      true,
      true,
    ]);
  });
});
