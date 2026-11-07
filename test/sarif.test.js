/**
 * SARIF: the same findings, in a format a code scanner already consumes.
 *
 * These tests check the promises that make the format worth emitting — that nothing is invented (a line
 * number we do not have), nothing is hidden (a waiver, an undecided check), and the payload is identical
 * byte for byte between runs — rather than re-testing that JSON serialises.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SARIF_SCHEMA, SARIF_VERSION, buildSarif, renderSarif } from '../src/reporters/sarif.js';
import { identityOf } from '../src/identity.js';
import { snapshot } from '../src/baseline.js';
import { compare } from '../src/baseline.js';
import { NAME } from '../src/config/brand.js';

const LEVELS = new Set(['none', 'note', 'warning', 'error']);

const finding = (ruleId, selector, impact, extra = {}) => ({
  ruleId,
  selector,
  impact,
  pillar: 'accessible',
  coverage: 'decided',
  message: `${ruleId}: what to do about it`,
  help: 'https://example.test/rule',
  snippet: `<div class="${selector}">`,
  ...extra,
});

const makeIr = (...findings) => ({
  findings,
  provenance: { uri: 'file:///home/ada/project/page.html', source: 'file', kind: 'document' },
});

const run = (payload) => payload.runs[0];

test('the document is SARIF, its rules are sorted, and every reference resolves', () => {
  const ir = makeIr(
    finding('region', '.card', 'moderate'),
    finding('label', '#a', 'critical'),
    finding('aria-hidden-focus', 'aside', 'serious')
  );
  const payload = buildSarif({ ir, scores: { accessible: 80 }, hash: 'abc' });
  assert.equal(payload.version, SARIF_VERSION);
  assert.equal(payload.$schema, SARIF_SCHEMA);
  assert.equal(run(payload).tool.driver.name, NAME);

  const ruleIds = run(payload).tool.driver.rules.map((rule) => rule.id);
  assert.deepEqual(ruleIds, [...ruleIds].sort(), 'rule order is fixed, so a diff of two runs shows findings');
  for (const result of run(payload).results) {
    assert.ok(Number.isInteger(result.ruleIndex), 'a result names its rule by index as well as by id');
    assert.equal(run(payload).tool.driver.rules[result.ruleIndex].id, result.ruleId);
    assert.ok(LEVELS.has(result.level), `${result.level} is not a SARIF level`);
  }
});

test('impact chooses the level, and a rule is configured by its worst finding', () => {
  const ir = makeIr(
    finding('color-contrast', '.a', 'minor'),
    finding('color-contrast', '.b', 'critical'),
    finding('region', '.c', 'moderate')
  );
  const payload = buildSarif({ ir, scores: {}, hash: 'h' });
  const level = (ruleId) => run(payload).tool.driver.rules.find((rule) => rule.id === ruleId).defaultConfiguration.level;
  assert.equal(level('color-contrast'), 'error', 'one critical makes the rule error, not the first finding it saw');
  assert.equal(level('region'), 'warning');
  const byAnchor = Object.fromEntries(run(payload).results.map((result) => [result.properties.sparkAnchor, result.level]));
  assert.deepEqual(
    byAnchor,
    { '.a': 'note', '.b': 'error', '.c': 'warning' },
    'each finding keeps its own level; the rule takes the worst'
  );
});

test('no line number is invented, because a confident wrong location is worse than none', () => {
  const ir = makeIr(finding('label', '#a', 'critical'));
  const [result] = run(buildSarif({ ir, scores: {}, hash: 'h' })).results;
  const location = result.locations[0].physicalLocation;
  assert.equal(location.region, undefined, 'the browserless collector has no source position to report');
  assert.equal(location.artifactLocation.uri, 'page.html', 'the artifact is the page, by name');
  assert.doesNotMatch(location.artifactLocation.uri, /^\/|\p{Lu}:/u, 'a committed report must not carry a home directory');
  assert.match(result.message.text, /at #a/);
  assert.match(result.message.text, /<div class="#a">/, 'and the snippet is where the anchor goes instead of a line');
});

test('an undecided check ships as information, never as a gap in the list', () => {
  const ir = makeIr(
    finding('color-contrast', '.hero', 'serious', { coverage: 'incomplete', undecidedKind: 'environment' }),
    finding('landmark-one-main', 'html', null, { coverage: 'incomplete', undecidedKind: 'judgement' })
  );
  const results = run(buildSarif({ ir, scores: {}, hash: 'h' })).results;
  assert.equal(results.length, 2, 'dropping them would make a blind run look like a clean one');
  for (const result of results) {
    assert.equal(result.kind, 'informational');
    assert.equal(result.level, 'note');
    assert.match(result.message.text, /could not be decided/);
    assert.equal(result.properties.sparkCoverage, 'incomplete');
  }
  assert.deepEqual(
    results.map((result) => result.properties.sparkUndecidedKind),
    ['judgement', 'environment'].sort(),
    'each one says whether it is our blindness or a human question'
  );
});

test('a waiver is carried visibly, and SARIF is not used to hide it', () => {
  const ir = makeIr(finding('color-contrast', '.brand', 'serious', { suppressed: true, suppressionReason: 'brand colour, signed off 2026-01' }));
  const [result] = run(buildSarif({ ir, scores: {}, hash: 'h' })).results;
  assert.equal(result.suppressions, undefined, 'the suppressions array tells the viewer to hide the result');
  assert.match(result.message.text, /waived by configuration: brand colour, signed off 2026-01/);
  assert.equal(result.properties.sparkStatus, 'suppressed');
  assert.equal(result.level, 'note');
});

test('the key the scanner dedupes on is the key the baseline compares', () => {
  const ir = makeIr(finding('region', '.card', 'moderate'));
  const [result] = run(buildSarif({ ir, scores: {}, hash: 'h' })).results;
  assert.equal(result.partialFingerprints.sparkKey, identityOf(ir.findings[0]).key);
  assert.equal(result.properties.sparkAnchor, '.card');
});

test('two builds of one page are the same bytes, and neither knows what time it is', () => {
  const ir = makeIr(finding('label', '#a', 'critical'), finding('region', '.card', 'moderate'));
  const a = renderSarif(buildSarif({ ir, scores: { accessible: 90 }, hash: 'h1' }));
  const b = renderSarif(buildSarif({ ir: makeIr(...ir.findings), scores: { accessible: 90 }, hash: 'h1' }));
  assert.equal(a, b);
  assert.match(a, /\n$/, 'a file that ends mid-line is a file people edit');
  assert.ok(!a.endsWith('\n\n'), 'and it does not pad either');
  assert.doesNotMatch(a, /\d{4}-\d{2}-\d{2}T\d{2}:/, 'no timestamps — the artifact must be diffable');
  assert.deepEqual(JSON.parse(a), buildSarif({ ir, scores: { accessible: 90 }, hash: 'h1' }));
});

test('with a baseline in play, each result says whether it is news', () => {
  const before = makeIr(finding('region', '.card', 'moderate'), finding('label', '#old', 'critical'));
  const now = makeIr(finding('region', '.card', 'serious'), finding('label', '#gone', 'critical'), finding('label', '#new', 'critical'));
  const diff = compare(snapshot({ ir: before, scores: {}, hash: 'h' }), now);
  const results = run(buildSarif({ ir: now, scores: {}, hash: 'h', diff })).results;
  const states = Object.fromEntries(results.map((result) => [result.properties.sparkKey.split('@')[0], result.baselineState]));
  assert.equal(states.label, 'new', 'the finding nobody has seen before');
  assert.equal(states.region, 'updated', 'the same anchor that got worse — the one GitHub annotates as a diff');
  assert.deepEqual(
    run(buildSarif({ ir: now, scores: {}, hash: 'h' })).results.map((result) => result.baselineState),
    [undefined, undefined, undefined],
    'without a baseline nothing claims to be new or unchanged'
  );
  const gate = run(buildSarif({ ir: now, scores: {}, hash: 'h', diff })).properties.sparkGate;
  assert.equal(gate.ok, false);
  assert.equal(gate.blocking, diff.counts.blocking);
  assert.equal(gate.escalated, diff.counts.escalated);
});
