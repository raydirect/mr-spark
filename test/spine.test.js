/**
 * The spine: documents → IR → page.
 *
 * These tests are split the way the pipeline is, because a single "it all works" assertion tells you
 * nothing about which half broke:
 *
 * - **lowering** is about *resolution*: tokens, cross-document identity, inherited defaults, timing.
 * - **emission** is about *fidelity*: every resolved fact reaches the CSS, nothing else does, and the
 *   bytes are reproducible.
 * - **the audit** is the only test that matters at the end: our own checker, on our own emitted page.
 *   Everything else can pass while the page is still bad.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadDocumentSet, lowerSet, LOWER_RULE_IDS, assessMotionImpact, cssVarName, className } from '../src/lower.js';
import { emit, EMIT_RULES } from '../src/emit.js';
import { sampleEase, cssTimingFunction } from '../src/ease-bake.js';
import { stableStringify, contentHash } from '../src/ir.js';
import { analyze } from '../src/engine.js';
import { main } from '../src/cli.js';
import { SAMPLE_MAX_KEYFRAMES } from '../src/formats/eases.js';

const FIXTURES = new URL('./fixtures/docs/', import.meta.url).pathname;
const SHOP = join(FIXTURES, 'shop.spark.scene.json');
const LANDING = join(FIXTURES, 'landing.spark.scene.json');

const read = (file) => JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
const sceneDoc = read('shop.spark.scene.json');
const motionDoc = read('shop.spark.motion.json');
const settingsDoc = read('brand.spark.settings.json');

function mutate(doc, patch) {
  return { ...structuredClone(doc), ...patch };
}

async function lowerShop(patch = {}) {
  const docs = { ...patch };
  const paths = { scene: SHOP };
  if (!docs.scene) docs.scene = sceneDoc;
  if (!docs.motion) docs.motion = motionDoc;
  if (!docs.settings) docs.settings = settingsDoc;
  return lowerSet({ docs, paths, problems: [] });
}

/* ------------------------------------------------------------------ lowering */

test('the spine fixture lowers with nothing left unresolved', async () => {
  const lowered = await lowerShop();
  assert.deepEqual(lowered.errors, [], `expected no errors, got ${lowered.errors.map((e) => `${e.code} ${e.path}`).join('; ')}`);
  assert.equal(lowered.complete, true, 'every semantic check ran');
  // One lint, on purpose: a duration written literally in the motion fixture. A fixture with no lint
  // would let a real one slip in unnoticed, so the count is the assertion.
  assert.equal(lowered.notices.length, 1);
  assert.equal(lowered.notices[0].code, 'literalValue');
  assert.equal(lowered.notices[0].actual, '0.6s', 'the one deliberate literal in the fixture');
});

test('the document set is found by name, not by a manifest', async () => {
  const set = await loadDocumentSet(SHOP);
  assert.deepEqual(Object.keys(set.paths).sort(), ['motion', 'scene', 'settings']);
  assert.match(set.paths.settings, /brand\.spark\.settings\.json$/, 'the scene points at its brand');

  const entryFromMotion = await loadDocumentSet(join(FIXTURES, 'shop.spark.motion.json'));
  assert.deepEqual(Object.keys(entryFromMotion.paths).sort(), ['motion', 'scene', 'settings'], 'either document is a valid entry point');
});

test('a scene referencing a settings file that is not there is refused, not left open', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spark-missing-'));
  try {
    const path = join(dir, 'orphan.spark.scene.json');
    await writeFile(path, JSON.stringify(mutate(sceneDoc, { tokens: { $ref: './absent.spark.settings.json' } })), 'utf8');
    const set = await loadDocumentSet(path);
    const lowered = lowerSet(set);
    const error = lowered.errors.find((entry) => entry.code === 'LOWER001');
    assert.ok(error, 'the missing file is a named error');
    assert.match(error.note, /not there/);
    // …and the tokens it would have supplied are reported too, so the reader learns both halves.
    assert.ok(lowered.errors.some((entry) => entry.code === 'LOWER003'), 'unresolvable token references are errors, not passes');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a motion that targets a component the scene never declared is refused', async () => {
  const ghost = mutate(motionDoc, {});
  ghost.animations[0].target.id = 'hero-title';
  const lowered = await lowerShop({ motion: ghost });
  const error = lowered.errors.find((entry) => entry.code === 'LOWER002');
  assert.ok(error, 'lowering knows the difference between a name and a thing');
  assert.match(error.note, /hero-title.*not a component/s);
});

