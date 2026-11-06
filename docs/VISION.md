# web-spark — The Unified Plan

> **Every artifact proves itself.**
>
> A design file, a motion timeline, a settings document, a component tree, a rendered scene,
> a shipped bundle — each one should carry its own proof that it is accessible, fast, safe,
> legible to AI agents, and resilient. Today, none of them do.

This document supersedes the "audit CLI" framing in [PLAN.md](PLAN.md). The CLI survives as
the first *surface* of a larger architecture. The research in [RESEARCH.md](RESEARCH.md) is
unchanged and still the evidence base.

Brand-free by design: this repo describes mechanisms and archetypes, never other people's
products. See [INSPIRATIONS.md](INSPIRATIONS.md) for the 100 reference points that shaped
this design, each expressed as "borrow this / avoid that".

---

## 1. Read the influences back to first principles

The reference points cluster into five families, and each family is a *different* unsolved
problem wearing the costume of a product:

| Family | What it proved | What it never solved |
|---|---|---|
| **Motion authoring** (timeline tools, animation runtimes, declarative state-machine motion, vector animation formats) | Professionals will pay for authoring that produces real motion, not screenshots | Motion has no portable *document* format with an accessible, reduced-motion semantics. Its predecessor ecosystem died and took a decade of work with it because the runtime and the format were proprietary. |
| **Design → code** (browser design tools, visual site builders, design documents, token systems) | Designers want direct manipulation; teams want tokens and systems | The handoff is manual and lossy. Generated output is unmaintainable. Nothing in a design file asserts contrast, focus order, or semantics. |
| **Settings-as-data** (declarative customization frameworks, schema-driven control panels) | Declaring controls as data beats hand-writing panels, and auto-generated CSS from config works | It only ever worked inside one CMS. Nobody has made the *whole page* a declarative document that can be verified before it ships. |
| **Component runtimes** (the incumbent and its rivals) | Composition, reactivity, and colocated state scale to large teams | The runtime produces output, not evidence. Verification is bolted on afterwards, in another tool, in another tab. |
| **Systems language + native shell** (Rust, WASM, webview shells) | Near-native speed and a real desktop surface are achievable from web tech | The web's *analysis* engines are still JS toys; the desktop shell adds another unaudited surface nobody verifies. |

Five families. One shared absence: **none of these artifacts carries a claim that can be
checked.** That is the product.

---

## 2. The thesis, stated once

> **web-spark is a conformance compiler for the web.**
> Many front-ends produce one typed intermediate representation. That IR is analyzed against a
> published rule set, given a public score, and emitted back out as diagnostics, safe fixes,
> agent-facing manifests, and renderable scenes.

Three consequences that make this a single product instead of a bundle:

1. **One IR is the spine.** Design documents, motion timelines, settings, framework source,
   and live URLs all lower into the same model. Everything else is a plug-in on one of two
   ends.
2. **Verification is a *property of the pipeline*, not a separate tool.** You cannot skip it,
   because it is the middle of the compiler, not a step after it.
3. **MCP is threaded through every layer, in four directions** — see [MCP.md](MCP.md):
   Spark *is* an MCP server; MCP servers are themselves a **verified surface** (a new rule
   family, `MCP001`–`MCP010`); one capability declaration lowers to **three machine faces**
   (browser-side tools, an MCP server, a content index) which we then prove agree; and the five
   pillars are exposed as one tool family so an agent can drive the whole lifecycle. The
   protocol's own gaps — no content hash, no version pinning, no re-approval for tool
   definitions — are our thesis appearing on a brand-new surface.
4. **Cross-artifact checks become possible for the first time.** Single-artifact linters can
   never say: *"this button is 2.9:1 from the design token, animates a property that triggers
   vestibular symptoms, has no accessible name in the shipped DOM, and declares no agent
   tool."* An IR can. That sentence is the product.

### The IR, concretely (v0 — deliberately small)

