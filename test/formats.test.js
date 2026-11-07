/**
 * The document formats: validation behaviour, and the promise that `schema/` is a projection
 * rather than a second definition.
 *
 * Half of these tests exist because a format nobody can diagnose is a format people abandon, so the
 * *messages* are asserted, not just the pass/fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateDocument, formatMessage, tokenRegistry, FORMATS, EXTENSIONS } from '../src/formats/index.js';
import { render, readCommitted, formatFile, COMMON_FILE, TYPES_FILE, INDEX_FILE } from '../src/formats/generate.js';
import { parseEase, EASE_NAMES, KEYWORD_EASES } from '../src/formats/eases.js';
import { STATE_PROPERTIES, COMPONENT_TYPES } from '../src/formats/scene.js';
import { INTENTS, MOTION_PROPERTIES } from '../src/formats/motion.js';
import { TOKEN_GROUPS, VERSION } from '../src/formats/common.js';
import { TOKENS } from '../src/config/tokens.js';
import { SCORE_SPEC_VERSION } from '../src/score.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/docs/${name}`, import.meta.url), 'utf8'));
const settingsDoc = read('brand.spark.settings.json');
const sceneDoc = read('landing.spark.scene.json');
const motionDoc = read('landing.spark.motion.json');
const registry = tokenRegistry(settingsDoc);

const messages = (result) => result.errors.map((entry) => formatMessage(entry));

/** Copy-on-write for a fixture, so a test that breaks one thing does not read like it broke all. */
function mutate(doc, patch) {
  return { ...structuredClone(doc), ...patch };
}

test('the three fixtures are valid documents, with nothing left unchecked', () => {
  for (const [kind, doc] of [['settings', settingsDoc], ['scene', sceneDoc], ['motion', motionDoc]]) {
    const result = validateDocument(kind, doc, { registry });
    assert.deepEqual(messages(result), [], `${kind} must validate`);
    assert.equal(result.notices.length, 0, `${kind} must carry no lints — a documented example is the format's advertisement`);
    assert.ok(result.complete, `${kind} must be fully decidable with the fixture settings document`);
  }
});

test('our own brand store is a valid settings document', () => {
  // The strongest test in this file: the file the report renders from and the file a designer would
  // author are one format, so the format cannot be a theory.
  const result = validateDocument('settings', TOKENS);
  assert.deepEqual(messages(result), []);
  assert.deepEqual(result.notices, []);
});

test('a token group the format does not know is refused, not skipped', () => {
  const result = validateDocument('scene', mutate(sceneDoc, { components: [{ id: 'a', type: 'text', props: { text: 'hi', size: 'focus.ring' } }] }), { registry });
  assert.match(messages(result).join('\n'), /may not reference "focus"/);
});

test('schema/ is a projection, byte for byte', () => {
  const files = render();
  for (const [path, text] of Object.entries(files)) {
    assert.equal(readCommitted(path), text, `${path} is out of date with src/formats/ — run \`npm run formats:generate\``);
  }
  assert.deepEqual(Object.keys(files).sort(), [COMMON_FILE, INDEX_FILE, TYPES_FILE, ...Object.keys(FORMATS).map(formatFile)].sort());
});

test('generating twice produces identical bytes', () => {
  // Not a style test. Byte-identical output is the property every later phase leans on, and a map
  // iteration order or an unsorted key would break it in a way no single file is responsible for.
  assert.deepEqual(render(), render());
});

test('the published schema says which rules it does not contain', () => {
  const schema = JSON.parse(readCommitted(formatFile('scene')));
  const ids = FORMATS.scene.checks.map((c) => c.id).sort();
  for (const id of ids) assert.ok(schema.$comment.includes(id), `$comment must name ${id}`);
  assert.match(schema.$comment, /Shape only/);
  for (const format of Object.values(FORMATS)) {
    for (const check of format.checks) {
      assert.match(check.id, /^[A-Z]+[0-9]{3}$/, 'every document rule carries an id, like every verifier rule does');
      assert.ok(check.message.length > 20, `${check.id} needs a message a stranger could read`);
    }
  }
});

