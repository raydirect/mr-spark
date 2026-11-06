import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scorePillar, scoreAll, band, SCORE_SPEC_VERSION } from '../src/score.js';
import { createIR, addFinding } from '../src/ir.js';

const irWith = (findings) => {
  const ir = createIR({ source: 'file', uri: 'x' });
  for (const f of findings) addFinding(ir, f);
  return ir;
};

const critical = (n, tag = 'c') =>
  Array.from({ length: n }, (_, i) => ({ ruleId: `${tag}${i}`, impact: 'critical', selector: `s${i}` }));

test('the spec version is published', () => {
  assert.match(SCORE_SPEC_VERSION, /^\d+\.\d+\.\d+$/);
});

test('unmeasured pillars are null, never a passing grade', () => {
  const scores = scoreAll(irWith([]));
  assert.equal(scores.accessible, 100);
  assert.equal(scores.fast, null);
  assert.equal(scores.safe, null);
  assert.equal(scores.legible, null);
  assert.equal(scores.resilient, null);
});

// The calibration table in docs/SCORE-SPEC.md §4 is a contract, not documentation.
test('calibration: no findings is 100', () => {
  assert.equal(scorePillar(irWith([]), 'accessible'), 100);
});

test('calibration: one critical is 80', () => {
  assert.equal(scorePillar(irWith(critical(1)), 'accessible'), 80);
});

test('calibration: one serious is 89', () => {
  const ir = irWith([{ ruleId: 's', impact: 'serious' }]);
  assert.equal(scorePillar(ir, 'accessible'), 89);
});

test('calibration: two critical + three serious is 53', () => {
  const findings = [
    ...critical(2),
    ...Array.from({ length: 3 }, (_, i) => ({ ruleId: `s${i}`, impact: 'serious', selector: `t${i}` })),
  ];
  assert.equal(scorePillar(irWith(findings), 'accessible'), 53);
});

test('calibration: six critical is 40', () => {
  assert.equal(scorePillar(irWith(critical(6)), 'accessible'), 40);
});

test('undecided checks do not contribute damage', () => {
  const decidedOnly = scorePillar(irWith(critical(2)), 'accessible');
  const withUndecided = scorePillar(
    irWith([...critical(2), { ruleId: 'contrast', impact: 'minor', coverage: 'incomplete' }]),
    'accessible'
  );
  assert.equal(withUndecided, decidedOnly);
});

test('a page whose only checks are undecided is not punished for it', () => {
  const ir = irWith([{ ruleId: 'color-contrast', impact: 'minor', coverage: 'incomplete' }]);
  assert.equal(scorePillar(ir, 'accessible'), 100);
});

test('critical outweighs moderate, and the curve is monotonic', () => {
  const one = scorePillar(irWith(critical(1)), 'accessible');
  const two = scorePillar(irWith(critical(2)), 'accessible');
  const three = scorePillar(irWith(critical(3)), 'accessible');
  assert.ok(one > two && two > three);
  const moderate = scorePillar(irWith([{ ruleId: 'm', impact: 'moderate' }]), 'accessible');
  assert.ok(one < moderate);
});

test('scores stay inside 0..100 and never hit zero on ordinary pages', () => {
  const many = scorePillar(irWith(critical(60)), 'accessible');
  assert.ok(many >= 0 && many <= 100);
  assert.ok(many > 0, 'the hyperbola never bottoms out on a merely bad page');
});

test('bands are blunt on purpose', () => {
  assert.equal(band(null), 'unmeasured');
  assert.equal(band(95), 'good');
  assert.equal(band(70), 'needs work');
  assert.equal(band(41), 'poor');
  assert.equal(band(0), 'failing');
});
