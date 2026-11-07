# ADR 0006 — The gate action audits, and the workflow publishes

**Date:** 2026-11-07
**Deciders:** repo maintainer, in review with Arena
**Supersedes:** nothing. It ships the last code deliverable of [ADR 0005](0005-a-gate-on-regressions-keyed-by-structure.md)'s gate, and it is where that gate meets a repository that is not ours.

## Context

Phase 2 asked for "an action" next to `baseline` / `--ci` / SARIF. A composite action looks like the
smallest thing in this repository to get right, and it is the most exposed: it runs in a stranger's CI,
with their secrets, on their pull requests, and a bug in it is a red build they cannot debug from source.

Four questions arrived together, each with an answer that is one line shorter and wrong.

1. Where does the file live, and what does that make a release tag mean?
2. Should the action also upload the SARIF, install the CLI, and — if no baseline exists — write one?
3. How do the workflow's inputs reach the shell?
4. How is any of this tested here, when there is no YAML parser in the dependency tree and the repository
   has cut no tags for anyone to pin?

## Decision

**A composite action at `.github/actions/spark-gate/action.yml`, consumed by subpath.** Not a root
`action.yml`. The repository's release identity is the npm package (`mr-spark`, version in
`package.json`); a root action would make every tag simultaneously a release of the CLI and a release of
an action, so a documentation-only tag would be a `uses:`-visible change to somebody's build. A subpath
keeps the two promises separate, and `package.json`'s `files` list keeps the action out of the tarball,
which is right: an action is consumed from Git, not from npm.

**It audits, and it publishes nothing.** The action runs `spark check --ci`, writes the SARIF payload, and
sets the step's exit code. It does not upload the SARIF — code-scanning upload needs
`security-events: write`, and a composite action asking for a stranger's write permission on their
repository's checks is a privilege the consumer should grant in their own file, where it is visible. It does
not install the CLI: the version that judges a page has to be pinned in the project's own dependency flow,
or an engine update silently changes what their gate means. It does not upload artifacts either, for the
same reason as the SARIF — that step is in `docs/GATE.md` §2 so a team can delete it without editing ours.

**No bootstrap flag, in any form.** A missing baseline is exit `2` with the sentence that names the file and
tells a human to run `spark baseline` once and commit it. A CI job that generates its own floor the first
time it runs has a gate that can never fail, and it fails silently in the good direction, which is the
worst way for a check to be wrong.

**Inputs cross through `env:` and nowhere else.** `${{ }}` inside a `run:` block is substituted before bash
parses the script, so an input containing a quote and a semicolon is code. Every value — target, baseline
path, SARIF path, strictness, threshold — is an environment variable, read inside double quotes. One input
is interpolated as a command line by design: `spark` (default `spark`, our own CI passes `node bin/spark.js`),
because the thing it names is *which build judges me*, and that is authored by the workflow, not by a page.

**The step summary is rendered from the payload, by `summary.mjs` next to the action.** It reads
`runs[0].properties.sparkGate` from the SARIF the action just wrote and prints the same numbers the exit
code was decided from — one arithmetic, one source. It runs under `|| true`, because a summary that can
fail a build is a summary nobody allows, and `check.yml` greps the summary for the line it expects so
"silently stopped working" is caught on our CI rather than noticed by a client a year later.

**The delta table is computed once, in `compare()`.** Adding this consumer exposed the risk of doing it
otherwise: the summary first grouped SARIF *results* by anchor and reported "+2 findings at `.card`" under
a headline that said 1 new, because two identical siblings are two results and one delta. `compare()` now
returns `entries` (per-key `added`, `from`, `blocking`, `escalated`) and `states`, and the gate line, the
SARIF results and the summary all read those. This also tightened SARIF's `baselineState`: a key the
baseline already had that grew or worsened is `updated`, not `new`, and the stamp stays per-key — a key with
three identical siblings has no per-element identity to stamp, which is the position ADR 0005 took
deliberately.

**Testing is structural, plus `bash -n`, plus the dogfood.** `test/action.test.js` reads the YAML the way a
reviewer does (two-level block mapping for `inputs:`, the `run: |` body as text) and asserts the properties
that break in production: every referenced input declared and every declared input used; every declared
input documented and either required or defaulted; no `${{ }}` inside a `run:` body; every env var read
quoted; every flag the script passes present in the generated `USAGE` text; balanced `then`/`fi`; and
`bash -n` on the extracted body, skipped out loud where bash does not exist. Whether the file is valid YAML
at all is answered by `check.yml`, which *uses* the action on every push — the runner parses it or our build
goes red. That is the reason the action is dogfooded instead of only documented.

## Alternatives considered, and why they were refused

- **A Docker container action.** Self-contained and reproducible, and it needs a published image per
  release, which puts a registry in the critical path of a check that exists to run offline. Refused.
- **A JavaScript action.** Needs `@actions/core` and a build step: this project takes no runtime
  dependencies, and the CLI it wraps is already the thing a runner executes.
- **Root `action.yml` with `uses: raydirect/mr-spark@v1`.** One clean line for a consumer, and it fuses
  the CLI's version to the action's. Rejected on the reasoning above; a subpath costs one line of YAML.
- **`bootstrap: true` when the baseline is missing.** Rejected in the strongest terms in the decision
  section: it turns the gate into a no-op that reports success.
- **Uploading the SARIF from inside the action.** Refused for the permission reason, and because
  `if: always()` is a decision about *their* workflow's failure semantics, not ours.
- **A YAML parser dependency for the tests.** Refused: no runtime dependency is a project rule, and a test
  dependency that becomes load-bearing for a file GitHub parses itself is weight without a guarantee. The
  guarantee comes from the runner.
- **Telling consumers to pin `@main`.** Refused in the docs as well as here: a gate pointed at a moving ref
  changes behaviour without a pull request, which is the exact property the committed baseline exists to
  give them. `docs/GATE.md` §7 says plainly that there is no tag to pin yet.

## Consequences

- A client's gate is four lines of YAML plus one `npm install`, and the docs show the upload step they can
  delete.
- The action is only as stable as its pinned ref, and there is no ref yet: cutting `v1` after `npm publish`
  is now a documented step, not an assumption.
- Two `uses:` steps in `check.yml` cover both SARIF branches — payload plus summary, and `sarif: ''` — so
  every run of our CI exercises the script that would otherwise only be tested by reading it.
- The step summary is a summary. It is not `docs/PLAN.md`'s `md` reporter, and nothing in here should be
  read as that feature landing: a PR comment from a bot is still unbuilt.
- `spark`'s "split on spaces" contract means a CLI path containing a space needs a wrapper; documented in
  the input description rather than solved by a second parser.
