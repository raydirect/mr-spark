/**
 * Finding identity: the thing a baseline is hung from.
 *
 * These tests are written against the real engine rather than hand-written selectors, because the failure
 * they guard against is a failure of *axe's* output — a positional selector that changes when unrelated
 * markup is inserted. A fixture I invent would be shaped exactly like my assumption.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { anchorOf, groupByIdentity, identityOf, identityFragility, isEscalation, worseImpact } from '../src/identity.js';
import { analyze } from '../src/engine.js';

/**
 * A stack of `.row` divs. Two identical unlabelled inputs in it make axe fall back to positional
 * selectors (`.row:nth-child(1) > input`, `.row:nth-child(2) > input`), which is precisely the shape of
 * output a baseline must not be keyed on.
 */
const stack = (rows) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Identity</title></head><body>` +
  `<div class="stack">${rows.map((row) => `<div class="row">${row}</div>`).join('')}</div>` +
  `</body></html>`;
const FIELD = '<input type="text">';

const run = async (html) => {
  const { ir } = await analyze({ html, uri: 'file:///identity.html' });
  return ir.findings.filter((finding) => finding.ruleId === 'label');
};

test('an unrelated insertion above an element does not move its finding', async () => {
  const before = await run(stack([FIELD, FIELD]));
  const after = await run(stack(['<p>Promo season</p>', FIELD, FIELD]));
  assert.equal(before.length, 2, 'the fixture must produce two label findings');
  assert.equal(after.length, 2, 'and still two after a paragraph is added above them');

  // The premise of this module is asserted against real engine output rather than assumed: every id moved,
  // because every selector picked up a new nth-child. A diff keyed on `finding.id` would read that as
  // "2 new, 2 fixed" on a commit that added a paragraph — and a gate that reports that once gets disabled.
  assert.deepEqual(
    after.map((finding) => finding.id),
    ['label:.row:nth-child(2) > input', 'label:.row:nth-child(3) > input'],
    'if axe stops emitting positional selectors here, this pin needs revisiting rather than passing silently'
  );

  const keysOf = (findings) => groupByIdentity(findings).map((entry) => `${entry.key}:${entry.count}`);
  assert.deepEqual(keysOf(after), keysOf(before), 'the identity of what is wrong must not move');
});

test('positional pseudo-classes are stripped, author-declared parts are kept', () => {
  const anchor = anchorOf({ selector: 'html > body > div:nth-child(3) > input#promo' }).anchor;
  assert.equal(anchor, 'input#promo', 'nth-child and the document roots carry no intent');
  assert.match(anchorOf({ selector: 'form > [aria-label="Promo code"]' }).anchor, /\[aria-label="Promo code"\]/);
  assert.equal(anchorOf({ selector: '.card' }).anchor, '.card', 'a class is author content and stays');
});

test('the path is cut at an id, because the id already pins the element', () => {
  assert.equal(anchorOf({ selector: 'main > section > div#hero > input' }).anchor, 'div#hero > input');
  assert.equal(anchorOf({ selector: '#hero' }).kind, 'id');
  assert.equal(anchorOf({ selector: 'div.card > p' }).kind, 'shape');
  assert.equal(anchorOf({ selector: 'input[name="x"]' }).kind, 'named');
});

test('a finding with no element is a document finding, not a selector-less accident', () => {
  const { anchor, kind } = anchorOf({ ruleId: 'document-title' });
  assert.equal(kind, 'document');
  assert.equal(anchor, '(document)');

  // axe does report document-level rules against `html`. Those are the same one-fact-per-page findings,
  // and leaving them a "shape" anchor would count them as fragile when nothing about them can drift.
  assert.deepEqual(anchorOf({ ruleId: 'html-has-lang', selector: 'html' }), { anchor: '(document)', kind: 'document' });
  assert.deepEqual(
    anchorOf({ ruleId: 'region', selector: 'html > body > main' }),
    { anchor: 'main', kind: 'shape' },
    'one root and one real element is still a location, not a document fact'
  );
});

test('identical siblings collapse into one entry with a count', async () => {
  const findings = await run(stack([FIELD, FIELD, FIELD]));
  const entries = groupByIdentity(findings);
  assert.equal(entries.reduce((sum, entry) => sum + entry.count, 0), findings.length, 'no finding may be lost');
  assert.equal(entries.length, 1, 'three structurally identical rows are one entry, not three names');
  assert.equal(entries[0].count, 3, 'and the count is the difference that matters');
  assert.equal(entries[0].anchor, '.row > input');

  // Fixing one of the three is a real change the gate has to see, and it can only be seen as a number.
  const two = groupByIdentity(await run(stack([FIELD, FIELD, '<p>not a field</p>'])));
  assert.equal(two[0].count, 2, 'fixing one of three moves the count, which is the whole point');
});

test('a fragment and a page are different measurements, and the anchor does not pretend otherwise', async () => {
  const { ir } = await analyze({ html: stack([FIELD, FIELD]), uri: 'file:///identity.html' });
  const keys = groupByIdentity(ir.findings).map((entry) => entry.key);
  assert.deepEqual(
    keys,
    [...keys].sort(),
    'entries are sorted by key, so a committed baseline diffs as content rather than as churn'
  );
});

test('the key is readable where it counts and opaque where it must be', () => {
  const { key } = identityOf({ ruleId: 'color-contrast', selector: '.hero' });
  assert.match(key, /^color-contrast@[0-9a-f]{12}$/);
  assert.equal(identityOf({ ruleId: 'color-contrast', selector: '.hero' }).key, key, 'same facts, same key');
  assert.notEqual(key, identityOf({ ruleId: 'region', selector: '.hero' }).key, 'a different rule is a different finding');
});

test('fragility is reported, so a green gate cannot overstate its own anchors', () => {
  const entries = groupByIdentity([
    { ruleId: 'label', selector: '#promo', impact: 'critical' },
    { ruleId: 'region', selector: 'div.card', impact: 'moderate' },
    { ruleId: 'region', selector: 'div.card', impact: 'moderate' },
  ]);
  const fragility = identityFragility(entries);
  assert.equal(fragility.total, 2);
  assert.equal(fragility.byKind.shape, 1);
  assert.equal(fragility.byKind.id, 1);
  assert.equal(fragility.positional, 1);
});

test('impact arithmetic uses the vocabulary, not a private ranking', () => {
  assert.equal(worseImpact('minor', 'critical'), 'critical');
  assert.equal(worseImpact('moderate', null), 'moderate');
  assert.equal(isEscalation('serious', 'moderate'), true, 'moderate → serious is worse');
  assert.equal(isEscalation('moderate', 'serious'), false);
  assert.equal(isEscalation('serious', 'serious'), false, 'the same impact is not an escalation');
  // An older baseline file may not know an impact at all. That is unknown, not an escalation.
  assert.equal(isEscalation('serious', null), false, 'unknown past impact never blocks');
});
