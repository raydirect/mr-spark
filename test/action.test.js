/**
 * The gate action: its contract with a workflow that is not ours.
 *
 * There is no YAML parser here on purpose — no runtime dependency is a project rule, and a hand-rolled
 * parser of "any YAML" would be a second YAML implementation nobody audits. So these tests read the file
 * the way a reviewer would (block mappings at two indent levels, the `run: |` body as text) and assert the
 * properties that actually break in production: an input referenced but not declared, a flag the CLI does
 * not have, and a value that reached the shell unquoted.
 *
 * Whether the file is valid YAML at all is answered by `.github/workflows/check.yml`, which *uses* this
 * action on every push — the runner parses it or the build goes red. That is why the action is dogfooded
 * rather than only documented, and it is the strongest test in this file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { USAGE } from '../src/cli.js';
import { buildSarif, renderSarif } from '../src/reporters/sarif.js';
import { compare, snapshot } from '../src/baseline.js';
import { VERSION } from '../src/config/brand.js';
import { summarize } from '../.github/actions/spark-gate/summary.mjs';

const ACTION_DIR = '.github/actions/spark-gate';
const action = readFileSync(new URL(`../${ACTION_DIR}/action.yml`, import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');

/** The `inputs:` mapping: name → { description, default, required }. */
function parseInputs(text) {
  const block = text.match(/\ninputs:\n([\s\S]*?)(?=\nruns:)/);
  assert.ok(block, 'action.yml must declare an inputs: block before runs:');
  const inputs = {};
  let current = null;
  for (const line of block[1].split('\n')) {
    const name = line.match(/^  ([a-z][a-z0-9-]*):$/);
    if (name) {
      current = name[1];
      inputs[current] = {};
      continue;
    }
    if (!current) continue;
    const field = line.match(/^    (description|default|required):\s*(.*)$/);
    if (field) inputs[current][field[1]] = field[2].replace(/^'|'$/g, '');
  }
  return inputs;
}

/** The body of every `run: |` step, dedented and concatenated. */
function runBodies(text) {
  const bodies = [];
  let body = null;
  let indent = 0;
  for (const line of text.split('\n')) {
    if (/^\s*run: \|\s*$/.test(line)) {
      body = [];
      indent = 0;
      bodies.push(body);
      continue;
    }
    if (body === null) continue;
    const spaces = (line.match(/^ */) ?? [''])[0].length;
    if (!indent) indent = spaces;
    if (line.trim() === '' || spaces >= indent) body.push(line.slice(indent));
    else body = null;
  }
  return bodies.map((part) => part.join('\n'));
}

const declared = parseInputs(action);
const script = runBodies(action).join('\n');

test('every input the action references is declared, and every declared input is used', () => {
  const referenced = [...action.matchAll(/\$\{\{\s*inputs\.([a-z0-9-]+)\s*\}\}/g)].map((match) => match[1]);
  for (const name of referenced) {
    assert.ok(declared[name], `inputs.${name} is referenced but not declared — it would arrive empty`);
  }
  for (const name of Object.keys(declared)) {
    assert.ok(referenced.includes(name), `inputs.${name} is declared and never read: a documented knob that does nothing`);
  }
  assert.deepEqual(Object.keys(declared).sort(), [
    'baseline',
    'fail-under',
    'sarif',
    'spark',
    'strict',
    'target',
    'working-directory',
  ]);
});

test('the docs each input carries are the whole contract, since there is no other place to read it', () => {
  for (const [name, spec] of Object.entries(declared)) {
    assert.ok(spec.description && spec.description.length > 12, `${name}: a one-word description is not documentation`);
    assert.ok(
      name === 'target' ? spec.required === 'true' : spec.default !== undefined,
      `${name}: either required or defaulted — an optional input with no default is a mystery`
    );
  }
  assert.equal(declared.target.required, 'true', 'a gate with no target is not a gate');
  assert.equal(declared.sarif.default, '.spark/spark-gate.sarif', 'the payload lands where a workflow can find it');
  assert.equal(declared.strict.default, 'false', 'the soft line is the default, and the hard one is a choice');
});

