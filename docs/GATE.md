# The gate

A build check that fails on 400 findings on the day you install it is a build check that gets deleted
inside a week. This document is how MR-Spark avoids that: the findings you already have become the floor,
and only what gets *worse* stops the build.

`docs/PLAN.md` §3.2 names this the most common way accessibility tooling dies. The gate is the answer, and
like the rest of this project it is a set of rules about what may be hidden rather than a feature count.

## 1. Two commands

```bash
spark baseline page.html          # writes .spark-baseline.json — commit it
spark check page.html --ci        # exits 1 only on what the baseline does not already have
```

Both take a set instead of a page, and that is what turns the gate from "this file" into "this repo":

```bash
spark baseline dist                       # every page under dist/, one file for all of them
spark check dist --ci                     # one verdict, exit code for the lot
spark check dist/a.html dist/b.html --ci   # or exactly the pages you choose
```

A directory is expanded to every `*.html`, `*.htm` and `*.xhtml` under it, sorted, skipping
`node_modules` and any dot-directory. It is not a policy about what counts as project code — it is a
refusal to fetch a thousand third-party pages because somebody passed `.` — and an ignore file is still
open (§7).

**One page's name in the file is its path from the directory the command ran in**, so `spark check
dist/a.html` and `spark baseline dist` agree, from any subdirectory or not. Run both from the project
root, which is also where `.spark-baseline.json` and `spark.config.json` are looked up. A run whose pages
overlap the file on nothing — the usual cause is the commands being run from different directories, the
second is a page renamed in this commit — exits `2` and says so, because a gate that compared nothing has
not earned a green tick.

Exit codes are the same three everywhere: `0` the run completed and the thresholds were met, `1` it
completed and something was not met, `2` it could not run — which is what `--ci` returns when there is no
baseline file, because "no regressions" and "never checked" are different sentences.

The path is `--baseline <path>`, else `"baseline"` in `spark.config.json`, else `./.spark-baseline.json`.
Relative paths resolve against the current directory and never against the target's directory, so
`spark baseline fixtures/real/x.html` cannot start writing gate files into `fixtures/`.

The file is reviewable, which is the point: a baseline is a decision, not a cache. Adopt it in a pull
request of its own — `spark baseline` on the pages you want gated, commit the file, turn the gate on in
the next one. Then a change to a page and a change to what the page is allowed to have are two diffs a
reviewer can weigh separately.

## 2. In a workflow

```yaml
name: a11y gate
on: [pull_request]
permissions:
  contents: read
  security-events: write   # only for the upload step below
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install --no-save mr-spark
      - uses: raydirect/mr-spark/.github/actions/spark-gate@<pinned-ref>
        with:
          target: dist            # one page, a directory, or several paths separated by spaces
          baseline: .spark-baseline.json
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: .spark/spark-gate.sarif }
```

Pin a release tag or a full commit SHA, not `@main`. This repository has cut no tags yet, so today that
placeholder has to be a SHA — a gate pointed at a moving ref is a gate whose behaviour changes without a
pull request, which is the one thing the baseline file exists to prevent.

**What the action does, and what it refuses to do.** It runs the audit and sets the step's exit code; it
writes the SARIF payload and a step summary; and that is all. It does not upload the SARIF (code-scanning
upload needs `security-events: write`, which is your repository's permission to grant, not something an
action should ask for on your behalf), it does not install the CLI (so a project can pin the version it
audits with, in the same lockfile as everything else), and it has no flag to write a missing baseline.
That last refusal is the important one: a CI job that generates its own floor has a gate that can never
fail, and `--ci` with no baseline file exits `2` with a message telling a human to run `spark baseline`
once and commit the file.

`target` is split on whitespace, so a path with a space in it cannot be named here — gate its directory
instead. That is a real limit, and it is cheaper than a second layer of quoting inside a shell script that
already has to survive untrusted input.

Non-GitHub CI gets the same thing in one line: `spark check dist --ci --no-color`, with `--format sarif
--out .spark/spark-gate.sarif` if the payload is wanted (`--out` creates the directory it writes into,
which is why the workflow does not `mkdir -p` first).

## 3. What the file is

From `test/fixtures/gate/bad.baseline.json`, our own known-bad fixture, with two of its ten entries shown.
It is one page here, and that is the whole format: the top level names the engine that wrote it, and
`pages[]` holds one section per page.

```json
{
  "baseline": 2,
  "engine": {
    "name": "MR-Spark",
    "version": "0.2.0",
    "scoreSpec": "3.0.0",
    "irVersion": "0.1"
  },
  "pages": [
    {
      "page": "fixtures/bad.html",
      "source": "file",
      "kind": "document",
      "ir": "e10770a356ce5499ac09504118a32ff0c82d6baa96cbf425ab64044348de8c53",
      "score": {
        "accessible": 50
      },
      "rules": [
        "button-name",
        "html-has-lang",
        "image-alt",
        "link-name",
        "region"
      ],
      "anchors": {
        "total": 10,
        "byKind": {
          "id": 0,
          "named": 2,
          "shape": 7,
          "document": 1
        },
        "positional": 7
      },
      "findings": [
        {
          "key": "button-name@74995c4fbec3",
          "ruleId": "button-name",
          "pillar": "accessible",
          "anchor": "button",
          "anchorKind": "shape",
          "impact": "critical",
          "count": 1
        },
        {
          "key": "html-has-lang@d21a9d308317",
          "ruleId": "html-has-lang",
          "pillar": "accessible",
          "anchor": "(document)",
          "anchorKind": "document",
          "impact": "serious",
          "count": 1
        }
      ]
    }
  ]
}
```

Ten entries, eleven findings — one entry is `region × 2`, and the file's numbers are deliberately phrased
the same way the report phrases them.

A repo-wide file is the same shape with more sections, each keyed by its path from the project root:

```json
{
  "pages": [
    { "page": "dist/a.html", "…": "each page keeps its own kind, rules, anchors and findings" },
    { "page": "dist/blog/b.html", "…": "and nothing is merged between them" }
  ]
}
```

**There is no score for a run of pages.** An average is how a hundred-page site gets to ship one page at
12, and the only number a maintainer trusts is the one next to their own file. Where a run-level number is
unavoidable — the SARIF run's `sparkScore`, the footnote on a step summary — it is the *worst* page, and
the summary says "worst page" beside it rather than letting the reader guess.

A `baseline: 1` file — this shape with one page's keys at the top level — is read and promoted, never
rejected. A project that committed one recorded a valid decision, and refusing to read it would turn every
such repository's gate red on the day the format widened. A repo-wide run against such a file prints one
extra line saying the file describes a single page, because that is the fact limiting what it can catch.

No timestamp, no absolute path, no machine identity — the same rules `schema/` follows, so two people
generating a baseline from one commit get byte-identical files and `git diff` on the baseline means
something. `score` is context for whoever reads the pull request; the comparison never uses it, because a
baseline that pinned a score invites somebody to gate on the number instead of the findings.

## 4. What counts as a regression

| Change | Gate | Why |
|---|---|---|
| Same anchor, more findings | **blocks** | `+1 region at .card` is the whole reason this exists |
| Same anchor, worse impact (`moderate → serious`) | **blocks** | an escalation is a regression even when the count did not move |
| A new finding from a rule the file never listed, written by an **older build** | reported, not blocking | shipping a rule must not turn every existing repo red; `--strict` opts in |
| The same, in a file written by **this** build | **blocks** | "a rule the baseline predates" is a claim about which build wrote the file, not about which findings a page had — a page that was clean for a rule this build knows grew a problem, and cannot buy immunity for its future |
| A page the baseline never listed | reported, not blocking | a new page is not a regression in what was gated yesterday; `--strict` opts in, and the run names it |
| A page in the file that this run did not audit | printed, and nothing else | deleting a page fixed nothing. Counting its findings as resolved would let a deletion look like an improvement |
| A run whose pages overlap the file on nothing | `2`, with the reason | two spellings of the target, or a rename in this commit: nothing was compared, which is neither a pass nor a failure |
| A finding that disappeared | reported as fixed | getting better never fails |
| A suppressed finding | ignored by the gate, printed in the report | it is already waived with a reason in `spark.config.json`; a waiver does not also become gate policy |
| An undecided check | excluded from the gate, printed everywhere | it measures *our* missing capability — a laptop with a canvas and a runner without one would disagree forever |
| A fragment checked against a page's baseline | `2`, with the reason | the fragment skips document-level rules, so the comparison would find nothing and call it a pass |

The sentence, on the terminal:

```
  ✓ gate · no new findings · 11 already known
