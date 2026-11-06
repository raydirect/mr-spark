/**
 * Operational constants: limits, defaults, environment names.
 *
 * This is the file for numbers that were previously scattered as literals — a port in two
 * places (one of them inside the help text), truncation widths, top-N counts, timeouts. If a
 * number changes behaviour, it belongs here and it gets a name that says what it does.
 */

/** Defaults the CLI uses when a flag is absent. */
export const DEFAULTS = Object.freeze({
  port: 4321,
  host: '0.0.0.0',
  out: 'spark-report.html',
  format: 'terminal',
  /** How long a URL fetch may take before the run is abandoned. */
  fetchTimeoutMs: 15_000,
});

/** Display limits. These shape what a reader sees, not what the tool computes. */
export const DISPLAY = Object.freeze({
  /** Characters of the engine's own reason kept for an undecided check. */
  reasonLength: 200,
  /** Characters of the failing element's markup kept in the IR. */
  snippetLength: 160,
  /** Width of a score cell: three digits plus the em dash used for "not measured". */
  scoreCellWidth: 4,
  /** Column reserved for the "≤" upper-bound marker, present or blank, so rows align. */
  boundWidth: 2,
  /** Distinct rules named in a one-line pillar summary before the rest are implied. */
  summaryRules: 3,
  /** Findings listed in the terminal before it stops enumerating. */
  terminalFindings: 6,
  /** Selector characters in the terminal finding list. */
  terminalSelectorWidth: 48,
  /** Rule id column width in the terminal finding list. Rule ids reach 21 characters. */
  terminalRuleWidth: 24,
  /** Impact column width in the terminal finding list. */
  terminalImpactWidth: 9,
  /** Pillar name column width in the terminal score table. */
  terminalPillarWidth: 12,
  /** Characters of an environment issue quoted in the terminal. */
  environmentIssueWidth: 60,
});

/** Environment variables the tool honours. Named, so they are greppable and documentable. */
export const ENV = Object.freeze({
  /** Reproducible-builds convention: fixes the collection timestamp. */
  sourceDateEpoch: 'SOURCE_DATE_EPOCH',
  /** Standard opt-out from ANSI colour. */
  noColor: 'NO_COLOR',
  /** Standard opt-in to ANSI colour when piping. */
  forceColor: 'FORCE_COLOR',
});

/** Exit codes. A public contract: scripts depend on these numbers. */
export const EXIT = Object.freeze({
  ok: 0,
  thresholdNotMet: 1,
  couldNotRun: 2,
});
