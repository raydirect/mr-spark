# 100 Influences, Brand-Free

The design in [VISION.md](VISION.md) was shaped by roughly a hundred existing projects,
formats and failures. This document records them as **archetypes**: what to borrow, what to
avoid. No product names — the point is to extract the mechanism, not to cite a brand, and to
make sure we inherit lessons instead of logos.

Read it as a design constraint list, not a bibliography. If a pillar in the plan violates one
of these "avoid" rows, that is a bug in the plan.

Legend: **B** = borrow · **A** = avoid.

---

## A. Motion authoring and animation runtimes (1–18)

The richest family of influences, and the one with the clearest cautionary tale.

| # | Archetype | B | A |
|---|---|---|---|
| 1 | Timeline-based motion authoring environment | Scrubbing a timeline as the primary mental model; keyframes with easing curves as visible objects | A proprietary document format that only one vendor's runtime can play |
| 2 | Declarative animation library with a terse timeline API | Sequencing, staggering and labels as first-class vocabulary; animation code that reads like a sentence | No reduced-motion story beyond a global off-switch |
| 3 | Physics/spring-driven motion library | Interruptible, velocity-aware transitions; motion that feels native rather than timed | Springs as the only model — designers still need explicit durations for brand motion |
| 4 | Vector animation interchange format | A compact, open, JSON-shaped scene document that many tools can read and write | Publishing a format without a reference implementation on *both* ends |
| 5 | Scroll-driven animation approach | Scroll position as a legitimate timeline source | Scroll hijacking; overriding native scroll physics |
| 6 | Native platform scroll/animation primitives | Delegating motion to the compositor and the platform where possible | Reimplementing what the browser already does well, in JS, worse |
| 7 | Declarative state-machine motion (states + transitions) | Modeling UI *as states*, not as a pile of booleans; transitions as declarative edges | State machines for trivial interactions — the abstraction must be optional |
| 8 | Animation runtime for game engines on the web | GPU-friendly property animation; sprite/scene mental models for rich surfaces | Assuming a fixed-size canvas; ignoring reflow, zoom, and text scaling |
| 9 | Offline-authored JSON motion playback | Designers authoring offline, runtime playing a compiled artifact | Baking text into vector paths, destroying selection, translation and screen readers |
| 10 | SVG animation via declarative markup | Motion that lives inside the document, so it can be inspected and diffed | Animating layout-affecting properties via markup only; no runtime control |
| 11 | Motion design tokens (durations, easings as tokens) | Motion values living in the same token system as color and spacing | Tokens that encode *intent* without semantics (see #14) |
| 12 | Page transition orchestration libraries | Treating navigation as an animatable state change | Blocking navigation on animation completion |
| 13 | Reduced-motion-aware animation helpers | Honoring the user preference as a first-class code path, not a hack | Treating "reduced motion" as "no motion" — it usually means *less and gentler* |
| 14 | Motion semantics vocabulary (entrance, exit, emphasis, feedback) | Naming *what motion means* so it can be verified, not just what it does | Unlabeled motion that a reviewer must reverse-engineer |
| 15 | Micro-interaction libraries | Small, composable, copy-pasteable interactions with real polish | Perpetual, looping, attention-seeking animation as a default |
| 16 | 3D scene / shader authoring for the web | Deterministic scenes, GPU pipelines, progressive fallback | Locking content inside a renderer that no crawler, agent, or screen reader can read |
| 17 | Skeletal/character animation runtimes | Declarative rigs and clips; separable data and player | Binary blobs with no inspectable structure |
| 18 | The dead runtime's lesson: tool + format + runtime + community as one proprietary bundle | The ambition to serve creators and engineers end-to-end | Irreplaceable, inseparable components — the failure mode that killed a decade of work |

**Synthesis for us:** motion must be a *document* (open, diffable, inspectable) plus a
*runtime* that is reduced-motion-aware by construction, plus a *verifier* that checks
semantics. Those three together are what #18 lost.

---

## B. Design → code, visual builders, authoring surfaces (19–38)

| # | Archetype | B | A |
|---|---|---|---|
| 19 | Browser-based collaborative design tool | Design as a shared, live, versioned document; direct manipulation | A canvas-only document whose content is invisible to every machine except its maker |
| 20 | Vector/UI design application with component instances | Instances and overrides; a single component definition propagating everywhere | Design-time components that have no runtime counterpart, so handoff is the bottleneck |
| 21 | Design tool's "inspect" / handoff mode | Showing computed values (spacing, type, color) as copyable facts | Handoff as a *reading* task — the engineer re-transcribes what the machine already knows |
| 22 | Auto-documenting design systems | One source of truth emitting docs, tokens, and components together | Docs generated once and never re-verified |
| 23 | Visual site builder with breakpoint editing | Multiple breakpoints as simultaneous constraints, not afterthoughts | Absolute positioning and pixel offsets that produce fragile, inaccessible layouts |
| 24 | Declarative customization/settings framework (config → generated CSS) | Declaring *intent* as data, generating implementation; settings validated by schema; ~30 control types as one vocabulary | Being trapped inside one CMS; settings that cannot be verified before publish |
| 25 | Schema-driven form/controls generator | One field schema producing UI, validation, storage, and tests | Generator output that nobody can override when the design diverges |
| 26 | Headless CMS field schema → API + editor | Content model as the contract; editors generated from it | Content and presentation coupling baked into the storage format |
| 27 | Drag-and-drop page composer | Immediate feedback loops for non-engineers | Output that compiles to div soup — the single biggest accessibility failure source |
| 28 | Static site generator with content collections | Deterministic builds; content validated at build time | Build systems so abstract the author cannot predict output |
| 29 | Notion-style block editor / block document model | A small block vocabulary that scales from note to site | Documents that cannot round-trip into semantic HTML cleanly |
| 30 | Design-file-to-CSS pipelines | Mapping style properties mechanically instead of by eye | Generating code nobody would ever write or maintain by hand |
| 31 | Token-first theming (color, type, space, radius, motion) | Everything is a token; themes are data | Token sprawl with no provenance or contrast guarantees |
| 32 | Design lint concepts (from code linters) | Linting *documents* with the same seriousness as code | Lint rules that no designer can understand or act on |
| 33 | Interactive prototype tools | Behavior previews during design, not after implementation | Prototypes that cannot be diffed, tested, or shipped |
| 34 | Server-side/reactivity-free enhancement pattern (progressive) | Start from a document that works; add interactivity as an enhancement | Assuming JS runs at all |
| 35 | Documentation-as-product pattern | Docs treated as a first-class surface with examples that execute | Docs that drift from behavior (see #48 and #64) |
| 36 | Prompt/LLM-assisted page generation | Fast first drafts, structural scaffolding | Shipping generated pages without verification — the exact gap we exist to close (#97) |
| 37 | Spreadsheet-as-layout model (grid, formulas) | Formulaic, inspectable relationships between cells and values | Untraceable magic in a cell — same failure as untyped code |
| 38 | WYSIWYG editing with live accessibility feedback | Design-time verification, in the authoring surface, as you type | Feedback that is advisory and skippable at publish time |

**Synthesis:** authoring surfaces are seductive and monetizable — and the reason we build them
*third*, behind the verifier, is row #38. Authoring is only trustworthy when the checker sits
inside it.

---

## C. Component runtimes, reactivity and app frameworks (39–54)

| # | Archetype | B | A |
|---|---|---|---|
| 39 | The dominant component runtime | Composition, colocated state, an enormous hiring pool; "it's just functions" | Complexity as the default; verification bolted on afterwards |
| 40 | Signals-based fine-grained reactivity | Precise updates; no dependency arrays; performance by construction | A new mental model for every generation of developers |
| 41 | Compiler-first reactive framework | Compile-time knowledge of what changes, at runtime minimal cost | Opaque output; debugging a compiler instead of an app |
| 42 | Class-based framework with batteries (DI, router, forms) | Opinionated, complete, enterprise-backed, long support windows | Framework-owned everything → framework-shaped lock-in |
| 43 | Progressive enhancement / islands architecture | Server by default, interactivity as islands | Two mental models in one codebase without a clear rule for which wins |
| 44 | Server-rendered-by-default metaframework | One language across boundaries; streaming HTML | Cache semantics and client/server boundary rules nobody can hold in their head |
| 45 | End-to-end typed API layer (no codegen) | Contracts inferred, not duplicated | Only works within one language and one repo — breaks at the second consumer |
| 46 | Router-first framework (absorbed a metaframework) | The web platform as the foundation; forms and URLs as primitives | Frameworks are routers plus ideology; "full-stack" is mostly a promise |
| 47 | File-system routing with loaders/actions | Convention over configuration; data loading colocated with routes | Convention that changes between major versions |
| 48 | Web Components / custom elements | Framework-independent components; the platform as the interchange layer | Shadow DOM as a styling and a11y problem; SSR story is still painful |
| 49 | Full-stack monolith kit with a code generator (Rails-like for JS) | Generators, conventions, auth scaffolds, one CLI | God-object framework; a fork of a moving framework is unmaintainable |
| 50 | GraphQL-first full-stack kit | Schema-first data, single graph for all clients | GraphQL for CRUD apps; operational burden exceeds the win |
| 51 | Zero-build reactivity library (HTML attributes) | Adopting progressively: sprinkle interactivity into existing HTML | Cute scripts that quietly become an unmaintainable app |
| 52 | HTML-over-the-wire enhancement library | Server owns the truth; no client state to debug | Network round-trip for local interactions |
| 53 | Lightweight VDOM alternative | Smaller payloads, predictable output | Ecosystem gravity: libraries without an ecosystem die of loneliness |
| 54 | State container with time-travel debugging | Inspectable state transitions; replay | Global stores that hide causality |

**Synthesis:** everything in this family optimizes for *building*. Nothing in it produces
*evidence of correctness*. That absence is row #55's business.

---

## D. Analysis, verification and quality infrastructure (55–72)

| # | Archetype | B | A |
|---|---|---|---|
| 55 | Accessibility rules engine used by browsers and CI | Zero-false-positive discipline; rules as data; the industry's most-trusted a11y primitive | The 20–30% coverage ceiling that users mistake for completeness |
| 56 | Automated accessibility audit (1M-page study) | A reproducible public dataset as a credibility artifact | Reporting detection numbers as if they were conformance rates |
| 57 | Page-quality audit runner | Scores, opportunities, diagnostics; embeddable; CI-native | Scores that became an industry target and got gamed |
| 58 | Lab-vs-field analytics split | Separating synthetic measurement from real-user data | Lab-only claims about real-world experience |
| 59 | Public web-state dataset (crawl-based annual report) | Open methodology, SQL included, so anyone can reproduce | Static PDF reports nobody re-runs |
| 60 | Automated WCAG coverage research | Honest measurement of the automation ceiling | Vendors implying their engine covers what humans must check |
| 61 | E2E browser automation | Deterministic driving of real browsers; trace artifacts; a11y-tree snapshots | Screenshot diffing as the primary assertion — expensive and approximate |
| 62 | DevTools protocol-level profiling | Real performance data (long tasks, main-thread, layout) | Metrics without budgets → measurement theater |
| 63 | Performance budget tooling | Enforcing ceilings in CI, on changed files only | Budgets so strict the team disables them on day two |
| 64 | Visual regression services | Snapshotting UI state as an artifact to diff | Flaky, unactionable diffs that train people to ignore the tool |
| 65 | Unit test runners with snapshot support | Fast, in-process, watch mode, great failure output | Snapshot tests that encode bugs as expectations |
| 66 | Contract testing between services | Verifying both sides against one artifact, in CI | Contracts that describe today's shape and rot silently |
| 67 | Schema validation libraries | Runtime schemas as the single source of truth for types, forms, APIs | Divergent validation on client, server and database |
| 68 | Software supply-chain scanners | Registry intelligence, advisory feeds, lockfile analysis | Alert fatigue: 200 advisories, no prioritization |
| 69 | Package provenance/attestation | Signed, verifiable build claims | Attestation that few verify and fewer understand |
| 70 | Dependency-update bots | Automated, reviewable, revertible changes | Unreviewable PR volume |
| 71 | Static analysis with safe autofix | Detect *and* fix, with a diff you can trust | Fixes that change behavior in subtle ways — hence "safe codemod only" |
| 72 | Formal/semantic diff for structures | Diffing trees, not text | Text diffs offered for structural changes |

**Synthesis:** this family is where our wedge lives (55–63), and where our credibility must
come from (56, 60). The rule we inherit: *never let the summary outrun the evidence.*

---

## E. Systems languages, runtimes and native shells (73–86)

| # | Archetype | B | A |
|---|---|---|---|
| 73 | Systems language with a compiler that prevents whole bug classes | Move semantics, exhaustive matching, fearless concurrency; errors at compile time | Compile times and cognitive load that make it wrong for the analysis core of a web tool |
| 74 | WASM toolchains for native-in-the-browser | Near-native analysis and rendering, one binary for every platform | 2–5 MB payloads shipped to parse a page |
| 75 | Native webview shell for desktop apps | One web codebase, a real desktop app, small binaries | A second unaudited surface — the shell nobody verifies either |
| 76 | Interop bridges between native and webview | Typed, versioned IPC; capability-scoped permissions | Stringly-typed IPC and a permission model that becomes a rubber stamp |
| 77 | Native UI toolkit + web rendering hybrid | Using native UI where the web is inappropriate | Two design systems, two accessibility trees, double the maintenance |
| 78 | Ephemeral CI-only native compilation | Gate native speed behind artifacts, keep developer setup trivial | Making a local toolchain a prerequisite for contributing |
| 79 | Parser/lexer combinator approaches in systems languages | Fast, error-tolerant parsing with great diagnostics | Hand-rolled parsers with no grammar spec |
| 80 | Incremental computation engines (demand-driven, cached) | Recompute only what changed; cache by content hash | Cache invalidation bugs that look like data loss |
| 81 | Query-based compiler architectures | The compiler as a database of facts; incremental by design | Architecture too clever for contributors to extend |
| 82 | Tree-sitter-style grammar-driven parsers | Incremental, error-tolerant, editor-friendly parsing for many languages | Losing parent links and semantics under repair |
| 83 | Wasm-bindgen-style JS interop ergonomics | Ergonomic glue instead of manual marshalling | Thin glue that hides the cost of crossing the boundary |
| 84 | Embedded animation-document parse/play engines | Small, declarative, deterministic playback of documents | Renderer-only formats with no semantics |
| 85 | Small-language movement for wasm components | Composable modules with typed interfaces | Fragmented tooling for a young standard |
| 86 | Systems runtime with an embedded JS engine | Verify JS behavior natively | Embedding two GCs to solve a problem better solved by scope |

**Synthesis:** Rust/WASM is an *accelerator*, never a prerequisite. Verified in this
environment: no Rust toolchain, no crates.io reachability — so pillar 1 through 3 stay JS/TS,
and native code enters through CI-built artifacts only when it wins a measured benchmark.

---

## F. Documentation, content and discovery (87–94)

| # | Archetype | B | A |
|---|---|---|---|
| 87 | Static docs site generator built around content | Docs that build from the same repo as the code | Docs as a separate, stale artifact |
| 88 | "Explain it with runnable examples" docs pattern | Every API surface has an executed example | Examples copied into docs by hand |
| 89 | Machine-readable content index proposal (`/llms.txt`-style) | Cheap, standard, at the site root, honest about limits | Treating it as a ranking hack; no vendor actually reads it reliably |
| 90 | Sitemap/robots discovery files | Discovery as a plain-text contract | Assuming crawlers honor anything |
| 91 | Structured-data (schema.org) vocabulary | Machine-readable claims about pages and entities | Structured data that lies |
| 92 | Agent capability protocol (browser-side tool registration) | Real actions a site exposes, with schemas and descriptions | Registering tools for views that are not on screen; tool sprawl |
| 93 | Server-side agent tool protocol | Hosted, authenticated capability servers | A second infrastructure to run and secure |
| 94 | Crawler/user-agent policy ecosystem | Explicit, machine-readable intent | Policy files nobody enforces |

**Synthesis:** the machine-facing surface of a page is *part of the page*. It should be
generated from the IR (pillar 2), never maintained by hand as a second copy of the truth.

---

## G. Open-source strategy, funding, standards and governance (95–110)

| # | Archetype | B | A |
|---|---|---|---|
| 95 | Standard-doc-plus-reference-implementation model | Publish the spec separately from the code; multiple implementations | A spec that only one team can implement |
| 96 | Open-core with a hosted dashboard | Free correctness, paid convenience (history, exports, org reporting) | Gating the checks behind a license |
| 97 | Dev-tool discovered by a single vivid artifact (a dataset, a GIF, a bad number) | Launch with evidence, not an announcement | Launching with a manifesto and no proof |
| 98 | OSS project killed by maintainer burnout | Ruthless scope; automated triage; funding from day one | "We'll figure out sustainability after 10k stars" |
| 99 | Foundation-governed dev tool | Neutral ownership of the spec; forkability as a promise | Single-vendor control disguised as community |
| 100 | Protocol/format standard that won by being boring | Small schemas, versioned, with a long compatibility promise | Designing for elegance over adoption |
| 101 | Company that ruined trust with a license change | A permanent, irrevocable license promise in writing | Marketing a license you later regret |
| 102 | Framework that pivoted and lost its community | Publicly committing to one shape for years | Following hype into a new shape every 18 months |
| 103 | "Boring technology" advocacy | Choosing stability as an explicit feature | Novelty as a value proposition |
| 104 | Tiny-dependency philosophy | A small dependency budget as a design constraint | Virtue-signalling thinness while shipping 300 transitive packages |
| 105 | Design-tool plugin ecosystem | Third parties extend the product without forking it | Plugins that can silently break conformance |
| 106 | Editor extension ecosystem as distribution | Meeting developers where they already work | IDE-only strategy (excludes CI, the place that matters) |
| 107 | CLI tool with impeccable output design | Failure output as the product; human-readable, agent-readable | Log dumps |
| 108 | `npx`-first distribution model | Zero-install first run, no build step, no daemon | Anything that requires a project to be created first |
| 109 | Docs-site-as-traffic-funnel (now eroding) | Documentation as an acquisition channel | Depending on docs traffic that AI agents are already diverting |
| 110 | High-signal "state of" annual surveys | Community data that shapes roadmaps | Vanity surveys with no methodology |

**Synthesis:** sustainability and governance are *product decisions*, not paperwork. Rows 100,
101 and 104 are the constraints: boring schema, irreversible license promise, tiny dependency
budget.

---

## The eight constraints this list generates

If the plan honours only these, it will be recognizably the same product:

1. **Open document formats with reference implementations on both ends** (1, 4, 18, 95).
2. **Accessibility is a checked property, not a claim** (14, 38, 55, 60).
3. **Never let the summary outrun the evidence** (56, 57, 60, 62).
4. **Verification lives inside the pipeline, not beside it** (39, 58, 71).
5. **Progressively enhance; never require migration** (34, 43, 51, 108).
6. **Native speed is an accelerator, never a prerequisite** (73, 74, 78, 86).
7. **Boring schema, irrevocable license, tiny dependency budget** (100, 101, 104).
8. **Launch with evidence; sustain before scaling** (97, 98, 99).