test('no action input reaches the shell as code', () => {
  // `${{ }}` is substituted into the script *before* bash parses it, so an input containing `"; …` would
  // become commands. Everything crosses through env, where a value is only ever a value.
  assert.doesNotMatch(script, /\$\{\{/, 'a run: block must interpolate nothing');
  const envs = [...action.matchAll(/^        ([A-Z_]+): \$\{\{ inputs\.([a-z-]+) \}\}$/gm)].map((m) => [m[1], m[2]]);
  assert.ok(envs.length >= 6, `values must travel through env:, found ${envs.length}`);
  for (const [variable, input] of envs) {
    assert.ok(declared[input], `env ${variable} maps to an undeclared input`);
    // And inside double quotes: an unquoted $VAR is word splitting, and a target path with a space in it
    // is not exotic, it is a folder called `My Site`.
    assert.ok(
      script.includes(`"$${variable}`) || script.includes(`"\${${variable}}`),
      `${variable} is read unquoted — word splitting on a path`
    );
  }
  const used = new Set([...script.matchAll(/\$\{?([A-Z][A-Z0-9_]+)/g)].map((match) => match[1]));
  const runner = new Set(['GITHUB_ACTION_PATH', 'GITHUB_STEP_SUMMARY', 'HOME', 'PATH']);
  for (const variable of used) {
    assert.ok(
      envs.some(([name]) => name === variable) || runner.has(variable),
      `${variable} is used but never declared in env: — it would be empty on a runner`
    );
  }
});

test('the action only passes flags this build actually has', () => {
  // The same rule as the OPTIONS table, seen from the other side: `--help` cannot document a flag the
  // parser lacks, and an action cannot pass a flag the CLI refuses. USAGE is generated from that table.
  const flags = new Set([...script.matchAll(/--([a-z-]+)/g)].map((match) => `--${match[1]}`));
  assert.ok(flags.size >= 5);
  for (const flag of flags) {
    assert.ok(USAGE.includes(flag), `${flag} is not in the usage text`);
  }
  assert.ok(flags.has('--ci') && flags.has('--baseline'), 'the point of the action');
  assert.ok(flags.has('--no-color'), 'a report with ANSI escapes in it is unreadable in a log viewer');
});

test('it fails on a flag typed as neither true nor false, and never on a missing summary', () => {
  assert.match(script, /strict must be true or false/);
  assert.match(script, /exit 2/, 'a misunderstood input is couldNotRun, not a silent false');
  assert.match(script, /\/dev\/null \|\| true/, 'the SARIF run reports, it does not decide');
  assert.match(script, />> "\$GITHUB_STEP_SUMMARY" \|\| true/, 'and the summary can never break a build');
  assert.match(script, /exit "\$code"/, 'the audit run does');
});

test('our own CI uses the action, so a broken action.yml is a red build here first', () => {
  assert.ok((workflow.match(new RegExp(`uses: \\./${ACTION_DIR}`, 'g')) ?? []).length >= 2, 'both branches');
  assert.match(workflow, /name: the gate is green on the pages we ship as examples/);
  // `summary.mjs` runs under `|| true` — correctly, it must never break a build — so CI asserts it landed
  // instead. Otherwise a summary that quietly stopped existing would be invisible for a year.
  assert.match(workflow, /grep "MR-Spark gate ✓ no new findings" \.spark\/summary\.md/);
  // The copy beside the payload, because `$GITHUB_STEP_SUMMARY` is a per-step file: a later step that
  // grepped it would be reading an empty file and calling that a failure — which is how this came up.
  assert.doesNotMatch(workflow, /grep.*\$GITHUB_STEP_SUMMARY/);
  assert.match(script, /summary="\$\(dirname "\$SPARK_SARIF"\)\/summary\.md"/);
  // One run with the payload and one without, on purpose: `sarif: ''` is the path a consumer is most
  // likely to type, and a branch nothing exercises is a branch that rots.
  assert.match(workflow, /sarif: ''/);
  assert.match(workflow, /sarif: \.spark\/bad\.sarif/);
});

test('the run script is a script: its blocks close, and bash parses it', (t) => {
  // Quote and block balance is cheap to check anywhere and catches the class of typo that a YAML block
  // scalar hides perfectly — the file stays valid YAML while the shell inside it stops being valid bash.
  assert.equal(
    (script.match(/\bthen\b/g) ?? []).length,
    (script.match(/\bfi\b/g) ?? []).length,
    'every if has a fi'
  );
  assert.equal(script.split('"').length % 2, 1, 'an even number of double quotes, i.e. all of them closed');

  let result;
  try {
    const file = join(tmpdir(), `spark-gate-syntax-${process.pid}.sh`);
    writeFileSync(file, `${script}\n`);
    result = execFileSync('bash', ['-n', file], { encoding: 'utf8', stdio: 'pipe' });
    rmSync(file, { force: true });
  } catch (error) {
    // A machine with no bash is a Windows checkout, where the runner's own shell is pwsh: the parse check
    // is a linux-runner guarantee, and skipping it out loud beats failing a contributor's `npm test`.
    assert.ok(error.code === 'ENOENT' || error.code === 'ERR_FILE_SYSTEM', `bash -n failed: ${error.stderr ?? error.message}`);
    if (error.code === 'ERR_FILE_SYSTEM') throw error;
    t.skip('no bash on this platform — the runner that executes this script is Linux');
  }
});

// ------------------------------------------------------------------ the step summary

const finding = (ruleId, selector, impact = 'moderate', extra = {}) => ({
  ruleId,
  selector,
  impact,
  pillar: 'accessible',
  coverage: 'decided',
  message: `${ruleId} message`,
  ...extra,
});

const ir = (...findings) => ({
  findings,
  provenance: { uri: 'file:///home/ada/page.html', source: 'file', kind: 'document' },
});

/**
 * The payload a CI run would have written, from two synthetic pages.
 *
 * `build` stamps which MR-Spark wrote the baseline. It is a knob because one of the gate's rules is about
 * exactly that: a rule the file has never heard of is "ours to adopt" only when an older build wrote the
 * file, and is a regression when this build did. Tests that want the first reading ask for `build: '0.1.0'`.
 */
const sarifFor = (before, now, { build = VERSION, ...options } = {}) => {
  const base = snapshot({ ir: before, scores: {}, hash: 'h' });
  const diff = compare({ ...base, engine: { ...base.engine, version: build } }, now, options);
  return renderSarif(buildSarif({ ir: now, scores: { accessible: 71 }, hash: 'h', diff }));
};

test('a clean gate says so once, and does not tell anyone to fix anything', () => {
  const text = summarize(JSON.parse(sarifFor(ir(finding('region', '.card')), ir(finding('region', '.card')))));
  assert.match(text, /^### MR-Spark gate ✓ no new findings/m);
  assert.match(text, /\| already in the baseline \| 1 \|/);
  assert.doesNotMatch(text, /Either fix them/);
  assert.match(text, /accessible 71\/100/, 'the number is there, but the verdict is not the number');
  assert.doesNotMatch(text, /home\/ada/, "and no path from somebody's laptop");
});

test('a regression lists only what blocks, and separates what it refuses to charge', () => {
  const before = ir(finding('region', '.card'));
  const now = ir(
    finding('region', '.card'),
    finding('region', '.card'),
    finding('label', '#x', 'critical'),
    finding('color-contrast', '.hero', 'serious', { coverage: 'incomplete', undecidedKind: 'environment' }),
    finding('html-has-lang', 'html', 'serious', { suppressed: true, suppressionReason: 'tracked upstream' })
  );
  const text = summarize(JSON.parse(sarifFor(before, now, { build: '0.1.0' })));
  assert.match(text, /✗ 1 new finding\(s\)/);
  assert.match(text, /\| new \| 1 \|/);
  // The bullet carries the delta, not the number of results at that anchor: two identical siblings are two
  // results and one new finding, and a summary that said "+2" would contradict the exit code.
  assert.match(text, /- `region` \+1 at `\.card` \(moderate\) · baseline had 1/);
  assert.doesNotMatch(text, /- `label`/, 'a finding from a rule the baseline predates is not listed as a regression');
  assert.match(text, /1 finding\(s\) are reported but not blocking/);
  assert.match(text, /Not counted as regressions: 1 could not be decided automatically, 1 waived by configuration/);
  assert.match(text, /Either fix them, or run `spark baseline`/);
});

test('--strict moves a finding from "ours to adopt" to "yours to fix", and the summary follows', () => {
  const before = ir(finding('region', '.card'));
  const now = ir(finding('region', '.card'), finding('label', '#x', 'critical'));
  const text = summarize(JSON.parse(sarifFor(before, now, { strict: true, build: '0.1.0' })));
  // The same finding without `--strict`, from the same older baseline: adopted, not charged.
  assert.match(summarize(JSON.parse(sarifFor(before, now, { build: '0.1.0' }))), /rules this baseline predates/, 'so the sentence this test is about is really about --strict');
  assert.match(text, /✗ 1 new finding\(s\)/);
  assert.match(text, /- `label` \+1 at `#x` \(critical\)/);
  assert.doesNotMatch(text, /rules this baseline predates/, 'nothing is left to adopt once the line is hard');
});

test('a long list is truncated, visibly', () => {
  const many = ir(...Array.from({ length: 9 }, (_, i) => finding('region', `.card${i}`)), finding('region', '.keep'));
  const text = summarize(JSON.parse(sarifFor(ir(finding('region', '.keep')), many)));
  assert.match(text, /\| new \| 9 \|/);
  assert.match(text, /and 1 more on the Files tab/);
  assert.equal((text.match(/^- `/gm) ?? []).length, 8, 'the list is capped at eight');
});

test('a run that compared nothing refuses to read as a pass', () => {
  const payload = JSON.parse(sarifFor(ir(finding('region', '.card')), ir(finding('region', '.card'))));
  delete payload.runs[0].properties.sparkGate;
  const text = summarize(payload);
  assert.match(text, /no comparison/);
  assert.match(text, /Nothing here is a pass/);
  assert.doesNotMatch(text, /\| new \| 0 \|/, 'absence of a comparison is not evidence of zero regressions');
});

test('the results and the summary quote one arithmetic, not two', () => {
  const before = ir(finding('region', '.card'));
  const now = ir(finding('region', '.card'), finding('region', '.card'));
  const payload = JSON.parse(sarifFor(before, now));
  const gate = payload.runs[0].properties.sparkGate;
  const stamped = payload.runs[0].results.filter((result) => result.baselineState === 'updated');
  assert.equal(gate.blocking, 1, 'one new finding at a known anchor');
  assert.equal(stamped.length, 2, 'and both results at that anchor say updated, because the anchor is what has a state');
  assert.ok(stamped.every((result) => result.properties.sparkBlocking === true));
  assert.deepEqual(
    gate.entries.map((entry) => `${entry.ruleId}:${entry.state}:${entry.added}:${entry.blocking}`),
    ['region:updated:1:true']
  );
});

test('a missing or unreadable report is a sentence, not a stack trace', () => {
  const path = `/tmp/spark-gate-missing-${process.pid}.sarif`;
  const out = execFileSync(
    process.execPath,
    [new URL(`../${ACTION_DIR}/summary.mjs`, import.meta.url).pathname, path],
    { encoding: 'utf8' }
  );
  assert.match(out, /no summary/);
  assert.match(out, /Could not read the report/);
  assert.doesNotMatch(out, /no new findings/, 'a missing report is not a pass');
  assert.doesNotMatch(out, /Error/, 'and a summary step that throws is a red build nobody can read');
});
