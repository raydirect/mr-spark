# Phase Plan — the working reference

This is the operational plan. The other documents explain *why*; this one says **what gets
built, in what order, and how we know it is done.** If a document and this file disagree about
scope, this file wins for scheduling and the others win for rationale.

Last updated: Phase 1b merged (report page + `--serve` + self-audit). Phase 1c next.

---

## 0. Status board

| Phase | Deliverable | Status |
|---|---|---|
| **1a** | engine · IR v0 · score · terminal + JSON reporters · `check` · fixtures · 13 tests · self-gating CI | ✅ merged |
| **1b** | deterministic server-rendered **report page** · `report` command · `--serve` · dogfooding (our report passes our tool) | ✅ merged |
| **1c** | `baseline` + `--ci` regression-only gating · SARIF · GitHub Action with PR comment | ⏳ next |
| **1d** | `.spark-tools.lock` · `spark mcp serve` · `MCP*` rules · self-conformance | ⏳ |
| **2** | three machine faces · MCP conformance as a product · extension lens | ⏳ |
| **3** | design/settings documents → conformant pages · safe fixes | ⏳ |
| **4** | motion document + runtime, reduced-motion as a checked property | ⏳ |
| **5** | scene renderer with projected semantic DOM | ⏳ |

Total to a complete product: **5 phases + 1 standing prerequisite**, roughly 14–18 months of
focused work. Every phase is independently useful, so there is no cliff.

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

## 2. Phase 1 — Verify

**Goal:** a stranger gets a true answer about any page in seconds, and cannot merge a regression.

### 1a — the engine ✅

| Item | Detail |
|---|---|
| IR 0.1 | plain JSON, sorted-key canonical form, SHA-256 content address, content-derived finding ids |
| Score | public weights, independent pillars, `null` for unmeasured, saturation clamped at zero |
| Collector | the only place a DOM is allowed; rules engine injected into the jsdom realm once |
| Reporters | terminal (designed), JSON (machine face, carries `irVersion` + `scoreSpec`) |
| CLI | `check <file\|url>`, `--format`, `--fail-under`, `--no-color`, exit codes 0/1/2 |
| Tests | 13 — determinism, null-vs-zero, saturation, id stability, fixture behaviour |

**Done when:** `npm test` is green, the bad fixture fails a 90 threshold, the good fixture passes,
and the workflow proves both.

### 1b — the report page 🔨

The front door, per the ease model: rung 1 is a link, and a link has to be readable by anyone,
anywhere, forever.

| Item | Requirement |
|---|---|
| Rendering | complete HTML on the server; **no client JS required**; readable with scripting disabled and in a text browser |
| Determinism | output is a pure function of `(target, engine version, rule set version)`; identical inputs must produce byte-identical output except the provenance timestamp |
| Provenance block | engine version, score-spec version, IR hash, timestamp, and the exact command to reproduce locally |
| Findings | raw findings listed, not only the score; undecided checks shown separately |
| Safety | target text is HTML-escaped; rule text comes from the rule id, never interpolated from the scanned page |
| Accessibility | **the report must pass our own tool** — this is a CI test, not an aspiration |
| Size | one self-contained file, no webfonts, no external requests |
| Command | `spark report <target> --out <file>` and `spark report <target> --serve [--port]` |

**Done when:** a generated report scores ≥95 with our own engine, is byte-identical across two
runs (excluding the timestamp), and serves over HTTP on `0.0.0.0`.

### 1c — the gate

| Item | Requirement |
|---|---|
| Baseline | `spark baseline` writes `.spark-baseline.json` from the current IR; committed |
| Regression-only | `--ci` fails **only** on new or worsened findings — never on pre-existing debt |
| Ratchet | a fixed finding may be promoted into the baseline so debt can only shrink |
| SARIF | `--format sarif` for native code-scanning surfaces |
| Action | one-line GitHub Action; posts a single PR comment with the delta and updates it in place |
| Budgets | `--max-js`, `--max-lcp`, `--min-score` enforced from day one |

**Done when:** a mature repo with 400 existing findings can go green in one commit, and a new
violation introduced in a later PR is blocked and then fixed.

### 1d — agents

| Item | Requirement |
|---|---|
| `spark mcp serve` | stateless, 2026-07-28 shape, IR hash as the handle, read-only by default |
| Tools | `audit`, `explain`, `fix` (returns a diff, never writes), `verify_tools`, `emit_faces`, `baseline` |
| `.spark-tools.lock` | SHA-256 per tool definition; `spark tools verify` fails CI on drift |
| `MCP*` rules | `MCP001`–`MCP010`, each with published rationale |
| Self-conformance | our own server passes `verify_tools`, in CI |

**Done when:** an agent completes `audit → explain → fix` end-to-end through the protocol, and
tool drift is caught before merge in a real repository.