test('an unknown version is refused before the shape is argued about', () => {
  const result = validateDocument('scene', mutate(sceneDoc, { version: '0.2' }), { registry });
  assert.equal(result.errors.length, 1, 'one error, not thirty shape complaints about a document we do not implement');
  assert.match(messages(result)[0], /reads "0.1" and this document declares "0.2"/);
});

test('a missing settings document is reported as undecided, never as valid', () => {
  const withRef = mutate(sceneDoc, { tokens: { $ref: './nowhere.spark.settings.json' } });
  const bare = validateDocument('scene', withRef);
  assert.ok(bare.valid, 'nothing in the document is wrong');
  assert.equal(bare.complete, false, 'but references could not be resolved, and that is a fact the caller must print');
  assert.ok(bare.unresolved.length > 0);
  assert.match(bare.unresolved.map((u) => formatMessage(u)).join('\n'), /could not be decided|not be resolved/);
});

test('an unknown key is an error, and the message lists what is allowed', () => {
  const result = validateDocument('settings', mutate(settingsDoc, { shadows: {} }), { registry });
  const message = messages(result)[0];
  assert.match(message, /is not a field of this document/);
  assert.match(message, /The fields here are: .*meta/);
});

test('a component shape is checked against its own type', () => {
  const result = validateDocument('scene', mutate(sceneDoc, { components: [{ id: 'h', type: 'heading', props: { level: 1, text: 'Hi' }, children: [{ type: 'text', props: { text: 'nested' } }] }] }), { registry });
  const message = messages(result).join('\n');
  assert.match(message, /components\[0\]\.children/);
  assert.match(message, /Checked as the "heading" shape/, 'the message must say which shape it decided to apply');
});

test('props are per type, and a value out of range says so', () => {
  const tooDeep = validateDocument('scene', mutate(sceneDoc, { components: [{ id: 'h', type: 'heading', props: { level: 7, text: 'Hi' } }] }), { registry });
  assert.match(messages(tooDeep).join('\n'), /components\[0\]\.props\.level must be at most 6/);
  const wrongProp = validateDocument('scene', mutate(sceneDoc, { components: [{ id: 'h', type: 'heading', props: { text: 'Hi', label: 'nope' } }] }), { registry });
  assert.match(messages(wrongProp).join('\n'), /props\.label is not a field/);
});

test('a token typo is answered with the nearest declared token', () => {
  const result = validateDocument('scene', mutate(sceneDoc, { layout: { hero: { gap: 'space.larg' } } }), { registry });
  assert.match(messages(result).join('\n'), /Did you mean "space\.lg"\?/);
});

test('a literal is legal, and costs a lint', () => {
  const result = validateDocument('scene', mutate(sceneDoc, { layout: { hero: { cols: '1fr' } } }), { registry });
  assert.equal(result.errors.length, 0);
  assert.ok(result.notices.some((n) => /written literally/.test(formatMessage(n))), 'a value that appears twice is how one-off numbers enter a design system');
});

test('a colour cannot hide inside a compound value', () => {
  const result = validateDocument('settings', mutate(settingsDoc, { layout: { ring: '2px solid #14181d' } }), { registry });
  const message = messages(result).join('\n');
  assert.match(message, /layout\.ring matches none of/);
  assert.match(message, /may not contain "#"/, 'the message must say what the rule protects, not just that a pattern disagreed');
});

test('stale layout rules and orphan states are errors', () => {
  const result = validateDocument('scene', mutate(sceneDoc, { layout: { ...sceneDoc.layout, ghost: { pad: 'space.lg' } } }), { registry });
  assert.match(messages(result).join('\n'), /layout\.ghost: no component is named "ghost"/);
});

test('an interactive component without its states fails the document', () => {
  const stripped = structuredClone(sceneDoc);
  delete stripped.states['hero-cta'].hover;
  const result = validateDocument('scene', stripped, { registry });
  assert.match(messages(result).join('\n'), /a "button" needs "hover" in `states`/);
});

