# web-spark — The Plan

> **One line:** a single command that tells you whether your web page is actually good —
> accessible, fast, safe, and usable by humans and AI agents — and stops you from merging
> a regression, without asking you to change a single framework.

Status: proposal, not yet built. This document is the thing to argue with.

---

## 1. The bet

The research in [RESEARCH.md](RESEARCH.md) lands on one gap:

> Every stage of web development has a world-class tool. The **outcome** has no owner,
> no single number, and no CI gate a stranger can install in five minutes.

Three facts make this a wedge instead of a wish:

1. **The failures are concentrated and known.** 96% of all detectable accessibility errors
   are six categories, unchanged for seven years. Performance regression is unmeasured at
   merge time. Contract drift is structural. All of it is *checkable*.
2. **Nobody wants a new framework.** The #1 and #2 free-text pain points in State of JS 2025
   are "cognitive overload" and "ecosystem issues." Adding a mental model loses. Adding a
   command wins.
3. **Agents changed the economics of verification.** With 35% of AI-generated code reaching
   production before it's understood, the ability to *prove* properties of a page is now
   worth more than the ability to generate one.

So: **don't beat the ecosystem. Grade it, and gate on the grade.**

### What "revolutionize the web" has to mean, honestly

Not "a new framework that replaces the incumbent UI library." Revolutions in dev tooling happen when a
*standard artifact* becomes universal — lockfiles, `package.json`, SARIF, `robots.txt`.
The realistic version of the ambition is:

> In three years, `spark.config.json` and a green/amber/red conformance score in a pull
> request comment are as normal as a lockfile — and "how accessible is this?" has a
> numeric answer for any repository on GitHub.

That is achievable by a small team. A framework war is not.

---

## 2. What we build

**A CLI + GitHub Action that audits a web page or app and emits a conformance score and
machine-readable report — reusing the engines the ecosystem already trusts.**

We are not writing a checker. We are writing the **orchestrator, the score, the gate, and
the report** — the layer that is missing.

```
┌──────────────────────────────────────────────────────────────┐
│  spark check            ← one command, zero config           │
├──────────────────────────────────────────────────────────────┤
│  Collectors (adapters over trusted engines)                   │
│   • a11y      → axe-core                                     │
│   • perf      → Lighthouse / PSI / CrUX, bundle analysis      │
│   • security  → lockfile + npm audit + OSV + policy rules     │
│   • agent     → accessibility-tree readability, WebMCP tools, │
│                 llms.txt, structured data                     │
├──────────────────────────────────────────────────────────────┤
│  Runners: jsdom (no browser, ~300ms) │ Playwright │ Lighthouse │
├──────────────────────────────────────────────────────────────┤
│  Score  +  baseline diff  +  budgets                          │
├──────────────────────────────────────────────────────────────┤
│  Reporters: terminal │ md (PR comment) │ JSON │ SARIF          │
└──────────────────────────────────────────────────────────────┘
```

### The five-minute first win

```bash
npx @webspark/cli check https://example.com
```

```
  web-spark  https://example.com

  ACCESSIBILITY   38/100   ✗  14 errors
    ✗ image-alt       3 elements    <img src="/hero.png">
    ✗ color-contrast  9 elements    .muted (2.1:1, needs 4.5:1)
    ✗ label           2 elements    <input type="email">
  PERFORMANCE     55/100   ~  LCP 3.8s · 612 KB JS · 74 requests
  SECURITY        88/100   ✓  1 advisory (moderate)
  AGENT READINESS 41/100   ✗  no main landmark · 12 unlabeled controls
                            · no llms.txt

  CONFORMANCE 52/100  ✗  FAIL (budget: 70)

  3 of these explain 80% of the damage. Fix them first →  spark fix a11y
```

And in CI, with no browser and no config:

```yaml
- uses: webspark/check-action@v1
```

Then the PR gets one comment with the delta:

```
web-spark  72 → 78 (+6)   ✓ passed
  +2  accessibility   fixed 4 contrast issues
  -3  performance     entry bundle +38 KB (charting library)
```

