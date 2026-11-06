# web-spark — The Revolution Plan

> **One line:** the first web toolchain where every artifact proves itself — design, motion,
> settings, pages and agent capabilities all lower into one typed intermediate representation,
> are verified by the same engine that judges shipped pages, and are emitted as standard web
> output that works forever.

Status: **directive plan, supersedes the sequencing in `VISION.md §4` and `PHASE-PLAN.md §2–6`.**
Thesis, architecture and research survive unchanged. What changes here is *what gets built in
what order*, and the reason is recorded in §12.

Read this document when you want to know what we are building and why the order is what it is.
Read `PHASE-PLAN.md` for the operational checklist. Read `VISION.md` for the argument. If they
disagree about *sequence*, this file wins; if they disagree about *purpose*, `VISION.md` wins.

---

## 1. What we are actually building

A **creative toolchain** for the web, not a linter.

| The thing a person does | In web-spark |
|---|---|
| Designs a page | Authors a **scene document** — components, layout, tokens, states. Typed, diffable JSON. |
| Animates it | Authors a **motion document** — timelines and state machines with semantic intent per animation. |
| Configures it | Authors a **settings document** — data → tokens → generated CSS, contrast computed at author time. |
| Ships it | **Compiles** documents to standard HTML/CSS/JS. No proprietary runtime, no lock-in. |
| Proves it | The **verifier** judges the compiled output. It is the middle of the compiler, not a step after it. |
| Exposes it to agents | One declaration lowers to **three machine faces**, proven to agree. |

Four artifacts, one compiler, one verifier:

```
   SCENE ─┐
  MOTION ─┼─▶  typed IR  ──▶  compiler  ──▶  HTML / CSS / JS  ──▶  a real page
SETTINGS ─┘        │                                                      │
     CAPABILITIES ─┘                                                      │
                   └────────────────  VERIFIER  ◀────────────────────────┘
                        every artifact proves itself
```

**The single non-negotiable:** you cannot emit an artifact the verifier has not judged. Authoring
is not a text editor with a preview; it is a compiler whose output is checked by construction.

---

## 2. The one sentence that is the product

> *A designer ships an accessible, fast, machine-legible, animated page without touching code —
> and cannot ship a broken one.*

Everything below either serves that sentence or is cut. Where a feature makes the sentence
harder to keep, the feature loses.

---

## 3. What we take from the influences, and what we refuse

We take **capability**, never a name, a file format or a runtime. Brand-free, per standing rule.

| Capability worth having | What we take | What we refuse to take |
|---|---|---|
| Visual authoring on a canvas | Direct manipulation, immediate feedback, a real document behind it | A proprietary format; a canvas that no crawler or screen reader can read |
| Timeline + state-machine animation | Temporal authoring as a first-class document with named states and transition conditions | A runtime that only our editor can produce; animation with no semantic intent |
| Declarative settings → CSS | Controls as data; CSS generated from configuration; tokens as the only source | Vendor coupling; settings that only work inside one host |
| A typed authoring language | Types on the document itself, so an invalid state cannot compile | A bespoke scripting language nobody can hire for |
| Component composition runtime | Colocated state, composition, islands, no global store required | A framework that owns the page and forbids the web platform |
| Vector/scene authoring | Deterministic scenes, GPU paths, progressive fallback | Content locked inside a renderer |
| Structured design documents | Components, variants, constraints, tokens as data | A cloud-only document; handoff as a manual export |
| Systems-language performance | WASM on measured hot paths, CI-built | A systems compiler as a build prerequisite; a native UI rewrite |
| Discovery conventions | Plain-text contracts, structured data, explicit agent policy | Vendor-specific "optimization" claims |
| Module hygiene | Deterministic builds, content hashes, reproducible artifacts | Runtime registry dependence for correctness |

**The refusal column is the strategy.** Every tool in the inspiration list is excellent at its
half and proprietary at its seam. We are mediocre-to-good at many halves and open at every seam.
That is the only defensible position for a new entrant, and the only one that survives the death
of this project.

