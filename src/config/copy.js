/**
 * Every user-facing string, keyed.
 *
 * The point is not translation today. It is that prose referenced by id can be changed,
 * reviewed, pluralised and eventually localised without touching a renderer. A sentence
 * embedded in a template literal is a sentence nobody can find again.
 *
 * Terminal output and report prose both read from here.
 */

import { NAME, BIN } from './brand.js';

export const COPY = Object.freeze({
  // ---------------------------------------------------------------- identity / help
  tagline: 'every artifact proves itself',

  usage: {
    usage: 'Usage',
    check: 'audit a page',
    report: 'build a shareable HTML report',
    help: 'this text',
    version: 'version',
    options: 'Options',
    format: 'check output format (default: terminal)',
    failUnder: 'exit 1 when conformance is below this score',
    noColor: 'disable ANSI colour',
    out: 'report: write HTML here (default: ./spark-report.html)',
    serve: 'report: also serve it over HTTP',
    port: 'report: port for --serve (default: 4321)',
    quiet: 'machine output: one tab-separated line per finding, no prose',
    config: 'path to spark.config.json (default: alongside the target)',
    exitCodes: 'Exit codes',
    exitOk: 'audit completed, thresholds met',
    exitThreshold: 'audit completed, thresholds not met',
    exitCouldNotRun: 'audit could not run (bad input, missing engine)',
    measuredNote:
      'Other pillars report "—" until they are built; an unmeasured pillar is a gap, never a passing grade.',
  },

  // ---------------------------------------------------------------- report sections
  headings: {
    conformance: 'Conformance report',
    result: 'Result',
    scores: 'Scores',
    findings: 'Findings',
    undecided: 'Could not be decided automatically',
    interpretation: 'What this score can and cannot tell you',
    provenance: 'Provenance',
    reproduce: 'Reproduce this',
  },

  // ---------------------------------------------------------------- states
  state: {
    notMeasured: 'not measured in this build',
    fragmentNotice:
      'this input is a fragment, not a whole page — checks about the document (title, language,' +
      ' skip link) are undecided here, because they describe the page it was taken from',
    noFindings: 'no findings',
    noDecidedFindings: 'no decided findings',
    noFindingsBody: 'No decided findings.',
    unmeasured: '—',
    /** A score where checks remain undecided is an upper bound, and the glyph says so. */
    upperBound: '≤',
    upperBoundNote: (n) =>
      `at most — ${n} check(s) could not be decided, so this is an upper bound, not a measurement`,
    undecidedCount: (n) => `${n} undecided`,
    suppressedCount: (n) => `${n} suppressed`,
    suppressedHeading: (n) =>
      n === 1
        ? '1 finding below is marked suppressed: spark.config.json waived it with a stated reason, so it does not affect the score.'
        : `${n} findings below are marked suppressed: spark.config.json waived them with stated reasons, so they do not affect the score.`,
    allSuppressed: (n) =>
      n === 1
        ? 'the only finding here was waived by configuration'
        : `all ${n} findings here were waived by configuration`,
    suppressedFooter: (n) =>
      n === 1
        ? '1 waiver — priced at zero, kept visible so it is reviewed rather than forgotten'
        : `${n} waivers — priced at zero, kept visible so they are reviewed rather than forgotten`,
    suppressedTitle: 'Suppressed by configuration',
    suppressedExplanation:
      'These findings were reported and then suppressed by spark.config.json with a stated reason. They do not affect the score. Each one is listed so the suppression is visible in review, not hidden in a config file.',
    /**
     * The footer used to say "could not be decided in this environment", which was false for two
     * thirds of a real page's undecided checks: markup alone cannot say whether an aria-label is
     * well supported on a div, in any environment. Naming the two causes is the whole point.
     */
    undecidedFooter: (n, environment = 0, judgement = 0) => {
      if (!n) return '';
      const parts = [];
      if (environment) {
        parts.push(`${environment} need a capability this run did not have (a canvas)`);
      }
      if (judgement) {
        parts.push(`${judgement} cannot be answered from markup by any environment`);
      }
      return `? = could not be decided (${n}): ${parts.join('; ')}. Excluded from the score; not violations.`;
    },
    undecidedLegend:
      '? = no environment can answer this from markup (a judgement call, usually worth checking)   ~ = this run lacked the capability (a canvas)',
    undecidedKindsLabel: (environment, judgement) =>
      environment || judgement
        ? `${environment} environment, ${judgement} judgement`
        : 'none',
    findingsCount: (n) => `Findings (${n})`,
    findingsHeading: (decided, undecided) =>
      undecided > 0 ? `Findings (${decided} violations, ${undecided} undecided)` : `Findings (${decided})`,
    couldNotBeDecided: (n) => `Could not be decided automatically (${n})`,
    moreFindings: (n) => `… ${n} more finding(s)`,
    pillarsMeasured: (measured, total) => `(${measured} of ${total} pillars measured)`,
    pillarsMeasuredPlain: (measured, total) => `${measured} of ${total} pillars measured`,
    pillarsMeasuredShort: (measured, total) => `${measured}/${total} pillars measured`,
    environmentIssues: (n, example) =>
      `environment could not evaluate ${n} check(s) — e.g. ${example}`,
    environmentLimits: (n, example) =>
      `Environment limits encountered: ${n} (for example: ${example}).`,
    undecidedExplanation:
      'These checks are excluded from the score and are NOT violations. They are questions that got no answer, for one of two reasons, and the difference matters: an environment question is our blindness — computed contrast needs a canvas this run did not have — while a judgement question cannot be answered from markup at all, because it depends on the accessibility tree the browser builds or on what a person sees. A judgement question is usually worth going and looking at.',
    reportWritten: (path) => `report written to ${path}`,
    serving: (url) => `serving at ${url}  (Ctrl+C to stop)`,
  },

  // ---------------------------------------------------------------- the honest caveat
  caveat: {
    short:
      'Automated checks cover a minority of accessibility criteria. Absence of findings does not mean a page is accessible.',
    long: (criteriaShare, volumeShare) =>
      `Automated checks cover roughly ${criteriaShare} of accessibility criteria (about ${volumeShare} of issue volume, because the most common failures are the machine-detectable ones). Absence of findings does not mean this page is accessible. An unmeasured pillar is a gap in the tool, not a passing grade.`,
    determinism:
      'The report is a pure function of the target, the engine version and the score spec, so the same command produces the same findings — and the same score — anywhere.',
  },

  // ---------------------------------------------------------------- labels
  labels: {
    rule: 'rule',
    pillar: 'pillar',
    engine: 'engine',
    ir: 'IR',
    scoreSpec: 'score spec',
    source: 'source',
    collected: 'collected',
    irHash: 'ir hash',
    identifier: 'Identifier',
    undecided: 'undecided',
    suppressed: 'suppressed',
    undecidedEnvironment: 'needs a canvas',
    undecidedJudgement: 'needs a browser',
    suppressedBecause: (reason) => `Suppressed because: ${reason}`,
    generatedBy: (version) =>
      `Generated by ${NAME} ${version}. This report is a summary of automated findings, not a certification.`,
    irHandle: (hash) => `ir ${hash}`,
    skipToContent: 'Skip to content',
  },

  // ---------------------------------------------------------------- CLI errors
  errors: {
    unknownArgument: (arg) => `Unknown argument: ${arg}`,
    unknownFormat: (format) => `Unknown format: ${format}`,
    noTarget: 'no target given',
    cannotRead: (name) => `Cannot read ${name} — no such file`,
    unreachable: (target, cause) => `Could not reach ${target}: ${cause}`,
    badStatus: (target, status) => `${target} returned ${status}`,
    missingDependency: (name, where, cause) =>
      `Cannot load the "${name}" engine in ${where}. Run \`npm ci\` from the project root, then run this command again from that same directory. Underlying error: ${cause}`,
  },

  /** Prefix for anything written to stderr by the CLI. */
  errorPrefix: (message) => `${BIN}: ${message}`,
});

/** Look up a copy key by dotted path. Throws on a typo instead of rendering `undefined`. */
export function copy(path, ...args) {
  const value = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), COPY);
  if (value === undefined) throw new Error(`copy: unknown key "${path}"`);
  return typeof value === 'function' ? value(...args) : value;
}