test('a stagger across the children of a leaf is refused, because it animates nothing', async () => {
  const empty = structuredClone(motionDoc);
  empty.timelines[1].items[0].target = { id: 'order-copy', each: 'children' };
  const lowered = await lowerShop({ motion: empty });
  assert.match(lowered.errors.map((e) => e.note).join('\n'), /has no children/);
});

test('a state trigger naming a machine the document does not have is refused', async () => {
  const wrong = structuredClone(motionDoc);
  wrong.animations[0].trigger = { on: 'state', machine: 'drawer', state: 'open' };
  const lowered = await lowerShop({ motion: wrong });
  const error = lowered.errors.find((entry) => entry.code === 'LOWER004');
  assert.ok(error, 'the machine is checked by name, not by hope');
  assert.match(error.note, /no machine named "drawer"/);
});

test('defaults resolve once, in one order, and the page inherits the answer', async () => {
  const lowered = await lowerShop();
  const byId = new Map(lowered.ir.motion.items.map((item) => [item.id ?? 'inline', item]));
  // root defaults: motion.base, ease-out, instant
  const breathe = lowered.ir.motion.items.find((item) => item.target?.id === 'order-image' && item.trigger?.on === 'load');
  assert.equal(breathe.easing, 'ease-in-out', 'the authored ease wins over the inherited one');
  assert.equal(breathe.reducedMotion, 'instant', 'a decorative loop still inherits the root reducedMotion');
  // the timeline override (`power2.out`) beats the root default (`ease-out`) for its items
  const list = lowered.ir.motion.items.find((item) => item.target?.id === 'order-list');
  assert.equal(list.easing, 'power2.out', 'timeline defaults beat root defaults');
  assert.equal(list.reducedMotion, 'instant', '…and root defaults still reach through where nothing overrides');
  assert.equal(list.startMs, 0, '`<` starts with the timeline');
  assert.equal(byId.get('title-in').duration.msValue, 120, 'a duration token resolves to milliseconds');
});

test('timing accumulates into absolute offsets, which is only possible because nothing is computed at play time', async () => {
  const lowered = await lowerShop();
  const items = lowered.ir.motion.items.filter((item) => item.target?.id !== 'masthead-title' && item.trigger?.on === 'visible');
  const starts = items.map((item) => item.startMs).sort((a, b) => a - b);
  assert.deepEqual(starts, [0, 150], 'label:after-list lands at 150ms, the position the document authored');
});

test('impact is computed and an author may only raise it', async () => {
  assert.equal(assessMotionImpact({ from: { opacity: '0' }, to: { opacity: '1' }, durationValue: '200ms' }), 'subtle', 'a fade is not a hazard');
  assert.equal(assessMotionImpact({ from: { translateY: '60px' }, to: { translateY: '0' }, durationValue: '400ms' }), 'intense', '60px of travel is');
  assert.equal(assessMotionImpact({ from: { rotate: '0deg' }, to: { rotate: '1.5deg' }, repeat: 'infinite', durationValue: '600ms' }), 'noticeable', 'a slow loop is noticeable; it never stops');
  assert.equal(
    assessMotionImpact({ from: { opacity: '0' }, to: { opacity: '1' }, durationValue: '200ms', impactFloor: 'intense' }),
    'intense',
    'a floor raises',
  );
  assert.equal(
    assessMotionImpact({ from: { translateX: '80px' }, to: { translateX: '0' }, durationValue: '400ms', impactFloor: 'subtle' }),
    'intense',
    'a floor never lowers — a guarantee the graded party can dial down is not a guarantee',
  );
});

