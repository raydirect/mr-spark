/**
 * The gate: the baseline file, the comparison, and the two commands that share them.
 *
 * Half of these tests exist to pin what the gate is NOT allowed to do: fail on what was already there,
 * invent an identity for an element that has none, or read a machine format's stdout as prose. Those are
 * the ways a build gate dies in a real repo, and none of them show up as a crash.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BASELINE_FILENAME,
  BaselineError,
  compare,
  gateEntries,
  parseBaseline,
  readBaseline,
  renderGate,
  serialize,
  snapshot,
  writeBaseline,
} from '../src/baseline.js';
import { analyze } from '../src/engine.js';
import { main } from '../src/cli.js';
import { BASELINE_VERSION } from '../src/baseline.js';
import { parseConfig } from '../src/suppress.js';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FIXTURE = `${REPO}/fixtures/real/tides.html`;

/** A finding, in the shape the IR carries, for tests that are about arithmetic rather than about axe. */
const finding = (ruleId, selector, impact = 'moderate', extra = {}) => ({
  ruleId,
  selector,
  impact,
  pillar: 'accessible',
  coverage: 'decided',
  message: `${ruleId} on ${selector}`,
  ...extra,
});

const ir = (...findings) => ({
  findings,
  provenance: { uri: 'file:///page.html', source: 'file', kind: 'document' },
});

/**
 * A baseline as it would have been committed by an *earlier build*.
 *
 * "A rule this baseline predates" is a claim about who wrote the file, not about which findings a page had:
 * only a different build can ship a rule the repo has never seen. Tests that want that reading ask for it
 * here, and the tests that want the ordinary one use `snapshot`, whose engine stamp matches this build — which
 * is what makes an unrecorded rule a regression instead of an exemption.
 */
function writtenBy(version, input) {
  const file = snapshot(input);
  return { ...file, engine: { ...file.engine, version } };
}

