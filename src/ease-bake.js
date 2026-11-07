/**
 * Baking an ease into a CSS timing function.
 *
 * The curves below are Robert Penner's easing equations — `Easing Equations v1.5`, 1 May 2003, the
 * ActionScript 1.0 text at <https://robertpenner.com/easing/penner_easing_as1.txt>, which his own 2025
 * TypeScript port (`@penner/classic-easing`) still follows. He released them under MIT and BSD-3
 * (<https://robertpenner.com/easing_terms_of_use.html>); the notices are in `LICENSE-PENNER.txt` and
 * `NOTICE`, and they travel with the package because `package.json` ships both.
 *
 * What is *not* his is the spelling: `power1`–`power4`, the `.in`/`.out`/`.inOut` suffixes and
 * `back.out(s)` as a name are the authoring vocabulary GSAP added on top of his curves
 * (docs/REVOLUTION.md §14 — take the vocabulary, never the runtime). Two consequences of getting that
 * distinction straight, both fixed here after checking the source instead of the folklore:
 *
 * - `back.inOut` scales its overshoot by 1.525, because Penner's `easeInOutBack` does. Skipping it is
 *   not a rounding error: the sampled curve peaked at 1.049 where the published one peaks at 1.100.
 * - The endpoint forcing in `sampleEase` is his v1.3 changelog entry — "tweaked the exponential easing
 *   functions to make endpoints exact" — not a float tidiness trick.
 *
 * The format's ease table has two emission classes, and the difference is not cosmetic:
 *
 * - `bezier` — CSS already has the word. `ease-out`, `linear`, `steps(4, end)` pass through untouched.
 * - `sampled` — every named family in `src/formats/eases.js` (`power2.out`, `bounce.out`,
 *   `back.out(1.7)`, …). CSS has no word for these, and fitting a single `cubic-bezier()` to one is a
 *   *different curve* — a silent substitution, which is the failure this compiler exists to prevent.
 *
 * So the compiler does at build time what an animation library does per frame: it evaluates the curve
 * once and writes the answer into CSS's own arbitrary-curve syntax, `linear(v0, v1, v2, …)`, which is
 * sampled evenly across the animation's duration. The output is a timing function, not a keyframe list,
 * which means it works identically for `animation`, `transition` and per-keyframe `animation-timing-`
 * `function`, and it costs one declaration.
 *
 * The sample count is `SAMPLE_MAX_KEYFRAMES` from the format, so the document's own constant decides
 * how much curve the page gets: 32 values, 31 segments, the error bounded and — this is the part that
 * matters — *identical for every browser and every build*.
 */

import { parseEase, KEYWORD_EASES, SAMPLE_MAX_KEYFRAMES } from './formats/eases.js';

/**
 * Each family below is written as its **out** curve — the decelerating one, matching how the authoring
 * vocabulary names `power2.out` — and `in`/`inOut` are derived from it by the two standard
 * transformations. One closed form per family, so a typo cannot make `power2.in` and `power3.out`
 * disagree about what the same curve means.
 */
// Written as the *out* curve, because `in` is derived from it: `1 - (1 - p) ** n` decelerates into the
// target, and Penner's `easeInQuad` is the reflection, `p ** n`. This line used to read `p ** n`, which
// is the accelerating curve — so `power2.out`, the most-used name in the whole vocabulary, emitted a
// snap-in and stopped hard. Nothing caught it: the endpoints are right either way, `inOut` is symmetric
// about the middle, and a schema cannot tell a decelerating cubic from an accelerating one. test/ease-laws.test.js
// exists because of that, and it is the only thing here that can.
const POW = (n) => (p) => 1 - (1 - p) ** n;

/** Penner's `easeInOutBack` multiplies the overshoot by this before building either half. */
const BACK_INOVERSHOOT_SCALE = 1.525;

