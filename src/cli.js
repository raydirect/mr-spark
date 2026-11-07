/**
 * CLI surface. Thin on purpose: parse arguments, load input, call the engine, hand the
 * result to a reporter. No analysis lives here — see src/engine.js for the rule.
 *
 * Options are declared once, as data, in OPTIONS below. The parser, the usage text and the
 * validation all read that same table, so help text can never document a flag that does not
 * exist — or miss one that does.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { analyze } from './engine.js';
import { loadDocumentSet, lowerSet } from './lower.js';
import { emit } from './emit.js';
import { formatMessage } from './formats/index.js';
import { scoreAll } from './score.js';
import { contentHash, IR_VERSION } from './ir.js';
import { renderTerminal, shouldColour } from './reporters/terminal.js';
import { buildJsonReport, renderJson } from './reporters/json.js';
import { renderReport } from './reporters/html.js';
import { serveReport } from './reporters/serve.js';
import { checkInstall, installMessage } from './require.js';
import { applySuppressions, configPathFor, loadConfig, ConfigError } from './suppress.js';
import { resolveTargets } from './targets.js';
import {
  BASELINE_FILENAME,
  BaselineError,
  compare,
  readBaseline,
  renderGate,
  snapshot,
  writeBaseline,
} from './baseline.js';
import { buildSarif, renderSarif } from './reporters/sarif.js';
import { DEFAULTS, ENV, EXIT } from './config/constants.js';
import { NAME, VERSION, BIN } from './config/brand.js';
import { copy } from './config/copy.js';

const COMMANDS = {
  check: 'check',
  report: 'report',
  baseline: 'baseline',
  lower: 'lower',
  emit: 'emit',
};

/**
 * The option table. `takesValue` decides whether the flag consumes the next token; `key` is
 * the field it writes. Adding a flag here makes it appear in --help automatically.
 */
const OPTIONS = [
  { flag: '--format', key: 'format', takesValue: true, values: ['terminal', 'json', 'sarif'], helpKey: 'format' },
  {
    flag: '--ci',
    key: 'ci',
    takesValue: false,
    value: true,
    helpKey: 'ci',
    warnWhen: (parsed) => (parsed.command === COMMANDS.baseline ? copy('usage.warnCiOnBaseline') : null),
  },
  { flag: '--baseline', key: 'baseline', takesValue: true, helpKey: 'baselinePath' },
  {
    flag: '--strict',
    key: 'strict',
    takesValue: false,
    value: true,
    helpKey: 'strict',
    warnWhen: (parsed) => (parsed.ci ? null : copy('usage.warnStrict')),
  },
  { flag: '--fail-under', key: 'failUnder', takesValue: true, coerce: Number, validate: isScore, helpKey: 'failUnder' },
  { flag: '--no-color', key: 'color', takesValue: false, value: false, helpKey: 'noColor' },
  { flag: '--out', key: 'out', takesValue: true, helpKey: 'out' },
  { flag: '--serve', key: 'serve', takesValue: false, value: true, helpKey: 'serve' },
  { flag: '--port', key: 'port', takesValue: true, coerce: Number, validate: isPort, helpKey: 'port' },
  { flag: '--quiet', key: 'quiet', takesValue: false, value: true, helpKey: 'quiet' },
  { flag: '--config', key: 'config', takesValue: true, helpKey: 'config' },
  { flag: '--settings', key: 'settings', takesValue: true, helpKey: 'settings' },
  { flag: '--help', key: 'help', takesValue: false, value: true, alias: '-h', helpKey: 'help' },
  { flag: '--version', key: 'version', takesValue: false, value: true, alias: '-v', helpKey: 'version' },
];