const withDir = (body) => async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mrspark-gate-'));
  try {
    return await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

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

// ------------------------------------------------------------------ what goes in the file

test('the snapshot is byte-identical from run to run, and carries nothing about the machine', async () => {
  const { ir: real, scores, hash } = await analyze({
    html: readFileSync(FIXTURE, 'utf8'),
    uri: `file://${FIXTURE}`,
  });
  const first = serialize(snapshot({ ir: real, scores, hash }));
  const second = serialize(snapshot({ ir: real, scores, hash }));
  assert.equal(first, second, 'a baseline two runs generate must not differ by one byte');
  assert.doesNotMatch(first, /collectedAt|generatedAt|timestamp/i, 'a clock in a committed file is churn');
  assert.doesNotMatch(first, /"\/|\p{Lu}:[\\/]/u, 'an absolute path is somebody\'s home directory, committed');
  assert.ok(first.includes('tides.html'), 'the basename is kept, so the diff reads as about a page');

  const back = parseBaseline(JSON.parse(first), 'x');
  assert.deepEqual(back.findings, snapshot({ ir: real, scores, hash }).findings, 'the file is the contract');
});

test('the gate prices decided, unsuppressed findings and nothing else', async () => {
  const page = ir(
    finding('label', '#a', 'critical'),
    finding('region', '.card', 'moderate', { coverage: 'incomplete', undecidedKind: 'judgement' }),
    finding('color-contrast', '.hero', 'serious', { suppressed: true, suppressionReason: 'brand colour' }),
    finding('label', '#a', 'critical')
  );
  const entries = gateEntries(page);
  assert.deepEqual(
    entries.map((entry) => `${entry.ruleId}:${entry.count}`),
    ['label:2'],
    'undecided is our blindness and suppressed is already waived — neither belongs in a gate'
  );
});

// ------------------------------------------------------------------ the comparison

test('new, fixed and unchanged are counted per finding, not per element name', () => {
  const base = snapshot({ ir: ir(finding('region', '.card'), finding('region', '.card')), scores: {}, hash: 'h' });
  const now = ir(finding('region', '.card'));
  const gone = compare(base, now);
  assert.equal(gone.counts.resolved, 1);
  assert.equal(gone.counts.unchanged, 1);
  assert.equal(gone.ok, true, 'getting better is never a failure');

  const worse = compare(base, ir(finding('region', '.card'), finding('region', '.card'), finding('region', '.card')));
  assert.equal(worse.counts.blocking, 1, 'a third card is one new finding');
  assert.equal(worse.ok, false);
  assert.deepEqual(
    worse.blocking.map((entry) => `${entry.ruleId}+${entry.added}(${entry.from}→${entry.count})`),
    ['region+1(2→3)']
  );
});

test('the same finding at a worse impact is a regression even when nothing was added', () => {
  const base = snapshot({ ir: ir(finding('color-contrast', '.hero', 'moderate')), scores: {}, hash: 'h' });
  const escalated = compare(base, ir(finding('color-contrast', '.hero', 'serious')));
  assert.equal(escalated.counts.blocking, 0, 'no new finding appeared');
  assert.equal(escalated.counts.escalated, 1);
  assert.equal(escalated.ok, false, 'but mod→serious is exactly what a gate is for');
  assert.match(renderGate(escalated).join('\n'), /color-contrast went moderate → serious/);
});

test('a rule the baseline predates is reported, not charged to the page', () => {
  const base = writtenBy('0.1.0', { ir: ir(finding('label', '#a')), scores: {}, hash: 'h' });
  const now = ir(finding('label', '#a'), finding('aria-hidden-focus', '.x', 'serious'));

  const lenient = compare(base, now);
  assert.equal(lenient.ok, true, 'shipping a new rule must not turn every existing repo red');
  assert.equal(lenient.counts.adoptable, 1);
  assert.match(renderGate(lenient).join('\n'), /rules this baseline predates .aria-hidden-focus./);

  const strict = compare(base, now, { strict: true });
  assert.equal(strict.counts.blocking, 1);
  assert.equal(strict.ok, false, 'a repo that wants the hard line can ask for it');

  // …and the exemption is *only* that. Same build, rule not recorded: the page grew a problem, which is the
  // one thing a gate exists to catch. A page that happened to be clean cannot buy immunity for its future.
  const same = compare(snapshot({ ir: ir(finding('label', '#a')), scores: {}, hash: 'h' }), now);
  assert.equal(same.ok, false, 'a finding this build knows how to look for is the page fault, not ours');
  assert.equal(same.counts.blocking, 1);
  assert.equal(same.counts.adoptable, 0, '…and nothing is offered as adoptable, because nothing is ours');
});

test('a fragment compared against a page baseline is refused, not passed', () => {
  const base = snapshot({ ir: ir(finding('label', '#a')), scores: {}, hash: 'h' });
  const fragment = { ...ir(finding('label', '#a')), provenance: { kind: 'fragment', source: 'file' } };
  assert.throws(() => compare(base, fragment), (error) => {
    assert.ok(error instanceof BaselineError);
    assert.match(error.message, /skips different rules/);
    assert.match(error.message, /call that a pass/);
    return true;
  });
});

test('the gate line ends with what to do, and only when something is wrong', () => {
  const base = snapshot({ ir: ir(finding('label', '#a')), scores: {}, hash: 'h' });
  assert.doesNotMatch(renderGate(compare(base, ir(finding('label', '#a')))).join('\n'), /accept them deliberately/);
  const lines = renderGate(compare(base, ir(finding('label', '#a'), finding('label', '#b'))));
  assert.match(lines.join('\n'), /gate · 1 new/);
  assert.match(lines.join('\n'), /accept them deliberately with `spark baseline`/);
});

test('a baseline longer than five new entries says how many it hid', () => {
  const many = ir(...Array.from({ length: 7 }, (_, i) => finding('label', `#f${i}`, 'critical')));
  // The baseline must know the rule, or these seven are "a rule we shipped since" rather than new work.
  const diff = compare(snapshot({ ir: ir(finding('label', '#known')), scores: {}, hash: 'h' }), many);
  const text = renderGate(diff).join('\n');
  assert.equal(diff.blocking.length, 7);
  assert.match(text, /and 2 more/, 'a truncated list must be visibly truncated');
  assert.match(text, /gate · 7 new/);
});

// ------------------------------------------------------------------ the file is user-editable

test('a hand-edited baseline is validated, and says why when it is wrong', () => {
  const entry = { key: 'label@000000000000', ruleId: 'label', anchor: '#a', anchorKind: 'id', impact: 'critical', count: 1 };
  const file = (pages, extra = {}) => ({ baseline: BASELINE_VERSION, pages, ...extra });
  const page = (findings, extra = {}) => ({ page: 'a.html', findings, ...extra });
  assert.doesNotThrow(() => parseBaseline(file([page([entry])])));

  const reject = (raw, pattern) =>
    assert.throws(() => parseBaseline(raw, 'gate.json'), (error) => {
      assert.match(error.message, pattern);
      assert.match(error.message, /^gate\.json: /, 'the path has to be in the message, or --baseline is blamed on the default file');
      return true;
    });

  reject({ baseline: 99, findings: [] }, /unsupported baseline version 99 — this build reads 1 or 2 and writes 2/);
  // The one mistake a v2 file makes easiest is writing the v1 shape — so the message names the key that is
  // missing rather than saying "unknown key findings", which is true but useless.
  reject({ baseline: BASELINE_VERSION, findings: [entry] }, /"pages" must be a non-empty array/);
  reject(file([]), /"pages" must be a non-empty array/);
  reject(file(['a.html']), /every entry in "pages" must be an object/);
  reject(file([{ findings: [entry] }]), /"page" must be a non-empty path/);
  reject(file([page([entry]), page([])]), /duplicate page "a\.html"/);
  reject(file([page([entry])], { extra: true }), /unknown key "extra"/);
  reject(file([page([entry], { bogus: 1 })]), /unknown key "bogus"/);
  reject(file([page({})]), /"findings" must be an array/);
  reject(file([page([entry, entry])]), /a\.html: duplicate entry "label@000000000000"/);
  reject(file([page([{ key: 'label', count: 1 }])]), /rule@digest/);
  reject(file([page([{ key: 'label@000000000000', count: 0 }])]), /at least 1/);
  reject(file([page([null])]), /must be an object/);
});

test('a v1 file is promoted, not rejected — and promotion cannot change a verdict', () => {
  const legacy = JSON.parse(readFileSync(`${REPO}/test/fixtures/gate/legacy-v1.baseline.json`, 'utf8'));
  assert.equal(legacy.baseline, 1, 'the fixture is the old shape on purpose');
  const parsed = parseBaseline(legacy, 'legacy-v1.baseline.json');
  assert.equal(parsed.baseline, BASELINE_VERSION, 'what the rest of the code sees is the current shape');
  assert.equal(parsed.promoted, true, '…and the fact it was promoted survives, because the gate says it out loud');
  assert.deepEqual(parsed.pages.map((entry) => entry.page), ['good.html'], 'the one target becomes the one page');

  // A v2 snapshot demoted to v1 by hand and promoted back: the same page, the same entries, the same
  // arithmetic. Promotion is a read-time shape change and must never be a second opinion about the page.
  const page = ir(finding('region', '.card'), finding('label', '#a'));
  const v2 = snapshot({ ir: page, scores: {}, hash: 'h' });
  const one = v2.pages[0];
  const demoted = {
    baseline: 1,
    engine: v2.engine,
    target: { source: one.source, kind: one.kind, file: one.page },
    score: one.score,
    ir: one.ir,
    rules: one.rules,
    anchors: one.anchors,
    findings: one.findings,
  };
  const promoted = parseBaseline(demoted, 'v1.json');
  assert.deepEqual(promoted.pages[0].findings, one.findings, 'the entries survive the trip unchanged');
  const now = ir(finding('region', '.card'), finding('label', '#a'), finding('label', '#b'));
  assert.deepEqual(compare(promoted, now).counts, compare(v2, now).counts, 'including the gate arithmetic');

  // One page needs no warning — the file describes it correctly, and telling someone to re-run
  // `spark baseline` for a byte-shuffle would be noise. A repo-wide run against it is a different story.
  assert.doesNotMatch(renderGate(compare(promoted, now)).join('\n'), /version 1/);
  const wider = compare(promoted, [
    { page: one.page, ir: now },
    { page: 'other.html', ir: ir(finding('label', '#z')) },
  ]);
  assert.match(renderGate(wider).join('\n'), /written as version 1/);
});

test('the config file can name the baseline, and still rejects what it does not know', () => {
  assert.deepEqual(parseConfig({ baseline: 'gate/gate.json' }), { suppressions: [], baseline: 'gate/gate.json' });
  assert.deepEqual(parseConfig({}), { suppressions: [], baseline: null });
  assert.throws(() => parseConfig({ baseline: 3 }), /"baseline" must be a path, as a string/);
  assert.throws(() => parseConfig({ basline: 'x' }), /unknown key "basline"/);
});

// ------------------------------------------------------------------ the commands

test('`spark baseline` then `spark check --ci` is green on the day you install it', await withDir(async (dir) => {
  const baseline = join(dir, BASELINE_FILENAME);
  const page = join(dir, 'page.html');
  writeFileSync(page, readFileSync(FIXTURE, 'utf8'));

  const first = capture();
  assert.equal(await main(['baseline', page, '--baseline', baseline], first.streams), 0);
  assert.match(first.text(first.out), /floor, not the failure/);
  assert.match(first.text(first.out), new RegExp(BASELINE_FILENAME), 'the line names the file it wrote');
  const written = JSON.parse(readFileSync(baseline, 'utf8'));
  assert.equal(written.baseline, BASELINE_VERSION);
  assert.deepEqual(written.pages.map((entry) => entry.page), ['page.html'], 'one file argument keys on its basename, as v1 did');
  assert.ok(written.pages[0].findings.length > 0, 'this fixture has findings, so the file must carry them');

  const clean = capture();
  assert.equal(await main(['check', page, '--baseline', baseline, '--ci'], clean.streams), 0);
  assert.match(clean.text(clean.out), /✓ gate · no new findings/);

  // Now the regression the whole feature exists for: an unlabelled field, unannounced.
  const html = readFileSync(join(dir, 'page.html'), 'utf8');
  writeFileSync(join(dir, 'page.html'), html.replace('</body>', '<input type="text" name="promo"></body>'));
  const dirty = capture();
  assert.equal(await main(['check', page, '--baseline', baseline, '--ci'], dirty.streams), 1);
  const gate = dirty.text(dirty.out);
  // The stray input outside a landmark regresses `region`, which the baseline lists. It also creates the
  // page's first `label` finding, and `label` was never recorded here — but this baseline was written by
  // *this* build, so that is not a rule the repo never had a chance to satisfy, it is a field nobody
  // labelled. Both block; only one of them is offered to us as an adoption.
  assert.match(gate, /gate · 2 new/);
  assert.match(gate, /\+1 region at .+ \(moderate\)/);
  assert.match(gate, /\+1 label at input \(critical\)/);
  assert.doesNotMatch(gate, /rules this baseline predates/, 'nothing is exempt when the same build wrote the file');
  assert.match(gate, /already known/, 'the existing findings are named as the floor, not re-litigated');
  assert.match(gate, /accept them deliberately with `spark baseline`/);
}));

test('without a baseline, --ci exits 2 and refuses to guess', await withDir(async (dir) => {
  const run = capture();
  const code = await main(['check', FIXTURE, '--baseline', join(dir, 'nope.json'), '--ci'], run.streams);
  assert.equal(code, 2, '"never set one up" is not the same message to a status check as "you regressed"');
  assert.match(run.text(run.err), /nope\.json does not exist/);
  assert.match(run.text(run.err), /run `spark baseline` once and commit the file/);
}));

test('the baselines we ship as examples are still what our own pages produce', async () => {
  // This is the CI step's twin, and the reason the fixture gate can be trusted at all: a committed baseline
  // that quietly goes stale stops meaning "these are known" and starts meaning "these are ignored".
  for (const name of ['good', 'bad']) {
    const committed = readFileSync(`${REPO}/test/fixtures/gate/${name}.baseline.json`, 'utf8');
    const { ir, scores, hash } = await analyze({
      html: readFileSync(`${REPO}/fixtures/${name}.html`, 'utf8'),
      uri: `file://${REPO}/fixtures/${name}.html`,
    });
    assert.equal(
      serialize(snapshot({ ir, scores, hash })),
      committed,
      `fixtures/${name}.html no longer matches its committed baseline — run \`spark baseline\` on it and commit ` +
      'the new file, or the gate in CI is comparing against a page that no longer exists'
    );
  }
});

test('a machine format keeps its stdout clean, because a pipe is not a terminal', await withDir(async (dir) => {
  const baseline = join(dir, BASELINE_FILENAME);
  const page = join(dir, 'page.html');
  writeFileSync(page, readFileSync(FIXTURE, 'utf8'));
  const quiet = capture();
  await main(['baseline', page, '--baseline', baseline], quiet.streams);

  const run = capture();
  const code = await main(['check', page, '--baseline', baseline, '--ci', '--format', 'sarif'], run.streams);
  assert.equal(code, 0);
  const payload = JSON.parse(run.out[0], 'stdout must stay parseable');
  assert.equal(payload.version, '2.1.0');
  assert.equal(payload.runs[0].properties.sparkGate.ok, true);
  assert.match(run.text(run.err), /gate · no new findings/, 'the human sentence goes to stderr');

  const tsv = capture();
  await main(['check', page, '--baseline', baseline, '--ci', '--quiet'], tsv.streams);
  const rows = tsv.text(tsv.out).trim().split('\n');
  assert.ok(rows.length > 0 && rows.every((row) => row.includes('\t')), 'quiet stdout stays tab-separated, row for row');
  assert.doesNotMatch(tsv.text(tsv.out), /gate · /, 'and never grows a sentence');
}));

test('a baseline nobody can read is a build that did not run, not a clean build', await withDir(async (dir) => {
  const baseline = join(dir, BASELINE_FILENAME);
  writeFileSync(baseline, '{ this is not json');
  const page = join(dir, 'page.html');
  writeFileSync(page, readFileSync(FIXTURE, 'utf8'));
  const run = capture();
  assert.equal(await main(['check', page, '--baseline', baseline, '--ci'], run.streams), 2);
  assert.match(run.text(run.err), /is not valid JSON/);
}));

test('`--strict` alone is a mistake we say out loud, and the config can own the path', await withDir(async (dir) => {
  writeFileSync(join(dir, 'page.html'), readFileSync(FIXTURE, 'utf8'));
  writeFileSync(
    join(dir, 'spark.config.json'),
    JSON.stringify({ version: 1, baseline: 'gate/committed.json', suppress: [] }, null, 2),
  );
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    const run = capture();
    // Nothing to compare, so nothing to block: exit 0. The warning is the whole answer to a flag that was
    // typed in the belief it was buying the hard line.
    assert.equal(await main(['check', 'page.html', '--strict'], run.streams), 0);
    assert.match(run.text(run.err), /--strict only means something next to --ci/);

    const written = capture();
    assert.equal(await main(['baseline', 'page.html'], written.streams), 0, 'the config path is where it wrote');
    assert.ok(readFileSync(join(dir, 'gate/committed.json'), 'utf8').includes(`"baseline": ${BASELINE_VERSION}`));

    const run2 = capture();
    assert.equal(await main(['check', 'page.html', '--ci'], run2.streams), 0);
    assert.match(run2.text(run2.out), /✓ gate/);
  } finally {
    process.chdir(cwd);
  }
}));

test('`spark baseline` prints the artifact on request and still writes the file', await withDir(async (dir) => {
  const baseline = join(dir, BASELINE_FILENAME);
  const page = join(dir, 'page.html');
  writeFileSync(page, readFileSync(FIXTURE, 'utf8'));
  const run = capture();
  assert.equal(await main(['baseline', page, '--baseline', baseline, '--format', 'json'], run.streams), 0);
  // One write per payload: the prose line that follows is for the human, and must not be glued onto the JSON.
  assert.equal(run.out.length, 2, 'payload, then the sentence — a payload must be one write');
  const printed = JSON.parse(run.out[0]);
  assert.equal(printed.baseline, BASELINE_VERSION);
  assert.deepEqual(printed.findings, JSON.parse(readFileSync(baseline, 'utf8')).findings);
}));
