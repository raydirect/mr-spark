/**
 * Terminal reporter. This is the product's face for most people, so it is designed,
 * not dumped: one line per pillar, the worst findings first, and the honest caveat
 * printed every single time.
 */

import { AUTOMATION_COVERAGE, band } from '../score.js';
import { PILLARS } from '../ir.js';

const RESET = '\u001b[0m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const GREEN = '\u001b[32m';
const GRAY = '\u001b[90m';

/** Respect a non-TTY or NO_COLOR environment; a redirected report must stay readable. */
function paint(enabled) {
  return (code, text) => (enabled ? `${code}${text}${RESET}` : text);
}

function scoreLabel(score, c) {
  if (score === null) return c(GRAY, '    —');
  const text = String(score).padStart(3, ' ');
  if (score >= 90) return c(GREEN, `${text}`);
  if (score >= 70) return c(YELLOW, `${text}`);
  return c(RED, `${text}`);
}

function icon(score, c) {
  if (score === null) return c(GRAY, '·');
  if (score >= 90) return c(GREEN, '✓');
  if (score >= 70) return c(YELLOW, '~');
  return c(RED, '✗');
}

/**
 * One-line reason per pillar, built from decided findings only.
 * Undecided checks are counted separately: "we could not tell" is not a violation, and
 * printing it as one would overstate both the problem and our confidence.
 */
function summarize(ir, pillar) {
  const all = ir.findings.filter((f) => f.pillar === pillar);
  const decided = all.filter((f) => f.coverage !== 'incomplete');
  const undecided = all.length - decided.length;

  const parts = [];
  if (decided.length === 0) parts.push(all.length === 0 ? 'no findings' : 'no decided findings');
  else {
    const byRule = new Map();
    for (const f of decided) byRule.set(f.ruleId, (byRule.get(f.ruleId) ?? 0) + 1);
    parts.push(
      [...byRule.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([rule, count]) => `${rule} ×${count}`)
        .join(' · ')
    );
  }
  if (undecided > 0) parts.push(`${undecided} undecided`);
  return parts.join(' · ');
}

const IMPACT_RANK = { critical: 0, serious: 1, moderate: 2, minor: 3 };

export function renderTerminal({ ir, scores, hash }, { color = process.stdout.isTTY } = {}) {
  const c = paint(color);
  const lines = [];

  lines.push('');
  lines.push(`  ${c(BOLD, 'web-spark')}  ${c(DIM, ir.provenance.uri ?? '')}`);
  lines.push('');

  for (const pillar of PILLARS) {
    const score = scores[pillar];
    lines.push(
      `  ${pillar.toUpperCase().padEnd(12)}${scoreLabel(score, c)}  ${icon(score, c)}  ` +
        c(DIM, score === null ? 'not measured in this build' : summarize(ir, pillar))
    );
  }

  const worst = [...ir.findings]
    .filter((f) => f.pillar === 'accessible' && f.impact !== 'minor')
    .sort((a, b) => (IMPACT_RANK[a.impact] ?? 9) - (IMPACT_RANK[b.impact] ?? 9))
    .slice(0, 6);

  if (worst.length) {
    lines.push('');
    for (const f of worst) {
      lines.push(
        `  ${c(RED, '✗')} ${f.ruleId.padEnd(16)} ${c(DIM, f.impact.padEnd(9))} ` +
          c(GRAY, (f.selector ?? '').slice(0, 48))
      );
    }
    const remaining = ir.findings.length - worst.length;
    if (remaining > 0) lines.push(`  ${c(GRAY, `  … ${remaining} more finding(s)`)}`);
  }

  const measured = PILLARS.filter((p) => scores[p] !== null);
  const overall =
    measured.length === 0
      ? null
      : Math.round(measured.reduce((sum, p) => sum + scores[p], 0) / measured.length);

  lines.push('');
  lines.push(
    `  ${c(BOLD, 'CONFORMANCE')} ${scoreLabel(overall, c)}  ${c(DIM, band(overall))}` +
      (measured.length < PILLARS.length
        ? c(GRAY, `  (${measured.length}/${PILLARS.length} pillars measured)`)
        : '')
  );
  const issues = ir.environment?.issues ?? [];
  if (issues.length) {
    lines.push(
      `  ${c(GRAY, `environment could not evaluate ${issues.length} check(s) — e.g. ${issues[0].slice(0, 60)}`)}`
    );
  }
  lines.push(`  ${c(GRAY, `ir ${hash.slice(0, 12)}  ·  ${AUTOMATION_COVERAGE.note}`)}`);
  lines.push('');

  return lines.join('\n');
}