test('every lowering rule id is documented', () => {
  const documented = readFileSync(new URL('../docs/DOCUMENTS.md', import.meta.url), 'utf8');
  for (const id of LOWER_RULE_IDS) assert.match(documented, new RegExp(id), `${id} appears nowhere in docs/DOCUMENTS.md`);
});

/* ------------------------------------------------------------------- emitting */

test('a page is three files, and the second run writes the same bytes', async () => {
  const lowered = await lowerShop();
  const first = emit(lowered.ir);
  const second = emit(lowered.ir);
  assert.deepEqual(Object.keys(first.files).sort(), ['index.html', 'spark.css', 'tokens.json']);
  for (const file of Object.keys(first.files)) assert.equal(first.files[file], second.files[file], `${file} differed between runs`);
  assert.equal(first.refusals.length, 0);
  // A timestamp anywhere in the output makes "byte-identical" a coin flip the next morning.
  for (const contents of Object.values(first.files)) {
    assert.doesNotMatch(contents, /\d{4}-\d{2}-\d{2}T/, 'no wall clock in an emitted artifact');
  }
});

test('the IR itself is a content address, not a snapshot of the clock', async () => {
  const a = (await lowerShop()).ir;
  const b = (await lowerShop()).ir;
  assert.equal(await contentHash(a), await contentHash(b), 'the same documents hash the same');
  assert.notEqual(stableStringify(a), stableStringify(b), '…while the raw IR still records when each run happened');
});