---

## 4. The architecture

### 4.1 Layers, and the dependency rule

```
┌───────────────────────────────────────────────────────────────────┐
│ SURFACES        studio (browser) · cli · ci action · mcp server    │  render + collect
├───────────────────────────────────────────────────────────────────┤
│ COMPILER        lower(document) → IR → emit(IR) → artifacts        │  pure transforms
├───────────────────────────────────────────────────────────────────┤
│ VERIFIER        analyzers → findings → score (published spec)      │  judges only
├───────────────────────────────────────────────────────────────────┤
│ IR              typed, plain JSON, content-addressed, versioned     │  the spine
└───────────────────────────────────────────────────────────────────┘
```

Hard rules, enforced in review and later by lint:

1. **The verifier imports no surface.** No `process.argv`, no DOM in scoring, no I/O.
2. **Surfaces compute nothing.** They collect inputs and render outputs. If a surface needs a
   verdict it did not get from the compiler, the compiler is wrong.
3. **The Compiler imports the verifier, never the reverse.** Emission may refuse to write an
   artifact that fails; verification must never know emission exists.
4. **The IR is the only cross-layer type.** No layer passes a bespoke object to another.

### 4.2 The IR, as it must grow

v0 today populates `document`, `tokens`, `tools`, and `findings`. The revolution needs it to
carry authoring, so the target shape is:

```jsonc
{
  "ir": "0.2",
  "provenance": { "source": "scene|motion|settings|url|source", "uri": "…", "kind": "document|fragment" },

  "document": { "lang": "en", "title": "…", "landmarks": ["main"],
                "tree": [ { "role": "heading", "level": 1, "text": "…" } ] },

  "scene":    { "components": [ { "id": "hero", "type": "stack", "props": {}, "children": [] } ],
                "layout":     { "hero": { "display": "grid", "cols": "1fr 1fr" } },
                "states":     { "card": { "default": {}, "hover": {}, "focus-visible": {} } },
                "assets":     [ { "id": "logo", "kind": "svg", "sha256": "…" } ] },

  "motion":   [ { "id": "hero-in", "target": "#hero", "intent": "entrance",
                  "properties": ["opacity", "transform"], "durationMs": 420,
                  "trigger": "load", "reducedMotion": "instant" } ],

  "tokens":   { "color.fg.muted": { "value": "#4a525c", "contrastOn": { "bg": 7.92 } } },

  "settings": { "controls": [ { "path": "color.accent", "type": "color", "default": "#0b5fd0" } ] },

  "legible":  { "structuredData": [ { "type": "Product", "valid": true, "claims": 7 } ],
                "robots": true, "sitemap": true, "textWithoutJs": true },

  "tools":    { "server": "2026-07-28",
                "declared": [ { "name": "search", "readOnly": true, "sha256": "…",
                                "faces": ["browser", "mcp", "index"] } ] },

  "findings": []
}
```

Rules that keep it honest:

- **Absent is absent.** A section that was not authored is `null`, never `{}` pretending.
- **Every section is independently useful.** The verifier reads `scene` even if nobody authors
  one; the compiler emits from `motion` even if no editor exists. No format depends on Studio.
- **Versioned, published, content-addressed.** `0.2` is a new major section set; existing 0.1
  consumers keep working because sections are additive and the version is a field.

### 4.3 The document stack (what a person actually edits)

Three document types, one grammar, one type system:

| Document | Authoring surface | Compiles to | Verified by |
|---|---|---|---|
| **Scene** (`.spark.scene.json`) | canvas + inspector | HTML + CSS | accessible, legible, fast |
| **Motion** (`.spark.motion.json`) | timeline + state graph | CSS transitions / WAAPI / JS runtime | motion rules (Phase 4) |
| **Settings** (`.spark.settings.json`) | generated control panel | tokens → CSS custom properties | contrast, token integrity |

