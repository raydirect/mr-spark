/**
 * One commit, one verdict for the whole repo: the multi-page layer of the gate.
 *
 * The rule these tests exist to hold is that nothing about a repo-wide run may look like a pass when it is
 * not: a page nobody audited, a directory that contained no HTML, a baseline keyed from a different root.
 * The second rule is the opposite — a repo that grows a page must not go red because of it, and must not go
 * *green* because of it either.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { BASELINE_VERSION, compare, parseBaseline, renderGate, serialize, snapshot } from '../src/baseline.js';
import { main } from '../src/cli.js';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const CLEAN = readFileSync(`${REPO}/fixtures/good.html`, 'utf8');
const DIRTY = readFileSync(`${REPO}/fixtures/bad.html`, 'utf8');
/** A page with exactly one gateable finding, so a regression can be named in one assertion. */
const ONE = '<!doctype html><html lang="en"><head><title>One</title></head><body><main><img src="x.png"></main></body></html>';

const capture = () => {
  const out = [];
  const err = [];
  return {
    out,
    err,
    streams: { stdout: { write: (line) => out.push(line) }, stderr: { write: (line) => err.push(line) } },
    text: (lines) => lines.join(''),
  };
};

/** A three-page site: two clean, one dirty, one nested, plus a build artefact that must be ignored. */
const withSite = (body) => async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mrspark-repo-'));
  const write = (rel, html) => {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
  };
  write('index.html', CLEAN);
  write('blog/a.html', ONE);
  write('blog/deep/b.html', DIRTY);
  write('blog/style.css', 'body{}');
  write('node_modules/pkg/vendored.html', DIRTY);
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    return await body(dir, write);
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
};

const gateLines = (run) => run.text(run.err) + run.text(run.out);

test('a directory writes one file for every page in it, and reads it back green', await withSite(async (dir) => {
  const written = capture();
  assert.equal(await main(['baseline', '.'], { ...written.streams, env: { NO_COLOR: '1' } }), 0);
  const file = JSON.parse(readFileSync(join(dir, '.spark-baseline.json'), 'utf8'));
  assert.equal(file.baseline, BASELINE_VERSION);
  assert.deepEqual(file.pages.map((entry) => entry.page), ['blog/a.html', 'blog/deep/b.html', 'index.html']);
  assert.match(written.text(written.out), /on 3 page\(s\) are now the floor, not the failure/);
  assert.doesNotMatch(serialize(file), /\/tmp\/|node_modules/, 'no absolute paths, and the vendored page is not in it');

  const run = capture();
  assert.equal(await main(['check', '.', '--ci', '--no-color'], run.streams), 0);
  assert.match(run.text(run.out), /✓ gate · 3 page\(s\) · no new findings · \d+ already known/);
  assert.match(run.text(run.out), /index\.html · 0 findings/, 'each page gets a row of its own');
}));

test('a regression on one page names that page, and stops the build', await withSite(async (dir, write) => {
  await main(['baseline', '.'], capture().streams);

  write('index.html', `${CLEAN.replace('</body>', '')}`.replace('</html>', '<input type="text" name="promo"></body></html>'));
  write('index.html', CLEAN.replace('</body>', '<input type="text" name="promo"></body>'));

  const run = capture();
  assert.equal(await main(['check', '.', '--ci', '--no-color'], run.streams), 1);
  const text = gateLines(run);
  assert.match(text, /✗ gate · 3 page\(s\) · \d+ new/);
  assert.match(text, /index\.html · \d+ new/, 'the page is named where the finding is');
  assert.match(text, /index\.html · \+1 region at .+ \(moderate\)/, 'and each blocking line carries it too');
  assert.match(text, /index\.html · \+1 label at /, '…including the rule this page had never reported');
  assert.match(text, /accept them deliberately with `spark baseline`/);
}));

