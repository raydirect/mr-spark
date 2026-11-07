/**
 * The ease table, held to Penner's published equations.
 *
 * `src/ease-bake.js` implements the curves, which means a typo there is a design document that says one
 * thing and a page that does another — and *no other test in this repository would notice*, because the
 * rest of the suite checks the shape of the output, not the mathematics of a name. So this file checks
 * the mathematics against the source, transcribed: `Easing Equations v1.5` (1 May 2003),
 * `robertpenner.com/easing/penner_easing_as1.txt`, which Robert Penner's own 2025 TypeScript port
 * (`@penner/classic-easing`) still follows. The reference implementations below are in his `(t, b, c, d)`
 * spelling on purpose: the check has to be against *the published thing*, not against a second copy of
 * our own derivation.
 *
 * ## The tier this file belongs to
 *
 * Method stolen from `classic-easing`, which splits its property tests into a merge-gating **law tier**
 * and a nightly **property tier**. A property earns a place here only if all four hold:
 *
 *   1. it is a *total* law — true for every input in the range, with no tolerance tuned to a curve;
 *   2. it cannot flake;
 *   3. it costs under ~50 ms;
 *   4. its generator is cheap and pure: no jsdom, no DOM, no clock, no filesystem.
 *
 * Convergence rates, numerical-continuity estimates and "adjacent samples differ by less than X" fail
 * criterion 1 and do not belong in a gate. The single non-total assertion in this file is labelled where
 * it appears, with the reason it cannot be made exact.
 *
 * Two bugs in our table are recorded here as laws, because both were found by reading the source rather
 * than the folklore: `back.inOut` was missing Penner's 1.525 overshoot scale (our curve peaked at 1.049
 * where the published one peaks at 1.100), and `elastic` used its amplitude as a phase shift instead of a
 * multiplier (so `elastic.out(3, 0.3)` overshot 1.56 instead of 2.68 — while `elastic.out(1, 0.3)`, the
 * value every copy-paste uses, looked perfect). A test that only checks a parameter is *used* cannot see
 * that. A test that checks what it *means* sees it at once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateEase, sampleEase, cssTimingFunction } from '../src/ease-bake.js';
import { EASE_FAMILIES, EASE_NAMES, KEYWORD_EASES, SAMPLE_MAX_KEYFRAMES } from '../src/formats/eases.js';

/* ------------------------------------------------------------------ the source

   Transcribed from penner_easing_as1.txt v1.5. Signatures are his (`t` current time, `b` beginning
   value, `c` change, `d` duration, plus a family's own arguments), including his in-place `t /= d`
   mutation and his default handling. Called with `b = 0, c = 1, d = 1` below, which is the same curve
   normalized to unit time and unit change.
*/
const PI = Math.PI;