test('an empty state block is refused, because it promises a change and delivers none', () => {
  const withEmpty = structuredClone(sceneDoc);
  withEmpty.states['hero-cta'].active = {};
  const result = validateDocument('scene', withEmpty, { registry });
  assert.match(messages(result).join('\n'), /states\.hero-cta\.active: an empty state block/);
});

test('landmarks, skip links and headings are checked in the document', () => {
  const twoMains = mutate(sceneDoc, { a11y: { ...sceneDoc.a11y, landmarks: [{ role: 'main', contains: 'hero' }, { role: 'main', contains: 'deals' }] } });
  assert.match(messages(validateDocument('scene', twoMains, { registry })).join('\n'), /2 landmarks claim `main`/);

  const skipNowhere = mutate(sceneDoc, { a11y: { landmarks: [{ role: 'banner', contains: 'hero' }], skipLink: true } });
  assert.match(messages(validateDocument('scene', skipNowhere, { registry })).join('\n'), /skips to nothing/);

  const twoH1 = structuredClone(sceneDoc);
  twoH1.components.push({ id: 'other-h1', type: 'heading', props: { level: 1, text: 'Competing title' } });
  assert.match(messages(validateDocument('scene', twoH1, { registry })).join('\n'), /2 headings are level 1/);
});

test('a link that goes nowhere is a button in a link costume', () => {
  const doc = structuredClone(sceneDoc);
  doc.components[0].children.push({ id: 'dead', type: 'link', props: { label: 'More', href: '#' } });
  doc.states.dead = { hover: { color: 'color.accent' }, 'focus-visible': { outline: 'layout.focusRing' } };
  const result = validateDocument('scene', doc, { registry });
  assert.match(messages(result).join('\n'), /href "#" activates and does nothing/);
});

test('an image must name a declared asset, and an unused asset is a lint', () => {
  const missing = structuredClone(sceneDoc);
  missing.components[0].children[3].props.src = 'not-declared';
  assert.match(messages(validateDocument('scene', missing, { registry })).join('\n'), /"not-declared" is not an id in `assets`/);

  const unused = structuredClone(sceneDoc);
  unused.components[0].children[3].props.src = 'https://cdn.example/live.png';
  const result = validateDocument('scene', unused, { registry });
  assert.equal(result.errors.length, 0);
  assert.ok(result.notices.some((n) => n.code === 'unusedAsset'), 'a declared asset nobody references is bytes somebody still hashes');
});