/** GSAP's power1..4 are the polynomials of degree 2..5; the aliases are the same curves by name. */
const FAMILIES = Object.freeze({
  quad: POW(2),
  power1: POW(2),
  cubic: POW(3),
  power2: POW(3),
  quart: POW(4),
  power3: POW(4),
  quint: POW(5),
  power4: POW(5),
  sine: (p) => Math.sin((p * Math.PI) / 2),
  circ: (p) => Math.sqrt(1 - (p - 1) ** 2),
  expo: (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  // back.out(s): the overshoot amount is the authored parameter, default 1.70158.
  back: (p, s = 1.70158) => {
    const c3 = s + 1;
    return 1 + c3 * (p - 1) ** 3 + s * (p - 1) ** 2;
  },
  // elastic.out(amplitude, period): a damped sine, so the amplitude scales the overshoot and the
  // period sets how many oscillations fit inside the duration. Unlike every other family, its `in`
  // curve is written out below rather than reflected: the decay runs toward the target, so mirroring
  // in time does not mirror the wave — Penner publishes both.
  elastic: (p, amplitude = 1, period = 0.3) => {
    if (p <= 0 || p >= 1) return p;
    const a = Math.max(Math.abs(amplitude), 1);
    const c1 = (Math.asin(1 / a) * period) / (2 * Math.PI);
    // The amplitude multiplies the wave, which is what makes it an amplitude. Setting it to 3 should
    // overshoot three times as far, not merely re-phase the same swing — `a *` was missing, and only a
    // test against Penner's published equation catches that, because `elastic.out(1, 0.3)` is correct
    // either way and is the value everyone copies out of the docs.
    return a * 2 ** (-10 * p) * Math.sin(((p - c1) * (2 * Math.PI)) / period) + 1;
  },
  // elastic.in(amplitude, period) — Penner's own `easeInElastic`, not a reflection of the out curve.
  // The wave's phase is derived from the same `s`, so the *shape* matches, but the reflection would put
  // the swing at the wrong end of the duration whenever the amplitude is above 1.
  elasticIn: (p, amplitude = 1, period = 0.3) => {
    if (p <= 0 || p >= 1) return p;
    const a = Math.max(Math.abs(amplitude), 1);
    const c1 = (Math.asin(1 / a) * period) / (2 * Math.PI);
    return -a * 2 ** (10 * (p - 1)) * Math.sin(((p - 1 - c1) * (2 * Math.PI)) / period);
  },
  bounce: (p) => {
    const n = 7.5625;
    const d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
    return n * (p -= 2.625 / d) * p + 0.984375;
  },
});

/** The standard derivations, so every family gets all three directions from one closed form. */
function curveFor(family, direction, params) {
  if (!FAMILIES[family]) return null;
  // `s == 0` is cubic easing with no overshoot, and the in-out half scales `s` so that its excursion
  // matches the `in` and `out` curves instead of halving it. Penner's own words for the scale: "scale
  // the strength up so the in-out curve has the same overshoot as the in or out curves".
  const backStrength = family === 'back' ? (params[0] ?? 1.70158) * (direction === 'inOut' ? BACK_INOVERSHOOT_SCALE : 1) : undefined;
  const out =
    family === 'back'
      ? (p) => FAMILIES.back(p, backStrength)
      : family === 'elastic'
        ? (p) => FAMILIES.elastic(p, params[0] ?? 1, params[1] ?? 0.3)
        : FAMILIES[family];
  const inCurve =
    family === 'elastic'
      ? (p) => FAMILIES.elasticIn(p, params[0] ?? 1, params[1] ?? 0.3)
      : (p) => 1 - out(1 - p);
  if (direction === 'in') return inCurve;
  if (direction === 'inOut') {
    // The halves construction, written as Penner writes it: the first half runs the `in` curve at double
    // speed and the second the `out` curve, each at half height. Identical to deriving it from `out`
    // alone for every family that reflects, and correct for `elastic`, which does not.
    return (p) => (p < 0.5 ? inCurve(2 * p) / 2 : out(2 * p - 1) / 2 + 0.5);
  }
  return out;
}

/** Round to 6 decimals: enough that a browser's own maths is the only remaining source of drift. */
function quantise(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * The curve itself, at any normalized time — the question a preview has to ask.
 *
 * `t` is clamped to `[0, 1]`: an ease describes the interval of an animation, and outside it there is
 * nothing to interpolate. His 2025 port added the same clamping ("no extrapolation, and a `NaN` input
 * returns `NaN`"), and it is the right rule for a tool that may be handed a scrub position. Note what
 * clamping does *not* do: `back` and `elastic` still overshoot past 1 on the inside of the domain, which
 * is the entire reason they exist. `null` means the ease needs no sampling (a CSS keyword, `steps()`).
 */
export function evaluateEase(ref, t) {
  const parsed = parseEase(ref);
  if (!parsed || parsed.emission === 'bezier') return null;
  const curve = curveFor(parsed.family, parsed.direction, parsed.params);
  if (!curve) return null;
  if (Number.isNaN(t)) return NaN;
  return curve(t <= 0 ? 0 : t >= 1 ? 1 : t);
}

/**
 * The sampled values of an ease, endpoints included. Returns `null` for an ease that does not need
 * sampling (a CSS keyword or `steps()`), so a caller can ask one question and branch on the answer.
 */
export function sampleEase(ref, values = SAMPLE_MAX_KEYFRAMES) {
  const parsed = parseEase(ref);
  if (!parsed) return null;
  if (parsed.emission === 'bezier') return null;
  const curve = curveFor(parsed.family, parsed.direction, parsed.params);
  if (!curve) return null;
  const steps = Math.max(2, Math.min(values, SAMPLE_MAX_KEYFRAMES));
  const out = [];
  for (let i = 0; i < steps; i += 1) out.push(quantise(curve(i / (steps - 1))));
  // Endpoints are the definition of an ease, not a floating-point accident: t=0 must be 0 and t=1
  // must be 1, or the element visibly jumps at the first or last frame.
  out[0] = 0;
  out[out.length - 1] = 1;
  return out;
}

/**
 * The CSS `animation-timing-function` / `transition-timing-function` value for an ease reference.
 *
 * `null` means "not in the table", which is the document's problem, not this function's: MOTION006 has
 * already refused the document, and an emitter that invented a fallback curve here would be the silent
 * substitution the format exists to prevent.
 */
export function cssTimingFunction(ref) {
  const parsed = parseEase(ref);
  if (!parsed) return null;
  if (KEYWORD_EASES.includes(ref)) return ref;
  if (parsed.family === 'steps') {
    const [count, side] = parsed.params;
    return `steps(${count}, ${side ?? 'end'})`;
  }
  if (parsed.emission === 'bezier') return parsed.family;
  const samples = sampleEase(ref);
  if (!samples) return null;
  return `linear(${samples.join(', ')})`;
}