```

```
  ✗ gate · 1 new · 5 already known
      +1 region at input (moderate)
  1 finding(s) come from rules this baseline predates (label) — reported, not blocking. Run `spark baseline` to adopt them, or use --strict to block on them today.
  either fix them, or accept them deliberately with `spark baseline` and say why in the commit
```

A repo-wide run says how many pages the verdict covers, names the pages that moved, and puts the page in
front of every finding line — the same three sentences, one level up:

```
  ✗ gate · 2 page(s) · 2 new · 13 already known
    index.html · 2 new
      index.html · +1 image-alt at img[src$="extra.png"] (critical)
      index.html · +1 region at img[src$="extra.png"] (moderate)
  either fix them, or accept them deliberately with `spark baseline` and say why in the commit
```

and, when a directory was audited, one line per page above the verdict so a reader knows which file to open:

```
  index.html · 2 findings · 29 elements · score 77
  dist/ugly.html · 11 findings · 25 elements · score 50
  2 pages · 13 findings in total · run `spark check <page>` for one page's report
```

A one-page run prints what it has always printed — same lines, same order, same columns — so a workflow
that grepped `gate · ` last release keeps working after the format widens.

The last line is not decoration. The honest move when a page genuinely needs its new problem is to
*adopt* it and say why in the commit message; the line has to be on screen at the moment that decision is
made, or the decision becomes "add `continue-on-error`".

## 5. How a finding is identified

`src/identity.js`. A key is `rule@digest` where the digest covers the rule id and a **structural anchor**
derived from the selector:

- `:nth-child`, `:nth-of-type` and friends are dropped. They describe render order, not intent.
- The path is cut at the nearest `id`. An `id` already pins the element; its ancestors only add ways to
  change.
- `html` and `body` are dropped. They are the document, not a place in it.
- Identical siblings collapse into one entry with a `count`. Which of the three cards was fixed is not
  knowledge anyone needs, and pretending to track it is how an anchor becomes a lie.

This exists because `finding.id` is `ruleId:selector`, and axe writes selectors like
`.row:nth-child(1) > input`. Add a paragraph above that row and every id on the page changes — a naive diff
reports "2 new, 2 fixed" for an edit that fixed nothing, and that is the commit after which a team turns
the gate off. `test/identity.test.js` pins exactly that case against real engine output.

The cost is stated in the artifact rather than hidden: `anchors.positional` counts how many entries rest
on a shape-only anchor, which a class rename can move. On our own `bad.html` that is 7 of 10, which is the
honest answer for a page written from scratch to be bad and worth re-reading before anybody treats this
module as stronger than it is.

## 6. SARIF

```bash
spark check page.html --ci --format sarif > spark.sarif
```

The findings in the shape a code scanner already reads, so results land on the pull request's Files tab
instead of in a log somebody has to expand. `docs/PLAN.md` makes "no score without the raw findings" a
principle, which is why this ships with the gate rather than after it.

Three things it deliberately does not do:

- **It does not invent line numbers.** The browserless collector reports a selector and a snippet, not a
  source position. A guessed `region` would annotate the wrong line of the wrong file in the one format
  people act on without reading the tool, so `physicalLocation` names the artifact and the anchor and
  snippet go in the message.
- **It does not use SARIF's `suppressions` array** — that array tells the viewer to hide the result. A
  waived finding is emitted as a `note` carrying its reason, because a waiver exists to be reviewed.
- **It does not drop undecided checks.** They ship as `kind: "informational"`, `level: "note"`, with
  `sparkUndecidedKind` saying whether it is our missing capability or a question markup cannot answer. A
  run with no canvas must not look clean to somebody else's viewer.

When a baseline is in play each result also carries `baselineState` (`new` / `updated` / `absent`) and the
run carries `properties.sparkGate` with the same verdict the exit code reports, so a diff-aware annotation
comes from the upload rather than from a second copy of the logic. GitHub Actions:

The step summary is the payload's own arithmetic, not a second opinion: the action reads the SARIF it just
wrote (`runs[0].properties.sparkGate`) and prints the same numbers the exit code was decided from, so a
green summary and a red build cannot coexist. It runs under `|| true`, because a summary must never be the
thing that breaks a build.

The markdown goes to `$GITHUB_STEP_SUMMARY` *and* to `summary.md` beside the payload — `GITHUB_STEP_SUMMARY`
is per-step, so it is empty for the step after the one that wrote it, and a workflow that wants to assert on
the summary or upload it needs a workspace path (`docs/adr/0006` records the red build that found this).

The upload snippet is in §2. The `if: always()` in it matters: `--ci` exits 1 when something regressed, and
an upload step that only runs on success would hide exactly the findings the annotation exists to point at.

Machine formats keep stdout to the payload alone: the gate's prose goes to stderr. A pipe that expects JSON
gets JSON, and a script reads the exit code, which never moves.

## 7. What this is not yet

- **A directory walk has no ignore file.** `spark baseline dist` takes every HTML under `dist`, skipping
  `node_modules` and dot-directories, and that is the whole policy. A build that emits pages into a folder
  you do not want gated has to name its pages one at a time or move the folder. An ignore file is a config
  decision — `spark.config.json` knows `suppress` and `baseline` and nothing else — and it is still open.
- **The tool does not gate its own report.** A `spark-report.html` sitting in the directory you audited is
  skipped by name, because a report made of findings would otherwise become a page whose findings depend on
  the report: a loop with a green tick at the end. Point `--out` somewhere else and the file is your page,
  audited like one.
- **A subset run is a subset verdict.** `spark check dist/a.html --ci` against a repo-wide baseline gates
  that page and says which pages of the file it did not look at; it does not stand in for the repo-wide
  command, and CI should run the one command the baseline was written from.
- **No `md` reporter.** `docs/PLAN.md` lists one for PR comments. The SARIF upload covers the Files tab
  today; a comment renderer is still open.
- **The exit criterion is not met.** `docs/PLAN.md` asks for ten real repositories with a green gate and a
  committed baseline, and at least three merges stopped by a real regression. What exists here is the
  mechanism, two committed baselines of our own fixtures, and a CI step that fails if our own pages drift
  from them. The ten repos are the part that cannot be written into existence.
- **`--ci` and `--fail-under` are independent.** The score threshold gates the number, `--ci` gates the
  findings, and a build can pass one and fail the other on purpose.
- **The action has nothing stable to point at yet.** `uses:` needs a tag or a SHA, and this repository has
  cut no tags, so the snippet in §2 says `<pinned-ref>` and means it. A `v1` tag is the next thing to cut
  after `npm publish`, and it is the release that makes the promise in `docs/HOSTING.md` §5.1 testable.
- **One shell.** The action is `bash`, which every Linux and macOS runner has and a Windows runner has from
  the Git install. A pwsh variant is not built; on a Windows-only setup, call the CLI directly (§1).
