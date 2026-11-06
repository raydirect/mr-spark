/**
 * CLI surface. Thin on purpose: parse arguments, load input, call the engine, hand the
 * result to a reporter. No analysis lives here — see src/engine.js for the rule.
 *
 * Options are declared once, as data, in OPTIONS below. The parser, the usage text and the
 * validation all read that same table, so help text can never document a flag that does not
 * exist — or miss one that does.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import { analyze } from './engine.js';
import { renderTerminal, shouldColour } from './reporters/terminal.js';
import { buildJsonReport, renderJson } from './reporters/json.js';
import { renderReport } from './reporters/html.js';
import { serveReport } from './reporters/serve.js';
import { DEFAULTS, ENV, EXIT } from './config/constants.js';
import { NAME, VERSION, BIN } from './config/brand.js';
import { copy } from './config/copy.js';

const COMMANDS = {
  check: 'check',
  report: 'report',
};

/**
 * The option table. `takesValue` decides whether the flag consumes the next token; `key` is
 * the field it writes. Adding a flag here makes it appear in --help automatically.
 */
const OPTIONS = [
  { flag: '--format', key: 'format', takesValue: true, values: ['terminal', 'json'], helpKey: 'format' },
  { flag: '--fail-under', key: 'failUnder', takesValue: true, coerce: Number, validate: isScore, helpKey: 'failUnder' },
  { flag: '--no-color', key: 'color', takesValue: false, value: false, helpKey: 'noColor' },
  { flag: '--out', key: 'out', takesValue: true, helpKey: 'out' },
  { flag: '--serve', key: 'serve', takesValue: false, value: true, helpKey: 'serve' },
  { flag: '--port', key: 'port', takesValue: true, coerce: Number, validate: isPort, helpKey: 'port' },
  { flag: '--quiet', key: 'quiet', takesValue: false, value: true, helpKey: 'quiet' },
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
    ['check  <file.html|url>', copy('usage.check')],
    ['report <file.html|url>', copy('usage.report')],
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
      if (!opts.target && rest.length) opts.target = rest.shift();
      if (rest.length) throw new Error(copy('errors.unknownArgument', rest[0]));
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

    if (!arg.startsWith('-') && !opts.target) {
      opts.target = arg;
      continue;
    }
    throw new Error(copy('errors.unknownArgument', arg));
  }

  return opts;
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

/** Returns a process exit code rather than calling process.exit, so it is testable. */
export async function main(argv, { stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    stderr.write(`${copy('errorPrefix', error.message)}\n\n${USAGE}\n`);
    return EXIT.couldNotRun;
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

  let result;
  try {
    const target = await loadTarget(opts.target);
    result = await analyze(target);
  } catch (error) {
    stderr.write(`${copy('errorPrefix', error.message)}\n`);
    return EXIT.couldNotRun;
  }

  if (opts.command === COMMANDS.report) {
    const out = opts.out ?? DEFAULTS.out;
    const html = renderReport(result, {
      reproduceCommand: `${BIN} check ${opts.target}`,
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

  if (opts.format === 'json') {
    stdout.write(renderJson(buildJsonReport(result)));
  } else {
    const rendered = renderTerminal(result, {
      color: shouldColour({ explicit: opts.color, env }),
      quiet: opts.quiet,
    });
    // Quiet output is a machine contract: no leading or trailing blank line to strip.
    stdout.write(opts.quiet ? (rendered ? `${rendered}\n` : '') : `${rendered}\n`);
  }

  if (opts.failUnder !== null) {
    const overall = buildJsonReport(result).conformance.score;
    if (overall === null || overall < opts.failUnder) return EXIT.thresholdNotMet;
  }
  return EXIT.ok;
}

export { ENV };
