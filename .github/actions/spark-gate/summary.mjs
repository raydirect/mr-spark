#!/usr/bin/env node
/**
 * The step summary, from the SARIF this action just wrote.
 *
 * Why it reads the payload instead of asking the CLI again: the payload is the artifact a reviewer's
 * code-scanning view is built from, so a summary computed from anything else would be a second opinion
 * about the same run — and two opinions are how a log and a Files tab start disagreeing.
 *
 * It prints markdown on stdout and lets the caller redirect it into `$GITHUB_STEP_SUMMARY`. It never
 * exits non-zero on a content problem, because the build's verdict was already recorded by the audit
 * step; a summary that can fail a build is a summary nobody allows.
 */

import { readFileSync } from 'node:fs';
import { argv, exit, stdout } from 'node:process';

/** Cap the list, because a summary that is 40 lines long is a log with extra steps. */
const LIMIT = 8;

function read(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The lines under the table: what the gate is acting on, with the numbers `compare()` produced.
 *
 * Counting results instead would be wrong in the common case — three identical siblings are three results
 * and one delta — and listing the adoptable ones would make the summary contradict the exit code.
 */
function listed(entries) {
  return (entries ?? [])
    .filter((entry) => entry.blocking)
    .sort((a, b) => b.added - a.added || (a.ruleId < b.ruleId ? -1 : 1));
}

export function summarize(payload) {
  const run = payload?.runs?.[0];
  const gate = run?.properties?.sparkGate;
  const results = run?.results ?? [];
  const lines = [];

  const undecided = results.filter((result) => result.kind === 'informational').length;
  const waived = results.filter((result) => result.properties?.sparkStatus === 'suppressed').length;
  const driver = run?.tool?.driver ?? {};
  const foot = [
    driver.version ? `MR-Spark ${driver.version}` : null,
    run?.properties?.sparkScoreSpec ? `score spec ${run.properties.sparkScoreSpec}` : null,
    Number.isFinite(run?.properties?.sparkScore) ? `accessible ${run.properties.sparkScore}/100` : null,
  ].filter(Boolean);

  if (!gate) {
    // A SARIF without the gate block is a run that compared nothing. Printing "0 new" there would be the
    // most dangerous sentence in the product: it reads as a pass.
    lines.push('### MR-Spark gate — no comparison');
    lines.push('');
    lines.push('This run had no baseline to compare against, so it did not check for regressions. Nothing here is a pass.');
    if (undecided) lines.push(`\n${undecided} result(s) could not be decided automatically and are not violations.`);
    if (foot.length) lines.push(`\n<sub>${foot.join(' · ')}</sub>`);
    return lines.join('\n');
  }

  const mark = gate.ok ? '✓' : '✗';
  const headline = gate.ok
    ? gate.escalated
      ? `${gate.escalated} finding(s) got worse`
      : 'no new findings'
    : `${gate.blocking} new finding(s)${gate.escalated ? ` · ${gate.escalated} worse` : ''}`;
  lines.push(`### MR-Spark gate ${mark} ${headline}`);
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| new | ${gate.blocking} |`);
  lines.push(`| worse | ${gate.escalated} |`);
  lines.push(`| fixed | ${gate.resolved} |`);
  lines.push(`| already in the baseline | ${gate.unchanged} |`);
  // Not a table row: the sentence below says the same number *and* what to do about it, and a count
  // repeated twice on one screen is a count that can be contradicted.
  if (gate.adoptable) {
    lines.push(`\n${gate.adoptable} finding(s) come from rules this baseline predates. Reported, not blocking — run \`spark baseline\` to adopt them.`);
  }

  const rows = listed(gate.entries);
  if (rows.length) {
    lines.push('');
    for (const row of rows.slice(0, LIMIT)) {
      const parts = [];
      if (row.added > 0) parts.push(`+${row.added}`);
      if (row.escalated) parts.push(`${row.fromImpact ?? 'worse'} → ${row.impact}`);
      if (parts.length === 0) parts.push('changed');
      lines.push(
        `- \`${row.ruleId}\` ${parts.join(', ')} at \`${row.anchor ?? '(document)'}\`` +
        (row.impact ? ` (${row.impact})` : '') +
        (row.from ? ` · baseline had ${row.from}` : '')
      );
    }
    if (rows.length > LIMIT) lines.push(`- … and ${rows.length - LIMIT} more on the Files tab`);
  }

  // What the gate did not count, on the same screen as what it did. A green check that quietly excludes
  // things is the failure mode this project keeps refusing, so the exclusions are in the summary too.
  const notCounted = [];
  if (undecided) notCounted.push(`${undecided} could not be decided automatically`);
  if (waived) notCounted.push(`${waived} waived by configuration with a stated reason`);
  if (notCounted.length) lines.push(`\nNot counted as regressions: ${notCounted.join(', ')}.`);
  if (!gate.ok) {
    lines.push('\nEither fix them, or run `spark baseline` and say why in the commit. The findings themselves are on the Files tab once the SARIF is uploaded.');
  }
  if (foot.length) lines.push(`\n<sub>${foot.join(' · ')}</sub>`);
  return lines.join('\n');
}

// Importable without side effects, so the wording is testable; the action runs it as a script.
if (argv[1] && new URL(`file://${argv[1]}`).href === import.meta.url) {
  const path = argv[2];
  if (!path) {
    stdout.write('### MR-Spark gate — no report to summarise\n');
    exit(0);
  }
  const payload = read(path);
  if (payload === null) {
    // A missing payload means the audit never got that far (no baseline, bad config). Saying "no new
    // findings" here would be the worst sentence this file can produce, and a stack trace would be the
    // second worst — the step is `|| true` precisely so it cannot be the thing that breaks a build.
    stdout.write(
      `### MR-Spark gate — no summary\n\n` +
      `Could not read the report at \`${path}\`, so there is nothing to add here. The audit step's own log ` +
      'carries the verdict, and nothing about this sentence changes it.\n',
    );
    exit(0);
  }
  stdout.write(`${summarize(payload)}\n`);
}