test('a page the baseline never listed is reported, not charged — until --strict says otherwise', await withSite(async (dir, write) => {
  await main(['baseline', 'index.html', 'blog/a.html'], capture().streams);
  write('blog/new.html', DIRTY);

  // Two pages are now outside the file: `blog/new.html` and `blog/deep/b.html`. Neither is a regression in
  // what was gated yesterday, so the build does not stop — and neither is invisible, so the run says which
  // pages it means. That is ADR 0005's rule for a new rule, applied to a new page.
  const lenient = capture();
  assert.equal(await main(['check', '.', '--ci', '--no-color'], lenient.streams), 0);
  const text = gateLines(lenient);
  assert.match(text, /2 page\(s\) are not in the baseline .*blog\/deep\/b\.html/);
  assert.doesNotMatch(text, /blog\/new\.html · \d+ new/, 'a new page gets no per-page regression line, because it has no floor');
  // …and the reason they are not charged is said correctly. Several of those rules *are* in the file, from
  // another page; calling them "rules this baseline predates" would blame our release for the team's new
  // file, and the fix they would reach for — re-running `spark baseline` — would be right for the wrong reason.
  assert.doesNotMatch(text, /rules this baseline predates/, 'a new page is a new page, not a new rule');
  assert.match(text, /index\.html · unchanged|blog\/new\.html · \d+ to adopt/, 'a page with nothing to say still gets its row');

  const strict = capture();
  assert.equal(await main(['check', '.', '--ci', '--strict', '--no-color'], strict.streams), 1);
  assert.match(gateLines(strict), /✗ gate · 4 page\(s\) · \d+ new/, 'a repo that wants the hard line can ask for it, page by page too');
}));

test('a page in the baseline that is not in the run is "not audited", never "fixed"', await withSite(async (dir) => {
  await main(['baseline', '.'], capture().streams);
  const run = capture();
  // `check blog` covers two of the three pages. The third is not a fix, and not a pass: it is a gap.
  assert.equal(await main(['check', 'blog', '--baseline', '.spark-baseline.json', '--ci', '--no-color'], run.streams), 0);
  const text = gateLines(run);
  assert.match(text, /were not in this run \(index\.html\)/);
  assert.match(text, /✓ gate · 2 page\(s\)/, 'the verdict is about the two pages this run looked at');
}));

test('a v1 baseline gates a repo-wide run, and says it was read as one page', await withSite(async (dir, write) => {
  // Write the current format for the one page we choose, demote it to v1 by hand, and run against the site.
  await main(['baseline', 'blog/a.html'], capture().streams);
  const v2 = JSON.parse(readFileSync(join(dir, '.spark-baseline.json'), 'utf8'));
  const one = v2.pages[0];
  const legacy = {
    baseline: 1,
    engine: v2.engine,
    target: { source: one.source, kind: one.kind, file: one.page },
    score: one.score,
    ir: one.ir,
    rules: one.rules,
    anchors: one.anchors,
    findings: one.findings,
  };
  assert.equal(legacy.baseline, 1, 'the fixture is v1 because this test is about the reader, not the writer');
  assert.ok(legacy.findings.length > 0, 'and it carries a real page of findings to promote');
  writeFileSync(join(dir, 'legacy.json'), `${JSON.stringify(legacy, null, 2)}\n`);

  const run = capture();
  const code = await main(['check', '.', '--baseline', 'legacy.json', '--ci', '--no-color'], run.streams);
  const text = gateLines(run);
  assert.equal(code, 0, 'a repo that committed a v1 file does not go red on the day the format widens');
  assert.match(text, /written as version 1/);
  assert.match(
    text,
    /are not in the baseline .*blog\/deep\/b\.html/,
    '…while naming exactly what that one-page file cannot gate'
  );

  const single = capture();
  assert.equal(
    await main(['check', 'blog/a.html', '--baseline', 'legacy.json', '--ci', '--no-color'], single.streams),
    0
  );
  assert.doesNotMatch(gateLines(single), /version 1/, 'one page against a one-page file needs no advice');
}));

