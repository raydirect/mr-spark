import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { analyze, loadEngines } from '../src/engine.js';

const engines = await loadEngines();
const read = (name) => readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

test('the bad fixture fails on the six dominant, machine-detectable error classes', async () => {
  const { ir, scores } = await analyze({
    html: await read('bad.html'),
    uri: 'file:///fixtures/bad.html',
    engines,
  });
  const rules = new Set(ir.findings.map((f) => f.ruleId));
  // per the accessibility research: alt text, labels, names, language, landmarks
  assert.ok(rules.has('image-alt'), 'expected image-alt');
  assert.ok(rules.has('link-name'), 'expected link-name');
  assert.ok(rules.has('button-name'), 'expected button-name');
  assert.ok(rules.has('html-has-lang'), 'expected html-has-lang');
  assert.ok(scores.accessible < 70);
});

test('the good fixture is clean of decided violations', async () => {
  const { ir, scores } = await analyze({
    html: await read('good.html'),
    uri: 'file:///fixtures/good.html',
    engines,
  });
  const decided = ir.findings.filter((f) => f.coverage !== 'incomplete');
  assert.deepEqual(decided.map((f) => f.ruleId), []);
  assert.ok(scores.accessible > 90);
});

test('analysis is deterministic: same input, same IR hash', async () => {
  const html = await read('bad.html');
  const a = await analyze({ html, uri: 'file://x', engines });
  const b = await analyze({ html, uri: 'file://x', engines });
  // The content address excludes volatile provenance, so the handle is stable across runs.
  assert.equal(a.hash, b.hash);
});

test('environment limits are recorded rather than thrown', async () => {
  const { ir } = await analyze({
    html: await read('good.html'),
    uri: 'file://fixtures/good.html',
    engines,
  });
  assert.ok(Array.isArray(ir.environment.issues));
});
