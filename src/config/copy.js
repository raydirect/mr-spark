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
    out: 'report: write HTML here (default: ./spark-report.html); emit: output directory (default: ./build); lower: IR file',
    serve: 'report: also serve it over HTTP',
    port: 'report: port for --serve (default: 4321)',
    quiet: 'machine output: one tab-separated line per finding, no prose',
    config: 'path to spark.config.json (default: alongside the target)',
    lower: 'lower a document set to the IR (JSON)',
    emit: 'lower a document set and write HTML + CSS',
    settings: 'document set: resolve tokens against this settings document instead of the one the scene references',
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

  // ---------------------------------------------------------------- document formats
  //
  // Validation messages live here for the same reason every other sentence does: a format whose
  // error text is scattered through the validator cannot be reviewed, and an author's ability to fix
  // a document depends on these lines more than on any schema.
  format: {
    root: 'the document root',
    unknownKind: (kind) => `Unknown document format "${kind}". The formats are scene, motion and settings.`,
    notAnObject: 'A document must be a JSON object at the top level.',
    versionMismatch: (implemented, found) =>
      `Format version mismatch: this build reads "${implemented}" and this document declares ${found === undefined ? 'nothing' : `"${found}"`}. Versions are refused, not guessed — a partially understood design document produces a confidently wrong page.`,
    required: (path, expected) => `${path} is required (${expected}).`,
    type: (path, expected, actual) => `${path} must be ${expected}, not ${actual}.`,
    const: (path, expected, actual) => `${path} must be exactly ${JSON.stringify(expected)}${actual === 'absent' ? '' : `, not ${JSON.stringify(actual)}`}.`,
    enum: (path, allowed, actual) =>
      `${path} must be one of ${allowed.map((v) => `"${v}"`).join(' | ')}. Got ${actual === 'absent' ? 'nothing' : JSON.stringify(actual)}.`,
    pattern: (path, pattern, actual) => `${path} is not in the expected form. Got ${JSON.stringify(actual)}, expected something matching /${pattern}/.`,
    keyPattern: (path, pattern, actual) => `${path}: the key ${JSON.stringify(actual)} is not a legal name here (/${pattern}/).`,
    minimum: (path, minimum, actual) => `${path} must be at least ${minimum}. Got ${actual}.`,
    maximum: (path, maximum, actual) => `${path} must be at most ${maximum}. Got ${actual}.`,
    minItems: (path, minItems, actual) => `${path} needs at least ${minItems} item(s); it has ${actual}.`,
    minLength: (path, minLength, actual) => `${path} is too short (${JSON.stringify(actual)}); minimum ${minLength} characters.`,
    maxLength: (path, maxLength, actual) => `${path} is too long; maximum ${maxLength} characters.`,
    unknownKey: (path, allowed, actual) =>
      `${path} is not a field of this document. ${allowed.length ? `The fields here are: ${allowed.join(', ')}.` : 'Nothing is allowed here.'} An unknown key is an error, not a hint — a typo that does nothing is how a design system rots.`,
    tokenGroup: (path, groups, actual) => `${path} may not reference "${String(actual).split('.')[0]}". The groups a document may reference are: ${groups.join(', ')}.`,
    unknownToken: (path, actual, nearest) =>
      `${path}: "${actual}" is not a token the settings document declares.${nearest ? ` Did you mean "${nearest}"?` : ' Declare it in the settings document, or use a literal and accept the lint.'}`,
    literalValue: (path, actual) =>
      `${path}: ${JSON.stringify(actual)} is written literally. Legal, and a lint — a value that appears twice is a bug waiting to disagree with itself.`,
    noBranch: (path, branches, actual, notes) =>
      `${path} matches none of: ${branches.join(' | ')}. Got ${JSON.stringify(actual)}.${notes?.length ? ` ${notes.join(' ')}` : ''}`,
    unknownDiscriminator: (path, discriminator, allowed, actual) =>
      `${path}: ${JSON.stringify(actual)} is not a known ${discriminator}. The ${discriminator}s this document accepts are: ${allowed.map((v) => `"${v}"`).join(' | ')}.`,
    branchChosen: (path, chosen) => `${path}: "${chosen}" decides which shape applies, so the errors below are read against that shape.`,
    tokenUnresolved: (path, actual) =>
      `${path}: "${actual}" is a token reference and no settings document was supplied, so it could not be resolved. Reported as undecided, never as valid.`,
    check: (id, path, note) => `${path ? `${path}: ` : ''}${note} [${id}]`,
    notice: (code, path, note) => `${path ? `${path}: ` : ''}${note}`,
    summary: (kind, errors, notices, unresolved) =>
      `${kind}: ${errors} error(s), ${notices} lint(s), ${unresolved} check(s) that could not be decided${unresolved ? ' — a settings document was not supplied' : ''}.`,
  },

  // ---------------------------------------------------------------- lower / emit
  /**
   * The spine's own voice. `check` reports on a page; `lower` and `emit` report on a *document set*,
   * and the sentences differ enough (errors vs. refusals, "nothing was written") that reusing the
   * audit's copy would make the CLI say something false.
   */
  spine: {
    lowered: (documents, components, tokens, motions) =>
      `lowered ${documents} document(s) · ${components} component(s) · ${tokens} token(s) · ${motions} motion item(s)`,
    verdict: (errors, lints, unresolved) =>
      `${errors} error(s) · ${lints} lint(s) · ${unresolved} unresolved reference(s)`,
    complete: 'every semantic check ran against this set',
    incomplete: 'a check could not run, so this set is not judgeable yet',
    wrote: (files) => `wrote ${files}`,
    refusalHead: (count) => `emit refused: ${count} fact(s) this build cannot honour`,
    refusal: (path, note) => `${path}: ${note}`,
    nothingWritten: 'nothing was written: a page with a dropped motion is not a partial result, it is a wrong one',
    irWritten: (file) => `IR written to ${file}`,
    irToStdout: 'pass --out <file> to write the IR instead of printing it',
    determinism: 'second run, byte-identical',
    irVersion: (found, wanted) =>
      `this IR was lowered by version ${found}; this build emits version ${wanted} — re-run \`spark lower\` rather than emit across versions`,
    irNoDocument: 'this IR carries no document — it was lowered from a motion or settings file alone, so there is no page to emit',
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