That second screenshot is the whole product. **Everybody already has dashboards. Nobody
has a merge gate with a number on it.**

---

## 3. Design decisions that decide success

These are the choices I'd fight for, with the reasoning, so you can disagree precisely.

### 3.1 Reuse, never reinvent (credibility + speed)

axe-core ships inside Chrome DevTools and Lighthouse and has a zero-false-positive
commitment. Lighthouse owns perf scoring. OSV/npm audit own advisories. We wrap and
normalize. A from-scratch a11y engine would take a year and be worse — and the community
would (rightly) ignore us.

*Our* IP is: the score model, the baseline/gate semantics, the report formats, the agent
layer, and the DX.

**[measured]** A jsdom + axe-core audit of a small fixture runs in **331 ms with no browser
and no network**, catching 4 of the 6 top WebAIM error categories. That's the entire reason
a "runs in your unit tests / pre-commit / PR" product is possible. Note the honest gap:
`color-contrast` came back `incomplete` without a canvas implementation — which is exactly
why the browser runner must exist as an upgrade path, and why we must *never* claim
automation is sufficient.

### 3.2 Fail on regressions, not on pre-existing debt

The single biggest reason accessibility checks get disabled in CI is that a mature codebase
has 400 existing violations on day one, so the build is red forever and someone puts
`continue-on-error: true` in the workflow. This is the #1 known failure mode of every
predecessor, and we must solve it on day one, not in v2.

Design:

```bash
spark baseline      # snapshot today's state into .spark-baseline.json, commit it
spark check --ci    # only NEW/regressed issues fail the build
```

A repo can go from 400 errors to a green gate in one commit, and then every subsequent
commit is held to "no worse." Progressive ratcheting, not big-bang remediation. Add
`spark budget --max-js 250kb` for hard ceilings enforced from day one.

### 3.3 A score that refuses to be gamed

Scores get gamed, and a gamed score destroys the project's credibility with exactly the
people we need (engineers, auditors, the a11y community). So:

- **Publish the weights** in a spec file with a semantic version. No secret sauce.
- **Four independent sub-scores**, never merged into a single number that hides a failure.
  A site with 99 performance and 12 accessibility is not a "B".
- **No score without the raw findings.** The score is a *summary* of a findings list; the
  findings are always emitted alongside, in SARIF.
- **Cap the cheap wins.** You cannot buy a good score with meta tags.
- **Automated-coverage honesty.** Report "38/100 automated (covers ~30% of WCAG criteria)" —
  never imply conformance. This is a legal-safety issue too: EAA-era claims must be honest.
- **Wrong-answer tests.** Every rule needs a fixture that *should* fail it, so we can't
  drift into "zero findings = green" delusion.

### 3.4 The agent layer is the reason this is new, not a me-too linter

Two capabilities nobody else has packaged well:

1. **Agent readiness**: semantic/a11y-tree quality (the same tree screen readers and browser
   agents consume), `llms.txt` validity, structured data, and — most interesting — a report
   of *what tools your site exposes to agents*. WebMCP (`navigator.modelContext.registerTool`)
   is in a Chrome origin trial with Edge support; we can polyfill-detect the current API
   surface in the browser runner and report "your site declares 0 callable actions," with a
   scaffold to add them.
2. **Agent-consumable output**: `spark check --format json --for-agents` returns a compact,
   deterministic findings object designed to be pasted into a coding agent's context, with
   file:line locations where derivable and a one-sentence fix per finding. The report *is*
   the context the agent lacks.

This is the differentiator that makes it a 2026 project rather than a 2021 project.

### 3.5 Guardrails on ourselves

Non-negotiable, because a tool that preaches bloat while shipping 300 packages is a
punchline:

- Node 20+, **no build step for the CLI**, single publish artifact, target **< 25
  dependencies**. axe-core and the browser runners are optional peer deps, lazy-loaded.
- CLI cold start **< 400 ms**; `spark check` on a static page **< 2 s** total.
- Every feature must survive the question: *"does this make the first command better?"*

---

## 4. Surface area (v1, deliberately small)

