/**
 * The view model: one projection from an IR to something a surface can render.
 *
 * Why this exists. The terminal reporter and the HTML reporter each had their own `summarize`,
 * `overallScore` and impact sort — same intent, subtly different implementations. Two surfaces
 * rendering the same IR could therefore disagree about it, which is exactly the drift the
 * architecture forbids ("surfaces collect and render, never judge").
 *
 * Now the judgement happens once, here, in a pure function. A surface's only remaining freedom
 * is presentation: colour, layout, wording. If a surface ever needs a different verdict, the
 * view model is the file to change — deliberately.
 */

import { PILLARS } from './ir.js';
import { band, bandOf } from './config/thresholds.js';
import { DISPLAY } from './config/constants.js';
import { copy } from './config/copy.js';
import { findingsFor, sortByImpact, isDecided } from './vocabulary.js';

/**
 * Conformance: the mean of MEASURED pillars. Unmeasured pillars are excluded rather than
 * counted as zero, and the count is always reported alongside, so a single-pillar run is
 * never mistaken for a whole-page verdict.
 */
export function conformance(scores) {
  const measured = PILLARS.filter((pillar) => scores[pillar] !== null && scores[pillar] !== undefined);
  if (measured.length === 0) return { score: null, band: band(null), measured: [], total: PILLARS.length };
  const mean = measured.reduce((sum, pillar) => sum + scores[pillar], 0) / measured.length;
  const score = Math.round(mean);
  return { score, band: band(score), measured, total: PILLARS.length };
}

/**
 * A one-line reason for a pillar's score, built from DECIDED findings only.
 * `format` lets the terminal use terse rule ids and the report use prose, from one count.
 */
export function pillarSummary(ir, pillar, { format = 'terse', limit = DISPLAY.summaryRules } = {}) {
  const { decided, undecided } = findingsFor(ir, pillar);
  const parts = [];

  if (decided.length === 0) {
    parts.push(ir.findings.length === 0 ? copy('state.noFindings') : copy('state.noDecidedFindings'));
  } else {
    const counts = new Map();
    for (const finding of decided) counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1);
    const ranked = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, limit);
    parts.push(
      format === 'prose'
        ? ranked.map(([rule, n]) => `${rule} (${n})`).join(' · ')
        : ranked.map(([rule, n]) => `${rule} ×${n}`).join(' · ')
    );
  }

  if (undecided.length > 0) parts.push(copy('state.undecidedCount', undecided.length));
  return parts.join(' · ');
}

/**
 * Everything a surface needs to draw the score area, decided once.
 * `value` is the display string, so "not measured" is rendered identically everywhere.
 */
export function pillarRows(ir, scores) {
  return PILLARS.map((pillar) => {
    const score = scores[pillar] ?? null;
    const info = bandOf(score);
    const { decided, undecided } = findingsFor(ir, pillar);
    return Object.freeze({
      pillar,
      score,
      value: score === null ? copy('state.unmeasured') : String(score),
      band: info.label,
      tone: info.tone,
      decidedCount: decided.length,
      undecidedCount: undecided.length,
      summary: pillarSummary(ir, pillar),
      summaryProse: pillarSummary(ir, pillar, { format: 'prose' }),
    });
  });
}

/**
 * The findings list, worst first, decided only. Undecided findings are returned separately and
 * never mixed in — a surface that merges them would be overstating both the problem and our
 * confidence.
 */
export function findingGroups(ir) {
  const allDecided = sortByImpact(ir.findings.filter(isDecided));
  const allUndecided = ir.findings.filter((finding) => !isDecided(finding));
  return {
    decided: allDecided,
    undecided: allUndecided,
    /** Kept for the terminal's "N more finding(s)" line. */
    total: ir.findings.length,
    decidedForPillar: (pillar) => (pillar ? findingsFor(ir, pillar).decided : allDecided),
  };
}

/** The whole projection. Surfaces take this and add nothing but presentation. */
export function buildView(ir, scores) {
  const summary = conformance(scores);
  const rows = pillarRows(ir, scores);
  const findings = findingGroups(ir);
  return {
    target: ir.provenance?.uri ?? 'unknown target',
    overall: summary,
    /** Band word for the conformance score, e.g. "poor". */
    overallBand: summary.band,
    overallTone: bandOf(summary.score).tone,
    rows,
    findings,
    coverage: {
      measured: summary.measured.length,
      total: summary.total,
      label: copy('state.pillarsMeasured', summary.measured.length, summary.total),
      plainLabel: copy('state.pillarsMeasuredPlain', summary.measured.length, summary.total),
      shortLabel: copy('state.pillarsMeasuredShort', summary.measured.length, summary.total),
    },
  };
}