test('a breakpoint must be a shared decision', () => {
  const result = validateDocument('scene', mutate(sceneDoc, { layout: { hero: { responsive: { tiny: { cols: 'layout.oneColumn' } } } } }), { registry });
  assert.match(messages(result).join('\n'), /layout\.breakpoint\.tiny" is not declared in the settings document/);
});

test('motion: a timeline owns the timing of what it references', () => {
  const doubleTrigger = structuredClone(motionDoc);
  doubleTrigger.animations[0].trigger = { on: 'load' };
  assert.match(messages(validateDocument('motion', doubleTrigger, { registry })).join('\n'), /plays twice — the timeline is the trigger/);

  const dangling = structuredClone(motionDoc);
  dangling.timelines[0].items[0].ref = 'nope';
  assert.match(messages(validateDocument('motion', dangling, { registry })).join('\n'), /"nope" is not an id in `animations`/);

  const both = structuredClone(motionDoc);
  both.timelines[0].items[0] = { ref: 'hero-in', to: { opacity: '1' } };
  assert.match(messages(validateDocument('motion', both, { registry })).join('\n'), /cannot both reference "hero-in" and redefine to/);

  const orphan = structuredClone(motionDoc);
  orphan.animations[0].id = 'lonely';
  orphan.timelines[0].items[0].ref = 'lonely';
  delete orphan.timelines[0].items[0];
  orphan.timelines[0].items.push({ target: { id: 'hero-title' }, to: { opacity: '1' } });
  const orphanResult = validateDocument('motion', mutate(motionDoc, { animations: [{ id: 'unwatched', target: { id: 'hero-title' }, to: { opacity: '1' } }] }), { registry });
  assert.match(messages(orphanResult).join('\n'), /nothing will ever run it/);
});

test('motion: intent and reducedMotion are required where they carry weight', () => {
  const noIntent = structuredClone(motionDoc);
  delete noIntent.timelines[0].intent;
  noIntent.timelines[0].items[1].intent = undefined;
  const noComponents = { ...structuredClone(sceneDoc), components: undefined };
  assert.ok(validateDocument('scene', noComponents, { registry }).errors.some((e) => e.code === 'required'), 'a scene with no components is not a scene');

  const res = validateDocument('motion', mutate(motionDoc, { timelines: motionDoc.timelines.map((tl) => ({ ...tl, intent: undefined })) }), { registry });
  assert.match(messages(res).join('\n'), /no `intent` here, on its timeline, or in root defaults/);

  const noFallback = mutate(motionDoc, { defaults: { duration: 'motion.base', easing: 'ease-out' } });
  assert.match(messages(validateDocument('motion', noFallback, { registry })).join('\n'), /reducedMotion.*required for every animation/m);
});

test('motion: content may not stay hidden waiting for a click', () => {
  const hoverIn = structuredClone(motionDoc);
  delete hoverIn.timelines[0].trigger;
  const result = validateDocument('motion', hoverIn, { registry });
  assert.match(messages(result).join('\n'), /hides content until the reader interacts/);
});

test('motion: a stagger needs a set to stagger across', () => {
  const solo = mutate(motionDoc, { animations: [{ id: 'x', target: { id: 'hero-title' }, to: { opacity: '1' }, stagger: { each: 'motion.fast' } }] });
  assert.match(messages(validateDocument('motion', solo, { registry })).join('\n'), /One element cannot be staggered against itself/);
});

test('motion: the ease table is the only source of curves', () => {
  assert.equal(parseEase('ease-out').emission, 'bezier');
  assert.equal(parseEase('power2.out').emission, 'sampled', 'there is no exact cubic-bezier for an ease-out-cubic, so we sample it rather than substitute an approximation');
  assert.equal(parseEase('back.out(1.7)').emission, 'sampled');
  assert.equal(parseEase('back.out'), null, 'an omitted parameter would be a hidden default');
  assert.equal(parseEase('spring'), null);
  assert.equal(parseEase('steps(4, end)').family, 'steps');
  assert.equal(parseEase('steps(999, end)'), null);
  assert.ok(!EASE_NAMES.includes('back.out'));
  assert.ok(KEYWORD_EASES.includes('linear'));

  const springy = mutate(motionDoc, { defaults: { ...motionDoc.defaults, easing: 'spring(1, 80)' } });
  assert.match(messages(validateDocument('motion', springy, { registry })).join('\n'), /is not in the ease table/);
});

test('motion: machines only point at states and motions that exist', () => {
  const broken = structuredClone(motionDoc);
  broken.machines.menu.states.open.on.toggle = 'sideways';
  assert.match(messages(validateDocument('motion', broken, { registry })).join('\n'), /leads to "sideways", which is not a state/);

  const badEffect = structuredClone(motionDoc);
  badEffect.machines.menu.states.open.effects = ['whoosh'];
  assert.match(messages(validateDocument('motion', badEffect, { registry })).join('\n'), /"whoosh" is neither an animation id nor a timeline id/);
});

test('motion: only compositor-friendly properties may move', () => {
  assert.ok(!MOTION_PROPERTIES.includes('width') && !MOTION_PROPERTIES.includes('top'));
  const janky = mutate(motionDoc, { animations: [{ id: 'grow', target: { id: 'hero-title' }, to: { width: '2rem' }, trigger: { on: 'load' } }] });
  const result = validateDocument('motion', janky, { registry });
  assert.match(
    messages(result).join('\n'),
    /the key "width" is not a legal name here/,
    'a layout property must not be animatable at all, in a loop or out of one',
  );
  assert.ok(!result.valid);
});

test('settings: themes must mirror each other', () => {
  const lopsided = structuredClone(settingsDoc);
  delete lopsided.color.dark.accent;
  const result = validateDocument('settings', lopsided, { registry });
  assert.match(messages(result).join('\n'), /"accent" exists in theme "light" but not in "dark"/);

  const extraTheme = structuredClone(settingsDoc);
  extraTheme.color.sepia = { bg: '#ffffff', surface: '#ffffff', text: '#000000', accent: '#000000', accentHover: '#000000' };
  assert.match(messages(validateDocument('settings', extraTheme, { registry })).join('\n'), /not a theme in meta\.themes/);
});

test('settings: contrast promises are checked against the bucket', () => {
  const weak = structuredClone(settingsDoc);
  weak.contrast.pairs[0].min = 2.1;
  const result = validateDocument('settings', weak, { registry });
  assert.match(messages(result).join('\n'), /2.1:1 is below the text minimum \(4.5:1\)/);

  const invented = structuredClone(settingsDoc);
  invented.contrast.pairs.push({ fg: 'not-a-colour', bg: 'bg', min: 4.5 });
  assert.match(messages(validateDocument('settings', invented, { registry })).join('\n'), /"not-a-colour" is not a colour in any theme/);
});

test('settings: a control that cannot exist is refused', () => {
  const broken = structuredClone(settingsDoc);
  broken.controls.push({ group: 'Colour', path: 'color.nope', label: 'Ghost', type: 'color' });
  assert.match(messages(validateDocument('settings', broken, { registry })).join('\n'), /"color.nope" is not a token this document declares/);

  const unbounded = structuredClone(settingsDoc);
  unbounded.controls.push({ group: 'Rhythm', path: 'space.lg', label: 'Gap', type: 'slider' });
  assert.match(messages(validateDocument('settings', unbounded, { registry })).join('\n'), /a slider without min and max/);

  const mismatched = structuredClone(settingsDoc);
  mismatched.controls.push({ group: 'Rhythm', path: 'space.lg', label: 'Gap', type: 'color' });
  assert.match(messages(validateDocument('settings', mismatched, { registry })).join('\n'), /a "color" control cannot edit "space" tokens/);
});

test('settings: an asset embedded in a token is refused', () => {
  const inlined = structuredClone(settingsDoc);
  inlined.layout.banner = 'url(./bg.png)';
  assert.match(messages(validateDocument('settings', inlined, { registry })).join('\n'), /declare it in `assets`/);
});

test('a check that throws is reported as our bug', () => {
  // A crash inside a rule must not become "your document is wrong", and must not vanish either.
  const format = FORMATS.motion;
  const original = format.checks.at(-1).run;
  format.checks.at(-1).run = () => {
    throw new Error('boom');
  };
  try {
    const result = validateDocument('motion', motionDoc, { registry });
    const crash = result.errors.find((entry) => entry.code === 'checkCrashed');
    assert.ok(crash, 'a thrown check becomes an error naming the rule');
    assert.match(formatMessage(crash), /bug in this tool, not in your document/);
  } finally {
    format.checks.at(-1).run = original;
  }
});

test('no document format asks for a coordinate', () => {
  // docs/DOCUMENTS.md §6 promises layout is constraints and tokens, not pixel positions. A test is
  // the only place that promise can be kept: prose does not stop someone adding a field.
  const banned = ['x', 'y', 'top', 'left', 'right', 'bottom', 'position', 'zIndex', 'offset', 'coordinate'];
  for (const kind of Object.keys(FORMATS)) {
    const schema = JSON.parse(readCommitted(formatFile(kind)));
    const names = new Set();
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'properties') for (const name of Object.keys(value)) names.add(name);
        walk(value);
      }
      (node.anyOf ?? node.$defs ? Object.values(node.$defs ?? {}) : []).forEach(walk);
    };
    walk(schema);
    for (const field of banned) {
      assert.ok(!names.has(field), `${kind} must not grow a "${field}" field — coordinates do not survive a viewport`);
    }
  }
  const display = JSON.parse(readCommitted(formatFile('scene'))).$defs.layoutBlock.properties.display.enum;
  assert.ok(!display.includes('none'), 'a scene does not hide content; visibility is a machine question');
});