All three are **JSON with a JSON Schema**, **typed for authors via TypeScript declaration
files**, and **diffable**. Why JSON and not a binary or a bespoke DSL: diffability is not a
convenience, it is what makes review, merge, blame and the verifier's delta meaningful. A
proprietary binary document is the single most destructive thing we could do, and it is what
the dead ecosystem did.

The typed-JS dialect is the *authoring* language, not a runtime: authors get autocomplete and
errors on an invalid document, and a CI type-check of the document costs nothing. We do not invent
a scripting language; we use the one every front-end developer already knows. Where behaviour is needed beyond declarative documents, the escape
hatch is an ordinary ES module export — typed, linted, and measured by the same verifier.

---

## 5. The six surfaces

One engine, six faces. Each is a different way to reach the same truth.

| Surface | What it is | Ships in | Never does |
|---|---|---|---|
| **Verifier** (CLI) | `spark check` — audit any page, any URL, in seconds | ✅ exists | analyse with a DOM in a reporter |
| **Report** | self-contained, deterministic HTML page with provenance | ✅ exists | require client JavaScript |
| **Studio** | browser authoring app: canvas, inspector, timeline, preview | 3 | render with a second, divergent engine |
| **Gate** | `baseline` + `--ci` + SARIF + action comment: regression-only | 1c | fail on pre-existing debt |
| **MCP server** | `spark mcp serve` — the whole lifecycle as tools | 1d | write without opt-in |
| **Lens** | capture-mode collection of live, authenticated pages | 2 | judge what it captured |

The Studio's preview **is** a browser view: the same layout engine, the same compositor, the same
accessibility tree that a user gets. This was decided in `SHELL.md` and it is what makes "what you
see is what verifiably ships" true rather than a slogan. A native shell arrives only as packaging
in Phase 5, never as the architecture, because a native shell is a second unaudited surface.

---

## 6. The five pillars, re-scoped

Pillars are *what we measure*. They are not phases; phases are in §7.

| # | Pillar | Measures | Current | Target |
|---|---|---|---|---|
| 1 | **accessible** | detectable WCAG failures + structure | ✅ live | + browser runner for contrast, focus order, target size |
| 2 | **fast** | budgeted weight, blocking work, layout stability | ⏳ | browser runner with real network/CPU throttling |
| 3 | **safe** | dependency and protocol posture, incl. agent tool definitions | ⏳ | `MCP*` rules, `.spark-tools.lock` drift |
| 4 | **legible** | discoverability, agent readiness, structured-data validity, text-survives-rendering | ⏳ | see §11 |
| 5 | **resilient** | behaviour under failure: no-JS, slow network, blocked third parties | ⏳ | degradation profiles as documents |

**Unmeasured is `null`.** A pillar without a collector prints `—` and the count of measured
pillars beside every aggregate. This rule has already caught four of our own dishonest outputs;
it stays permanent.

---

## 7. The phases (this is the new sequence)

The old plan put Verify first for ten weeks, then Manifest, then Author at month six. That
sequence produced a correct tool that looks like a linter, and the project's own author could not
tell it apart from one. The new sequence front-loads a **vertical slice** so the three artifacts
prove they cohere, then deepens each in turn.

Total: **~14 months to a product**, with something usable and demonstrable at **~10 weeks**.

### Phase 0 — Ground truth (2 weeks) — *in progress*

Make the verifier trustworthy enough to be the gate of everything after it. Without this, every
later phase reports confident nonsense.

- Fix the scoring defect: one root cause charged per element (a single missing landmark produced
  88 findings and a score of 19 on a real page).
- **Suppression with printed reasons** — `spark.config.json`, justified ignores, report shows
  "N suppressed" with reasons. A gate with no legitimate way to say "deliberate" gets disabled.
- Resolve the decided-vs-undecided inconsistency seen on real pages.
- **Corpus in the repo**: the real pages that scored wrongly become fixtures. This is the
  standing prerequisite in `PHASE-PLAN.md §1` and it has already been skipped once.
