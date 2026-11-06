import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scorePillar, scoreAll, band } from '../src/score.js';
import { createIR, addFinding } from '../src/ir.js';

const irWith = (findings) => {
  const ir = createIR({ source: 'file', uri: 'x' });
  for (const f of findings) addFinding(ir, f);
  return ir;
};

test('unmeasured pillars are null, never a passing grade', () => {
  const scores = scoreAll(irWith([]));
  assert.equal(scores.accessible, 100);
  assert.equal(scores.fast, null);
  assert.equal(scores.safe, null);
  assert.equal(scores.legible, null);
  assert.equal(scores.resilient, null);
});

test('a page with no accessibility findings scores 100', () => {
  assert.equal(scorePillar(irWith([]), 'accessible'), 100);
});

test('critical issues outweigh moderate ones', () => {
  const critical = scorePillar(irWith([{ ruleId: 'a', impact: 'critical' }]), 'accessible');
  const moderate = scorePillar(irWith([{ ruleId: 'b', impact: 'moderate' }]), 'accessible');
  assert.ok(critical < moderate);
});

test('the score saturates at zero instead of going negative', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    ruleId: `r${i}`,
    impact: 'critical',
    selector: `s${i}`,
  }));
  assert.equal(scorePillar(irWith(many), 'accessible'), 0);
});

test('bands are blunt on purpose', () => {
  assert.equal(band(null), 'unmeasured');
  assert.equal(band(95), 'good');
  assert.equal(band(70), 'needs work');
  assert.equal(band(41), 'poor');
  assert.equal(band(0), 'failing');
});