function isScore(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function isPort(value) {
  return Number.isInteger(value) && value >= 0 && value <= 65535;
}

/** The usage text, derived from the same table the parser uses. */
export function usage() {
  const rows = [
    ['check  <file|dir|url> [more…]', copy('usage.check')],
    ['report <file.html|url>', copy('usage.report')],
    ['baseline <file|dir|url> [more…]', copy('usage.baseline')],
    ['lower  <name.spark.scene.json>', copy('usage.lower')],
    ['emit   <name.spark.scene.json>', copy('usage.emit')],
  ];
  const optionRows = OPTIONS.map((option) => {
    const label = option.takesValue ? `${option.flag} <value>` : option.flag;
    return [label, copy(`usage.${option.helpKey}`)];
  });
  const width = Math.max(...[...rows, ...optionRows].map(([label]) => label.length)) + 3;
  const line = ([label, description]) => `    ${label.padEnd(width)}${description}`;

  return `
  ${NAME} — ${copy('tagline')}

  ${copy('usage.usage')}
${rows.map(line).join('\n')}

  ${copy('usage.options')}
${optionRows.map(line).join('\n')}

  ${copy('usage.exitCodes')}
    ${EXIT.ok}  ${copy('usage.exitOk')}
    ${EXIT.thresholdNotMet}  ${copy('usage.exitThreshold')}
    ${EXIT.couldNotRun}  ${copy('usage.exitCouldNotRun')}

  Currently measured: accessible. ${copy('usage.measuredNote')}
`;
}

/** Kept as an export for tests and callers that only need the text. */
export const USAGE = usage();

export function parseArgs(argv) {
  const opts = {
    command: COMMANDS.check,
    format: DEFAULTS.format,
    failUnder: null,
    color: undefined,
    quiet: false,
    target: null,
    // `check` and `baseline` take a list — a repo-wide gate is the point of having a baseline at all.
    // `target` stays the first positional, because the one-page commands and the report's
    // reproduce-command are about a single page.
    targets: [],
    out: null,
    serve: false,
    port: DEFAULTS.port,
  };
  const rest = [...argv];

  // Optional explicit subcommand. `spark check <target>` and `spark <target>` are equivalent,
  // which keeps the shortest possible path to first value.
  if (Object.hasOwn(COMMANDS, rest[0])) opts.command = rest.shift();

  const byFlag = new Map();
  for (const option of OPTIONS) {
    byFlag.set(option.flag, option);
    if (option.alias) byFlag.set(option.alias, option);
  }

  while (rest.length) {
    const arg = rest.shift();
    if (arg === '--') {
      // Everything after `--` is a target, even if it starts with a dash.
      for (const value of rest) if (!opts.targets.includes(value)) opts.targets.push(value);
      rest.length = 0;
      opts.target ??= opts.targets[0] ?? null;
      continue;
    }

    const [flag, inline] = arg.startsWith('--') && arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, undefined];

    const option = byFlag.get(flag);
    if (option) {
      const raw = option.takesValue ? (inline ?? rest.shift()) : undefined;
      if (option.takesValue && raw === undefined) {
        throw new Error(`${flag} requires a value`);
      }
      const value = option.takesValue
        ? option.coerce
          ? option.coerce(raw)
          : raw
        : option.value;
      if (option.values && !option.values.includes(value)) {
        throw new Error(copy('errors.unknownFormat', value));
      }
      if (option.validate && !option.validate(value)) {
        throw new Error(`${flag} is out of range: ${value}`);
      }
      opts[option.key] = value;
      continue;
    }

    if (!arg.startsWith('-')) {
      // A repeated path is the same page audited once, not twice — and a directory argument is a set of
      // pages, resolved below by `resolveTargets`.
      if (!opts.targets.includes(arg)) opts.targets.push(arg);
      opts.target ??= arg;
      continue;
    }
    throw new Error(copy('errors.unknownArgument', arg));
  }

  return opts;
}

/**
 * A committed path is friendlier than an absolute one, but only while it stays inside the project: a message
 * reading `../../../tmp/scratch/x.json` advertises the tmpdir and hides the file. Past the boundary, show
 * what was asked for.
 */
function shownPath(path) {
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith('..') ? rel : path;
}