test('machine formats describe a run of pages in their own terms', await withSite(async (dir) => {
  await main(['baseline', '.'], capture().streams);

  const tsv = capture();
  assert.equal(await main(['check', '.', '--ci', '--quiet'], tsv.streams), 0);
  const rows = tsv.text(tsv.out).trim().split('\n');
  assert.ok(rows.length > 3, 'one row per finding, across every page');
  assert.ok(rows.every((row) => row.split('\t').length === 5), 'and a fifth column for which page');
  assert.doesNotMatch(tsv.text(tsv.out), /gate · /, 'quiet never grows a sentence');
  const pages = new Set(rows.map((row) => row.split('\t')[4]));
  assert.deepEqual([...pages].sort(), ['blog/a.html', 'blog/deep/b.html'], 'only the pages with findings appear');

  const single = capture();
  await main(['check', 'blog/a.html', '--ci', '--quiet'], single.streams);
  assert.ok(
    single.text(single.out).trim().split('\n').every((row) => row.split('\t').length === 4),
    'a one-page run keeps the four columns it has always had'
  );

  const json = capture();
  assert.equal(await main(['check', '.', '--ci', '--format', 'json'], json.streams), 0);
  const payload = JSON.parse(json.out[0], 'stdout must stay parseable');
  assert.ok(Array.isArray(payload), 'many pages are a JSON array of the per-page reports');
  assert.equal(payload.length, 3);
  assert.ok(
    payload.every((report) => Object.hasOwn(report, 'conformance') && Object.hasOwn(report, 'findings')),
    'each element is the single-page payload, unchanged'
  );

  const sarif = capture();
  assert.equal(await main(['check', '.', '--ci', '--format', 'sarif'], sarif.streams), 0);
  const doc = JSON.parse(sarif.out[0]);
  assert.equal(doc.runs.length, 1, 'one run: code scanning reports per repository');
  assert.equal(doc.runs[0].artifacts.length, 3);
  assert.deepEqual(doc.runs[0].properties.sparkPages, ['blog/a.html', 'blog/deep/b.html', 'index.html']);
  assert.equal(doc.runs[0].properties.sparkGate.pages, 3);
  assert.equal(doc.runs[0].properties.sparkIr, null, 'one IR hash cannot name three pages');
  const keys = doc.runs[0].results.map((result) => result.partialFingerprints.sparkKey);
  assert.ok(keys.every((key) => key.includes('\u0000')), 'a repo-wide key carries its page');
  assert.ok(
    keys.every((key) => doc.runs[0].properties.sparkPages.some((page) => key.startsWith(`${page}\u0000`))),
    '…and the page it carries is one this run actually audited, not a prefix somebody guessed'
  );
  // Identical siblings on one page share a fingerprint by design (see `src/identity.js`), so uniqueness of
  // the key is not the property — the property is that page A's key never lands on page B's alert.
  const pairs = doc.runs[0].results.map((result) => `${result.locations[0].physicalLocation.artifactLocation.uri}\u0000${result.partialFingerprints.sparkKey}`);
  assert.ok(new Set(pairs).size <= keys.length, 'the page prefix is what keeps two files apart');
  const worst = Math.min(...doc.runs[0].artifacts.map((_, index) => payload[index].conformance.score ?? 100));
  assert.equal(doc.runs[0].properties.sparkScore, worst, 'the run score is the worst page, not the mean');
  assert.match(sarif.text(sarif.err), /gate · 3 page\(s\)/, 'the human sentence goes to stderr');
}));

