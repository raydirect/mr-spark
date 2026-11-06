/**
 * CLI surface. Thin on purpose: parse arguments, load input, call the engine, hand the
 * result to a reporter. No analysis lives here — see src/engine.js for the rule.
 */

import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import { writeFile } from 'node:fs/promises';

import { analyze } from './engine.js';
import { renderTerminal } from './reporters/terminal.js';
import { buildJsonReport, renderJson } from './reporters/json.js';
import { renderReport } from './reporters/html.js';
import { serveReport } from './reporters/serve.js';

export const USAGE = `
  web-spark — every artifact proves itself

  Usage
    spark check  <file.html|url>   audit a page
    spark report <file.html|url>   build a shareable HTML report
    spark --help                   this text
    spark --version                version

  Options
    --format terminal|json   check output format (default: terminal)
    --fail-under <score>     exit 1 when conformance is below this score
    --no-color               disable ANSI colour
    --out <file>             report: write HTML here (default: ./spark-report.html)
    --serve                  report: also serve it over HTTP
    --port <n>               report: port for --serve (default: 4321)

  Exit codes
    0  audit completed, thresholds met
    1  audit completed, thresholds not met
    2  audit could not run (bad input, missing engine)

  Currently measured: ${'accessible'}. Other pillars report "—" until they are built;
  an unmeasured pillar is a gap, never a passing grade.
`;

function parseArgs(argv) {
  const opts = {
    command: 'check',
    format: 'terminal',
    failUnder: null,
    color: undefined,
    target: null,
    out: null,
    serve: false,
    port: 4321,
  };
  const rest = [...argv];

  // Optional explicit subcommand. `spark check <target>` and `spark <target>` are equivalent,
  // which keeps the shortest possible path to first value.
  if (rest[0] === 'check' || rest[0] === 'report') opts.command = rest.shift();
  else opts.command = 'check';
  while (rest.length) {
    const arg = rest.shift();
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--version' || arg === '-v') opts.version = true;
    else if (arg === '--no-color') opts.color = false;
    else if (arg === '--serve') opts.serve = true;
    else if (arg === '--out') opts.out = rest.shift();
    else if (arg.startsWith('--out=')) opts.out = arg.slice('--out='.length);
    else if (arg === '--port') opts.port = Number(rest.shift());
    else if (arg.startsWith('--port=')) opts.port = Number(arg.slice('--port='.length));
    else if (arg === '--format') opts.format = rest.shift();
    else if (arg === '--fail-under') opts.failUnder = Number(rest.shift());
    else if (arg.startsWith('--format=')) opts.format = arg.slice('--format='.length);
    else if (arg.startsWith('--fail-under=')) opts.failUnder = Number(arg.slice('--fail-under='.length));
    else if (!arg.startsWith('-') && !opts.target) opts.target = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (opts.format && !['terminal', 'json'].includes(opts.format)) {
    throw new Error(`Unknown format: ${opts.format}`);
  }
  return opts;
}

/** Read the target into `{ html, uri, source }`. Network fetching is intentionally absent. */
async function loadTarget(target) {
  if (/^https?:\/\//i.test(target)) {
    let response;
    try {
      response = await fetch(target, { redirect: 'follow' });
    } catch (cause) {
      throw new Error(`Could not reach ${target}: ${cause.message}`);
    }
    if (!response.ok) throw new Error(`${target} returned ${response.status}`);
    return { html: await response.text(), uri: target, source: 'url' };
  }
  const path = resolve(target);
  let html;
  try {
    html = await readFile(path, 'utf8');
  } catch {
    throw new Error(`Cannot read ${basename(path)} — no such file`);
  }
  return { html, uri: pathToFileURL(path).href, source: 'file' };
}

/** Returns a process exit code rather than calling process.exit, so it is testable. */
export async function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    stderr.write(`spark: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }

  if (opts.help) {
    stdout.write(USAGE);
    return 0;
  }
  if (opts.version) {
    const { readFile: read } = await import('node:fs/promises');
    const pkg = JSON.parse(
      await read(new URL('../package.json', import.meta.url), 'utf8')
    );
    stdout.write(`${pkg.version}\n`);
    return 0;
  }
  if (!opts.target) {
    stderr.write(`spark: no target given\n\n${USAGE}\n`);
    return 2;
  }

  let target;
  let result;
  try {
    target = await loadTarget(opts.target);
    result = await analyze(target);
  } catch (error) {
    stderr.write(`spark: ${error.message}\n`);
    return 2;
  }

  if (opts.command === 'report') {
    const out = opts.out ?? 'spark-report.html';
    const html = renderReport(result, {
      reproduceCommand: `spark check ${opts.target}`,
      generatedAt: result.ir.provenance.collectedAt,
    });
    await writeFile(out, html, 'utf8');
    stdout.write(`report written to ${out}\n`);

    if (opts.serve) {
      const { url, close } = await serveReport({ html, port: opts.port, target: opts.target });
      stdout.write(`serving at ${url}  (Ctrl+C to stop)\n`);
      await new Promise((resolve) => {
        const stop = () => {
          close();
          resolve();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      });
    }
    return 0;
  }

  if (opts.format === 'json') {
    stdout.write(renderJson(buildJsonReport(result)));
  } else {
    stdout.write(
      renderTerminal(result, { color: opts.color ?? process.stdout.isTTY ?? false }) + '\n'
    );
  }

  if (opts.failUnder !== null) {
    const measured = Object.values(result.scores).filter((s) => s !== null);
    const overall =
      measured.length === 0
        ? null
        : Math.round(measured.reduce((a, b) => a + b, 0) / measured.length);
    if (overall === null || overall < opts.failUnder) return 1;
  }
  return 0;
}