test('the emitter writes tokens once, and a rule never carries a colour of its own', async () => {
  const lowered = await lowerShop();
  const css = emit(lowered.ir).files['spark.css'];
  const outside = css.replace(/:root \{[\s\S]*?\n\}/g, '').replace(/\[data-theme="[^"]+"\] \{[\s\S]*?\n\}/g, '');
  assert.doesNotMatch(outside, /#[0-9a-fA-F]{3,8}\b/, 'a hex outside the token block is a colour no contrast pair promised');
  assert.match(css, /--color-accent: #0b5fd0;/, 'the light value is the default');
  assert.match(css, /\[data-theme="dark"\] \{\n  --color-accent: #85b4ff;/, 'and the dark value is one attribute away');
});

test('every resolved token reference reaches the CSS as a var(), and no document path survives as text', async () => {
  const lowered = await lowerShop();
  const files = emit(lowered.ir).files;
  const { 'index.html': index, 'spark.css': css } = files;
  assert.match(css, /\.s-12rqvlk \{\n  display: grid;\n  gap: var\(--space-lg\);/, 'one class, one rule, declarations in name order');
  assert.match(css, /outline: var\(--layout-focus-ring\);/, 'the focus ring is one token, so it inherits a colour that is in a pair');
  assert.equal(/space\.(lg|xl|md)/.test(css) || /space\.(lg|xl|md)/.test(index), false, 'a dotted path is not a CSS value');
  assert.match(index, /<h1 id="masthead-title"/, 'the authored level survives');
});

test('states land on the selectors users actually reach', async () => {
  const css = emit((await lowerShop()).ir).files['spark.css'];
  assert.match(css, /:focus-visible \{\n\s*outline: var\(--layout-focus-ring\);/);
  assert.match(css, /:hover \{\n\s*background-color: var\(--color-accent-hover\);/);
  assert.match(css, /:disabled \{\n\s*opacity: 0\.5;/);
  assert.match(css, /:checked \{\n\s*opacity: 0\.6;/, 'a checkbox that shows its own state');
  assert.match(css, /:invalid \{/);
});

test('the a11y contract is emitted, not inferred: landmarks, one main, and a skip link that is reachable', async () => {
  const lowered = await lowerShop();
  const files = emit(lowered.ir).files;
  const { 'index.html': index, 'spark.css': css } = files;
  assert.match(index, /<html lang="en">/);
  assert.match(index, /<header id="masthead"/);
  assert.match(index, /<main id="order"/);
  assert.match(index, /<footer id="footer-note"/);
  assert.match(index, /<form id="order-form" class="[^"]+"/, 'the region role still chooses the element');
  assert.equal((index.match(/<main/g) ?? []).length, 1);
  assert.match(index, /<a class="spark-skip" href="#order">Skip to main content<\/a>/);
  assert.match(css, /^\.spark-skip:focus \{ transform: none; \}$/m, 'hidden from pointer users, first in the tab order, visible on focus');
  assert.match(css, /^\.spark-skip \{ position: absolute; transform: translateY\(-200%\);/m, 'moved off-screen with a transform, so revealing it costs no layout');
  assert.doesNotMatch(index, /style="/, 'no inline styles, so nothing escapes the stylesheet');
});

test('form controls are labelled by the element that names them', async () => {
  const { 'index.html': index } = emit((await lowerShop()).ir).files;
  for (const id of ['field-order-email', 'field-order-terms', 'field-order-size']) {
    assert.match(index, new RegExp(`<label for="${id}">[^<]+</label>`), `${id} has no label`);
    assert.match(index, new RegExp(`id="${id}"`), `${id} is labelled but absent`);
  }
  assert.match(index, /<option value="compact" selected>/, 'the authored value is the selected option');
  assert.match(index, /type="email"[^>]*required/, 'validation attributes survive');
});

test('images carry alt text, intrinsic size where the document had a number, and a real source', async () => {
  const { 'index.html': index } = emit((await lowerShop()).ir).files;
  const img = /<img[^>]+>/.exec(index)?.[0] ?? '';
  assert.match(img, /alt="The three tools laid out in their open case"/);
  assert.match(img, /src="kit\.svg"/, 'an asset id resolves to the declared file, beside the page');
  assert.match(img, /loading="lazy" decoding="async"/);
  assert.doesNotMatch(img, /width="space\./, 'a token is not an HTML attribute value');
});

test('motion emits as CSS the document could have written by hand', async () => {
  const lowered = await lowerShop();
  const css = emit(lowered.ir).files['spark.css'];
  assert.match(css, /@keyframes k-masthead-title-load \{\n {2}from \{ opacity: 0; translate: 0 10px \}/);
  assert.match(css, /#masthead-title \{\n  animation: k-masthead-title-load 120ms ease-out both;\n  animation-delay: 0ms;/, 'a standalone animation starts when it is triggered, not after its neighbour');
  const loop = /#order-image \{[^}]+\}/.exec(css)?.[0] ?? '';
  assert.match(loop, /animation-iteration-count: infinite;/, 'the decorative loop is a loop in CSS, not a runtime');
  assert.match(loop, /animation-direction: alternate;/);
  assert.match(loop, /animation: k-order-image-load 600ms ease-in-out both;/, 'the authored 0.6s literal reaches 600ms');
  assert.match(css, /@supports \(animation-timeline: view\(\)\) \{/, 'a `visible` motion only exists where scroll-driven animation exists');
  assert.match(
    css,
    /#masthead-cart \{\n  transition: translate 120ms steps\(2, end\);\n  translate: 0 0;\n\}/,
    'a hover motion emits a transition and the `from` side, so the resting state is authored too',
  );
  assert.match(css, /#masthead-cart:hover \{\n  translate: 3px 0;\n\}/, 'and the hover state is the `to` side, not an approximation of it');
});

test('a sampled ease becomes linear(), not a cubic-bezier approximation', async () => {
  const lowered = await lowerShop();
  const css = emit(lowered.ir).files['spark.css'];
  const baked = /animation: k-order-list-visible 200ms (linear\([^)]*\))/.exec(css)?.[1];
  assert.ok(baked, 'the staggered list uses the timeline default ease, which is sampled');
  const values = baked.slice('linear('.length, -1).split(', ').map(Number);
  assert.ok(values.length <= SAMPLE_MAX_KEYFRAMES, `${values.length} values exceeds the format's own cap`);
  assert.equal(values[0], 0);
  assert.equal(values[values.length - 1], 1);
  assert.ok(values.every((value, index) => index === 0 || value >= values[index - 1]), 'a baked curve that reverses is a baking bug');
});

test('prefers-reduced-motion answers every motion, in the mode each one asked for', async () => {
  const css = emit((await lowerShop()).ir).files['spark.css'];
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(block, /#masthead-title \{ animation: none; \}/, 'instant: it arrives');
  assert.match(block, /#order-copy \{ animation-name: k-order-copy-visible-reduced; animation-duration: 1ms;/, 'fade: it fades, and the movement is gone');
  assert.match(block, /#order-image \{ animation: none; \}/, 'a scale-only motion has nothing to fade');
  assert.match(block, /#masthead-cart, #masthead-cart:hover \{ transition: none; \}/, 'a `none` hover stays none');
  assert.doesNotMatch(block, /!important/, 'the answer wins by coming last, not by shouting');
});

test('stagger order is the authored order, and the delays are arithmetic the document can be read against', async () => {
  const css = emit((await lowerShop()).ir).files['spark.css'];
  const delays = [...css.matchAll(/#order-list > :nth-child\((\d)\) \{\n\s*animation-delay: (\d+)ms;/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(delays, [[1, 0], [2, 120], [3, 240]], 'from: "start" plays them in order, 120ms apart');

  const centred = structuredClone(motionDoc);
  centred.timelines[1].items[0].stagger.from = 'center';
  const centredCss = emit((await lowerShop({ motion: centred })).ir).files['spark.css'];
  const centredDelays = [...centredCss.matchAll(/:nth-child\((\d)\) \{\n\s*animation-delay: (\d+)ms;/g)].map((m) => [Number(m[1]), Number(m[2])]);
  // The rules are written in the order the children play, which is the whole point of the field: a
  // reader can check the sequence against the document without running anything.
  assert.deepEqual(centredDelays, [[2, 0], [1, 120], [3, 240]], 'from: "center" starts in the middle and works outwards');
});

test('tokens emit as JSON beside the CSS, from the same source', async () => {
  const files = emit((await lowerShop()).ir).files;
  const parsed = JSON.parse(files['tokens.json']);
  assert.equal(parsed.name, 'fixture brand');
  assert.deepEqual(parsed.themes, ['light', 'dark']);
  assert.equal(parsed.groups.space.lg, '1.5rem');
  assert.equal(parsed.cssVars['color.accentHover'], '--color-accent-hover', 'the CSS name is derived, never hand-typed');
  const keys = Object.keys(parsed);
  assert.deepEqual(keys, [...keys].sort(), 'key order is part of the artifact being reproducible');
});

/* ---------------------------------------------------------------- refusals */

test('a motion that needs something running at play time is refused, and the page is not written', async () => {
  const lowered = lowerSet(await loadDocumentSet(LANDING));
  assert.equal(lowered.errors.length, 0, 'the landing set is valid');
  const page = emit(lowered.ir);
  const refusal = page.refusals.find((entry) => entry.code === 'EMIT001');
  assert.ok(refusal, 'the landing fixture has a machine with effects, and CSS cannot play it');
  assert.match(refusal.note, /runtime \(Phase 4\)/);

  const dir = await mkdtemp(join(tmpdir(), 'spark-refuse-'));
  try {
    const code = await main(['emit', LANDING, '--out', dir]);
    assert.equal(code, 2, 'a refusal is an exit code, not a warning');
    assert.deepEqual(await readdir(dir), [], 'and nothing was written');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('two triggers on one element is a refusal, because CSS gives an element one animation list', async () => {
  const clash = structuredClone(motionDoc);
  // The decorative loop already owns `load` on the image; give the same element a second, `visible`.
  clash.animations.push({
    id: 'image-in',
    intent: 'entrance',
    target: { id: 'order-image' },
    trigger: { on: 'visible' },
    from: { opacity: '0' },
    to: { opacity: '1' },
    reducedMotion: 'instant',
  });
  const page = emit((await lowerShop({ motion: clash })).ir);
  const refusal = page.refusals.find((entry) => entry.code === 'EMIT003');
  assert.ok(refusal, 'the decorative `load` loop and a `visible` motion cannot both own #order-image');
  assert.match(refusal.note, /pick one trigger/);
});

test('repeatDelay is refused rather than faked', async () => {
  const delayed = structuredClone(motionDoc);
  delayed.timelines[0].items[0].repeatDelay = '1s';
  const page = emit((await lowerShop({ motion: delayed })).ir);
  const refusal = page.refusals.find((entry) => entry.code === 'EMIT002');
  assert.ok(refusal, 'padding the duration would emit a different motion than the one authored');
  assert.match(refusal.note, /fold the pause into `duration`/);
});

test('a skip link with nothing to skip to is a refusal at emit time too', async () => {
  const orphan = mutate(sceneDoc, {
    a11y: { landmarks: [{ role: 'banner', contains: 'masthead' }], skipLink: true },
  });
  const page = emit((await lowerShop({ scene: orphan })).ir);
  assert.match(page.refusals.map((entry) => entry.note).join('\n'), /needs a `main` landmark/);
});

test('the emitter says which props it could not paint instead of staying quiet', async () => {
  const lead = structuredClone(sceneDoc);
  lead.components[1].children[0].children[0].props = { text: 'A lead with no type scale', as: 'lead' };
  const page = emit((await lowerShop({ scene: lead })).ir);
  const notice = page.notices.find((entry) => entry.path === '#order-copy');
  assert.ok(notice, 'a `lead` with no size is not a paragraph by accident');
  assert.match(notice.note, /with no .size. emits as a paragraph/);
});

test('every emission rule id is documented', () => {
  const documented = readFileSync(new URL('../docs/DOCUMENTS.md', import.meta.url), 'utf8');
  for (const id of Object.keys(EMIT_RULES)) assert.match(documented, new RegExp(id), `${id} appears nowhere in docs/DOCUMENTS.md`);
});

/* ---------------------------------------------------------------- the curve */

test('the ease table splits where CSS ends, not where a fit could begin', () => {
  assert.equal(cssTimingFunction('ease-out'), 'ease-out', 'a word CSS already has is written as that word');
  assert.equal(cssTimingFunction('linear'), 'linear');
  assert.equal(cssTimingFunction('steps(2, end)'), 'steps(2, end)');
  assert.equal(cssTimingFunction('steps(4)'), null, '`steps(4)` is not in the table: the format asks for the side to be written, not inferred');
  assert.match(cssTimingFunction('power2.out'), /^linear\(0, [\d., ]+, 1\)$/, 'a polynomial family is baked');
  assert.equal(cssTimingFunction('spring(1, 80)'), null, 'not in the table means no answer, not a near miss');
});

test('baking is bounded, endpoints included, and monotone where the curve must be', () => {
  for (const ease of ['power1.inOut', 'quad.out', 'circ.inOut', 'expo.in', 'sine.out', 'bounce.out', 'back.out(1.7)', 'elastic.out(1, 0.3)']) {
    const values = sampleEase(ease);
    assert.ok(values, `${ease} should sample`);
    assert.ok(values.length <= SAMPLE_MAX_KEYFRAMES, `${ease}: ${values.length} values over the cap`);
    assert.equal(values[0], 0, `${ease} starts at nothing`);
    assert.equal(values[values.length - 1], 1, `${ease} ends at everything`);
    if (!/^(back|elastic|bounce)/.test(ease)) {
      assert.ok(values.every((value, index) => index === 0 || value >= values[index - 1]), `${ease} must not reverse`);
    }
  }
  for (const keyword of ['ease', 'ease-in-out', 'steps(3, start)']) assert.equal(sampleEase(keyword), null, `${keyword} needs no baking`);
});

test('an overshoot curve overshoots, which is why it is in the table at all', () => {
  const back = sampleEase('back.out(1.7)');
  assert.ok(Math.max(...back) > 1.05, 'a baked back.out that never passes 1 is a baking bug, not a curve');
  const bounce = sampleEase('bounce.out');
  assert.ok(bounce.filter((value) => value === 1).length <= 2, 'bounce settles once; a flat line means the sampling is wrong');
});

test('token names are derived by one rule, and a collision is a refusal', () => {
  assert.equal(cssVarName('color.accentHover'), '--color-accent-hover');
  assert.equal(cssVarName('space.lg'), '--space-lg');
  assert.equal(cssVarName('layout.breakpoint.narrow'), '--layout-breakpoint-narrow');
  assert.equal(className('order-image').length, 9, 'short enough to read in devtools, stable enough to diff');
  assert.notEqual(className('order-image'), className('order-image-2'));
  const collided = {
    settings: mutate(settingsDoc, {}),
  };
  collided.settings.layout = { ...collided.settings.layout, focusRing: '2px solid currentcolor', 'focus-ring': '2px solid currentcolor' };
  const lowered = lowerSet({ docs: { settings: collided.settings }, paths: {}, problems: [] });
  assert.ok(lowered.errors.some((entry) => entry.code === 'LOWER003'), 'two tokens, one CSS name: a token that silently loses');
});

/* ------------------------------------------------------------------ the audit */

test('the page we emit passes the audit we sell', async () => {
  const lowered = await lowerShop();
  const files = emit(lowered.ir).files;
  const result = await analyze({ html: files['index.html'], uri: 'file:///emitted/index.html', source: 'file' });
  const decided = result.ir.findings.filter((finding) => finding.coverage === 'automated' && !finding.suppressed);
  assert.deepEqual(
    decided.map((finding) => `${finding.ruleId} on ${finding.selector}`),
    [],
    'the emitted page has no decided findings — the promise, tested where it is actually made',
  );
  assert.ok(result.scores.accessible >= 95, `accessible scored ${result.scores.accessible}`);
  assert.ok(result.ir.findings.some((finding) => finding.coverage === 'incomplete'), '…and the run says out loud what it could not see');
});

test('the CLI writes the same bytes as the API, and refuses in the same words', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spark-cli-'));
  const log = [];
  const stdout = { write: (line) => log.push(line) };
  try {
    const code = await main(['emit', SHOP, '--out', dir], { stdout, stderr: { write: (line) => log.push(line) } });
    assert.equal(code, 0);
    const onDisk = await readFile(join(dir, 'index.html'), 'utf8');
    // The same lowering the CLI performed, provenance and all: comparing against a hand-assembled
    // document set would hide a difference in exactly the header this test is about.
    const lowered = lowerSet(await loadDocumentSet(SHOP));
    const api = emit(lowered.ir, { irHash: await contentHash(lowered.ir) }).files['index.html'];
    assert.equal(onDisk, api, 'two paths through the same code, one byte sequence');
    assert.match(log.join(''), /second run, byte-identical/);
    assert.match(
      onDisk.split('\n')[0],
      /^<!-- generated by MR-Spark from .*@0\.1 · ir [0-9a-f]{12} -->$/,
      'the artifact says what produced it, and which version of each document',
    );
    assert.doesNotMatch(onDisk, /\/home\/|\/Users\//, 'in basenames, so the same documents emit the same bytes on another machine');

    const irPath = join(dir, 'page.ir.json');
    assert.equal(await main(['lower', SHOP, '--out', irPath]), 0);
    const ir = JSON.parse(await readFile(irPath, 'utf8'));
    assert.equal(ir.ir, '0.1');
    assert.ok(ir.document.tree.length >= 3);
    assert.equal(ir.provenance.collector, 'spark-lower');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an IR is a valid input to emit, and a stale one is refused', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spark-ir-'));
  const quiet = { write: () => true };
  try {
    const lowered = await lowerShop();
    const irPath = join(dir, 'page.ir.json');
    await writeFile(irPath, `${JSON.stringify(lowered.ir, null, 2)}\n`, 'utf8');

    assert.equal(await main(['emit', irPath, '--out', join(dir, 'from-ir')], { stdout: quiet, stderr: quiet }), 0);
    const fromIr = await readFile(join(dir, 'from-ir', 'index.html'), 'utf8');
    assert.equal(
      fromIr,
      emit(lowered.ir, { irHash: await contentHash(lowered.ir) }).files['index.html'],
      'documents → IR → page equals IR → page, provenance included',
    );
    assert.match(fromIr.split('\n')[0], /ir [0-9a-f]{12}/, 'the hash survives the round trip through a file');

    const stale = { ...lowered.ir, ir: '0.0' };
    const stalePath = join(dir, 'stale.ir.json');
    await writeFile(stalePath, JSON.stringify(stale), 'utf8');
    const outDir = join(dir, 'from-stale');
    assert.equal(await main(['emit', stalePath, '--out', outDir], { stdout: quiet, stderr: quiet }), 2);
    assert.deepEqual(await readdir(outDir).catch(() => []), [], 'a version this build cannot honour writes nothing');

    const tokensOnly = join(dir, 'brand.ir.json');
    const settingsIr = lowerSet({ docs: { settings: settingsDoc }, paths: {}, problems: [] }).ir;
    await writeFile(tokensOnly, JSON.stringify(settingsIr), 'utf8');
    let message = '';
    assert.equal(
      await main(['emit', tokensOnly, '--out', join(dir, 'no-page')], {
        stdout: quiet,
        stderr: { write: (line) => (message += line) },
      }),
      2,
    );
    assert.match(message, /no page to emit/, 'a settings document is a real IR and not a real page');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an emitted page never names the directory it was built in', async () => {
  // Same documents, two absolute paths, one byte sequence. This is what the provenance header's
  // basename rule exists to protect — and what a post-merge verification run in a second checkout
  // proved by accident, so it is now a test rather than an anecdote. A leaked path would make
  // "byte-identical" a claim about where you happened to run the compiler.
  const dir = await mkdtemp(join(tmpdir(), 'spark-anywhere-'));
  const emitFrom = async (entry) => {
    const lowered = lowerSet(await loadDocumentSet(entry));
    assert.equal(lowered.refusals ? lowered.refusals.length : 0, 0);
    return emit(lowered.ir, { irHash: await contentHash(lowered.ir) });
  };
  try {
    for (const file of ['shop.spark.scene.json', 'shop.spark.motion.json', 'brand.spark.settings.json']) {
      await writeFile(join(dir, file), await readFile(join(FIXTURES, file), 'utf8'));
    }
    const here = await emitFrom(SHOP);
    const elsewhere = await emitFrom(join(dir, 'shop.spark.scene.json'));
    assert.deepEqual(Object.keys(elsewhere.files), Object.keys(here.files), 'same files, anywhere');
    for (const name of Object.keys(here.files)) {
      assert.equal(elsewhere.files[name], here.files[name], `${name} must not depend on where it was built`);
    }
    // Sorted by kind, so `motion` leads — assert the source is named, not the position it holds.
    assert.match(here.files['index.html'], /scene shop\.spark\.scene\.json @0\.1/, 'and it still names its sources');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the IR carries the versions of the documents it came from', async () => {
  const lowered = await lowerShop();
  assert.deepEqual(lowered.ir.provenance.versions, { scene: '0.1', motion: '0.1', settings: '0.1' });
  // The header renders without a hash too, because a caller that did not ask for one still gets an
  // artifact that names its sources — and it renders identically twice, which is the actual promise.
  const once = emit(lowered.ir).files['spark.css'].split('\n')[0];
  assert.match(once, /^\/\* generated by MR-Spark from .* \*\/$/);
  assert.doesNotMatch(once, /ir /, 'no hash is claimed when none was computed');
  assert.equal(once, emit(lowered.ir).files['spark.css'].split('\n')[0]);
});

test('the CSS is small, and nothing in it is a surprise', async () => {
  const css = emit((await lowerShop()).ir).files['spark.css'];
  assert.ok(css.length < 6000, `${css.length} bytes of stylesheet for a page with 13 components and 5 motions`);
  assert.doesNotMatch(css, /@import|url\(/, 'no second request, and no asset the hash does not cover');
  assert.doesNotMatch(css, /!important/);
  assert.ok((css.match(/\n\./g) ?? []).length >= 12, 'one rule per component and state, which is the whole promise of a closed vocabulary');
});