test('a command that writes one artifact refuses to guess which page to write', await withSite(async (dir) => {
  const report = capture();
  assert.equal(await main(['report', '.'], report.streams), 2);
  assert.match(gateLines(report), /report writes one artifact for one document/);

  const lower = capture();
  assert.equal(await main(['lower', 'blog/a.html', 'blog/deep/b.html'], lower.streams), 2);
  assert.match(gateLines(lower), /one artifact for one document/);

  const both = capture();
  // `.spark/does-not-exist/` on purpose: a workflow that asks for an artefact at a path it has not made yet
  // should get the artefact, not ENOENT — this is the line the action's own step runs.
  const nested = join(dir, '.spark/does-not-exist/gate.json');
  assert.equal(await main(['check', '.', '--no-color', '--format', 'json', '--out', nested], both.streams), 0);
  assert.match(gateLines(both), /report written to/, 'and --out still means one file for the whole run');
  assert.ok(Array.isArray(JSON.parse(readFileSync(nested, 'utf8'))), 'written, with its directory, and still the array');

  const missing = capture();
  assert.equal(await main(['check', 'nope/'], missing.streams), 2);
  assert.match(gateLines(missing), /Cannot read/, 'a typo is a typo, not an empty site');
}));

test('--fail-under is asked per page, and names the pages that missed', await withSite(async (dir) => {
  const run = capture();
  const code = await main(['check', '.', '--no-color', '--fail-under', '99'], run.streams);
  assert.equal(code, 1, 'a site that averages well cannot hide one bad page behind the others');
  const text = gateLines(run);
  assert.match(text, /is below the required 99/);
  assert.match(text, /blog\/a\.html|blog\/deep\/b\.html/, 'and says which');
}));

test('the page arithmetic lives in compare(), so no surface has to recompute it', () => {
  const fake = (page, findings) => ({
    page,
    ir: {
      findings,
      provenance: { uri: `file:///repo/${page}`, source: 'file', kind: 'document' },
    },
    scores: { accessible: 100 },
    hash: 'h',
  });
  const finding = (ruleId, selector, impact = 'moderate') => ({
    ruleId,
    selector,
    impact,
    pillar: 'accessible',
    coverage: 'decided',
    message: `${ruleId} on ${selector}`,
  });

  const baseline = snapshot([
    fake('a.html', [finding('region', '.card')]),
    fake('b.html', [finding('label', '#x', 'critical')]),
  ]);
  const parsed = parseBaseline(JSON.parse(serialize(baseline)), 'x');
  const same = compare(parsed, [fake('a.html', [finding('region', '.card')]), fake('b.html', [finding('label', '#x', 'critical')])]);
  assert.equal(same.ok, true);
  assert.deepEqual(same.counts, {
    blocking: 0,
    adoptable: 0,
    adoptableRule: 0,
    adoptablePage: 0,
    escalated: 0,
    resolved: 0,
    unchanged: 2,
  });

  // The point of the union rule: `b.html` was clean when the file was written, so it recorded no rules
  // of its own — and a fresh finding there is still a regression, because the *tool* knew that rule.
  const regressed = compare(parsed, [
    fake('a.html', [finding('region', '.card')]),
    fake('b.html', [finding('label', '#x', 'critical'), finding('label', '#y', 'critical')]),
  ]);
  assert.equal(regressed.ok, false);
  assert.equal(regressed.counts.blocking, 1);
  assert.equal(regressed.pages[1].page, 'b.html', 'the page keeps its own diff, so a consumer can blame it');
  assert.deepEqual(renderGate(regressed).join('\n').match(/b\.html/g).length >= 2, true, 'and the page is named in the prose');

  // The same anchor on two pages is two facts. `region@.card` is one key, and the file has it under a.html
  // only — so fixing it there while introducing it there-over-there is one fix and one regression, not a
  // wash, and not "the anchor was already known" either.
  const crossed = compare(parsed, [
    fake('a.html', []),
    fake('b.html', [finding('label', '#x', 'critical'), finding('region', '.card')]),
  ]);
  assert.equal(crossed.counts.resolved, 1, 'a.html fixed its finding');
  assert.equal(
    crossed.counts.blocking,
    1,
    'and b.html gained one at an anchor a.html had recorded — on a page that never had it'
  );
  assert.equal(crossed.pages[1].entries[0].known, true, 'the rule was in the file, so nothing is exempt here');
});
