/**
 * What the published tarball owes the people whose work it ships.
 *
 * `package.json` is the manifest of a distributed artifact, so a file listed in `files` is a promise
 * about what a stranger receives. These tests are about the two promises that are easy to break silently:
 * the licence notices a third party's terms require, and the subpath exports an outside caller imports.
 * Neither is checked by anything else here — `npm test` passes with a missing NOTICE file and with an
 * `exports` entry pointing at a file that does not exist, and both failures only ever appear to someone
 * who cannot legally, or cannot at all, `import` what we shipped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('the licence notices ship in the tarball', () => {
  // Penner's MIT text requires "the above copyright notice and this permission notice … in all copies
  // or substantial portions"; the BSD-3 text repeats it. Apache-2.0 §4(d) then requires the same of our
  // own NOTICE. A notice that lives in the repository but not in the package satisfies nobody.
  for (const name of ['LICENSE', 'LICENSE-PENNER.txt', 'NOTICE']) {
    assert.ok(pkg.files.includes(name), `${name} must be listed in package.json "files"`);
    assert.ok(existsSync(join(ROOT, name)), `${name} must exist at the package root`);
  }
  const packed = readFileSync(join(ROOT, 'package.json'), 'utf8');
  assert.match(packed, /"README\.md"/, 'and the entry point people read first');
});

test('the notice names the party, the terms, and where to verify it', () => {
  const notice = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
  const licence = readFileSync(join(ROOT, 'LICENSE-PENNER.txt'), 'utf8');
  assert.match(licence, /Copyright \(c\) 2001 Robert Penner/);
  assert.match(licence, /MIT License/);
  assert.match(licence, /3-Clause BSD License/);
  assert.match(licence, /robertpenner\.com\/easing_terms_of_use\.html/, 'the terms are quoted from their source');
  assert.match(notice, /Easing Equations v1\.5/, 'the artifact says which revision it implements');
  assert.match(notice, /test\/ease-laws\.test\.js/, 'and where the claim is checked, not just asserted');
  assert.match(notice, /GSAP/, 'the vocabulary and the mathematics are credited separately, because they are different debts');
});

test('every subpath export resolves to a file that exists', () => {
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    if (subpath.includes('*')) {
      assert.ok(target.includes('*'), `${subpath} is a wildcard on both sides or it is a lie`);
      continue;
    }
    assert.ok(target.startsWith('./'), `${subpath} must resolve inside the package, not above it`);
    assert.ok(existsSync(join(ROOT, target)), `${subpath} points at ${target}, which is not there`);
  }
  // The names are part of the API: the studio imports the baker to draw a curve preview, and a design
  // tool imports the formats to ask "is this legal" before it offers a value.
  for (const name of ['.', './formats', './lower', './emit', './ease-bake', './ir']) {
    assert.ok(name in pkg.exports, `${name} is documented as importable`);
  }
});