test('the closed vocabularies are the ones the docs publish', () => {
  assert.deepEqual([...TOKEN_GROUPS], ['color', 'space', 'radius', 'type', 'layout', 'motion']);
  assert.deepEqual([...COMPONENT_TYPES], ['stack', 'grid', 'region', 'heading', 'text', 'link', 'button', 'image', 'input', 'list', 'listbox']);
  assert.deepEqual([...INTENTS], ['entrance', 'exit', 'emphasis', 'feedback', 'decorative']);
  assert.deepEqual([...STATE_PROPERTIES], ['background', 'color', 'border', 'outline', 'shadow', 'opacity', 'radius']);
  assert.deepEqual(EXTENSIONS.scene, '.spark.scene.json');
});

test('a document format version is not the score spec version', () => {
  // Two independent version axes, deliberately: freezing a schema says nothing about calibration, and
  // a score bump says nothing about formats. Asserting the separation stops someone tying the two
  // together the first time both change in one release.
  assert.equal(SCORE_SPEC_VERSION, '3.0.0');
  assert.equal(VERSION, '0.1');
  assert.notEqual(VERSION, SCORE_SPEC_VERSION);
  for (const kind of Object.keys(FORMATS)) {
    const schema = JSON.parse(readCommitted(formatFile(kind)));
    assert.ok(schema.properties.version.const === VERSION, `${kind} pins its own version as a const`);
  }
});