**Phase exit:** 10 real repositories gated with a committed baseline; ≥3 merges blocked by a real
regression and then fixed; the public state-of-the-web dataset published and reproducible.

---

## 3. Phase 2 — Manifest

**Goal:** one capability declaration becomes three machine faces, and they are proven to agree.

- `emit_faces`: browser-side tool declarations, an MCP server definition, and a content index,
  all lowered from one IR `tools` section.
- `MCP009` face-agreement check: fail the build if the three disagree.
- Extension as the **lens**: authenticated-page audits, interaction capture, `capture → baseline`
  export. It **collects, never judges**.
- Snippet capture (rung 4) built on the same capture format.

**Exit:** a page's agent-visible capabilities go 0 → N, proven reachable and labelled; a
third-party MCP server fixed by our `MCP*` findings; three faces provably identical in CI.

---

## 4. Phase 3 — Author

**Goal:** a document produces a conformant page, and the verifier proves the generator.

- Settings/design document format (own schema) → IR → page.
- Editor: browser-based web app, engine in a worker, no analysis in the UI.
- Safe fixes only: every codemod ships a diff and a test proving behaviour is unchanged.
- Token export (CSS custom properties + JSON).

**Exit:** a real marketing page rebuilt from a document, scoring higher than its hand-written
original, with the diff published.

---

## 5. Phase 4 — Animate

**Goal:** the first motion format where accessibility is a checked property.

- Motion document format: declarative, diffable, inspectable, with **semantic intent** per
  animation (entrance, exit, emphasis, feedback).
- Runtime: reduced-motion-aware by construction, not by a global off-switch.
- Rules: vestibular triggers (large transforms, parallax, looping), missing reduced-motion path,
  animation that blocks interaction, motion that outlasts its purpose.

**Exit:** a motion artifact that both a screen-reader user and a vestibular-sensitive user
approve, demonstrated on camera.

---

## 6. Phase 5 — Render

**Goal:** drawn scenes with a real, projected semantic DOM — accessible pixels.

- Scene document → canvas/WebGL output **plus** a projected DOM layer (roles, names, focus order,
  hit-testing routed back to the scene graph).
- Hard gate: a scene page passes the same verifier at the same bar as a DOM page.
- WASM on measured hot paths only, CI-built, never a build prerequisite.
- Optional thin desktop shell for filesystem/offline — packaging, never architecture.

**Exit:** a scene-based page passes at the same bar as a DOM page, with the coverage caveat
printed like everything else.

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

### Testable at the end of 1b

| What | How |
|---|---|
| The shared report page | `spark report <target> --serve` then open it |
| Determinism | run twice, `diff` the outputs |
| Accessibility of our own output | `spark check report.html --fail-under 95` |
| Reader without scripting | disable JS / read in a text browser |

### Testable at the end of 1c

| What | How |
|---|---|
| Regression-only gating | commit a baseline, introduce one violation, watch it block |
| The ratchet | fix a finding, promote it, confirm it cannot come back |
| SARIF | upload to a code-scanning surface |

### Testable at the end of 1d

| What | How |
|---|---|
| The agent path | connect an MCP host, run `audit → explain → fix` |
| Tool drift | change a tool description, watch `spark tools verify` fail |
| Self-conformance | our own server under our own `MCP*` rules |

### Not testable yet — and we will not pretend otherwise

Motion safety, the renderer, the three machine faces, and the editor. Those have no code. Any
demo of them today would be a mock, and mocks are how projects lie.

---

## 9. Known gaps to close before publicizing

| Gap | Why it matters | Owner decision |
|---|---|---|
| **Score weights are uncalibrated** (10/5/2/1, saturating at 100 damage) | The number will be shown for real sites | Calibrate against the fixture set + practitioner review |
| **Contrast is undecided without a canvas** in the browserless path | Our most common real finding is unavailable in the default runner | Keep honest; add the browser runner in Phase 1c/2 |
| **First-run install** — `npx` pulls the optional engines, `--omit=optional` does not | A failed first command is a lost user | Verify from a packed tarball in CI; make the error message actionable |
| **Report page is not yet a URL service** | Rung 1 is a link | Local `--serve` now; hosting is a Phase 2 decision, never a gate |
| **Rules are inherited, not ours** | Coverage and messaging are the upstream engine's | Own the *score* and the *rationale*; never fork the engine |

---

## 10. Working agreements

- **The engine imports no surface.** IR in, findings out.
- **Surfaces compute nothing.** They collect and render; the engine judges.
- **Unmeasured is `null`.** Never zero, never 100.
- **Every finding has a rule id and a published reason.** A rule we cannot justify gets deleted.
- **No new dependency** without a line in the PR explaining what it replaces.
- **No phase ships a demo of an unbuilt pillar.**