```jsonc
{
  "ir": "0.1",
  "provenance": { "source": "url", "uri": "https://example.com", "capturedAt": "2026-11-06T…" },
  "document": { "lang": "en", "landmarks": ["main", "nav"],
                "tree": [ { "role": "heading", "level": 1, "text": "Products" }, … ] },
  "tokens":   { "color.fg.muted": { "value": "#9aa0a6", "contrastOn": { "surface": 2.9 } } },
  "motion":   [ { "target": "#hero", "properties": ["transform"], "durationMs": 420,
                  "reducedMotion": "none" } ],
  "data":     { "bindings": [ { "path": "/api/products", "schema": "ref#/Product" } ] },
  "tools":    { "server": "2026-07-28",
                "declared": [ { "name": "searchProducts", "readOnly": true,
                                "sha256": "…", "faces": ["browser","mcp","index"] } ] },
  "findings": []
}
```

v0 *populates* `document`, `tokens`, `tools`, and `findings`. `motion` and `data` are declared
from day one (so the spec is stable) and filled as later pillars land. `tools` is populated
early **because MCP is load-bearing**: tool declarations are the artifact an agent trusts, and
they currently have no lockfile, no hash and no drift detection anywhere in the ecosystem.

---

## 3. The architecture

```
FRONT-ENDS  (lower into the IR)              BACK-ENDS  (emit from the IR)
├─ url / html / dom snapshot                 ├─ findings → terminal, JSON, SARIF, PR comment
├─ source (framework-aware extractor)        ├─ score (published, versioned spec)
├─ settings document (config → page)         ├─ fixes (safe codemods only)
├─ design document (own open format)         ├─ agent manifest (tool declarations, content map)
└─ motion document (own open format)         ├─ token/theme export (CSS, JSON)
                                             └─ render (scene → DOM + canvas; v3+)
        MCP SURFACE  (every pillar is a tool family; see MCP.md)
        audit · explain · fix · verify_tools · emit_faces · baseline
                     ┌──────────────────┐
                     │   SPARK IR 0.x   │   ← the standard-shaped artifact
                     └──────────────────┘
                              │
        ANALYZERS  ───────────┴───────────  accessible · fast · safe (incl. MCP*) · legible · resilient
```

Five pillars, in the order they must be built. The order is not taste; it is forced by
distribution and by credibility.

| # | Pillar | What ships | Why now |
|---|---|---|---|
| 1 | **Verify** | `check`, IR v0, score, baseline, CI gate | Works on any URL today. Needs no ecosystem. This is the wedge the research identified. |
| 2 | **Manifest** | **one declaration → three machine faces** (browser tools, MCP server, content index), plus `MCP*` conformance and `.spark-tools.lock` | Cheapest possible output of an IR, and the strongest 2026 narrative. Turns the verifier into a producer — and creates the missing lockfile for agent-trusted definitions. |
| 3 | **Author** | settings-as-data → conformant page; design document v0 → code; safe fixes | Uses the IR in the other direction. The verifier validates the generator, so authoring arrives *trustworthy*. |
| 4 | **Animate** | open motion document + runtime that is reduced-motion-aware by construction, and whose accessibility is checkable | Motion is the accessibility blind spot. First motion format where vestibular safety is a checked property, not a wish. |
| 5 | **Render** | scene renderer with semantic projection (real DOM over drawn output) and a canvas path with accessibility preserved | This is the big swing, and it is only defensible *after* the verifier exists — otherwise we become one more canvas tool nobody can audit. |

### Why verification must come first (the argument I'd stake the project on)

1. **It is the best-evidenced pain point** in the research, and the only one where a stranger
   gets value in one command with zero migration.
2. **It is the only pillar that pays off before the beautiful parts exist.** No design-tool
   partnership, no runtime adoption, no renderer.
3. **It is the trust credential for everything after it.** A motion format or a renderer from
   an unknown project is a liability. The same artifact arriving with a *public, honest score*
   and a rule set people already run in CI is a different proposition.
4. **The alternative has a graveyard.** Design-tool-first and runtime-first projects die from
   cold start: they need both creators and consumers on day one. A CI tool needs one user.