/**
 * `--out` makes the directory it was asked to write into, because `mkdir -p .spark` in a workflow is the same
 * instruction in a language with more ways to get it wrong, and a bare ENOENT is not an answer to "write this
 * file". `spark baseline` has behaved this way since the gate existed; the machine formats follow it.
 */
async function writeArtifact(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, 'utf8');
}

/**
 * Read the target into `{ html, uri, source }`. Network fetching is guarded by a timeout so a
 * hanging server cannot hang CI; a slow site should fail the audit quickly and honestly.
 */
async function loadTarget(target) {
  if (/^https?:\/\//i.test(target)) {
    let response;
    try {
      response = await fetch(target, {
        redirect: 'follow',
        signal: AbortSignal.timeout(DEFAULTS.fetchTimeoutMs),
      });
    } catch (cause) {
      throw new Error(copy('errors.unreachable', target, cause.message));
    }
    if (!response.ok) throw new Error(copy('errors.badStatus', target, response.status));
    return { html: await response.text(), uri: target, source: 'url' };
  }

  const path = resolve(target);
  let html;
  try {
    html = await readFile(path, 'utf8');
  } catch {
    throw new Error(copy('errors.cannotRead', basename(path)));
  }
  return { html, uri: pathToFileURL(path).href, source: 'file' };
}

/**
 * `lower` and `emit`, which share one flow: read the set, resolve it, then either hand back the IR or
 * write the page. Reporting lives here because both commands owe the reader the same three sentences —
 * what was read, whether anything was refused, and what bytes changed.
 */
async function runSpine(command, opts, { stdout, stderr }) {
  // `spark emit page.ir.json` is the second half alone. The plan describes the pipeline as
  // `lower` → IR → `emit`, and a design tool that already holds an IR should not have to re-lower the
  // documents it no longer has.
  if (command === COMMANDS.emit && /\.ir\.json$/.test(opts.target)) {
    return emitFromIR(opts, { stdout, stderr });
  }

  let set;
  try {
    set = await loadDocumentSet(opts.target, { settingsPath: opts.settings ?? null });
  } catch (error) {
    stderr.write(`${copy('errorPrefix', error.message)}\n`);
    return EXIT.couldNotRun;
  }

  if (!set.docs.scene && command === COMMANDS.emit) {
    // A settings or motion document alone is a real IR and not a real page. Saying which half is
    // missing is more useful than emitting an empty body.
    stderr.write(`${copy('errorPrefix', copy('spine.irNoDocument'))}\n`);
    return EXIT.couldNotRun;
  }

  const lowered = lowerSet(set);
  const unresolved = Object.values(lowered.validated).reduce((total, result) => total + result.unresolved.length, 0);
  const summary = copy(
    'spine.lowered',
    Object.keys(set.paths).length,
    lowered.ir.document?.componentIds.length ?? 0,
    lowered.table.size,
    lowered.ir.motion?.items.length ?? 0,
  );
  const verdict = copy('spine.verdict', lowered.errors.length, lowered.notices.length, unresolved);
  const judgement = lowered.complete ? copy('spine.complete') : copy('spine.incomplete');
  stdout.write(`  ${summary}\n  ${verdict} · ${judgement}\n`);

  for (const error of lowered.errors) {
    stderr.write(`  \u2717 ${formatMessage(error)}\n`);
  }
  if (lowered.errors.length) return EXIT.couldNotRun;
  for (const notice of lowered.notices) {
    stdout.write(`  ~ ${formatMessage(notice)}\n`);
  }

  if (command === COMMANDS.lower) {
    const json = `${JSON.stringify(lowered.ir, null, 2)}\n`;
    if (opts.out) {
      await writeFile(opts.out, json, 'utf8');
      stdout.write(`  ${copy('spine.irWritten', opts.out)}\n`);
    } else {
      stdout.write(`${json}\n  ${copy('spine.irToStdout')}\n`);
    }
    return EXIT.ok;
  }

  const irHash = await contentHash(lowered.ir);
  const first = emit(lowered.ir, { irHash });
  const second = emit(lowered.ir, { irHash });
  const deterministic = Object.keys(first.files).every((file) => first.files[file] === second.files[file]);
  for (const refusal of first.refusals) {
    stderr.write(`  \u2717 ${copy('spine.refusal', refusal.path, refusal.note)} [${refusal.code}]\n`);
  }
  for (const notice of first.notices) {
    stdout.write(`  ~ ${copy('spine.refusal', notice.path, notice.note)}\n`);
  }
  if (first.refusals.length) {
    stderr.write(`  ${copy('spine.nothingWritten')}\n`);
    return EXIT.couldNotRun;
  }
  if (!deterministic) {
    stderr.write('  \u2717 the second emit differed from the first: this build is not reproducible, which is a bug in the emitter\n');
    return EXIT.couldNotRun;
  }

  const dir = opts.out ?? DEFAULTS.outDir;
  await writePage(dir, first.files, stdout);
  return EXIT.ok;
}