const PENNER = {
  quad: {
    in: (t, b, c, d) => c * (t /= d) * t + b,
    out: (t, b, c, d) => -c * (t /= d) * (t - 2) + b,
    inOut: (t, b, c, d) => {
      if ((t /= d / 2) < 1) return (c / 2) * t * t + b;
      return (-c / 2) * (--t * (t - 2) - 1) + b;
    },
  },
  cubic: {
    in: (t, b, c, d) => c * (t /= d) * t * t + b,
    out: (t, b, c, d) => c * ((t = t / d - 1) * t * t + 1) + b,
    inOut: (t, b, c, d) => {
      if ((t /= d / 2) < 1) return (c / 2) * t * t * t + b;
      return (c / 2) * ((t -= 2) * t * t + 2) + b;
    },
  },
  quart: {
    in: (t, b, c, d) => c * (t /= d) * t * t * t + b,
    out: (t, b, c, d) => -c * ((t = t / d - 1) * t * t * t - 1) + b,
    inOut: (t, b, c, d) => {
      if ((t /= d / 2) < 1) return (c / 2) * t * t * t * t + b;
      return (-c / 2) * ((t -= 2) * t * t * t - 2) + b;
    },
  },
  quint: {
    in: (t, b, c, d) => c * (t /= d) * t * t * t * t + b,
    out: (t, b, c, d) => c * ((t = t / d - 1) * t * t * t * t + 1) + b,
    inOut: (t, b, c, d) => {
      if ((t /= d / 2) < 1) return (c / 2) * t * t * t * t * t + b;
      return (c / 2) * ((t -= 2) * t * t * t * t + 2) + b;
    },
  },
  sine: {
    in: (t, b, c, d) => -c * Math.cos((t / d) * (PI / 2)) + c + b,
    out: (t, b, c, d) => c * Math.sin((t / d) * (PI / 2)) + b,
    inOut: (t, b, c, d) => (-c / 2) * (Math.cos((PI * t) / d) - 1) + b,
  },
  expo: {
    in: (t, b, c, d) => (t === 0 ? b : c * Math.pow(2, 10 * (t / d - 1)) + b),
    out: (t, b, c, d) => (t === d ? b + c : c * (-Math.pow(2, -10 * (t / d)) + 1) + b),
    inOut: (t, b, c, d) => {
      if (t === 0) return b;
      if (t === d) return b + c;
      if ((t /= d / 2) < 1) return (c / 2) * Math.pow(2, 10 * (t - 1)) + b;
      return (c / 2) * (-Math.pow(2, -10 * --t) + 2) + b;
    },
  },
  circ: {
    in: (t, b, c, d) => -c * (Math.sqrt(1 - (t /= d) * t) - 1) + b,
    out: (t, b, c, d) => c * Math.sqrt(1 - (t = t / d - 1) * t) + b,
    inOut: (t, b, c, d) => {
      if ((t /= d / 2) < 1) return (-c / 2) * (Math.sqrt(1 - t * t) - 1) + b;
      return (c / 2) * (Math.sqrt(1 - (t -= 2) * t) + 1) + b;
    },
  },
  // easeInElastic/easeOutElastic/easeInOutElastic: `a` amplitude, `p` period, `s` the phase he derives
  // from both. Note `t * d - s` in his source: `t` has already been divided by `d` above, so the
  // multiplication puts it back into the same units as `s` and `p`.
  elastic: {
    in: (t, b, c, d, a, p) => {
      if (t === 0) return b;
      if ((t /= d) === 1) return b + c;
      if (!p) p = d * 0.3;
      let s;
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else {
        s = (p / (2 * PI)) * Math.asin(c / a);
      }
      return -(a * Math.pow(2, 10 * (t -= 1)) * Math.sin(((t * d - s) * (2 * PI)) / p)) + b;
    },
    out: (t, b, c, d, a, p) => {
      if (t === 0) return b;
      if ((t /= d) === 1) return b + c;
      if (!p) p = d * 0.3;
      let s;
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else {
        s = (p / (2 * PI)) * Math.asin(c / a);
      }
      return a * Math.pow(2, -10 * t) * Math.sin(((t * d - s) * (2 * PI)) / p) + c + b;
    },
    inOut: (t, b, c, d, a, p) => {
      if (t === 0) return b;
      if ((t /= d / 2) === 2) return b + c;
      if (!p) p = d * (0.3 * 1.5);
      let s;
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else {
        s = (p / (2 * PI)) * Math.asin(c / a);
      }
      if (t < 1) return -0.5 * (a * Math.pow(2, 10 * (t -= 1)) * Math.sin(((t * d - s) * (2 * PI)) / p)) + b;
      return a * Math.pow(2, -10 * (t -= 1)) * Math.sin(((t * d - s) * (2 * PI)) / p) * 0.5 + c + b;
    },
  },
  back: {
    in: (t, b, c, d, s) => {
      if (s === undefined) s = 1.70158;
      return c * (t /= d) * t * ((s + 1) * t - s) + b;
    },
    out: (t, b, c, d, s) => {
      if (s === undefined) s = 1.70158;
      return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
    },
    inOut: (t, b, c, d, s) => {
      if (s === undefined) s = 1.70158;
      if ((t /= d / 2) < 1) return (c / 2) * (t * t * (((s *= 1.525) + 1) * t - s)) + b;
      return (c / 2) * ((t -= 2) * t * (((s *= 1.525) + 1) * t + s) + 2) + b;
    },
  },
  bounce: {
    out: (t, b, c, d) => {
      t /= d;
      if (t < 1 / 2.75) return c * (7.5625 * t * t) + b;
      if (t < 2 / 2.75) return c * (7.5625 * (t -= 1.5 / 2.75) * t + 0.75) + b;
      if (t < 2.5 / 2.75) return c * (7.5625 * (t -= 2.25 / 2.75) * t + 0.9375) + b;
      return c * (7.5625 * (t -= 2.625 / 2.75) * t + 0.984375) + b;
    },
    in: (t, b, c, d) => c - PENNER.bounce.out(d - t, 0, c, d) + b,
    inOut: (t, b, c, d) => {
      if (t < d / 2) return PENNER.bounce.in(t * 2, 0, c, d) * 0.5 + b;
      return PENNER.bounce.out(t * 2 - d, 0, c, d) * 0.5 + c * 0.5 + b;
    },
  },
};

