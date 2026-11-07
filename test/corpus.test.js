import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

import { analyze, loadEngines } from '../src/engine.js';
import { scorePillar, damageOf, SCORE_SPEC_VERSION } from '../src/score.js';
import { contrastRatio } from '../src/contrast.js';

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
  // Written for this folder: a trade page with every colour in a <style> block and the markup done
  // properly. Its job is the negative result — the styled page scores exactly like the unstyled one,
  // because the offline runner cannot compute contrast from a stylesheet any better than from none.
  'locksmith.html': {
    score: 100,
    rules: [],
    decided: 0,
    undecided: 3,
  },
  // Div soup by an author in a hurry, plus one heading skip and one labelled `div`. That is a page
  // with three structural problems and a 91, because `region` prices runs of orphaned content, not
  // elements — the wrapper around the six cards is what makes this 91 instead of 82. See
  // "newsletter-archive" in docs/CORPUS.md and the grouping probe below.
  'newsletter-archive.html': {
    score: 91,
    rules: ['heading-order', 'region'],
    decided: 2,
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

test('corpus: pricing stays sub-linear at the scale a real listing page reaches', async () => {
  // The 2.0.0 property, measured where `tides.html` cannot reach: five findings is one story, eighty-five
  // is another, and a marketplace grid of unlandmarked sellers is the case that decides whether the tool
  // reads as "needs work" or as "catastrophic".
  //
  // Generated in the test rather than committed as a page on purpose: a corpus fixture built from rule ids
  // is the closed loop docs/CORPUS.md rule 1 exists to keep out, so this is labelled what it is — a
  // probe. The real 84-region page it stands in for could not be shipped (docs/CORPUS.md, "What four
  // uploaded demo pages taught us"), and its measurement outlived it.
  const build = (sellers) =>
    `<!doctype html><html lang="en"><head><title>Catalogue</title></head><body><h1>Catalogue</h1>` +
    Array.from({ length: sellers }, (_, i) => `<div><h2>Seller ${i + 1}</h2><p>Listing ${i + 1}.</p></div>`).join('') +
    `</body></html>`;
  const price = async (sellers) => {
    const { ir } = await analyze({ html: build(sellers), uri: `file:///synthetic-catalogue-${sellers}.html`, engines });
    const decided = ir.findings.filter((f) => f.coverage !== 'incomplete');
    return { damage: damageOf(decided), score: scorePillar(ir, 'accessible'), findings: decided.length };
  };

  const one = await price(1);
  const grid = await price(84);
  assert.ok(grid.findings > 80, `the generator should produce a real grid, got ${grid.findings} findings`);
  assert.ok(grid.damage > one.damage, 'repetition is priced, not forgiven — a root cause is cheap, not free');
  assert.ok(
    grid.damage < one.damage * grid.findings,
    `${grid.findings} findings cost ${grid.damage.toFixed(2)}, which must stay far under linear (${(one.damage * grid.findings).toFixed(1)})`,
  );
  assert.ok(grid.score >= 65, `an unlandmarked grid is "needs work" (${grid.score}), not a broken page`);

  // And it saturates rather than running off the end of the scale — the property that keeps a page with
  // two hundred widgets in the same conversation as a page with twenty.
  const huge = await price(200);
  assert.ok(huge.damage > grid.damage && huge.damage < grid.damage * 2, `200 findings cost ${huge.damage.toFixed(2)} after 84 cost ${grid.damage.toFixed(2)}`);
  assert.ok(huge.score >= 60, `${huge.score} for 200 findings: the band holds as the page grows`);
});

test('corpus: a page with its CSS inside the file still cannot be checked for contrast', async () => {
  // The claim the removed uploads looked like they settled and did not, measured on pages we own.
  // `newsletter-archive.html` puts small grey text (#a8a196) on a cream background (#f6f3ec): 2.31:1,
  // a failure any human can see and any browser can compute. Both pages declare every colour they use
  // inside the file, and both leave `color-contrast` undecided. If the offline runner ever learns to
  // resolve a <style> block, this test fails and this document gets rewritten — which is the point.
  const { ir } = await audit('newsletter-archive.html');
  const styles = await read('newsletter-archive.html');
  assert.match(styles, /<style>/, 'the fixture must carry its CSS, or this proves nothing');
  assert.match(styles, /color:\s*#a8a196/, 'and it must carry the failure described here');
  // The failure is real arithmetic, not an assertion about a story: below even the 3:1 large-text floor.
  assert.ok(contrastRatio('#a8a196', '#f6f3ec') < 3, 'a checker with a browser would call this');
  const contrast = ir.findings.find((f) => f.ruleId === 'color-contrast');
  assert.equal(contrast?.coverage, 'incomplete', 'and the checker without one says nothing');
  assert.equal(contrast?.undecidedKind, 'environment', 'because the missing thing is a browser, not data');
  assert.equal(scorePillar(ir, 'accessible'), 91, 'a 2.31:1 body-text failure is worth zero points offline');
});

test('corpus: region prices runs of orphaned content, not elements', async () => {
  // `newsletter-archive.html` has six unlandmarked cards and one `region` finding: they sit inside a
  // single wrapper div, so the page is one orphan. Unwrap those same six and the same text is seven
  // findings. Correct for a rule whose output is one instruction ("wrap it in a main"), misleading for
  // a number compared across pages, so it is asserted here and written into docs/LIMITS.md.
  const cards = (n) =>
    Array.from({ length: n }, (_, i) => `<div class="issue"><h3>Issue ${i + 1}</h3><p>Body ${i + 1}.</p></div>`).join('');
  const price = async (body) => {
    const { ir } = await analyze({ html: `<!doctype html><html lang="en"><head><title>t</title></head><body>${body}</body></html>`, uri: 'file:///probe-region.html', engines });
    const decided = ir.findings.filter((f) => f.coverage !== 'incomplete' && f.ruleId === 'region');
    return { regions: decided.length, score: scorePillar(ir, 'accessible') };
  };

  const nested = await price(`<div class="page"><h1>Archive</h1>${cards(6)}</div>`);
  const flat = await price(`<h1>Archive</h1>${cards(6)}`);
  assert.equal(nested.regions, 1, 'one wrapper makes six cards one orphan');
  assert.ok(flat.regions >= 6, `the same content unwrapped is ${flat.regions} findings`);
  assert.ok(flat.score < nested.score, `nesting alone moved the score ${nested.score} -> ${flat.score}`);
});

test('corpus: which aria habit we can call depends on the attribute, not the element', async () => {
  // `aria-label` on a role-less div is axe saying "not well supported": a judgement about the
  // accessibility tree, deferred. `aria-required` on the same div is a violation of a neighbouring
  // rule, decided, and it costs. The switch is invisible in the docs and load-bearing in the score,
  // so it lives in a test.
  const probe = async (attr) => {
    const html = `<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>t</h1>${attr}</main></body></html>`;
    const { ir } = await analyze({ html, uri: 'file:///probe-aria.html', engines });
    return ir.findings.filter((f) => /aria-/.test(f.ruleId)).map((f) => `${f.ruleId}:${f.coverage === 'incomplete' ? 'undecided' : 'decided'}`);
  };
  assert.deepEqual(await probe('<div aria-label="Latest">text</div>'), ['aria-prohibited-attr:undecided']);
  assert.deepEqual(await probe('<div aria-required="true">text</div>'), ['aria-allowed-attr:decided']);
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
