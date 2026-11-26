import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROBLEM_CODES, EXCLUDED_CODES, COMPETITION_REASONS, OMITTED_REASONS, DIAGNOSTIC_STATUSES,
  ILLUSTRATIVE_REASONS, LOCAL_INCOMPLETE_REASONS, problemKey, excludedKey, competitionKey,
  omittedKey, diagnosticKey, illustrativeReasonKey, incompleteKey, isZeroAmount, pairExamples,
  carriesFigures, isApplied, showsPotential,
} from './preview-view.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const union = (text, name) => {
  const match = text.match(new RegExp(`export type ${name}\\s*=([\\s\\S]*?);`));
  assert.ok(match, `missing union ${name}`);
  return [...match[1].matchAll(/'([A-Z_]+)'/g)].map((entry) => entry[1]);
};

test('known codes track API unions and have English and Arabic messages', () => {
  const api = source('./api.ts');
  for (const [name, codes] of [['PreviewDiagnostic', DIAGNOSTIC_STATUSES], ['CompetitionReason', COMPETITION_REASONS], ['OmittedExampleReason', OMITTED_REASONS], ['IllustrativeReason', ILLUSTRATIVE_REASONS]]) {
    assert.deepEqual([...codes].sort(), union(api, name).sort(), name);
  }
  const engine = source('../../../../api/src/promotions/promotion-engine.ts');
  for (const code of union(engine, 'PromotionInputProblemCode')) assert.ok(PROBLEM_CODES.includes(code), code);
  const text = source('../i18n/messages/promotions.ts');
  const arabicStart = text.indexOf("'promotions.title'", text.indexOf("'promotions.title'") + 1);
  assert.ok(arabicStart > 0);
  const english = text.slice(0, arabicStart);
  const arabic = text.slice(arabicStart);
  for (const [codes, key] of [[PROBLEM_CODES, problemKey], [EXCLUDED_CODES, excludedKey], [COMPETITION_REASONS, competitionKey], [OMITTED_REASONS, omittedKey], [DIAGNOSTIC_STATUSES, diagnosticKey], [ILLUSTRATIVE_REASONS, illustrativeReasonKey], [LOCAL_INCOMPLETE_REASONS, incompleteKey]]) {
    for (const code of codes) {
      const message = `'${key(code)}': '`;
      assert.ok(english.includes(message), `en ${code}`);
      const line = arabic.split('\n').find((entry) => entry.includes(message));
      assert.ok(line && /[\u0600-\u06FF]/.test(line), `ar ${code}`);
    }
  }
});

test('an illustrative no-product result discloses the 500-product scan in both languages', () => {
  const text = source('../i18n/messages/promotions.ts');
  const lines = text.split('\n').filter((line) => line.includes("'promotions.preview.illustrativeReason.NO_ORDERABLE_APPLICABLE_PRODUCT':"));
  assert.equal(lines.length, 2);
  for (const line of lines) assert.match(line, /500/);
});

test('unknown backend codes use safe localized fallbacks', () => {
  assert.equal(problemKey('UNKNOWN'), 'promotions.preview.problem.OTHER');
  assert.equal(excludedKey('UNKNOWN'), 'promotions.preview.excluded.ITEM_NOT_ORDERABLE');
  assert.equal(competitionKey('UNKNOWN'), 'promotions.preview.winner.ITEM_OFFER_BEATEN_ON_SAME_ITEMS');
  assert.equal(omittedKey('UNKNOWN'), 'promotions.preview.omitted.DRAFT_NOT_APPLICABLE_IN_CONTEXT');
  assert.equal(diagnosticKey('UNKNOWN'), 'promotions.diagnostic.INVALID_CONFIGURATION');
  assert.equal(illustrativeReasonKey('UNKNOWN'), 'promotions.preview.illustrativeReason.NO_ORDERABLE_APPLICABLE_PRODUCT');
  assert.equal(incompleteKey('UNKNOWN'), 'promotions.preview.incomplete.OTHER');
});

test('only ready answers carry figures and examples are paired by kind', () => {
  assert.equal(carriesFigures(null), false);
  assert.equal(carriesFigures({ state: 'INCOMPLETE' }), false);
  for (const state of ['REAL', 'ILLUSTRATIVE']) assert.equal(carriesFigures({ state }), true);
  const qualifying = { kind: 'QUALIFYING' }, below = { kind: 'BELOW_THRESHOLD' };
  assert.deepEqual(pairExamples({ examples: [qualifying, below] }), { below, qualifying, single: null });
  assert.deepEqual(pairExamples({ examples: [{ kind: 'SINGLE' }] }), { below: null, qualifying: null, single: { kind: 'SINGLE' } });
});

test('applied and potential savings depend on status and backend decimal strings', () => {
  for (const value of [null, undefined, '0', '0.0', '0.00']) assert.equal(isZeroAmount(value), true);
  for (const value of ['0.01', '10.00']) assert.equal(isZeroAmount(value), false);
  const example = (status, appliedSaving, potentialSaving) => ({ appliedSaving, diagnostic: { status, potentialSaving } });
  assert.equal(isApplied(example('APPLIED', '0.01', '0.01')), true);
  assert.equal(isApplied(example('APPLIED', '0.00', '1.00')), false);
  assert.equal(isApplied(example('LOST_TO_BETTER_OFFER', '1.00', '1.00')), false);
  assert.equal(showsPotential(example('LOST_TO_BETTER_OFFER', '0.00', '1.00')), true);
  assert.equal(showsPotential(example('LOST_TO_BETTER_OFFER', '0.00', '0.00')), false);
  assert.equal(showsPotential(example('APPLIED', '1.00', '1.00')), false);
});