/** The families whose names are ours, with the arguments a legal spelling must carry. */
const REFERENCE = [
  ...Object.keys(PENNER)
    // `back` and `elastic` are only nameable with their parameters — the format refuses a bare
    // `back.out` precisely so no author inherits an invisible default — so they are covered by the
    // spelled-out entries below instead.
    .filter((family) => EASE_FAMILIES[family].params === 0)
    .flatMap((family) =>
      ['in', 'out', 'inOut'].map((direction) => ({ name: `${family}.${direction}`, family, direction, args: [] })),
    ),
  // GSAP's `powerN` is Penner's polynomial of degree N+1; the aliases are tested as aliases, not re-derived.
  ...[1, 2, 3, 4].flatMap((n) =>
    ['in', 'out', 'inOut'].map((direction) => ({
      name: `power${n}.${direction}`,
      family: ['quad', 'cubic', 'quart', 'quint'][n - 1],
      direction,
      args: [],
      alias: true,
    })),
  ),
  ...['in', 'out', 'inOut'].flatMap((direction) => [
    { name: `back.${direction}(0)`, family: 'back', direction, args: [0] },
    { name: `back.${direction}(1.70158)`, family: 'back', direction, args: [1.70158] },
    { name: `back.${direction}(4)`, family: 'back', direction, args: [4] },
    { name: `elastic.${direction}(1, 0.3)`, family: 'elastic', direction, args: [1, 0.3] },
    { name: `elastic.${direction}(3, 0.3)`, family: 'elastic', direction, args: [3, 0.3] },
    { name: `elastic.${direction}(0.5, 0.6)`, family: 'elastic', direction, args: [0.5, 0.6] },
  ]),
];

/** GSAP's names for the same polynomials; tested as aliases, so they cannot drift apart. */
const ALIASES = { power1: 'quad', power2: 'cubic', power3: 'quart', power4: 'quint' };

