/**
 * Named eases, as data.
 *
 * The format's rule is that an ease is a name from a closed table, never a function and never a
 * string the emitter has to interpret loosely. That only works if the table knows how each entry is
 * produced, so it does: `bezier` means a CSS keyword exists and is the same curve; `sampled` means
 * the compiler bakes the curve into keyframes at build time; anything not in the table is refused
 * rather than approximated.
 *
 * Every curve these names denote is Robert Penner's — `Easing Equations v1.5`, 1 May 2003, MIT and
 * BSD-3 (`LICENSE-PENNER.txt`, and see `NOTICE`). The spellings are the vocabulary GSAP layered on top
 * of his equations, which is why this file is about names and `src/ease-bake.js` is about mathematics.
 * `test/ease-laws.test.js` holds the names in this table to his published equations, and the three bugs
 * it found are recorded in docs/DOCUMENTS.md §2.
 *
 * The honest consequence, and the one people argue about: `power2.out` is `sampled`, not `bezier`.
 * A `cubic-bezier(0.215, 0.61, 0.355, 1)` is the *published approximation* of an ease-out-cubic,
 * not the curve itself. Substituting it silently would make the emitted page differ from the
 * authored intent by a fraction of a second of acceleration — small, and exactly the sort of drift
 * this project exists to refuse. A sampled curve is emitted as real keyframes and is exact.
 */

/** Families with no parameters and no direction, spelled exactly. */
export const KEYWORD_EASES = Object.freeze(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']);

export const EASE_FAMILIES = Object.freeze({
  power1: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  power2: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  power3: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  power4: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  quad: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  cubic: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  quart: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  quint: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  sine: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  circ: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  expo: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
  /** Overshoot and elasticity take an amount; `steps()` takes a count and a side. */
  back: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 1 },
  elastic: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 2 },
  bounce: { emission: 'sampled', directions: ['in', 'out', 'inOut'], params: 0 },
});

/** `steps(4, end)` — a discrete ease is native CSS, so it is exact rather than sampled. */
export const STEPS = Object.freeze({ emission: 'bezier', sides: ['start', 'end'] });

/**
 * The exact-spelling names. Families that take a parameter are deliberately absent: `back.out` with
 * no overshoot amount would mean "whatever the implementation defaults to", and an invisible default
 * in a design document is the thing this format was written to remove. Write `back.out(1.7)`.
 */
export const EASE_NAMES = Object.freeze([
  ...KEYWORD_EASES,
  ...Object.entries(EASE_FAMILIES)
    .filter(([, spec]) => spec.params === 0)
    .flatMap(([family, spec]) => spec.directions.map((direction) => `${family}.${direction}`)),
]);

const PARAMETRIC = /^(back|elastic)\.(in|out|inOut)\(([^)]*)\)$|^steps\((\d+),\s*(start|end)\)$/;

/**
 * Parse an ease reference into `{ family, direction, params, emission }`, or `null` when the name is
 * not in the table. `null` is what makes an unlisted ease an *error naming the nearest supported
 * curve* instead of a quiet fallback — see docs/DOCUMENTS.md §2, "Easing is a table, not a function".
 */
export function parseEase(ref) {
  if (typeof ref !== 'string') return null;
  if (KEYWORD_EASES.includes(ref)) return { family: ref, direction: null, params: [], emission: 'bezier' };

  const parametric = PARAMETRIC.exec(ref);
  if (parametric) {
    // The two alternatives share one regex, so the group that matched decides which shape this is.
    if (parametric[4] !== undefined) {
      const count = Number(parametric[4]);
      if (count < 1 || count > STEPS_MAX) return null;
      return { family: 'steps', direction: null, params: [count, parametric[5]], emission: STEPS.emission };
    }
    const family = parametric[1];
    const spec = EASE_FAMILIES[family];
    const args = parametric[3].split(',').map((part) => Number(part.trim()));
    if (!spec || args.length !== spec.params || args.some((n) => !Number.isFinite(n))) return null;
    if (args.some((n) => n < 0 || n > 10)) return null;
    return { family, direction: parametric[2], params: args, emission: spec.emission };
  }

  const [family, direction] = ref.split('.');
  const spec = EASE_FAMILIES[family];
  if (!spec) return null;
  if (spec.params !== 0) return null;
  if (direction && !spec.directions.includes(direction)) return null;
  return { family, direction: direction ?? null, params: [], emission: spec.emission };
}

/**
 * Keyframes are cheap in a stylesheet and expensive in a frame budget, so sampling has a ceiling.
 * Past it the compiler must fail rather than flatten a bounce into a fade — a wrong animation that
 * looks right is worse than a build that stops.
 */
export const STEPS_MAX = 24;
export const SAMPLE_MAX_KEYFRAMES = 32;

/** Every ease string the format accepts, for the schema's `enum` plus the parametric pattern. */
export const EASE_PATTERN = String.raw`(?:back|elastic)\.(?:in|out|inOut)\(\s*\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)?\s*\)|steps\(\s*(?:[1-9]|1\d|2[0-4])\s*,\s*(?:start|end)\s*\)`;