| Command | What it does | Ships in |
|---|---|---|
| `spark check [url\|dir]` | audit, print score + top findings | M1 |
| `spark baseline` | write `.spark-baseline.json` | M1 |
| `spark check --ci` | fail only on new/regressed | M1 |
| `spark report --format sarif\|json\|md` | CI-native output | M1 |
| `webspark/check-action@v1` | PR comment + check run + delta | M1 |
| `spark budget --max-js/--max-lcp/--min-score` | hard ceilings | M2 |
| `spark check --url` | Playwright runner (rendered DOM, contrast, WebMCP) | M2 |
| `spark agent` | a11y-tree report + WebMCP tool inventory | M2 |
| `spark fix <rule>` | guided fix with codemod where safe | M3 |
| `spark init` | detect stack, write config, generate the Action | M1 (thin) |

Config (`spark.config.json`) — flat, ~10 keys, no plugin system in v1:

```json
{
  "$schema": "https://webspark.dev/schema/1.json",
  "paths": ["app/**/*.tsx", "src/**/*.html"],
  "baseline": ".spark-baseline.json",
  "enforce": { "minScore": 70, "maxJsBytes": 250000, "maxLcpMs": 2500 },
  "ignore": ["**/fixtures/**"],
  "severity": { "color-contrast": "error", "llms-txt": "off" }
}
```

---

## 5. Roadmap

Each phase has an **exit criterion** — the thing that is true when we're done, verified by
something other than our own opinion.

### Phase 0 — Prove it's real (1 week)
- Build the 331 ms jsdom+axe path into a real CLI with the four sub-scores and a terminal
  report.
- Scan **the top 1,000 sites by Tranco rank** and publish `docs/STATE-OF-THE-WEB.md` with
  our own numbers, reproducible via one command.
- **Exit:** the report is interesting enough that *we* would link it. Baseline repo
  (`docs/` + CLI + one worked example) is public, Apache-2.0, CONTRIBUTING + CODE_OF_CONDUCT
  in place.

> The state-of-the-web artifact is the launch. A tool announcement is noise; a *dataset*
> about 1,000 real sites, generated by an open script, is a story. It also proves the score
> is honest before anyone depends on it.

### Phase 1 — The gate (2–3 weeks)
- `baseline`, `--ci` regression semantics, SARIF, and the GitHub Action with PR comments.
- Self-audit: web-spark's own repo runs web-spark on its docs site, in CI, from day one.
- **Exit:** 10 real repos (pulled from `good-first-issue` projects we contribute the Action
  to) have a green gate with a committed baseline, and at least 3 merges were blocked by a
  real accessibility regression.

### Phase 2 — Depth (4–6 weeks)
- Playwright runner (`--url`): rendered DOM, real contrast, console/network errors,
  **WebMCP tool inventory**, agent readiness sub-score.
- Budgets tied to *changed files* so a PR only fails for the bytes it added.
- **Exit:** `spark agent` output successfully used by a coding agent to fix a real
  accessibility issue end-to-end in one of our own examples, recorded and published.

### Phase 3 — Standard (ongoing)
- Publish `spec/score-v1.md` (weights, semantics, versioning) as an independent, stable
  document with a public changelog, so third parties can *implement* the score.
- Adapters: unit-test matcher (generic), pre-commit hook, build-plugin API for CDNs, GitLab CI.
- A public score badge with an honesty disclaimer baked into the SVG.
- **Exit:** one third-party project implements or consumes the score spec without our help.

### Explicit non-goals for the first year
Frameworks. Bundlers. Component libraries. A dashboard SaaS. AI code generation.
Dependency scanning we didn't originate. Anything requiring users to migrate.

---

## 6. How we'd know it's working

Leading indicators, in order of what actually matters:

1. **Repeat usage** — repos that run the Action on ≥5 PRs (the only metric that separates
   novelty from adoption). Target: 50 repos by end of Phase 2.
2. **Regressions caught** — count of merges blocked by a real finding that was then fixed.
   This is the product's actual output, and it must be measured, not assumed.
3. **Time-to-green** — median minutes from `npx` to a passing gate in a real repo.
   Target: < 10 min.
