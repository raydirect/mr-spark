# Phase Plan — the working reference

This is the operational plan. The other documents explain *why*; this one says **what gets built,
how we know it is done, and what the rules of engagement are.** Sequencing lives in
[REVOLUTION.md §7](REVOLUTION.md#7-the-phases-this-is-the-new-sequence) so there is exactly one
place to change it.

Last updated 2026-11-07, when the three document formats froze. The sequence changed before that:
**`REVOLUTION.md` is now the directive plan** for order and
scope; this file remains the operational checklist and the definition of done. Read
`REVOLUTION.md §7` for *why* the order below is what it is, and §12 for what the previous order
got wrong.

---

## 0. Status board

Sequence per [REVOLUTION.md §7](REVOLUTION.md#7-the-phases-this-is-the-new-sequence). Phases 0–2
are the trust foundation; 3 is the first creative surface; 4–6 deepen by width.

| Phase | Deliverable | Status |
|---|---|---|
| **0a** | engine · IR v0 · score · terminal + JSON reporters · `check` | ✅ merged |
| **0b** | deterministic server-rendered **report page** · `--serve` · dogfooding | ✅ merged |
| **0c** | score calibration spec 2.0.0 · hyperbolic curve · undecided excluded | ✅ merged |
| **0d** | one token store · one view model · real dark theme · verified contrast | ✅ merged |
| **0e** | full rule set (100 of 105) · fragments vs documents · upper-bound scores | ✅ merged |
| **0f** | **ground truth** — per-root-cause scoring · suppression with reasons · real-page corpus · re-audit | 🟡 sub-linear pricing pinned at 1/84/200-finding scale · corpus is five pages now, the two newest ours with their CSS inline, which settled one thing: a stylesheet in the file does not make contrast decidable offline, only a browser does · open: one committed page from outside this repo (calibration), and the browser runner |
| **1** | **spine** — frozen `scene`/`motion`/`settings` schemas · `lower` · `emit` · byte-identical output | 🟡 **nearly** — formats + validator + published `schema/` ([ADR 0002](adr/0002-one-grammar-three-projections.md)), `lower`/`emit` with the emitted page audited in CI ([ADR 0003](adr/0003-emit-refuses-rather-than-degrades.md)); open: `schema/` + IR spec at a stable URL |
| **2** | **gate** — `baseline` · regression-only `--ci` · SARIF · action · structural finding identity | ⏳ |
| **3** | **studio** — browser canvas, inspector, live verifier, export, URL/HTML import | ⏳ |
| **4** | **motion** — motion document, timeline, state graph, reduced-motion by construction | ⏳ |
| **5** | **manifest** — one declaration → three faces · `MCP*` · `.spark-tools.lock` | ⏳ |
| **6** | **render** — scene → canvas + projected semantic DOM, gated at the DOM bar | ⏳ |

Something usable and demonstrable at the end of Phase 3 (~10 weeks from the start of Phase 0f).
Complete product ~14 months. Every phase is independently useful, so there is no cliff.

**Carried forward and not yet done:** `docs/STATE-OF-THE-WEB.md` (public, reproducible dataset from
our own scanner) lands during Phase 2; `spark mcp serve` moves from 1d to Phase 5 where the three
faces give it something to emit.

---

## 1. Standing prerequisite (runs in parallel with everything)

Not a phase — a habit. Skipping it is how this project fails.

- **Freeze IR v0** and publish the schema at a stable URL.
- **Publish the score spec** with its weights and a semantic version. Any change is a new minor
  version, and the reporter prints which version produced a number.
- **Practitioner review before publicizing scores.** Two or three respected accessibility
  engineers must say the score is honest. Until then, our numbers are internal.
- **Calibrate**: every score claim is checked against the fixture set, and the fixture set grows
  every time we meet a real-world page that scores wrongly.
- **Dogfood**: this repository passes its own gate, in CI, permanently.

---

## 2. Phase detail

The phase-by-phase breakdown — deliverables, dependencies, exit criteria and the argument for the
order — lives in **[REVOLUTION.md §7](REVOLUTION.md#7-the-phases-this-is-the-new-sequence)**. It is
kept in one place so the two documents cannot drift.

What stays here is the part that applies to every phase: the standing prerequisite above, the
definition of done below, the testing schedule, and the working agreements.

Historical detail for the completed phases (0a–0e) is in git history and in
`docs/adr/`; the phase entries that used to live here described a sequence that has been
superseded.

---

## 7. Definition of done (applies to every phase)

A phase is only done when **all** of these hold:

1. `npm test` green, including a **wrong-answer test** for every new rule (a fixture that must
   fail, so we cannot drift into "no findings = fine").
2. `spark check` on our own report artifacts passes.
3. Output is deterministic and byte-diffable.
4. Every new claim is either measured or explicitly marked as not measured — never implied.
5. Docs updated: `VISION.md` status, this file's status board, README if the story changed.
6. Coverage limits printed in the output of any surface that shows a score.

---

## 8. Testing schedule (answer to "when can we start testing?")

### Testable right now

| What | How | Time |
|---|---|---|
| The whole engine + CLI | `npm install && npm test` | ~5 s |
| A real report on a real page | `node bin/spark.js check <file.html>` | <1 s |
| A live URL | `node bin/spark.js check https://example.com` | 1–5 s |
| Machine output | `--format json` | <1 s |
| Gate behaviour | `--fail-under 90` → exit 1 | <1 s |
| CI behaviour | push a branch; the workflow self-gates | ~30 s |
| The document formats | `node --test test/formats.test.js` | ~1 s |
| A document against the format | `node -e "import('./src/formats/index.js').then(m => console.log(m.validateDocument('scene', JSON.parse(require('node:fs').readFileSync('my.spark.scene.json','utf8')))))"` | <1 s |
| The published schemas match the grammar | `npm run formats:check` | <1 s |

### Testable at the end of 0b

| What | How |
|---|---|
| The shared report page | `spark report <target> --serve` then open it |
| Determinism | run twice, `diff` the outputs |
| Accessibility of our own output | `spark check report.html --fail-under 95` |
| Reader without scripting | disable JS / read in a text browser |

### Testable now that Phase 1's compiler has landed

| What | How |
|---|---|
| A document set becomes a page | `spark emit test/fixtures/docs/shop.spark.scene.json --out /tmp/x` |
| Byte-identical output | emit twice into two directories, `diff -r` them |
| The page survives our own bar | `spark check /tmp/x/index.html --fail-under 95` |
| Nothing invented in the CSS | no hex outside `:root`/`[data-theme]`, no `style=`, no `!important` — all asserted in `test/spine.test.js` |

### Testable at the end of 2

| What | How |
|---|---|
| Regression-only gating | commit a baseline, introduce one violation, watch it block |
| The ratchet | fix a finding, promote it, confirm it cannot come back |
| SARIF | upload to a code-scanning surface |

### Testable at the end of 5

| What | How |
|---|---|
| The agent path | connect an MCP host, run `audit → explain → fix` |
| Tool drift | change a tool description, watch `spark tools verify` fail |
| Self-conformance | our own server under our own `MCP*` rules |

### Not testable yet — and we will not pretend otherwise

A canvas. A document set compiles to a page today and the page is auditable today, but there is no
editor: the renderer, the studio, the three machine faces and the runtime that `EMIT001` refuses on have
no code. Any demo of those today would be a mock, and mocks are how projects lie.

---

## 9. Known gaps to close before publicizing

| Gap | Why it matters | Owner decision |
|---|---|---|
| **Score calibration needs field review** | The curve is now published and frozen as tests (spec 3.0.0), but no external practitioner has signed off | Practitioner review before any badge or ranking; every wrongly-scored real page becomes a fixture |
| **Contrast is undecided without a canvas** in the browserless path | Our most common real finding is unavailable in the default runner | Keep honest; add the browser runner in Phase 1c/2. Scoped by `UNDECIDED.md`: that runner clears `environment` findings — contrast and nothing else — so `judgement` findings stay permanently undecided and must never be sold as pending work |
| **First-run install** — `npx` pulls the optional engines, `--omit=optional` does not | A failed first command is a lost user | Verify from a packed tarball in CI; make the error message actionable |
| **The package name is not ours** | `webspark` on npm has belonged to an unrelated Node blog engine since 2019, so every old `npx webspark` line in these docs pointed at a stranger's package | **Closed in the repo, open in the world:** the product is **MR-Spark**, `package.json` says `mr-spark` (unclaimed when checked), `brand.js` `NAME` drives the report header and the emitted provenance line, and the docs are swept. What is left is human: publish `mr-spark` (and the `mrspark` pointer) from the maintainer's npm account, ~~`gh repo rename`~~ **done 2026-11-07**: the repository is `raydirect/mr-spark` and every clone line points at it (the owner ran it; the automation token is refused `403` because renaming needs `administration:write`, which is also why the doc strings were left correct-for-the-old-name until then). Remaining human steps: `npm publish` `mr-spark` + the `mrspark` pointer, and the two Cloudflare secrets for the first real deploy |
| **Report page is not yet a URL service** | Rung 1 is a link | Local `--serve` now; hosting is a Phase 2 decision, never a gate |
| **`schema/` has a free host, not an owned one** | The `"$schema"` string in every document — `https://mr-spark.pages.dev/schema/scene-0.1.json` — is a *required const*, so it is part of the format and not an ops detail: it must answer, and keep answering the same bytes and headers for as long as documents name it | **Closed for testing, open for permanence:** `SCHEMA_HOST` now names a real host we can deploy to, `npm run schema:bundle` writes the static tree with its `_headers`, `.github/workflows/pages.yml` deploys and verifies bytes *and* headers, and `schema:serve`/`schema:verify` still cover the offline case. Two things remain: the Cloudflare secrets (and the first deploy) — without them the workflow skips with a notice rather than going red — and a bought domain, because a free `pages.dev` subdomain cannot honestly carry the ten-year promise in `docs/HOSTING.md` §5.1. The rename and the host moved together, per `docs/adr/0004-one-name-one-host.md` |
| **Motion that needs a runtime cannot be emitted** | `EMIT001`: `state`, `click` and `scroll` triggers and machines with effects are refused, so a document that uses them has no page | Phase 4 ships the ~3 KB generated runtime; until then the refusal is the answer, and it names the alternative in the message |
| **Rules are inherited, not ours** | Coverage and messaging are the upstream engine's | Own the *score* and the *rationale*; never fork the engine |
| **A baked `spring(...)` ease is not in the table** | `sampled` already covers any curve that is a pure function of progress, so a *prerecorded* spring bakes fine; only an interruptible, velocity-carrying one needs Phase 4's runtime. Robert Penner's own `@penner/easing` (MIT) has the closed forms, including the one distinction we would have to copy: `innerSpring` never overshoots past 1, which is what a progress bar or an opacity fade needs | A **format amendment**, not a runtime: add the family to `EASE_FAMILIES` with `params`, and `test/ease-laws.test.js` refuses to let it ship until its transcription of the published curve exists. Owner's call before Phase 4 spends anything on springs |

---

## 10. Working agreements

- **The engine imports no surface.** IR in, findings out.
- **Surfaces compute nothing.** They collect and render; the engine judges.
- **Unmeasured is `null`.** Never zero, never 100.
- **Every finding has a rule id and a published reason.** A rule we cannot justify gets deleted.
- **No new dependency** without a line in the PR explaining what it replaces.
- **No phase ships a demo of an unbuilt pillar.**
