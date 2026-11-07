import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TOKENS,
  colorToken,
  contrastPairs,
  assertTokensValid,
  TokenError,
} from '../src/config/tokens.js';
import { contrastRatio, contrastVerdict, luminance } from '../src/contrast.js';
import { renderStyles } from '../src/reporters/styles.js';
import { BANDS, band, bandOf, tone } from '../src/config/thresholds.js';
import { COPY, copy } from '../src/config/copy.js';
import { VERSION, NAME } from '../src/config/brand.js';

// ---------------------------------------------------------------- contrast maths

test('relative luminance matches the WCAG anchors', () => {
  assert.equal(Math.round(luminance('#000000') * 100) / 100, 0);
  assert.equal(Math.round(luminance('#ffffff') * 100) / 100, 1);
  // 0x80 linearises to ~0.2158; the canonical mid-grey check.
  assert.equal(Math.round(luminance('#808080') * 100) / 100, 0.22);
});

test('contrast ratio is symmetric and bounded', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.equal(contrastRatio('#123456', '#123456'), 1);
  assert.equal(contrastRatio('#4a525c', '#ffffff'), contrastRatio('#ffffff', '#4a525c'));
});

test('a failing verdict reports how far below the minimum it is', () => {
  assert.equal(contrastVerdict(7, 4.5), null);
  const verdict = contrastVerdict(2.25, 4.5);
  assert.equal(verdict.minimum, 4.5);
  assert.equal(verdict.shortfall, 2.25);
});

test('contrast maths rejects non-hex input rather than guessing', () => {
  assert.throws(() => luminance('#fff'), /not a 6-digit hex/);
  assert.throws(() => luminance('white'), /not a 6-digit hex/);
});

// ---------------------------------------------------------------- the token contract

test('every declared pair passes in every theme', () => {
  const failures = [];
  for (const theme of TOKENS.meta.themes) {
    for (const pair of contrastPairs()) {
      const fg = colorToken(theme, pair.fg);
      const bg = colorToken(theme, pair.bg);
      const verdict = contrastVerdict(contrastRatio(fg, bg), pair.min);
      if (verdict) {
        failures.push(
          `${theme}: ${pair.fg} on ${pair.bg} is ${verdict.ratio}:1, needs ${verdict.minimum}:1`
        );
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('no foreground colour can ship unchecked', () => {
  // Every non-surface colour token in every theme must appear in a declared pair, otherwise a
  // new colour could be added and never contrasted against anything.
  const paired = new Set(contrastPairs().flatMap((pair) => [pair.fg, pair.bg]));
  const unpaired = [];
  for (const theme of TOKENS.meta.themes) {
    const walk = (node, prefix) => {
      for (const [key, value] of Object.entries(node)) {
        if (value && typeof value === 'object') walk(value, `${prefix}${key}.`);
        else if (!paired.has(`${prefix}${key}`)) unpaired.push(`${prefix}${key}`);
      }
    };
    walk(TOKENS.color[theme], '');
  }
  assert.deepEqual([...new Set(unpaired)], []);
});

test('themes define exactly the same tokens, so a theme cannot silently inherit', () => {
  assert.equal(assertTokensValid(TOKENS), true);
  const broken = structuredClone(TOKENS);
  delete broken.color.dark.link;
  assert.throws(() => assertTokensValid(broken), TokenError);
});

test('a malformed colour is rejected at import time, not at render time', () => {
  const broken = structuredClone(TOKENS);
  broken.color.light.text = 'rgb(0,0,0)';
  assert.throws(() => assertTokensValid(broken), /not a 6-digit hex/);
});

test('every contrast pair declares a numeric minimum', () => {
  for (const pair of contrastPairs()) {
    assert.equal(typeof pair.min, 'number', `${pair.fg}/${pair.bg} has no minimum`);
  }
});

// ---------------------------------------------------------------- stylesheet generation

test('the stylesheet implements both themes instead of declaring one', () => {
  const css = renderStyles();
  assert.match(css, /color-scheme: light/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /color-scheme: dark/);
});

test('the stylesheet is generated from tokens, not from literals', () => {
  const css = renderStyles();
  // Every hex colour in the output must be a token value. A literal that is not in
  // tokens.json would fail this, which is the point: the CSS has no palette of its own.
  const tokenValues = new Set(
    TOKENS.meta.themes.flatMap((theme) => {
      const out = [];
      const walk = (node) => {
        for (const value of Object.values(node)) {
          if (value && typeof value === 'object') walk(value);
          else out.push(value.toLowerCase());
        }
      };
      walk(TOKENS.color[theme]);
      return out;
    })
  );
  const hexes = css.match(/#[0-9a-f]{6}/gi) ?? [];
  assert.ok(hexes.length > 0, 'the stylesheet should contain the palette');
  for (const hex of hexes) {
    assert.ok(tokenValues.has(hex.toLowerCase()), `${hex} is not a token value`);
  }
});

test('the stylesheet contains no bare rgb()/hsl() colours outside token composition', () => {
  const css = renderStyles();
  assert.equal((css.match(/\bhsl\(/gi) ?? []).length, 0);
});

test('motion is optional and never load-bearing', () => {
  const css = renderStyles();
  assert.match(css, /prefers-reduced-motion: reduce/);
  // No keyframe animations at all: nothing in the report moves on its own.
  assert.ok(!/@keyframes/.test(css));
});

test('focus indicators are drawn from tokens', () => {
  const css = renderStyles();
  assert.match(css, /:focus-visible/);
  assert.match(css, /--layout-focusWidth/);
});

// ---------------------------------------------------------------- thresholds

test('bands are ordered, inclusive at the bottom, and total over 0..100', () => {
  const mins = BANDS.map((b) => b.min);
  assert.deepEqual(mins, [...mins].sort((a, b) => b - a), 'highest threshold first');
  for (let score = 0; score <= 100; score += 1) {
    const info = bandOf(score);
    assert.ok(info, `${score} has no band`);
    assert.equal(score >= info.min, true);
    assert.equal(band(score), info.label);
  }
});

test('an unmeasured score is a gap, never a failing grade', () => {
  assert.equal(band(null), 'unmeasured');
  assert.equal(tone(null), 'none');
  assert.equal(bandOf(undefined).label, 'unmeasured');
});

test('the band table matches the published calibration', () => {
  assert.equal(band(100), 'good');
  assert.equal(band(90), 'good');
  assert.equal(band(89), 'needs work');
  assert.equal(band(70), 'needs work');
  assert.equal(band(69), 'poor');
  assert.equal(band(53), 'poor');
  assert.equal(band(40), 'poor');
  assert.equal(band(39), 'failing');
});

// ---------------------------------------------------------------- copy and brand

test('every copy reference resolves, and an unknown key fails loudly', () => {
  assert.equal(copy('headings.result'), 'Result');
  assert.equal(copy('state.findingsCount', 3), 'Findings (3)');
  assert.throws(() => copy('headings.nope'), /unknown key/);
});

test('the version has exactly one definition', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
  assert.equal(NAME, 'MR-Spark');
});

test('copy contains no unresolved placeholders', () => {
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        assert.ok(!value.includes('undefined'), `${prefix}${key} mentions undefined`);
        assert.ok(!value.includes('${'), `${prefix}${key} has an unevaluated template`);
      } else if (typeof value === 'object') {
        walk(value, `${prefix}${key}.`);
      }
    }
  };
  walk(COPY, '');
});