/** Names that are not his, and never will be: CSS's own words, and `steps()`. */
const NOT_PENNER = /^linear$|^ease(-in|-out|-in-out)?$|^steps\(/;

const AT = Array.from({ length: 257 }, (_, i) => i / 256);

/* ------------------------------------------------------------------ the laws */

test('every sampled ease in the table is Penner\'s published curve', () => {
  for (const { name, family, direction, args } of REFERENCE) {
    const his = PENNER[family][direction];
    const ours = (t) => evaluateEase(name, t);
    assert.notEqual(ours(0.5), null, `${name} has no curve — the table and the bake are out of step`);
    let worst = 0;
    for (const t of AT) {
      const diff = Math.abs(ours(t) - his(t, 0, 1, 1, ...args));
      if (diff > worst) worst = diff;
    }
    // The only tolerance here is IEEE double noise, and it is stated as such rather than fitted to a
    // curve: both sides are closed forms, so disagreement at 1e-9 means different mathematics.
    assert.ok(worst < 1e-9, `${name} diverges from the published equation by ${worst}`);
  }
});

test('nothing in the public table is unaccounted for', () => {
  // A family added to EASE_FAMILIES without a reference implementation is a curve nobody checked, which
  // is how a format amendment quietly becomes "whatever the implementation happens to compute". Either
  // transcribe the source (it is almost certainly Penner's) or say why it is not.
  const covered = new Set(REFERENCE.map((entry) => entry.name));
  for (const name of EASE_NAMES) {
    if (NOT_PENNER.test(name)) continue;
    assert.ok(covered.has(name), `${name} is in the format's table with no reference curve in this test`);
  }
  const families = new Set(REFERENCE.map((entry) => entry.family));
  for (const family of Object.keys(EASE_FAMILIES)) {
    assert.ok(families.has(family) || ALIASES[family] , `family ${family} has no transcription here`);
  }
});

test('endpoints: every ease is 0 at t=0 and 1 at t=1, exactly', () => {
  for (const name of EASE_NAMES) {
    if (NOT_PENNER.test(name)) continue;
    assert.equal(evaluateEase(name, 0), 0, `${name} must start at 0`);
    assert.equal(evaluateEase(name, 1), 1, `${name} must end at 1 — Penner's v1.3 changelog entry`);
    const samples = sampleEase(name);
    assert.equal(samples[0], 0);
    assert.equal(samples.at(-1), 1, 'the baked list agrees with the curve at both ends');
  }
});

test('reflection: easeIn(t) = 1 − easeOut(1 − t), for every family', () => {
  for (const family of Object.keys(PENNER)) {
    if (EASE_FAMILIES[family].params !== 0) continue;
    for (const t of AT) {
      const left = evaluateEase(`${family}.in`, t);
      const right = 1 - evaluateEase(`${family}.out`, 1 - t);
      assert.ok(Math.abs(left - right) < 1e-12, `${family}: the in curve is not the reflection of the out curve at t=${t}`);
    }
  }
});

test('power1–4 are aliases, not separate curves', () => {
  for (const [power, family] of [['power1', 'quad'], ['power2', 'cubic'], ['power3', 'quart'], ['power4', 'quint']]) {
    for (const direction of ['in', 'out', 'inOut']) {
      assert.deepEqual(sampleEase(`${power}.${direction}`), sampleEase(`${family}.${direction}`), `${power}.${direction} must equal ${family}.${direction} sample for sample`);
    }
  }
});

test('inOut crosses the middle at the middle, exactly', () => {
  // True of the construction itself — `f(0.5) = (base(0) + 1) / 2` — so it needs no tolerance, and it
  // is the law that fails first when someone "improves" an inOut by averaging two different halves.
  for (const name of Object.keys(EASE_FAMILIES)) {
    if (EASE_FAMILIES[name].params !== 0) continue;
    assert.equal(evaluateEase(`${name}.inOut`, 0.5), 0.5, `${name}.inOut must pass through (0.5, 0.5)`);
  }
});

test('non-overshooting families stay inside [0, 1] and never go backwards', () => {
  for (const [family, spec] of Object.entries(EASE_FAMILIES)) {
    if (spec.params !== 0 || family === 'bounce') continue;
    for (const direction of spec.directions) {
      const name = `${family}.${direction}`;
      let previous = 0;
      for (const t of AT) {
        const value = evaluateEase(name, t);
        assert.ok(value >= 0 && value <= 1, `${name} left [0, 1] at t=${t}`);
        assert.ok(value >= previous - 1e-12, `${name} went backwards at t=${t}`);
        previous = value;
      }
    }
  }
});

test('bounce stays inside [0, 1]; back and elastic overshoot on purpose', () => {
  for (const direction of ['in', 'out', 'inOut']) {
    for (const t of AT) {
      const value = evaluateEase(`bounce.${direction}`, t);
      assert.ok(value >= 0 && value <= 1, `bounce.${direction} left [0, 1] at t=${t}`);
    }
  }
  assert.ok(Math.max(...AT.map((t) => evaluateEase('back.out(1.70158)', t))) > 1, 'back without overshoot is not back');
  assert.ok(Math.max(...AT.map((t) => evaluateEase('elastic.out(1, 0.3)', t))) > 1, 'elastic without a swing is not elastic');
  assert.equal(evaluateEase('back.out(0)', 0.5), evaluateEase('cubic.out', 0.5), 's = 0 is cubic easing with no overshoot, per his own comment');
});

test('the amplitude is an amplitude: bigger swings, and the curve is his either way', () => {
  // Deliberately not a "the parameter is used" check — with the bug it passed, because a phase shift is
  // also a change. The published equation is the only standard that says what the number means.
  for (const [a, p] of [[1, 0.3], [2, 0.3], [3, 0.3], [0.5, 0.6], [5, 0.45]]) {
    for (const direction of ['in', 'out', 'inOut']) {
      const name = `elastic.${direction}(${a}, ${p})`;
      const his = PENNER.elastic[direction];
      for (const t of AT) assert.ok(Math.abs(evaluateEase(name, t) - his(t, 0, 1, 1, a, p)) < 1e-9, `${name} at t=${t}`);
    }
  }
});

test('t is clamped to the animation, and NaN stays NaN', () => {
  // His 2025 port added input clamping for the same reason: there is nothing to interpolate outside the
  // interval, and an unclamped scrub position produces NaN or runaway values in a UI that had done
  // nothing wrong. Overshoot on the *inside* is kept — that is what back and elastic are for.
  for (const name of ['bounce.in', 'back.inOut(1.70158)', 'elastic.out(2, 0.3)', 'quad.out']) {
    assert.equal(evaluateEase(name, -0.5), 0);
    assert.equal(evaluateEase(name, 1.5), 1);
    assert.ok(Number.isNaN(evaluateEase(name, NaN)), `${name} must not invent a value for NaN time`);
  }
});

test('a CSS keyword has no samples, and neither does an ease that does not exist', () => {
  for (const ref of [...KEYWORD_EASES, 'steps(4, end)', 'steps(4, start)']) {
    assert.equal(evaluateEase(ref, 0.5), null, `${ref} is CSS's own word — sampling it would be an approximation`);
    assert.equal(sampleEase(ref), null);
  }
  for (const ref of ['wobble.out', 'back.out', 'steps(4)', 'linear.in']) {
    assert.equal(evaluateEase(ref, 0.5), null, `${ref} is not in the table and must not get a curve`);
    assert.equal(cssTimingFunction(ref), null);
  }
});

test('the baked list is the curve, at exactly the sample points and nothing else', () => {
  for (const name of EASE_NAMES.filter((n) => !NOT_PENNER.test(n))) {
    const samples = sampleEase(name);
    assert.equal(samples.length, SAMPLE_MAX_KEYFRAMES, 'the format\'s own constant decides how much curve a page gets');
    for (let i = 0; i < samples.length; i += 1) {
      const t = i / (samples.length - 1);
      const exact = Math.round(evaluateEase(name, t) * 1e6) / 1e6;
      assert.equal(samples[i], Object.is(exact, -0) ? 0 : exact, `${name} sample ${i} is not the curve at t=${t}`);
    }
  }
});

test('the one non-total assertion in this file, and why it is here', () => {
  // Penner's own justification for the 1.525 in `easeInOutBack` is a *design* claim, not an identity:
  // "scale the strength up so the in-out curve has the same overshoot as the in or out curves". A peak
  // of a smooth curve cannot be compared exactly without solving for it, so this is the single check in
  // this file that carries a fitted tolerance — and it is quarantined here, labelled, rather than being
  // allowed to set the standard for the laws above.
  const peak = (name) => Math.max(...Array.from({ length: 4001 }, (_, i) => evaluateEase(name, i / 4000)));
  const out = peak('back.out(1.70158)') - 1;
  const inOut = peak('back.inOut(1.70158)') - 1;
  assert.ok(Math.abs(out - inOut) < 5e-3, `in-out overshoot ${inOut.toFixed(4)} should match out overshoot ${out.toFixed(4)}`);
  assert.ok(inOut > 0.09, 'an unscaled in-out halves the gesture, which is the bug this law exists to keep out');
});