- Re-audit published numbers; bump score spec if anything moves.

**Exit:** the four real demo pages score believably, the corpus is committed, and no score in the
repository disagrees with its own fixture.

### Phase 1 — Spine (3 weeks)

The document formats exist and the compiler can round-trip.

- Freeze `scene`, `motion`, `settings` **schemas** (`schema/*.json`) with TypeScript types.
- `spark lower <doc>` → IR — pure, deterministic, tested.
- `spark emit <ir>` → HTML/CSS — a static page from a scene document, no interactivity.
- Determinism: same document → byte-identical output, asserted in CI.
- One worked example, committed: a landing page as a scene document.

**Exit:** `spark lower` + `spark emit` turns a hand-written document into a page, byte-identically,
and `spark check` on that output passes at the same bar as a hand-written page.

### Phase 2 — Gate (3 weeks)

Make verification consequential. This is still front-loaded because it is the trust credential.

- `spark baseline`, `.spark-baseline.json`, regression-only `--ci`.
- **Finding identity that survives generated ids.** Required before any baseline: an additive
  edit must not report a fixed+new pair. Identity is `ruleId + structural path` when a selector
  contains generated ids, with both forms recorded in the IR.
- SARIF output; one-line GitHub Action posting a single updated PR comment.
- Budgets: `--max-js`, `--min-score`.

**Exit:** a repo with 400 existing findings goes green in one commit; a new violation is blocked;
a purely additive PR passes.

### Phase 3 — Studio (8–10 weeks)

The first thing a person opens and uses. Browser app, engine in a worker.

- Canvas: real DOM rendering, selection, drag, resize, alignment, undo/redo.
- Inspector: tokens, spacing, type, states — writing to the scene document, not to CSS.
- Preview: the same page in a second viewport, **with the verifier's verdict live** — findings
  appear on the canvas as you author, not after export.
- Export: compile to a clean project (HTML/CSS/JS, no runtime lock-in).
- Route to adoption: **open the app, drop in a URL or an HTML file, and get an editable
  document.** Going from "I have a page" to "I can edit it" in one step is how this tool gets
  used by people who will never read a schema.

**Exit:** a real marketing page authored in Studio exports, passes the verifier, and diffs cleanly
against the hand-written original. Published as a public before/after.

### Phase 4 — Motion (6–8 weeks)

The strongest differentiator, and the reason the phrase "revolution" is defensible at all.

- Motion document: timeline + state machine, per-animation **semantic intent**
  (`entrance`/`exit`/`emphasis`/`feedback`/`decorative`).
- Runtime: reduced-motion aware **by construction** — intent decides the fallback, not a global
  kill switch.
- Rules: vestibular triggers (large transforms, parallax, looping), missing reduced-motion path,
  animation blocking interaction, motion outlasting its purpose, motion that hides content.
- Timeline editor in Studio; state graph view.
- Export: CSS for simple cases, WAAPI for orchestration, a small runtime for state machines.

**Exit:** an animated artifact approved by both a screen-reader user and a vestibular-sensitive
user, demonstrated on camera. This is a recorded, public, human test — not a benchmark.

### Phase 5 — Manifest (4 weeks)

One declaration, three faces, proven to agree.

- `emit_faces`: browser tool registration, MCP server definition, content index + structured data.
- `MCP009` face-agreement check; `.spark-tools.lock` with per-tool hashes; `spark tools verify`.
- `MCP001`–`MCP010` rule family with published rationale; Spark passes its own in CI.

**Exit:** a page's agent-visible capabilities go 0 → N, reachable and labelled; three faces
provably identical; a third-party server fixed by our findings.

### Phase 6 — Render (10–14 weeks)

The big swing, and only defensible now that everything before it can judge.

- Scene document → canvas/WebGL output **plus a projected semantic DOM**: roles, names, focus
  order, hit-testing routed back to the scene graph.