### The lesson the dead ecosystem taught

The most influential animation platform in web history died and took an enormous body of work
with it. The reason is instructive: **its moat was the tool + runtime + format + community
arriving together**, and when the owning company withdrew, none of those pieces were
independently viable because they were proprietary and inseparable.

The design response, baked into this plan:

- The IR is a **published spec**, not an internal format. Anyone may implement a front-end or
  a back-end against it.
- Every pillar must be **independently useful**, so no pillar's death kills the product.
- Nothing depends on a hosted service to be correct. Hosted history is a convenience, never a
  key.

---

## 3b. Where it runs: one engine, four surfaces

The product is the **engine**. It has no DOM and no browser dependency, and every surface is a
thin adapter over it. Full reasoning in [SURFACES.md](SURFACES.md); the short version:

| Surface | Role | Ships |
|---|---|---|
| **CLI** | the wedge — zero config, seconds to a score | Phase 1 |
| **CI action** | the gate — the only place a regression is actually stopped | Phase 1 |
| **MCP server** | the agents — the audit as a callable tool | Phase 1 |
| **Shared report link** | the front door — a deterministic, server-rendered report anyone can paste | Phase 1b |
| **Snippet capture** | authenticated/localhost pages with no terminal; collects, never judges | Phase 2 |
| **Browser extension** | the **lens** — authenticated pages, interaction capture, `capture → baseline` export | Phase 2 |

Two rules that make this work, and that must be enforced from the first commit:

1. **The engine never imports a surface.** IR in, findings out.
2. **The extension computes nothing.** It collects (rendered DOM, computed styles, a11y tree,
   timings, interactions) and hands that to the same engine. Anything it can compute, CI can
   compute from the same capture — which is what makes the score comparable across surfaces.

**Ease is its own design problem**, specified in [EASE.md](EASE.md): a nine-rung ladder from a
shared link down to localized first-run, where **no rung requires an account, an install, or a
toolchain**. Rung 1 is the marketing (a shared link), rung 5 is the moat (a gate on the merge),
and the rungs in between all report the same findings from the same IR — which is the only
reason a score can be trusted across a terminal, a pipeline and a link.

**Where the authoring UI lives** is a separate decision, answered in [SHELL.md](SHELL.md): a
browser-based web app driven by the local engine, with a thin native shell added later for
filesystem and offline. The reason is the same one that governs everything here — the design
surface must *be* the runtime, and a native host would mean a second engine to verify.

The extension is *not* optional and *not* the main app: it is the only surface that can reach
authenticated, in-session pages, and its `capture → baseline` export is how a page you can only
see while logged in becomes a test in CI. But it cannot be the authority: results vary per
machine, someone must be watching, users run stale builds, and CI is where a gate has to live.

---

## 3c. Where we actually are

Phase 1a is **built and tested** as of this commit: the engine seam, IR v0 with a content
address, the accessibility collector, the public score, terminal and JSON reporters, the `check`
command, two fixtures (one known-bad, one known-good), 13 unit tests, and a CI workflow that
gates this repository on its own tool.

Measured in this environment, cold CLI run against a local file: **~640 ms**, of which ~300 ms
is the audit itself. No browser, no network, no daemon.

The two things it does *not* do are the things that would be dishonest to fake:

- Pillars that are not built report `—` (not measured), never a comfortable number.
- Checks the environment cannot evaluate (contrast without a canvas) are listed as
  *undecided*, and excluded from the score, rather than counted as violations or silently
  dropped.

## 4. Roadmap (with exit criteria, not dates)

Each phase is one visible command. Scope discipline is the whole game.

### Phase 1 — Verify (the wedge)
`check` on URL/file, IR v0 (including `tools`), the five sub-scores, terminal + SARIF + PR
comment, `baseline`, `--ci` regression-only failures, the GitHub Action — **and `spark mcp
serve`**, because the audit must be reachable as a tool, not only as a terminal command.
Publishes `docs/STATE-OF-THE-WEB.md` generated by our own scanner over the top 1,000 sites.