test('the only key a document may add anywhere is $comment', async () => {
  // Tightening the `$` pass-through is what makes a `$ref` legal only where a format agreed to resolve
  // it. Without this, "unknown keys are rejected" has a hole the size of the JSON Schema dialect.
  const { isReserved, RESERVED_KEYS } = await import('../src/formats/grammar.js');
  assert.deepEqual(RESERVED_KEYS, ['$comment']);
  assert.ok(isReserved('$comment'));
  for (const key of ['$ref', '$schema', '$defs', '$filter', '$identity']) assert.ok(!isReserved(key), key);

  const registry = tokenRegistry(settingsDoc);
  const smuggled = mutate(sceneDoc, { layout: { hero: { gap: 'space.lg', $filter: 'blur(2px)' } } });
  assert.ok(validateDocument('scene', smuggled, { registry }).errors.some((e) => e.code === 'unknownKey' && e.path.endsWith('$filter')));

  // `$comment` stays legal everywhere, because there is nothing in it to verify.
  const annotated = mutate(sceneDoc, { layout: { hero: { gap: 'space.lg', $comment: 'tighter than the brand default' } } });
  assert.ok(validateDocument('scene', annotated, { registry }).valid, 'a comment is not a defect');

  // and where a format does declare a `$` key, its value is checked like any other — including the
  // fragment this format used to allow pointing at a `tokens` object that no longer exists.
  for (const ref of ['./brand.spark.settings.json', './brand.spark.settings.json#/space']) {
    assert.ok(validateDocument('scene', mutate(sceneDoc, { tokens: { $ref: ref } }), { registry }).valid, ref);
  }
  for (const ref of ['./brand.spark.settings.json#/tokens', './brand.spark.tokens.json']) {
    const result = validateDocument('scene', mutate(sceneDoc, { tokens: { $ref: ref } }), { registry });
    // The refusal lands on the union (that is the branch that failed), and its note carries the pattern's
    // own explanation — asserting both keeps the message honest, not just the verdict.
    const error = result.errors.find((e) => e.path.endsWith('tokens') || e.path.endsWith('tokens.$ref'));
    assert.ok(error, `${ref}: expected a refusal`);
    assert.match(formatMessage(error), /settings document|token group/);
  }
});