/**
 * Emit from an IR that was lowered earlier, possibly by another process on another machine. There is no
 * re-resolution here and no repair: the version must match, or the IR must carry a document, and either
 * way the answer is a refusal rather than a page assembled from a guess.
 */
async function emitFromIR(opts, { stdout, stderr }) {
  const path = resolve(opts.target);
  let ir;
  try {
    ir = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    stderr.write(`${copy('errorPrefix', `${basename(path)} is not a readable IR: ${error.message}`)}\n`);
    return EXIT.couldNotRun;
  }
  if (ir.ir !== IR_VERSION) {
    stderr.write(`${copy('errorPrefix', copy('spine.irVersion', String(ir.ir ?? 'none'), IR_VERSION))}\n`);
    return EXIT.couldNotRun;
  }
  if (!ir.document) {
    stderr.write(`${copy('errorPrefix', copy('spine.irNoDocument'))}\n`);
    return EXIT.couldNotRun;
  }

  const irHash = await contentHash(ir);
  const first = emit(ir, { irHash });
  const second = emit(ir, { irHash });
  for (const refusal of first.refusals) {
    stderr.write(`  \u2717 ${copy('spine.refusal', refusal.path, refusal.note)} [${refusal.code}]\n`);
  }
  if (first.refusals.length) {
    stderr.write(`  ${copy('spine.nothingWritten')}\n`);
    return EXIT.couldNotRun;
  }
  if (!Object.keys(first.files).every((file) => first.files[file] === second.files[file])) {
    stderr.write('  \u2717 the second emit differed from the first: this build is not reproducible, which is a bug in the emitter\n');
    return EXIT.couldNotRun;
  }
  await writePage(opts.out ?? DEFAULTS.outDir, first.files, stdout);
  return EXIT.ok;
}

/** The one place bytes hit disk for the spine, so both commands share the same failure behaviour. */
async function writePage(dir, files, stdout) {
  await mkdir(dir, { recursive: true });
  const written = [];
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    await writeFile(path, contents, 'utf8');
    const shown = relative(process.cwd(), path);
    written.push(shown.startsWith('..') ? path : shown);
  }
  stdout.write(`  ${copy('spine.wrote', written.join(', '))} · ${copy('spine.determinism')}\n`);
}

