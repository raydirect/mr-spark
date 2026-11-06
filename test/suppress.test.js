import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseConfig, applySuppressions, loadConfig, ConfigError } from '../src/suppress.js';
import { createIR, addFinding } from '../src/ir.js';
import { scorePillar } from '../src/score.js';
import { buildView } from '../src/view-model.js';
import { buildJsonReport } from '../src/reporters/json.js';
import { renderTerminal } from '../src/reporters/terminal.js';

const REASON = 'deliberate honeypot field, must stay unlabelled';

const critical = (ruleId, selector) => ({ ruleId, impact: 'critical', selector });
const irWith = (findings) => {
  const ir = createIR({ source: 'file', uri: 'x' });
  for (const f of findings) addFinding(ir, f);
  return ir;
};

// --- the shape of a config -------------------------------------------------------------------

test('a suppression without a selector must say "all": true', () => {
  assert.throws(() => parseConfig({ suppress: [{ ruleId: 'label', reason: REASON }] }), ConfigError);
});

test('"all": true suppresses a rule everywhere', () => {
  const { suppressions } = parseConfig({ suppress: [{ ruleId: 'label', all: true, reason: REASON }] });
  assert.equal(suppressions[0].selector, null);
  assert.equal(suppressions[0].all, true);
});

test('a reason is required, and must be more than a shrug', () => {
  assert.throws(
    () => parseConfig({ suppress: [{ ruleId: 'label', selector: '#x' }] }),
    /reason is required/
  );
  assert.throws(
    () => parseConfig({ suppress: [{ ruleId: 'label', selector: '#x', reason: 'n/a' }] }),
    /reason is required/
  );
});

test('unknown keys are rejected rather than ignored', () => {
  assert.throws(() => parseConfig({ suppresions: [] }), /unknown key/);
  assert.throws(
    () => parseConfig({ suppress: [{ ruleId: 'label', selector: '#x', reason: REASON, ignore: 1 }] }),
    /unknown key/
  );
});

test('a malformed expiry is rejected', () => {
  assert.throws(
    () => parseConfig({ suppress: [{ ruleId: 'label', selector: '#x', reason: REASON, expires: 'soon' }] }),
    /ISO date/
  );
});

test('a missing config file means no suppressions, not an error', async () => {
  const config = await loadConfig('/nonexistent/spark.config.json');
  assert.deepEqual(config.suppressions, []);
  assert.equal(config.path, null);
});