- **Hard gate:** a scene page passes the same verifier at the same bar as a DOM page, in both
  accessibility and legibility. A canvas page that fails is not shipped.
- WASM on measured hot paths only, CI-built, never a prerequisite.
- Optional thin desktop shell — packaging.

**Exit:** a scene-based page passes at the same bar as a DOM page, with the coverage caveat
printed like everything else.

---

## 8. The revolution thesis, stated for a stranger

Three claims, in increasing ambition. Each is falsifiable.

1. **Verification becomes a property of authoring.** Today you design, export, then audit — if
   you audit. Here the compiler refuses to emit an artifact the verifier rejects, so the
   failure is caught while it is still cheap. *Test:* can a page be authored in our tool and
   shipped broken? If yes, we failed.
2. **One document replaces five handoffs.** Design, motion, settings, semantics and agent
   capabilities are one artifact with one type system, so a cross-cutting defect is one finding
   instead of five tickets: *"this control is 2.9:1 from the token, animates a vestibular
   trigger, has no accessible name in the shipped DOM, and declares no agent tool."* **That
   sentence has never been checkable before.** It is the product.
3. **Output is forever.** Standard HTML/CSS/JS, no proprietary runtime. If web-spark disappears,
   the pages still work, still validate, and still run. Every tool in the inspiration list fails
   this test, and one of them already took a decade of authored work down with it.

---

## 9. What we deliberately refuse

Written down so a maintainer can point at it.

| Refused | Why |
|---|---|
| A proprietary runtime or binary document format | The dead ecosystem's mistake, in one sentence |
| Hosted-only documents | Your work must survive our company |
| Certification, badges, rankings | Automation reaches ~30% of criteria; badges are how this field gets burned |
| An account system | Permanently. Anything behind a login is not rung 1 of the ease ladder |
| An AI page generator | We compile documents; we do not sell prose |
| A dependency scanner | One rule family, not a product |
| A rendering canvas for *all* content by default | Canvas is an option, never the default, and never without a projected DOM |
| Reimplementing CSS | Decade-long trap |
| A second rendering engine for the editor | The design surface is the runtime |
| Optimising for rankings | We check readiness, never outcomes |

---

## 10. How we know it worked

Measured, on a schedule, published.

| Signal | Target | When |
|---|---|---|
| Repositories gated with a committed baseline | 10 | end of Phase 2 |
| Merges blocked by a real regression, then fixed | ≥3 | end of Phase 2 |
| Pages authored in Studio and shipped | 1 real, public, with before/after | end of Phase 3 |
| Motion artifacts approved by both user groups | 1, on camera | end of Phase 4 |
| Third-party servers fixed by our findings | 1 | end of Phase 5 |
| Canvas pages passing at the DOM bar | 1 | end of Phase 6 |
| Public state-of-the-web dataset, reproducible | 1,000 sites | during Phase 2 |
| **Regressions we shipped to users** | 0 confirmed | continuously |

---

## 11. Legibility: SEO, AEO, GEO — and why they are one pillar

The `legible` pillar answers three questions that are usually sold as three products:

| Term | The real question | Checked as |
|---|---|---|
| **SEO** | can a search engine crawl, parse and rank this? | title, description, canonical, heading structure, structured-data **validity**, robots/sitemap |
| **AEO** | can a retrieval system lift a *correct answer* out of this? | semantic HTML, answer-shaped headings, **text that survives rendering** |
| **GEO** | will a generative engine cite this as a source? | the same three machine faces as `MCP.md`, plus provenance and freshness signals |

Three consumers, one artifact. Building three checkers would be the "six products, one team"
failure, so it is one pillar with three sub-signals.

**The differentiator inside this pillar:** almost nobody checks whether content survives
rendering. Text injected by script, or drawn into a canvas, is invisible to a crawler *and* to a
screen reader — the same defect seen by two audiences. Phase 6's mandatory projected semantic DOM
is therefore a legibility guarantee as well as an accessibility one. One check, two industries.