/** Returns a process exit code rather than calling process.exit, so it is testable. */
export async function main(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    stderr.write(`${copy('errorPrefix', error.message)}\n\n${USAGE}\n`);
    return EXIT.couldNotRun;
  }

  // A flag that means nothing on this command is not an error. Silence would let a workflow that typed
  // `--strict` without `--ci` believe it had the hard line, so it warns — through this same table, so a
  // flag can never advertise a warning its parser does not implement.
  for (const option of OPTIONS) {
    if (!option.warnWhen) continue;
    if (opts[option.key] === undefined || opts[option.key] === false) continue;
    const warning = option.warnWhen(opts);
    if (warning) stderr.write(`${copy('errorPrefix', warning)}\n`);
  }

  if (opts.help) {
    stdout.write(USAGE);
    return EXIT.ok;
  }
  if (opts.version) {
    stdout.write(`${VERSION}\n`);
    return EXIT.ok;
  }
  if (!opts.target) {
    stderr.write(`${copy('errorPrefix', copy('errors.noTarget'))}\n\n${USAGE}\n`);
    return EXIT.couldNotRun;
  }

  // The spine needs neither jsdom nor axe: it reads documents and writes documents. Running the
  // engine-install check here would fail a compile because a *checker's* optional dependency is absent.
  if (opts.command === COMMANDS.lower || opts.command === COMMANDS.emit) {
    // The spine reads one document and writes one artefact named after it, so a list is not a shortcut —
    // and taking the first entry would be the worst possible reading, because the second file would be
    // silently unwritten and look compiled.
    if (opts.targets.length > 1) {
      stderr.write(`${copy('errorPrefix', copy('errors.multiTarget', opts.command))}\n`);
      return EXIT.couldNotRun;
    }
    return runSpine(opts.command, opts, { stdout, stderr });
  }

  // Fail before doing any work if the install is incomplete, and say which directory is wrong.
  const install = checkInstall();
  if (!install.ok) {
    stderr.write(`${copy('errorPrefix', installMessage(install))}\n`);
    return EXIT.couldNotRun;
  }

  // ---- the run: every page in the arguments, in order, one IR each -----------------------------
  // No aggregate score is invented for a multi-page run: averaging pages would hide a broken page behind
  // nine fine ones, and the only number a maintainer trusts is the one next to their own file. The
  // multi-page-ness lives in the baseline file and in the gate, which is where a repo-wide verdict is the
  // point. `run` is one entry per page; single-target commands use `run[0]` and change nothing.
  let config = { suppressions: [], baseline: null, path: null };
  let run = [];
  try {
    const { pages } = await resolveTargets(opts.targets.length ? opts.targets : [opts.target], {
      cwd: process.cwd(),
    });
    // A directory is a set of pages, and only `check`/`baseline` know what to do with a set.
    if (pages.length > 1 && opts.command !== COMMANDS.check && opts.command !== COMMANDS.baseline) {
      throw new Error(copy('errors.multiTarget', opts.command));
    }
    // The config is looked up beside the project being audited, which is where a maintainer will
    // put it; falling back to the working directory covers `spark check <url>` from a repo root.
    config = await loadConfig(opts.config ?? configPathFor());
    for (const page of pages) {
      const target = await loadTarget(page.path ?? page.url);
      const result = await analyze(target);
      const suppression = applySuppressions(result.ir, config.suppressions);
      result.suppression = suppression;
      if (config.suppressions.length) result.scores = scoreAll(result.ir);
      run.push({ page: page.key, ir: result.ir, scores: result.scores, hash: result.hash });
    }
  } catch (error) {
    if (error instanceof ConfigError || error instanceof BaselineError) {
      stderr.write(`${copy('errorPrefix', error.message)}\n`);
      return EXIT.couldNotRun;
    }
    stderr.write(`${copy('errorPrefix', error.message)}\n`);
    return EXIT.couldNotRun;
  }
  const result = run[0];

  // ---- the gate file: `spark baseline` writes it, `spark check --ci` reads it ----------------
  // One rule for the path, so a laptop and a CI job cannot disagree about which file they mean:
  // `--baseline`, else `"baseline"` in spark.config.json, else ./.spark-baseline.json — and every
  // relative path resolves against the current directory, never against the target's directory, so
  // `spark check fixtures/real/x.html` cannot start writing baselines into fixtures.
  const baselinePath = resolve(opts.baseline ?? config.baseline ?? BASELINE_FILENAME);
  const multi = run.length > 1;

  if (opts.command === COMMANDS.baseline) {
    const next = snapshot(run);
    const file = await writeBaseline(baselinePath, next);
    if (opts.format === 'json') {
      // Asking for the machine format here means "show me what you wrote" — the file is written either
      // way, because a baseline printed to a CI log and never committed is not a baseline.
      stdout.write(`${JSON.stringify(next, null, 2)}\n`);
    }
    if (opts.format === 'sarif') stdout.write(renderSarif(buildSarif({ ...result, pages: run })));
    const shown = shownPath(file) || BASELINE_FILENAME;
    // Findings, not entries: three identical siblings are one entry and three findings, and the number a
    // reader compares against their report has to be the number the report printed.
    const found = next.pages.reduce((sum, entry) => sum + entry.findings.reduce((n, f) => n + f.count, 0), 0);
    const rules = new Set(next.pages.flatMap((entry) => entry.findings.map((f) => f.ruleId))).size;
    // A repo-wide write says how many pages it covered, because "44 findings adopted" reads the same in a
    // commit message whether it covers one page or the whole site — and only one of those is a gate.
    const line = multi
      ? found === 0
        ? copy('state.baselineEmptyPages', shown, run.length)
        : copy('state.baselineWrittenPages', shown, found, rules, run.length)
      : found === 0
        ? copy('state.baselineEmpty', shown)
        : copy('state.baselineWritten', shown, found, rules);
    stdout.write(`  ${line}\n`);
    return EXIT.ok;
  }

  let diff = null;
  if (opts.ci) {
    try {
      const baseline = await readBaseline(baselinePath);
      if (!baseline) {
        stderr.write(
          `${copy('errorPrefix', copy('errors.noBaseline', shownPath(baselinePath) || BASELINE_FILENAME))}\n`,
        );
        return EXIT.couldNotRun;
      }
      diff = compare(baseline, run, { strict: opts.strict === true });
      // A run that overlaps the baseline on nothing is not a clean build. The usual cause is a different
      // spelling of the same set (`baseline dist` in CI, `check .` on a laptop, which keys pages differently)
      // and the second is a rename or a moved page in this very commit. Both need the same fix — say what
      // was compared, or re-baseline — and neither of them is exit 0.
      if (diff.overlap === 0 && diff.pages.length && baseline.pages.length) {
        stderr.write(
          `${copy('errorPrefix', copy('gate.noOverlap', baseline.pages.length, diff.pages.length))}\n`
        );
        return EXIT.couldNotRun;
      }
    } catch (error) {
      // A baseline nobody can read is not a passing build. It is also not a failing one — the page was
      // never compared to anything — so it exits 2, the code that says "the gate did not run".
      if (error instanceof BaselineError) {
        stderr.write(`${copy('errorPrefix', error.message)}\n`);
        return EXIT.couldNotRun;
      }
      throw error;
    }
  }

  if (opts.command === COMMANDS.report && opts.format === 'terminal') {
    const out = opts.out ?? DEFAULTS.out;
    const html = renderReport(result, {
      reproduceCommand: `${BIN} check ${opts.targets.join(' ')}`,
      generatedAt: result.ir.provenance.collectedAt,
    });
    await writeFile(out, html, 'utf8');
    if (!opts.quiet) stdout.write(`${copy('state.reportWritten', out)}\n`);

    if (opts.serve) {
      const { url, close } = await serveReport({
        html,
        port: opts.port,
        host: DEFAULTS.host,
        target: opts.target,
      });
      stdout.write(`${copy('state.serving', url)}\n`);
      await new Promise((resolvePromise) => {
        const stop = () => {
          close();
          resolvePromise();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      });
    }
    return EXIT.ok;
  }

  const machine = opts.format === 'json' || opts.format === 'sarif';
  if (opts.format === 'sarif') {
    // The gate verdict rides inside the payload (`runs[0].properties.sparkGate`, and each result's
    // `baselineState`), so a code-scanning upload gets the judgement the exit code carries instead of a
    // second, drift-prone copy of it. A whole-repo run stays one SARIF *run* with one artifact per page:
    // code scanning is per-repository, and a run per page would split one verdict across many.
    const text = renderSarif(buildSarif(multi ? { ...result, pages: run, diff } : { ...result, diff }));
    if (opts.out) {
      await writeArtifact(resolve(opts.out), text);
      stdout.write(`${copy('state.reportWritten', opts.out)}\n`);
    } else {
      stdout.write(text);
    }
  } else if (opts.format === 'json') {
    // One page prints the report object it always printed. Many pages print a JSON *array* of those
    // objects, one per page: an envelope with new keys would be a third shape for every consumer to
    // learn, and an array is `jq '.[] | …'` with each element byte-identical to the single-page payload.
    const text = renderJson(multi ? run.map((page) => buildJsonReport(page)) : buildJsonReport(result));
    if (opts.out) {
      await writeArtifact(resolve(opts.out), text);
      stdout.write(`${copy('state.reportWritten', opts.out)}\n`);
    } else {
      stdout.write(text);
    }
  } else if (multi && opts.quiet) {
    // Quiet is a machine contract, so a repo-wide run keeps one row per finding and gains a fifth column:
    // which page it came from. A `cut -f1` over twelve pages is otherwise a list of rules with nowhere to go.
    const rows = run
      .map((page) => {
        const text = renderTerminal(page, { color: false, quiet: true });
        return text ? text.split('\n').map((line) => `${line}\t${page.page}`).join('\n') : '';
      })
      .filter(Boolean);
    stdout.write(`${rows.length ? `${rows.join('\n')}\n` : ''}`);
  } else if (multi) {
    // A directory of twelve pages prints twelve rows, not twelve reports: the row says which page to open,
    // and the gate lines below say which of them broke. One page at a time is still `spark check <page>`,
    // and that is the run that prints the full report.
    const found = (page) => (page.ir?.findings ?? []).filter((f) => !f.suppressed && f.coverage !== 'incomplete').length;
    const rows = run.map((page) =>
      copy(
        'state.pageRow',
        page.page,
        found(page),
        page.ir?.document?.elements ?? 0,
        page.scores?.accessible ?? page.ir?.score ?? '—'
      )
    );
    stdout.write(`${rows.join('\n')}\n`);
    stdout.write(`${copy('state.pagesTotal', run.length, run.reduce((n, page) => n + found(page), 0))}\n`);
  } else {
    const rendered = renderTerminal(result, {
      color: shouldColour({ explicit: opts.color, env }),
      quiet: opts.quiet,
    });
    // Quiet output is a machine contract: no leading or trailing blank line to strip, and one line per
    // finding in the fixed column order.
    stdout.write(opts.quiet ? (rendered ? `${rendered}\n` : '') : `${rendered}\n`);
  }

  // ---- the gate's verdict --------------------------------------------------------------------
  // Terminal output takes stdout, because for a human the sentence belongs to the report. A machine
  // format takes stderr instead: a workflow that pipes `--format sarif` into an uploader, or `--quiet`
  // into `cut -f1`, would otherwise choke on prose. Scripts read the exit code, and that never moves.
  if (diff) {
    const sink = machine || opts.quiet ? stderr : stdout;
    for (const line of renderGate(diff)) sink.write(`${line}\n`);
  }

  if (opts.failUnder !== null) {
    // Per page, never averaged: a build that passes nine pages and breaks the tenth is a broken build, and
    // a mean is how a 100-page site gets to hide one page at 12.
    const below = run.filter((page) => {
      const score = buildJsonReport(page).conformance.score;
      return score === null || score < opts.failUnder;
    });
    if (below.length) {
      for (const page of below.slice(0, 5)) {
        stderr.write(`${copy('errorPrefix', copy('state.belowThreshold', page.page, buildJsonReport(page).conformance.score ?? '—', opts.failUnder))}\n`);
      }
      if (below.length > 5) stderr.write(`  ${copy('gate.more', below.length - 5)}\n`);
      return EXIT.thresholdNotMet;
    }
  }
  if (diff && !diff.ok) return EXIT.thresholdNotMet;
  return EXIT.ok;
}

export { ENV };