test('a config that is not JSON names the file it came from', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spark-config-'));
  try {
    const path = join(dir, 'spark.config.json');
    await writeFile(path, '{ not json');
    await assert.rejects(loadConfig(path), (error) => {
      assert.ok(error.message.includes(path));
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- what a suppression does -----------------------------------------------------------------

test('a suppression removes exactly the finding it names, and no other', () => {
  const ir = irWith([critical('label', '#honeypot'), critical('label', '#real'), critical('region', 'main')]);
  const { suppressions } = parseConfig({
    suppress: [{ ruleId: 'label', selector: '#honeypot', reason: REASON }],
  });
  const report = applySuppressions(ir, suppressions);
  assert.equal(report.applied.length, 1);
  assert.equal(ir.findings.filter((f) => f.suppressed).length, 1);
  assert.equal(ir.findings.find((f) => f.selector === '#real').suppressed, false);
  assert.equal(ir.findings.find((f) => f.selector === 'main').suppressed, false);
  assert.equal(ir.findings.find((f) => f.selector === '#honeypot').suppressionReason, REASON);
});

test('suppressed findings stay in the IR — they are not deleted', () => {
  const ir = irWith([critical('label', '#honeypot')]);
  const { suppressions } = parseConfig({
    suppress: [{ ruleId: 'label', selector: '#honeypot', reason: REASON }],
  });
  applySuppressions(ir, suppressions);
  assert.equal(ir.findings.length, 1);
});

test('a suppressed finding does not move the score', () => {
  const findings = [critical('label', '#honeypot'), critical('region', 'main')];
  const unsuppressed = irWith(findings);
  // A critical is priced at 10 of damage, so two distinct criticals give 100·40/(20+40) = 67.
  assert.equal(scorePillar(unsuppressed, 'accessible'), 67);

  const suppressed = irWith(findings);
  const { suppressions } = parseConfig({
    suppress: [{ ruleId: 'label', selector: '#honeypot', reason: REASON }],
  });
  applySuppressions(suppressed, suppressions);
  // One distinct critical left, which the calibration table prices at 80.
  assert.equal(scorePillar(suppressed, 'accessible'), 80);
});

test('suppressing everything gives a perfect score and says so', () => {
  const ir = irWith([critical('label', '#honeypot')]);
  const { suppressions } = parseConfig({ suppress: [{ ruleId: 'label', all: true, reason: REASON }] });
  applySuppressions(ir, suppressions);
  assert.equal(scorePillar(ir, 'accessible'), 100);
  const summary = buildView(ir, { accessible: 100 }).rows[0].summary;
  assert.match(summary, /waived by configuration/);
});

test('an expired suppression stops suppressing and is reported as expired', () => {
  const ir = irWith([critical('label', '#honeypot')]);
  const { suppressions } = parseConfig({
    suppress: [{ ruleId: 'label', selector: '#honeypot', reason: REASON, expires: '2020-01-01' }],
  });
  const report = applySuppressions(ir, suppressions, new Date('2026-11-07T00:00:00Z'));
  assert.equal(report.expired.length, 1);
  assert.equal(report.applied.length, 0);
  assert.equal(ir.findings[0].suppressed, false);
});

test('a suppression that matches nothing is reported as unmatched, not as an error', () => {
  const ir = irWith([critical('label', '#honeypot')]);
  const { suppressions } = parseConfig({
    suppress: [
      { ruleId: 'label', selector: '#honeypot', reason: REASON },
      { ruleId: 'region', selector: 'main', reason: 'fixed upstream in the layout rewrite' },
    ],
  });
  const report = applySuppressions(ir, suppressions);
  assert.equal(report.applied.length, 1);
  assert.equal(report.unmatched.length, 1);
});

// --- every surface counts it out loud --------------------------------------------------------

test('the view keeps suppressed findings out of the violation list but counts them', () => {
  const ir = irWith([critical('label', '#honeypot'), critical('region', 'main')]);
  const { suppressions } = parseConfig({
    suppress: [{ ruleId: 'label', selector: '#honeypot', reason: REASON }],
  });
  applySuppressions(ir, suppressions);
  const view = buildView(ir, { accessible: 80 });
  assert.equal(view.findings.decided.length, 1);
  assert.equal(view.findings.suppressed.length, 1);
  assert.equal(view.suppressedCount, 1);
});

test('the JSON contract carries the suppression count and each reason', () => {
  const ir = irWith([critical('label', '#honeypot')]);
  const { suppressions } = parseConfig({
    suppress: [{ ruleId: 'label', selector: '#honeypot', reason: REASON }],
  });
  applySuppressions(ir, suppressions);
  const report = buildJsonReport({ ir, scores: { accessible: 80 }, hash: 'abc' });
  assert.equal(report.summary.suppressed, 1);
  assert.equal(report.suppressions.length, 1);
  assert.equal(report.suppressions[0].reason, REASON);
  assert.equal(report.suppressions[0].ruleId, 'label');
});

test('the terminal prints the reason, not just the count', () => {
  const ir = irWith([critical('label', '#honeypot')]);
  const { suppressions } = parseConfig({
    suppress: [{ ruleId: 'label', selector: '#honeypot', reason: REASON }],
  });
  applySuppressions(ir, suppressions);
  const output = renderTerminal({ ir, scores: { accessible: 100 }, hash: 'a'.repeat(40) }, { color: false });
  assert.match(output, /Suppressed by configuration/);
  assert.ok(output.includes(REASON));
});

test('quiet mode does not list suppressed findings as violations', () => {
  const ir = irWith([critical('label', '#honeypot')]);
  const { suppressions } = parseConfig({
    suppress: [{ ruleId: 'label', selector: '#honeypot', reason: REASON }],
  });
  applySuppressions(ir, suppressions);
  const output = renderTerminal(
    { ir, scores: { accessible: 100 }, hash: 'a'.repeat(40) },
    { color: false, quiet: true }
  );
  assert.equal(output.trim(), '');
});