4. **A11y-community acceptance** — an explicit review from 2–3 respected accessibility
   practitioners *before* we publicize scores. If they call the score dishonest, we stop and
   fix it. Their objection is the project's biggest existential risk.
5. Stars/downloads — a lagging vanity metric. Watch it, don't steer by it.

---

## 7. Risks and honest mitigations

| Risk | Why it's real | Mitigation |
|---|---|---|
| **A11y community rejects the score** as automation theater | Automated tools cover ~30% of criteria; the field has been burned by "certified compliant" badges | Publish coverage limits in the report itself; no compliance claims ever; get practitioners to review before launch; make manual-review workflows first-class |
| **CI checks get disabled** | Every predecessor's failure mode (400 pre-existing errors → red forever) | Baseline + ratchet is M1, non-negotiable |
| **We drift into building a framework** | Frameworks are the natural gravity of "web dev tool" projects | Non-goals list in the README; every feature gated on "does the first command get better" |
| **Engine dependency** (axe-core license/behavior change) | We're a wrapper; our value can be pulled out from under us | Adapter interface from day one; a second engine can be added; contribute upstream rather than fork |
| **Score gaming / badge abuse** | Inevitable the moment it's popular | Public weights, wrong-answer fixtures, no badge without findings + disclaimer |
| **Maintainer burnout** (the OSS reality) | Sonatype-adjacent workloads, 1–3 people | Narrow scope, ruthless non-goals, automated triage, and a funding plan from day one (see §8) |
| **AI inverts the traffic model** | Vibe coding already cut one major CSS framework's docs traffic ~40%; agents install deps without visiting sites | This is upside-down: make the tool *agent-native* — the report is designed to be consumed by agents, which is where usage is heading |

---

## 8. Sustainability (decide now, not after 10k stars)

- **License: Apache-2.0** (already in the repo) — patent grant matters for a standards-ish
  project, and it's what corporate legal teams accept without a meeting.
- **No VC, no open-core gate on the score.** The score must be free forever or nobody trusts
  it. Funding: GitHub Sponsors + a paid *hosted dashboard for orgs that want history and
  compliance exports* — a convenience layer, never a lock on the checks.
- **Governance:** a written `GOVERNANCE.md` before Phase 2 that promises the spec is
  versioned publicly and can be forked. The standard is the legacy; the repo is just where
  it lives today.

---

## 9. Decisions I need from you

1. **Scope of v1** — my recommendation: Phase 0 + 1 only (audit + baseline + Action), ship in
   ~4 weeks, and let real users pull Phase 2 out of us. Alternative: build the Playwright
   runner and WebMCP layer first for a flashier demo, at the cost of a month and a much
   heavier first install.
2. **Wedge audience** — (a) agency/freelancer devs who must satisfy EAA now and feel the pain
   today; (b) OSS maintainers (star-friendly, low budget); (c) teams with audit deadlines
   (money, but slower to reach). I'd start with (a) for urgency and (b) for distribution.
3. **The name.** `web-spark` is fine and now the repo, but the CLI/package name matters for
   discovery. Candidates: `spark`, `webspark`, `conformance`, `sightline`, `proof`. I'd avoid
   `spark` alone (collisions, and it's a Kubernetes project); `webspark` reads clearly as
   "the web's conformance tool."
4. **How hard we lean on the agent angle.** It's the best narrative and the newest capability,
   and it's also the easiest thing to over-promise. My instinct: ship it as a *reporting*
   capability in Phase 2, never as an "AI fixes your a11y" claim until we have recorded
   evidence.

---

## 10. The next commit

If you say go, the immediate work is:

1. `README.md` — the pitch, the 30-second demo GIF, the honest limits.
2. `src/` — CLI skeleton: `check`, `baseline`, `--ci`, terminal reporter, four sub-scores,
   jsdom+axe adapter.
3. `fixtures/` — known-bad pages, one per top-six error category (wrong-answer tests).
4. `scripts/scan-top-sites.mjs` — the reproducible dataset generator.
5. `.github/workflows/self-check.yml` — we gate our own repo on our own tool.

Everything above is small, and every piece is separable if we change our minds.
