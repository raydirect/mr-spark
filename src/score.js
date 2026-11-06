/**
 * The score. Public, versioned, and deliberately unwilling to flatter.
 *
 * Rules (see docs/VISION.md §3.3):
 *  - Weights are public. There is no secret sauce to tune for a better number.
 *  - Pillars are scored independently and NEVER merged into one number that hides a failure.
 *  - A pillar we cannot measure is reported as `null` (rendered as "—"), never as 100.
 *  - The score is a summary of findings; findings are always emitted alongside it.
 *  - Automated coverage is stated in the output itself. We never imply conformance.
 */

import { PILLARS, COLLECTABLE } from './ir.js';
import { isDecided } from './vocabulary.js';
import { band } from './config/thresholds.js';

export const SCORE_SPEC_VERSION = '2.0.0';

/**
 * Impact weights. Chosen so the failure classes that dominate the web cannot be outvoted by
 * a pile of minor issues: one critical finding should be visible on its own.
 */
export const IMPACT_WEIGHT = {
  critical: 10,
  serious: 5,
  moderate: 2,
  minor: 1,
};

/**
 * The damage scale of the scoring curve.
 *
 * score = 100 * K / (damage + K)
 *
 * A hyperbola rather than a straight line, because a straight line flatters: with linear
 * scoring, a page with two missing alt texts and no document language still reads like a
 * pass. Anchors (see docs/SCORE-SPEC.md):
 *   no findings            -> 100
 *   one critical           ->  80
 *   two critical + 3 serious ->  53
 *   six critical           ->  40
 * The curve never reaches 0, so "0" stays reserved for the degenerate case rather than
 * becoming a routine verdict.
 */
export const DAMAGE_SCALE = 40;

/**
 * Score a single pillar from its findings.
 * Returns null when the pillar was not collected — the honest answer.
 */
export function scorePillar(ir, pillar) {
  if (!COLLECTABLE.has(pillar)) return null;
  // Undecided checks are excluded: "we could not tell" is not damage, and counting it would
  // make the score depend on the runner's capabilities rather than the page's quality.
  const findings = ir.findings.filter((f) => f.pillar === pillar && isDecided(f));
  if (findings.length === 0) return 100;
  const damage = findings.reduce((sum, f) => sum + (IMPACT_WEIGHT[f.impact] ?? 2), 0);
  return Math.round((100 * DAMAGE_SCALE) / (damage + DAMAGE_SCALE));
}

/** All pillar scores. Unmeasured pillars are `null`, not zero — a gap, not a verdict. */
export function scoreAll(ir) {
  const out = {};
  for (const pillar of PILLARS) out[pillar] = scorePillar(ir, pillar);
  return out;
}

/**
 * Coverage honesty: how much of the accessibility criteria space automation can even
 * look at. Published, not hidden. See docs/RESEARCH.md §1 for the sourcing.
 */
export const AUTOMATION_COVERAGE = {
  criteriaShare: '20-31%',
  volumeShare: '~57%',
  note: 'Automated checks cover a minority of WCAG criteria. Absence of findings does not mean a page is accessible.',
};

/**
 * Human-facing label for a score. Deliberately blunt; no "excellent" for a 70.
 *
 * Re-exported from the threshold config, which is now the only definition. The thresholds used
 * to be retyped here and in two reporters, which meant a page could show "good" in a colour
 * that said "needs work".
 */
export { band };