**Re-cut around activation** ([EASE.md §6](EASE.md#6-phase-1-re-cut-around-activation)): the
**shared report page** ships before the CI gate. A gate is worthless until people trust the
score, and the cheapest way to earn that trust is a link anyone can open, read the provenance of
and reproduce locally. Order: engine → shared report → gate → agents.
**Exit:** 10 real repositories gated with a committed baseline; ≥3 merges blocked by a real
regression and then fixed.

### Phase 2 — Manifest (the 2026 story)
MCP conformance as a product: `verify_tools`, the `MCP001`–`MCP010` rule family with published
rationale, `.spark-tools.lock` + drift detection, and `emit_faces` producing all three machine
faces from one declaration. Plus the **browser extension as the lens**: authenticated-page
audits, interaction capture, and `capture → baseline` export into CI (single browser engine first,
active-tab-only permissions, no analysis inside the extension).
**Exit:** a real repository whose tools are locked, drift-checked in CI, and whose three faces
are proven identical — plus one third-party MCP server fixed by our findings.

### Phase 3 — Author (design + config, verified)
A settings/design document format (own schema) that lowers to the IR and emits a conformant
page; a fix engine that applies only provably safe changes; token export. The authoring UI is a
**browser-based web app driven by the local engine** (see [SHELL.md](SHELL.md)) — same IR in,
same findings out, no bespoke backend.
**Exit:** a real marketing page rebuilt from a document, scoring higher than its hand-written
original, with the diff published.

### Phase 4 — Animate (motion, reduced-motion first)
Motion document format + runtime. Every animation declares its semantics: what it means, and
what it does when reduced motion is requested. The verifier checks both.
**Exit:** the first motion artifact in the wild that a screen-reader user and a
vestibular-sensitive user can both approve, demonstrated on camera.

### Phase 5 — Render (the big swing)
A scene renderer: drawn output with a real, projected semantic DOM layer, so screen readers,
find-in-page, autofill, and browser agents all work over pixels.
**Exit:** a scene-based page passes the same verifier at the same bar as a DOM page.
Packaging note: a thin **native desktop shell** (filesystem + offline only, the same web app
inside) may ship here if users ask for it — it is a distribution format, never a second
architecture ([SHELL.md §3](SHELL.md#3-but-a-web-app-has-three-real-deficits-and-they-need-answers)).

### Deliberately not built
A framework to replace the incumbent. A bundler. A component library. A dependency scanner we
did not originate. An AI page generator. A hosted design tool. An MCP gateway or proxy. A hosted
dashboard as the main app, an extension that computes its own verdicts, and *not* a native-UI
rewrite of the editor (Rust stays a WASM accelerator; native is packaging only), and *not* an
account system — no rung of the ladder may require one, permanently.

---

## 5. Risks that could actually kill this

| Risk | Honest assessment | Mitigation |
|---|---|---|
| **Six products, one team** | This is the dominant risk. Unmitigated, it fails. | One IR, one command per phase, and a written non-goals list that a maintainer can point at. |
| **The accessibility community rejects the score** | Highest-severity risk: automation covers ~30% of WCAG criteria, and the field has been burned by "certified" badges. | Coverage limits printed in the output; no conformance claims, ever; practitioner review before the score is publicized; the report always carries raw findings. |
| **Scoring gets gamed** once it is popular | Certain, eventually. | Public versioned weights, wrong-answer fixtures, no badge without findings and disclaimer, and a policy that we break the badge before we let it lie. |
| **We ship a renderer and it is inaccessible** | Would confirm every critic at once. | Renderer ships only after *its own* verifier does, with the same bar as DOM pages. Non-negotiable. |
| **Ecosystem cold start for design/motion formats** | Real; formats die without both authoring and consumption. | Formats are published specs with reference implementations on both ends; every format is valuable alone (the verifier reads it even if nobody authors in it). |
| **Systems-language work is unreachable in the current environment** | Verified: no Rust toolchain, no crates registry reachable from this sandbox. | Rust/WASM is an *optional accelerator* compiled in CI, never a build prerequisite, and it lives **inside** the web app and CLI as a library — it never hosts the UI ([SHELL.md](SHELL.md)). JS/TS core until a WASM path proves a measurable win. |
| **MCP spec churn** (quarterly revisions; 2026-07-28 removed sessions, sampling, roots, logging and the GET endpoint) | High: a server written to one revision ages fast | Revision-aware adapters behind one internal interface; conformance rules keyed to a declared revision ([MCP.md §5](MCP.md#5-risks-specific-to-being-mcp-first)) |
| **Our own MCP server becomes an attack surface** | We would be shipping exactly what we audit | Deterministic, read-only by default, no write tools without opt-in, allowlisted egress, self-conformance in CI |
| **Agent-authored code outruns verification** | This is the wind at our back, but it also means our reports must be consumable by agents, or we become a human-only bottleneck. | Agent-consumable report format from Phase 1, not later. |
| **Surface sprawl** (engine + 4 surfaces invites drift) | Real: each surface is a place for behaviour to fork | The engine is the only place truth is computed; surfaces are tested against a fake surface, and the extension is forbidden from analysing |
| **The free public scanner becomes an unbounded cost and abuse target** | High: link previews and bots will hammer it | Cache keyed by `(target, engine, ruleset)`, rate limits per IP and per target, opt-out honoured, no content retention ([EASE.md §7](EASE.md#7-risks-specific-to-being-easy)) |
| **Maintainer burnout** | The standard OSS failure. | Narrow surface, automated triage, funding from day one, governance that lets the spec outlive the repo. |

---

## 6. How we would know it is working

1. **Regressions caught and then fixed** — the product's only real output.
2. **Repos running the gate on ≥5 PRs** — separates novelty from adoption.
3. **Time to a green gate in a real repo** — target under 10 minutes from `npx`.
4. **Practitioner sign-off** — two or three respected accessibility engineers publicly say the
   score is honest. Without this, nothing else matters.
5. **MCP conformance adopted** — repos with a committed `.spark-tools.lock`, and tool-definition
   drift caught before merge. This is the metric that proves Direction 2 is a real category.
6. **One third-party implementation** of the IR or the score spec without our help — the first
   real evidence that this is becoming a standard rather than a tool.

---

## 7. Decisions needed before any code

1. **Adopt the compiler framing?** This is the load-bearing choice: audit CLI (safe, small,
   already planned) vs. IR-centred compiler (bigger, but it is the only version where the five
   pillars are one product instead of six).
2. **Publish the IR spec at v0?** Recommended yes — the spec is the standard ambition, and
   retrofitting a spec onto shipped code never works.
3. **After Verify, which pillar second?** My recommendation is Manifest: cheapest output,
   strongest narrative, and it proves the IR can produce as well as diagnose. The alternative —
   Author second — is more impressive to designers but drags in the ecosystem problem earlier.
4. **Systems language now or later?** Recommendation: later, as a CI-compiled WASM accelerator.
5. **The five public names.** Pillars need words that are ours: *Verify, Manifest, Author,
   Animate, Render*; scores *accessible / fast / safe / legible / resilient*; the IR *Spark IR*.
   Confirm or rename before they appear in a schema URL.
6. **Is MCP really load-bearing, or a layer?** This revision treats it as load-bearing: the IR
   has a `tools` section, SAFE has an `mcp` dimension, Phase 1 ships `spark mcp serve`, and Spark
   must permanently pass its own `MCP*` rules. The alternative — MCP as an integration added in
   Phase 3 — is far cheaper and, I think, wrong. See [MCP.md §7](MCP.md#7-decisions-this-document-needs).
7. **Scope of the public promise.** "Unifies design, motion and engineering" is a three-year
   claim. Recommend the README says what is true today and lists the rest as a public roadmap,
   so credibility compounds instead of evaporating.
