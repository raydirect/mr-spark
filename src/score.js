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

export const SCORE_SPEC_VERSION = '1.0.0';

/**
 * Impact weights for the accessibility pillar. Chosen so that the six failure classes
 * that dominate the web (per the accessibility research in docs/RESEARCH.md) cannot be
 * outvoted by a pile of minor issues.
 */
export const IMPACT_WEIGHT = {
  critical: 10,
  serious: 5,
  moderate: 2,
  minor: 1,
};

/** Damage at which a pillar is considered fully broken. Linear below, so scores move smoothly. */
export const SATURATION = 100;

/**
 * Score a single pillar from its findings.
 * Returns null when the pillar was not collected — the honest answer.
 */
export function scorePillar(ir, pillar) {
  if (!COLLECTABLE.has(pillar)) return null;
  const findings = ir.findings.filter((f) => f.pillar === pillar);
  if (findings.length === 0) return 100;
  const damage = findings.reduce((sum, f) => sum + (IMPACT_WEIGHT[f.impact] ?? 2), 0);
  const ratio = Math.min(1, damage / SATURATION);
  return Math.max(0, Math.round((1 - ratio) * 100));
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

/** Human-facing label for a score. Deliberately blunt; no "excellent" for a 70. */
export function band(score) {
  if (score === null) return 'unmeasured';
  if (score >= 90) return 'good';
  if (score >= 70) return 'needs work';
  if (score >= 40) return 'poor';
  return 'failing';
}
