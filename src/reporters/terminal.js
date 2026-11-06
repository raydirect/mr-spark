/**
 * Terminal reporter. This is the product's face for most people, so it is designed,
 * not dumped: one line per pillar, the worst findings first, and the honest caveat
 * printed every single time.
 *
 * Presentation only. Every verdict — which findings are decided, what a pillar's summary is,
 * what the conformance score is — comes from src/view-model.js, so the terminal and the HTML
 * report cannot disagree about the same IR.
 */

import { AUTOMATION_COVERAGE } from '../score.js';
import { PILLARS } from '../ir.js';
import { DISPLAY, ENV } from '../config/constants.js';
import { copy } from '../config/copy.js';
import { band, tone } from '../config/thresholds.js';
import { buildView, pillarSummary } from '../view-model.js';
import { sortByImpact, isDecided } from '../vocabulary.js';

const RESET = '\u001b[0m';
const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const GREEN = '\u001b[32m';
const GRAY = '\u001b[90m';

const TONE_COLOUR = { good: GREEN, warn: YELLOW, bad: RED, none: GRAY };
const TONE_ICON = { good: '✓', warn: '~', bad: '✗', none: '·' };

function paint(enabled) {
  return (code, text) => (enabled ? `${code}${text}${RESET}` : text);
}

/**
 * Whether to colourise.
 *
 * Previously the reporter took `process.stdout.isTTY` directly and a comment claimed NO_COLOR
 * was respected when it was not — a documented behaviour that did not exist. Order of
 * precedence follows the conventions: an explicit flag wins, then NO_COLOR (any value,
 * including empty), then FORCE_COLOR, then the TTY check.
 */
export function shouldColour({ explicit, env = process.env, isTTY = process.stdout.isTTY } = {}) {
  if (explicit !== undefined) return explicit;
  if (Object.prototype.hasOwnProperty.call(env, ENV.noColor)) return false;
  if (Object.prototype.hasOwnProperty.call(env, ENV.forceColor)) return true;
  return Boolean(isTTY);
}

function scoreCell(score, c) {
  const colour = TONE_COLOUR[tone(score)] ?? GRAY;
  // Column width must cover the widest value (three digits) AND the em dash used for
  // "not measured", so the pillar column stays aligned for measured and unmeasured rows alike.
  const cell = score === null ? copy('state.unmeasured') : String(score);
  return c(colour, cell.padStart(DISPLAY.scoreCellWidth, ' '));
}

/** Rule ids are ASCII padded; this keeps alignment explicit rather than incidental. */
function decidingWidth(ruleId) {
  return ruleId;
}

function iconCell(score, c) {
  const t = tone(score);
  return c(TONE_COLOUR[t] ?? GRAY, TONE_ICON[t] ?? '·');
}

export function renderTerminal(
  { ir, scores, hash },
  { color = true, quiet = false } = {}
) {
  const c = paint(color);
  const view = buildView(ir, scores);
  const lines = [];

  // Quiet mode is a machine contract for scripts: one tab-separated line per decided finding,
  // no pillar table, no prose, no trailing caveat. Stable field order, ids included.
  if (quiet) {
    for (const finding of sortByImpact(ir.findings.filter(isDecided))) {
      lines.push(
        [finding.ruleId, finding.impact, finding.selector ?? '', finding.id].join('\t')
      );
    }
    return lines.join('\n');
  }

  lines.push('');
  lines.push(`  ${c(BOLD, 'web-spark')}  ${c(DIM, ir.provenance.uri ?? '')}`);
  lines.push('');

  for (const pillar of PILLARS) {
    const score = scores[pillar] ?? null;
    lines.push(
      `  ${pillar.toUpperCase().padEnd(DISPLAY.terminalPillarWidth)}${scoreCell(score, c)}  ` +
        `${iconCell(score, c)}  ` +
        c(
          DIM,
          score === null ? copy('state.notMeasured') : pillarSummary(ir, pillar)
        )
    );
  }

  // ONE list, worst first, decided and undecided together. Splitting undecided checks into a
  // footnote below the violations was the most misleading thing the first report did: a CRITICAL
  // undecided check (contrast) sorted below three decided serious ones and effectively vanished.
  //
  // Symbols rather than colour alone, because colour is unavailable in half the terminals this
  // will run in: an undecided check is genuinely NOT a violation, so it must not wear the same
  // mark as one. It gets a question mark, not a cross.
  const shown = sortByImpact(ir.findings).slice(0, DISPLAY.terminalFindings);
  if (shown.length) {
    lines.push('');
    for (const finding of shown) {
      const decided = isDecided(finding);
      const mark = decided ? c(RED, '✗') : c(YELLOW, '?');
      const rule = decidingWidth(finding.ruleId).padEnd(DISPLAY.terminalRuleWidth);
      lines.push(
        `    ${mark} ${c(decided ? RESET : DIM, rule)}` +
          `${c(DIM, finding.impact.padEnd(DISPLAY.terminalImpactWidth))} ` +
          c(GRAY, (finding.selector ?? '').slice(0, DISPLAY.terminalSelectorWidth))
      );
    }
    const remaining = ir.findings.length - shown.length;
    if (remaining > 0) {
      lines.push(`    ${c(GRAY, copy('state.moreFindings', remaining))}`);
    }
  }

  lines.push('');
  lines.push(
    `  ${c(BOLD, 'CONFORMANCE')} ${scoreCell(view.overall.score, c)}  ` +
      `${c(DIM, band(view.overall.score))}` +
      (view.coverage.measured < view.coverage.total
        ? c(GRAY, `  (${copy('state.pillarsMeasuredShort', view.coverage.measured, view.coverage.total)})`)
        : '')
  );

  const undecidedCount = ir.findings.filter((finding) => !isDecided(finding)).length;
  if (undecidedCount > 0) {
    lines.push(`    ${c(GRAY, copy('state.undecidedFooter', undecidedCount))}`);
  }

  const issues = ir.environment?.issues ?? [];
  if (issues.length) {
    lines.push(
      `  ${c(GRAY, copy('state.environmentIssues', issues.length, issues[0].slice(0, DISPLAY.environmentIssueWidth)))}`
    );
  }
  lines.push(`  ${c(GRAY, `${copy('labels.irHandle', hash.slice(0, 12))}  ·  ${AUTOMATION_COVERAGE.note}`)}`);
  lines.push('');

  return lines.join('\n');
}
