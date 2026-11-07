import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { analyze, loadEngines } from '../src/engine.js';
import { classifyUndecided, UNDECIDED } from '../src/collectors/a11y.js';
import { countUndecidedKinds, buildView } from '../src/view-model.js';
import { createIR, addFinding, COVERAGE } from '../src/ir.js';

const engines = await loadEngines();

// --- classification is by cause, not by rule id ----------------------------------------------

test('a missing capability is an environment question', () => {
  assert.equal(
    classifyUndecided({ failureSummary: 'Fix any of the following:\n Canvas is not implemented' }, { id: 'x' }),
    UNDECIDED.environment
  );
});

test('contrast is an environment question whatever the message says', () => {
  // Contrast is decided by computation. When it is undecided the cause is a missing capability,
  // never a judgement, and pinning it by name stops a message change from reclassifying it.
  assert.equal(
    classifyUndecided({ failureSummary: 'Fix any of the following:\n Unable to determine background colour' }, { id: 'color-contrast' }),
    UNDECIDED.environment
  );
});

test('"not well supported" is a judgement: no environment answers it from markup', () => {
  assert.equal(
    classifyUndecided(
      { failureSummary: 'Fix all of the following:\n aria-label attribute is not well supported on "div" elements with no valid role attribute.' },
      { id: 'aria-prohibited-attr' }
    ),
    UNDECIDED.judgement
  );
});

test('an unknown cause defaults to judgement, never to environment', () => {
  // Claiming a question needs a capability we might have had is the defect this change removes.
  assert.equal(classifyUndecided({}, { id: 'some-new-rule' }), UNDECIDED.judgement);
});

// --- the real rule, end to end ---------------------------------------------------------------

const PROBE = `<!doctype html>
<html lang="en"><head><title>t</title></head>
<body><main><h1>t</h1>
  <div aria-label="Cart">0</div>
  <div role="button" aria-label="Cart">0</div>
</main></body></html>`;

test('aria-prohibited-attr is undecided on a bare div and passing on a role=button div', async () => {
  const { ir } = await analyze({ html: PROBE, uri: 'file:///probe.html', engines });
  const prohibited = ir.findings.filter((f) => f.ruleId === 'aria-prohibited-attr');
  assert.equal(prohibited.length, 1, 'only the bare div is reported');
  assert.equal(prohibited[0].coverage, 'incomplete');
  assert.equal(prohibited[0].undecidedKind, 'judgement');
  assert.match(prohibited[0].coverageReason, /not well supported/);
});

test('an aria-hidden element is never reported by that rule at all', async () => {
  const { ir } = await analyze({
    html: PROBE.replace('<div aria-label="Cart">0</div>', '<a href="/x" aria-label="Cart" aria-hidden="true">0</a>'),
    uri: 'file:///probe2.html',
    engines,
  });
  assert.deepEqual(ir.findings.filter((f) => f.ruleId === 'aria-prohibited-attr'), []);
});

// --- the split reaches every surface ----------------------------------------------------------

test('undecided findings are counted by kind in the view', () => {
  const ir = createIR({ source: 'file', uri: 'x' });
  addFinding(ir, { ruleId: 'color-contrast', impact: 'serious', coverage: COVERAGE.incomplete, undecidedKind: 'environment' });
  addFinding(ir, { ruleId: 'aria-prohibited-attr', impact: 'serious', coverage: COVERAGE.incomplete, undecidedKind: 'judgement' });
  addFinding(ir, { ruleId: 'label', impact: 'critical' });
  assert.deepEqual(countUndecidedKinds(ir), { environment: 1, judgement: 1 });
  assert.deepEqual(buildView(ir, { accessible: 80 }).undecidedByKind, { environment: 1, judgement: 1 });
});

test('a decided finding carries no kind', () => {
  const ir = createIR({ source: 'file', uri: 'x' });
  const finding = addFinding(ir, { ruleId: 'label', impact: 'critical' });
  assert.equal(finding.undecidedKind, null);
});

test('a real page names both causes instead of blaming the environment', async () => {
  const html = await readFile(new URL('../fixtures/real/booking.html', import.meta.url), 'utf8');
  const { ir, scores, hash } = await analyze({ html, uri: 'file:///b.html', engines });
  const { renderTerminal } = await import('../src/reporters/terminal.js');
  const out = renderTerminal({ ir, scores, hash }, { color: false });
  assert.match(out, /need a capability this run did not have/);
  assert.match(out, /cannot be answered from markup by any environment/);
  assert.ok(!/could not be decided in this environment \(/.test(out), 'the old blanket phrasing must be gone');
});
