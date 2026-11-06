import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stableStringify, hashIR, createIR, addFinding, sortFindings } from '../src/ir.js';

test('stableStringify is key-order independent', () => {
  assert.equal(
    stableStringify({ b: 1, a: { d: 2, c: 3 } }),
    stableStringify({ a: { c: 3, d: 2 }, b: 1 })
  );
});

test('hashIR is stable across key order and differs across content', async () => {
  const a = await hashIR({ x: 1, y: [2, 3] });
  const b = await hashIR({ y: [2, 3], x: 1 });
  const c = await hashIR({ x: 1, y: [2, 4] });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('finding ids are content-derived, so baselines and diffs are trustworthy', () => {
  const ir = createIR({ source: 'file', uri: 'file:///x.html' });
  const first = addFinding(ir, { ruleId: 'image-alt', selector: 'img', message: 'm' });
  const second = addFinding(ir, { ruleId: 'image-alt', selector: 'img', message: 'm' });
  assert.equal(first.id, 'image-alt:img');
  assert.equal(second.id, first.id);
});

test('findings sort deterministically by pillar then id', () => {
  const ir = createIR({ source: 'file', uri: 'x' });
  addFinding(ir, { ruleId: 'zeta', selector: 'b', pillar: 'accessible' });
  addFinding(ir, { ruleId: 'alpha', selector: 'c', pillar: 'accessible' });
  addFinding(ir, { ruleId: 'beta', selector: 'a', pillar: 'fast' });
  sortFindings(ir);
  assert.deepEqual(
    ir.findings.map((f) => f.ruleId),
    ['alpha', 'zeta', 'beta']
  );
});
