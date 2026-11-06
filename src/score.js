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
import { countsTowardScore, IMPACTS as IMPACT_ORDER } from './vocabulary.js';
import { SCORING } from './config/constants.js';
import { band } from './config/thresholds.js';

export const SCORE_SPEC_VERSION = '3.0.0';

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
 * How much each additional instance of the SAME rule is charged.
 *
 * A real page produced 88 findings with one root cause: a single missing landmark, reported once
 * per element outside it. Linear weighting turned that into damage 176 and a score of 19 - a
 * number that says "this page is catastrophic" when it says "this page has one structural
 * problem". Nobody acts on 19; they stop trusting the tool.
 *
 * Repeats still cost something: six unlabelled inputs really is worse than one, and the fix is
 * six edits not one. The charge decays so that the FIRST instance carries the full weight and the
 * eleventh carries almost none:
 *
 *   charge(n) = 1 / (1 + (n - 1) * REPEAT_DECAY)     n = 1-based occurrence index
 *
 * With REPEAT_DECAY = 0.5: 1st = 1.0, 2nd = 0.67, 3rd = 0.5, 4th = 0.4 … 11th = 0.18.
 * Asymptotic, so no count is ever free and no count is ever catastrophic.
 *
 * The findings themselves are never aggregated or hidden - every instance stays on the page. Only
 * the score is per-root-cause. Reporting what happened and pricing it are different jobs.
 */
export const REPEAT_DECAY = SCORING.repeatDecay;

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
export const DAMAGE_SCALE = SCORING.damageScale;

/**
 * Score a single pillar from its findings.
 * Returns null when the pillar was not collected — the honest answer.
 */
export function scorePillar(ir, pillar) {
  if (!COLLECTABLE.has(pillar)) return null;
  // Undecided checks are excluded: "we could not tell" is not damage, and counting it would
  // make the score depend on the runner's capabilities rather than the page's quality.
  const findings = ir.findings.filter((f) => f.pillar === pillar && countsTowardScore(f));
  if (findings.length === 0) return 100;
  return Math.round((100 * DAMAGE_SCALE) / (damageOf(findings) + DAMAGE_SCALE));
}

/** The weight charged for the nth instance of a rule (n is 1-based). */
export function repeatCharge(n) {
  return 1 / (1 + (n - 1) * REPEAT_DECAY);
}

/**
 * Total damage for a set of decided findings, priced per ROOT CAUSE.
 *
 * Findings are grouped by `ruleId` - the root cause - and each group is charged its weight once
 * per instance with `repeatCharge` decay. Grouping by rule and not by selector is deliberate: a
 * page with a missing landmark on six elements has ONE structural cause, and a page with six
 * unlabelled inputs has six instances of one cause. Both are one root cause to fix, and the
 * charge should reflect the work, not the element count.
 */
export function damageOf(findings) {
  const perRule = new Map();
  for (const finding of findings) {
    perRule.set(finding.ruleId, (perRule.get(finding.ruleId) ?? 0) + 1);
  }
  let damage = 0;
  for (const [ruleId, count] of perRule) {
    const weight = IMPACT_WEIGHT[impactFor(findings, ruleId)] ?? 2;
    for (let n = 1; n <= count; n += 1) damage += weight * repeatCharge(n);
  }
  return damage;
}

/** The worst impact a rule reported in this set - a rule that fired as critical is priced so. */
function impactFor(findings, ruleId) {
  let worst = 'minor';
  for (const finding of findings) {
    if (finding.ruleId !== ruleId) continue;
    const rank = IMPACT_ORDER.indexOf(finding.impact);
    if (rank !== -1 && (IMPACT_ORDER.indexOf(worst) === -1 || rank < IMPACT_ORDER.indexOf(worst))) {
      worst = finding.impact;
    }
  }
  return worst;
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