**Three rules that must not break:**

1. **Never promise rankings.** Readiness is checkable; outcomes are not.
2. **GEO is lobbying, not technology.** No specification says what a generative engine will cite.
   We check signals and label them signals.
3. **Never fold `legible` into `accessible`.** Their incentives usually align and sometimes
   conflict (keyword stuffing, wall-of-text). One number would corrupt both.

**The export advantage:** pages compiled from a document cannot ship malformed structured data,
because the structured data is generated from the document's own typed fields rather than
hand-written. An entire failure class becomes unrepresentable.

---

## 12. Why the sequence changed

The old order was Verify → Manifest → Author → Animate → Render, with the first creative surface
at month six. It was defensible: a verifier is the trust credential, and it needs one user rather
than an ecosystem. It also failed a test that matters — **its own author could not tell it apart
from a linter after two weeks of work.** If the person who commissioned it cannot see the product,
no stranger will.

The amendment is not "build the pretty thing first". It is:

- **Verify deeply enough to be believed** (Phases 0–2, eight weeks) rather than completely
  (ten weeks plus). The difference is the browser runner, which waits.
- **Then prove coherence** with a thin vertical slice (Phase 3) where one document produces one
  page that is verified on export.
- **Then deepen by width**, one pillar per phase, each independently useful.

This keeps the original insight — verification inside the pipeline — and buys the one thing the
old plan could not: a product-shaped artifact early enough that the project survives to its own
deadline.

---

## 13. Risks, updated

Inherits `VISION.md §5` unchanged. Two additions:

| Risk | Assessment | Mitigation |
|---|---|---|
| **Studio ships before the verifier is trustworthy** | The single most likely failure now that authoring is front-loaded. A beautiful editor exporting unverified pages is the sixth clone of a design tool. | Phases 0–2 are gates: no Studio work merges until the corpus scores believably and the gate blocks a real regression. |
| **Three document formats become three products** | Real. Formats drift into dialects, then into vendored forks. | One grammar, one type system, one schema directory, one `lower()` entry point. A new document type requires deleting a section from this file. |

---

## 14. Decisions still open (blocking)

1. **First surface you personally want to open** — a canvas to drag boxes on, or a document you
   type that produces a page. Determines whether Phase 3 starts with the canvas or with the
   renderer. *Recommendation: renderer first, thin canvas second — every project that built the
   editor first wrote its format from the editor's needs and could never open it up.*
2. **Do scene documents allow arbitrary HTML/CSS escapes** in v1? *Recommendation: no. An escape
   hatch makes the guarantees unprovable; it arrives in v2 as an explicitly-marked "unverified
   region" that fails the gate unless allowlisted.*
3. **Is the desktop shell in v1?** *Recommendation: no — packaging, Phase 6.*
4. **Motion intent vocabulary** — is `entrance / exit / emphasis / feedback / decorative`
   sufficient, or does it need a vestibular-severity axis separate from intent?
5. **Does the Studio ever accept code-authored documents from third tools**, or only its own
   output plus imported HTML? *Recommendation: yes for import, never for round-trip of
   hand-edited exports.*

---

## 15. What happens next, concretely

In order, each as its own pull request:

1. Score the same defect once per root cause; stop charging 88 findings for one missing landmark.
2. ~~Suppression with printed reasons (`spark.config.json`)~~ — done. See `docs/SUPPRESSION.md`.
3. Commit the real-page corpus and re-audit published numbers.
4. Freeze `schema/scene-0.1.json` + TypeScript types; write `docs/SCENE.md`.
5. `spark lower` + `spark emit` for a static scene → byte-identical HTML/CSS.
6. One worked example page in the repository, authored as a document.
7. Then Phase 2 (the gate) begins.

Nothing in step 1–7 needs a browser, a server, or a new dependency.
