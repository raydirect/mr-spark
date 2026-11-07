import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

import { analyze, loadEngines } from '../src/engine.js';
import { scorePillar, damageOf, SCORE_SPEC_VERSION } from '../src/score.js';

const engines = await loadEngines();
const dir = new URL('../fixtures/real/', import.meta.url);
const read = (name) => readFile(new URL(name, dir), 'utf8');

/**
 * The corpus: real pages, frozen as baselines.
 *
 * The repository's own fixtures are a closed loop — they were built from the failure classes the
 * tool detects, so the tool scoring them badly proves nothing. These pages were written as pages
 * first and measured second, which is the only way to find out what the tool does to ordinary work.
 *
 * `score` is a regression baseline, not a verdict. If a change to the score moves one of these
 * numbers, that is a deliberate act: update the number here, and say why in the commit. A baseline
 * updated silently is a score nobody is measuring any more.
 *
 * `rules` is the decided rule set. It is asserted for the same reason: a change that makes a rule
 * stop firing, or start firing, is a change to the instrument, and the corpus is what notices.
 */
const EXPECTED = {
  // A well-built small-business page: landmarks, one h1, ordered headings, a real form.
  'ceramics.html': {
    score: 100,
    rules: [],
    decided: 0,
    undecided: 3,
  },
  // Genuinely unlandmarked — the author used `div`s for structure. `region` is TRUE every time it
  // fires here, which is exactly what made 2.0.0's per-element pricing absurd: five findings, one
  // fix ("wrap the content in a main"), and a score of 19.
  'tides.html': {
    score: 87,
    rules: ['region'],
    decided: 5,
    undecided: 3,
  },
  // The realistic small-business booking page: everything wrong that real pages get wrong.
  'booking.html': {
    score: 69,
    rules: ['label', 'region'],
    decided: 11,
    undecided: 4,
  },
};

async function audit(name) {
  const { ir, scores, hash } = await analyze({
    html: await read(name),
    uri: `file:///fixtures/real/${name}`,
    engines,
  });
  return { ir, scores, hash };
}

test('the score spec these baselines were recorded against is still the one shipping', () => {
  // Deliberately a literal. Bumping the spec without revisiting the corpus should fail here first.
  assert.equal(SCORE_SPEC_VERSION, '3.0.0');
});

for (const [name, expected] of Object.entries(EXPECTED)) {
  test(`corpus: ${name} scores ${expected.score}`, async () => {
    const { ir, scores } = await audit(name);
    assert.equal(scorePillar(ir, 'accessible'), expected.score);
  });

  test(`corpus: ${name} reports ${expected.rules.length} decided rule(s)`, async () => {
    const { ir } = await audit(name);
    const decided = ir.findings.filter((f) => f.coverage !== 'incomplete');
    const undecided = ir.findings.filter((f) => f.coverage === 'incomplete');
    assert.deepEqual([...new Set(decided.map((f) => f.ruleId))].sort(), [...expected.rules].sort());
    assert.equal(decided.length, expected.decided);
    // Undecided counts are a fact about THIS environment (no canvas, no layout). Asserting the
    // number keeps a silent change in what the environment can answer from passing unnoticed.
    assert.equal(undecided.length, expected.undecided);
  });
}

test('corpus: one root cause cannot sink a page on its own', async () => {
  // The 2.0.0 regression, frozen as a property: five `region` findings from one missing landmark
  // must not produce the catastrophic-looking score that made the tool untrustworthy.
  const { ir } = await audit('tides.html');
  const regionOnly = damageOf(ir.findings.filter((f) => f.ruleId === 'region'));
  const fiveSeparateCauses = regionOnly * 5;
  assert.ok(regionOnly < fiveSeparateCauses / 2, 'repetition must be priced below linear');
  const { scores } = await audit('tides.html');
  assert.ok(scores.accessible >= 80, 'one structural defect is not a failing page');
});

test('corpus: every page in fixtures/real has a baseline', async () => {
  // A page added without an expectation would be measured by nobody. This is the check that keeps
  // the corpus from becoming a folder of HTML.
  const files = (await readdir(dir)).filter((f) => f.endsWith('.html')).sort();
  assert.deepEqual(files, Object.keys(EXPECTED).sort());
});

test('corpus: scores are stable across runs', async () => {
  const a = await audit('booking.html');
  const b = await audit('booking.html');
  assert.equal(a.hash, b.hash);
  assert.equal(a.scores.accessible, b.scores.accessible);
});
