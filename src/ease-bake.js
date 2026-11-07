/**
 * Baking an ease into a CSS timing function.
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
const POW = (n) => (p) => p ** n;

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
  // period sets how many oscillations fit inside the duration.
  elastic: (p, amplitude = 1, period = 0.3) => {
    if (p <= 0 || p >= 1) return p;
    const a = Math.max(Math.abs(amplitude), 1);
    const c1 = (Math.asin(1 / a) * period) / (2 * Math.PI);
    return 2 ** (-10 * p) * Math.sin(((p - c1) * (2 * Math.PI)) / period) + 1;
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
  const base =
    family === 'back'
      ? (p) => FAMILIES.back(p, params[0] ?? 1.70158)
      : family === 'elastic'
        ? (p) => FAMILIES.elastic(p, params[0] ?? 1, params[1] ?? 0.3)
        : FAMILIES[family];
  if (!base) return null;
  if (direction === 'out' || !direction) return base;
  if (direction === 'in') return (p) => 1 - base(1 - p);
  return (p) => (p < 0.5 ? (1 - base(1 - 2 * p)) / 2 : (base(2 * p - 1) + 1) / 2);
}

/** Round to 6 decimals: enough that a browser's own maths is the only remaining source of drift. */
function quantise(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
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
