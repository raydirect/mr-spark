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
    // The set is the point of the row: a directory is how a repo gets one verdict for one commit, and
    // `report`/`lower`/`emit` stay single-document on purpose (they write one artifact).
    check: 'audit a page, a directory of pages, or several paths',
    report: 'build a shareable HTML report',
    help: 'this text',
    version: 'version',
    options: 'Options',
    format: 'check output format (default: terminal)',
    failUnder: 'exit 1 when conformance is below this score',
    noColor: 'disable ANSI colour',
    out:
      'report: write HTML here (default: ./spark-report.html); --format json|sarif: write the payload here;' +
      ' emit: output directory (default: ./build); lower: IR file',
    serve: 'report: also serve it over HTTP',
    port: 'report: port for --serve (default: 4321)',
    quiet: 'machine output: one tab-separated line per finding, no prose',
    config: 'path to spark.config.json (default: alongside the target)',
    baseline: 'write the current findings — for one page or a whole directory — to .spark-baseline.json',
    ci: 'fail only on findings the baseline does not already have',
    baselinePath: 'path to the baseline file (default: ./.spark-baseline.json, or "baseline" in spark.config.json)',
    strict: 'with --ci: findings from rules the baseline never saw also block',
    lower: 'lower a document set to the IR (JSON)',
    emit: 'lower a document set and write HTML + CSS',
    settings: 'document set: resolve tokens against this settings document instead of the one the scene references',
    warnStrict: '--strict only means something next to --ci: it is a decision about what the gate blocks',
    warnCiOnBaseline:
      'ignored: `spark baseline` writes the file that --ci reads, so there is nothing to compare on this run',
    exitCodes: 'Exit codes',
    exitOk: 'audit completed, thresholds met',
    exitThreshold: 'audit completed, thresholds not met',
    exitCouldNotRun: 'audit could not run (bad input, missing engine, no baseline to compare against)',
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
    /**
     * The sentence a `spark baseline` run ends on. It says "the floor, not the failure" on purpose: the
     * reader has just been shown a few hundred findings, and the difference between adopting them and
     * giving up on the tool is whether that number reads as permission to ship or as a verdict.
     */
    baselineWritten: (file, findings, rules) =>
      `wrote ${file}: ${findings} finding(s) across ${rules} rule(s) are now the floor, not the failure`,
    // The page count belongs in the sentence because a one-page baseline and a whole-repo baseline that
    // both say "44 findings" look identical in a commit message, and are not the same agreement.
    baselineWrittenPages: (file, findings, rules, pages) =>
      `wrote ${file}: ${findings} finding(s) across ${rules} rule(s) on ${pages} page(s) are now the floor, not the failure`,
    baselineEmptyPages: (file, pages) =>
      `wrote ${file}: an empty baseline across ${pages} page(s) — nothing to fix today is not the same as nothing to gate tomorrow`,
    baselineEmpty: (file) =>
      `wrote ${file}: an empty baseline — this page has nothing to carry forward, and the gate will stop the ` +
      'first finding it ever sees',
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
    /**
     * A repo-wide run prints one row per page instead of one report per page. The numbers in a row are the
     * numbers that page's own report prints, so a row and a report can never disagree — and a page nobody
     * opened still gets its findings counted in the total below.
     */
    pageRow: (page, findings, elements, score) =>
      `  ${page} · ${findings} finding${findings === 1 ? '' : 's'} · ${elements} elements · score ${score}`,
    pagesTotal: (pages, findings) =>
      `  ${pages} page${pages === 1 ? '' : 's'} · ${findings} finding${findings === 1 ? '' : 's'} in total · run \`spark check <page>\` for one page's report`,
    // `--fail-under` is asked per page on purpose: a mean is how a 100-page site gets to ship one page at 12.
    belowThreshold: (page, score, threshold) =>
      `${page}: score ${score} is below the required ${threshold} — the other pages passing is not the question`,
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

  // ---------------------------------------------------------------- the gate
  /**
   * The baseline gate's sentences. Kept together because they are read in one screenful and because the
   * wording is the product: "400 known findings, +2 new" has to land as *progress you can keep*, not as
   * a wall of red that gets the workflow disabled.
   */
  gate: {
    summary: (blocking, escalated, resolved, unchanged) => {
      const parts = [];
      parts.push(blocking === 0 ? 'no new findings' : `${blocking} new`);
      if (escalated) parts.push(`${escalated} worse`);
      if (resolved) parts.push(`${resolved} fixed`);
      parts.push(`${unchanged} already known`);
      return `gate · ${parts.join(' · ')}`;
    },
    entry: (rule, count, anchor, impact) =>
      `+${count} ${rule} at ${anchor}${impact && impact !== 'unknown' ? ` (${impact})` : ''}`,
    escalated: (rule, from, to, anchor) => `${rule} went ${from} → ${to} at ${anchor}`,
    more: (n) => `… and ${n} more; run without --quiet to see the list`,
    adoptable: (count, rules) =>
      `${count} finding(s) come from rules this baseline predates (${rules}) — reported, not blocking. ` +
      'Run `spark baseline` to adopt them, or use --strict to block on them today.',
    specChanged: (from, to) =>
      `score spec changed since the baseline (${from} → ${to}): counts still compare, scores do not`,
    howToFix:
      'either fix them, or accept them deliberately with `spark baseline` and say why in the commit',
    /**
     * Multi-page runs. One line per page that moved, and a total line, because the question a build log
     * asks is "is anything worse" and the question a human asks next is "where".
     */
    pagesSummary: (pages, blocking, escalated, resolved, unchanged) => {
      const parts = [`${pages} page(s)`];
      parts.push(blocking === 0 ? 'no new findings' : `${blocking} new`);
      if (escalated) parts.push(`${escalated} worse`);
      if (resolved) parts.push(`${resolved} fixed`);
      parts.push(`${unchanged} already known`);
      return `gate · ${parts.join(' · ')}`;
    },
    // "unchanged" is only true of a page the file knows. A page it never listed has nothing to be unchanged
    // against, and printing that word over a page with 11 findings would be the most convincing lie in the log.
    page: (page, blocking, escalated, resolved, adoptable, isNew) => {
      const parts = [];
      if (blocking) parts.push(`${blocking} new`);
      if (escalated) parts.push(`${escalated} worse`);
      if (resolved) parts.push(`${resolved} fixed`);
      if (adoptable) parts.push(`${adoptable} to adopt`);
      if (!parts.length && isNew) parts.push('new page, nothing to fix');
      return `${page} · ${parts.length ? parts.join(' · ') : 'unchanged'}`;
    },
    newPages: (names) =>
      `${names.length} page(s) are not in the baseline (${names.join(', ')}) — their findings are reported, ` +
      'not blocking. Run `spark baseline` on the same set of pages to adopt them, or use --strict',
    morePages: (n) => `… and ${n} more page(s) with changes; run \`spark check <page> --ci\` for one at a time`,
    staleFormat: (version) =>
      `this baseline was written as version 1, which describes one page — it is being read as a one-page ` +
      `version ${version}. Run \`spark baseline\` on this set of pages to write the whole set down`,
    // The sentence for a run and a baseline with nothing in common, which is never a pass and never a
    // regression either: nothing was compared. It exits 2 for the same reason a missing baseline does.
    noOverlap: (recorded, audited) =>
      `the baseline records ${recorded} page(s) and this run audited ${audited} other page(s), so nothing ` +
      'was compared — the two commands have to be given the same target, or a page was renamed in this ' +
      'commit, in which case run `spark baseline` again and say so in the commit',
    gonePages: (names) =>
      `${names.length} page(s) in the baseline were not in this run (${names.join(', ')}) — nothing was fixed, ` +
      'the pages were not audited',
  },

  // ---------------------------------------------------------------- CLI errors
  errors: {
    unknownArgument: (arg) => `Unknown argument: ${arg}`,
    unknownFormat: (format) => `Unknown format: ${format}`,
    noTarget: 'no target given',
    cannotRead: (name) => `Cannot read ${name} — no such file`,
    unreachable: (target, cause) => `Could not reach ${target}: ${cause}`,
    badStatus: (target, status) => `${target} returned ${status}`,
    noBaseline: (file) =>
      `--ci needs a baseline and ${file} does not exist — run \`spark baseline\` once and commit the file. ` +
      'A gate with nothing to compare against cannot tell "no regressions" from "never checked", so it does not guess',
    baselineUnreadable: (cause) => `cannot read the baseline (${cause})`,
    baselineNotJson: (cause) => `is not valid JSON (${cause})`,
    baselineShape: 'the baseline must be a JSON object',
    baselineUnknownKey: (key) => `unknown key "${key}"`,
    baselineVersion: (found, readable, written) =>
      `unsupported baseline version ${found} — this build reads ${readable} and writes ${written}`,
    baselineNoFindings: '"findings" must be an array',
    baselineNoPages:
      '"pages" must be a non-empty array — a baseline that lists no pages gates nothing, which is not the same as a pass',
    baselinePageShape: 'every entry in "pages" must be an object',
    baselinePageKey: '"page" must be a non-empty path, as a string',
    baselineDuplicatePage: (page) => `duplicate page "${page}"`,
    baselineEntryShape: 'must be an object',
    baselineEntry: (index) => `findings[${index}] must be an object`,
    baselineEntryKey: 'every entry needs a "key" of the form rule@digest',
    baselineEntryCount: '"count" must be an integer of at least 1',
    baselineDuplicate: (key) => `duplicate entry "${key}"`,
    baselineKindMismatch: (was, now) =>
      `this baseline was written for a ${was} and you are checking a ${now}, which skips different rules — ` +
      'the comparison would find nothing to report and call that a pass. Re-run `spark baseline` on the same kind of input',
    duplicatePage: (page) =>
      `two arguments name the same page ("${page}") — pass the directory or the file, not both`,
    noPages: (inputs) =>
      `no HTML found under ${inputs}. A directory with no pages in it is not a passing audit, it is a run ` +
      'that looked at nothing, so it does not exit 0',
    // A second and third target are not folded into "and so on": the command that takes a set is a
    // different command, and the answer to "I meant all of them" has to be a command line, not a shrug.
    multiTarget: (command) =>
      `${command} writes one artifact for one document — give it a single file or URL. The command that takes ` +
      'a set is `spark check <dir>` (or several paths), which audits every page in it and gates them with one verdict',
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
