import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scorePillar, scoreAll, band, damageOf, repeatCharge, SCORE_SPEC_VERSION } from '../src/score.js';
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

// ------------------------------------------------ duplicate-finding pricing (spec 3.0.0)

test('eight-eight instances of one rule do not read as catastrophe', () => {
  // The real defect: one missing landmark, reported once per element, produced 88 findings and a
  // score of 19. That number says "catastrophic" when the page has one structural problem.
  const findings = Array.from({ length: 88 }, (_, i) => ({
    ruleId: 'region',
    impact: 'moderate',
    selector: `#el-${i}`,
  }));
  const score = scorePillar(irWith(findings), 'accessible');
  assert.ok(score > 65, `expected a floor-level verdict, got ${score}`);
  assert.ok(score < 90, 'still a real problem, not a pass');
});

test('six distinct critical rules still bottom out at the published anchor', () => {
  // Repetition is discounted; VARIETY is not. Six different critical failures is the calibration
  // table's worst case and must keep its number.
  assert.equal(scorePillar(irWith(critical(6)), 'accessible'), 40);
});

test('the second instance of a rule costs less than the first, and never zero', () => {
  const one = scorePillar(irWith([{ ruleId: 'r', impact: 'critical', selector: 'a' }]), 'accessible');
  const two = scorePillar(
    irWith([
      { ruleId: 'r', impact: 'critical', selector: 'a' },
      { ruleId: 'r', impact: 'critical', selector: 'b' },
    ]),
    'accessible'
  );
  assert.ok(two < one, 'a second occurrence must still cost something');
  // The second instance moves the score less than the first moved it, because the curve itself
  // flattens. Compare against the drop the first instance produced from a clean page.
  const clean = scorePillar(irWith([]), 'accessible');
  assert.ok(clean - one > one - two, 'the first instance must dominate');
  // decay is monotonic and asymptotically positive, never negative
  let previous = Infinity;
  for (let n = 1; n <= 50; n += 1) {
    const charge = repeatCharge(n);
    assert.ok(charge > 0, 'no instance is ever free');
    assert.ok(charge < previous, 'each repeat costs strictly less');
    previous = charge;
  }
  assert.equal(repeatCharge(1), 1, 'the first instance carries the full weight');
});

test('a rule is priced at the worst impact it reported', () => {
  const mixed = [
    { ruleId: 'r', impact: 'minor', selector: 'a' },
    { ruleId: 'r', impact: 'critical', selector: 'b' },
  ];
  const asCritical = damageOf([{ ruleId: 'r', impact: 'critical', selector: 'a' }]);
  // Both instances are priced at the worst impact the rule reported, not at their own impact:
  // the fix for a partially-critical rule is the critical fix.
  assert.equal(damageOf(mixed), asCritical + asCritical * repeatCharge(2));
});
