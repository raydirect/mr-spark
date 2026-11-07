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
          target: dist/index.html
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

Non-GitHub CI gets the same thing in one line: `spark check dist/index.html --ci --no-color`, with
`--format sarif --out .spark/spark-gate.sarif` if the payload is wanted.

## 3. What the file is

From `test/fixtures/gate/bad.baseline.json`, our own known-bad fixture:

```json
{
  "baseline": 1,
  "engine": { "name": "MR-Spark", "version": "0.2.0", "scoreSpec": "3.0.0", "irVersion": "0.1" },
  "target": { "source": "file", "kind": "document", "file": "bad.html" },
  "score": { "accessible": 50 },
  "ir": "e10770a356ce…",
  "rules": ["button-name", "html-has-lang", "image-alt", "link-name", "region"],
  "anchors": { "total": 10, "byKind": { "id": 0, "named": 2, "shape": 7, "document": 1 }, "positional": 7 },
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
```

Ten entries, eleven findings — one entry is `region × 2`, and the file's numbers are deliberately phrased the
same way the report phrases them.

No timestamp, no absolute path, no machine identity — the same rules `schema/` follows, so two people
generating a baseline from one commit get byte-identical files and `git diff` on the baseline means
something. `score` is context for whoever reads the pull request; the comparison never uses it, because a
baseline that pinned a score invites somebody to gate on the number instead of the findings.

## 4. What counts as a regression

| Change | Gate | Why |
|---|---|---|
| Same anchor, more findings | **blocks** | `+1 region at .card` is the whole reason this exists |
| Same anchor, worse impact (`moderate → serious`) | **blocks** | an escalation is a regression even when the count did not move |
| A new finding from a rule the baseline never listed | reported, not blocking | shipping a rule must not turn every existing repo red; `--strict` opts in |
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
thing that breaks a build — and `check.yml` greps for the line it expects, so "silently stopped working" is
caught here rather than discovered by a client.

The upload snippet is in §2. The `if: always()` in it matters: `--ci` exits 1 when something regressed, and
an upload step that only runs on success would hide exactly the findings the annotation exists to point at.

Machine formats keep stdout to the payload alone: the gate's prose goes to stderr. A pipe that expects JSON
gets JSON, and a script reads the exit code, which never moves.

## 7. What this is not yet

- **One target per run.** `spark baseline page.html` and `spark check page.html --ci` describe one page. A
  repo-wide baseline covering a directory is not built, and `loadTarget` does not read directories; a
  multi-page file is a format change (entries would need a document discriminator) and will get its own
  ADR rather than being quietly widened.
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
