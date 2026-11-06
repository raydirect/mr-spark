# The Authoring Surface: Web App or Native Shell?

**Decision document.** The question: if the extension is not the main app, and we want an
authoring environment of the kind designers expect, what do we build it in?

**Recommendation: a browser-based web app, served by the local engine, with a thin native
desktop shell added later for filesystem and offline. Rust/WASM is an accelerator inside that
web app, not the thing that hosts it.**

Yes, that is the answer the reference products arrived at too — and it is not imitation. It falls
out of one constraint below, with a number attached.

---

## 1. The constraint that decides it: the design surface *is* the runtime

An authoring tool for the web must render the web:

- your layout is CSS, so the canvas must be a browser layout engine;
- your motion runs on the compositor, so the preview must be the real compositor;
- your crafted output must be auditable by the same engine that audits shipped pages, so the
  editor's viewport must be inspectable by browser tooling.

Any host that cannot run a real browser layout engine beside its own UI has to either
**reimplement CSS** or **embed a browser anyway**. Reimplementing CSS is a decade-long trap; a
third-party renderer means the editor shows something subtly different from the product, which
is fatal for a tool whose whole value is *"what you see is what verifiably ships."*

So the host question reduces to: **where does the browser live?**

| Host | Where the browser lives | Verdict |
|---|---|---|
| Browser app | it *is* the browser | canonical rendering, zero extra runtime |
| Native shell + webview | embedded in a platform webview | rendering differs per platform; a second engine to test |
| Native GPU canvas | reimplemented or embedded again | worst case for fidelity |

---

## 2. The decisive measurement: a second engine to verify

Already established in this repo, and it matters more here than anywhere else:

- Our verification path **cannot** reach systems toolchains in this environment — no Rust
  toolchain, no crates registry. Native code therefore arrives only as CI-built artifacts.
- More importantly: **a native shell is a second audit surface.** Native + webview means two
  accessibility trees, two input stacks, two focus models, two update mechanisms, and one more
  privilege boundary (IPC) that nobody verifies. For a product whose entire claim is *"every
  artifact proves itself,"* shipping an unaudited shell would be self-refuting.

A browser-based editor has exactly **one** surface to verify: the page it is.

---

## 3. But a web app has three real deficits, and they need answers

An honest comparison, not a sales pitch:

| Deficit | How bad | Answer |
|---|---|---|
| **Filesystem access** (save projects locally, watch a repo, commit) | Real, but bounded — the platform has a file-system access API now, and it is the *only* capability that truly needs a shell | Ship the browser app first; add a thin desktop shell purely for filesystem + offline. The app does not change shape. |
| **Cold start / install** | The reference products solved this: install is a small download, and the first-run experience is the product | Desktop shell = distribution format, not architecture. Later. |
| **Performance on very large documents** | Real above a threshold — thousands of nodes, deep scene graphs, long timelines | Rust/WASM **inside** the web app on the hot paths: layout diffing, scene graph traversal, animation sampling, collision/hit-testing, diffing for verification. This is where native actually pays, and it pays without moving the host. |

That third row is the important one, and it is the correct role for Rust in this plan: **a
library, not a platform.** It can ship as WASM in the browser *and* be reused by the CLI, which
a native host cannot offer.

---

## 4. What we actually build: three separable pieces

The mistake would be to build "an app." Build three things that happen to compose:

```
┌────────────────────────────────────────────────────────────┐
│  the editor  (web app)                                     │
│  loads the engine in a worker; autosaves to local storage / │
│  filesystem; never computes a verdict itself                │
└───────────────┬────────────────────────────────────────────┘
                │  same IR in, same findings out
┌───────────────▼────────────────────────────────────────────┐
│  the engine  (TS core, domain-agnostic)                     │
│  IR · rules · score · reporters        ← also used by CLI,  │
│  hot paths optionally accelerated by WASM                   │  CI, MCP server
└───────────────┬────────────────────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────────────┐
│  the local runtime  (optional, later)                       │
│  saves files, runs a real browser for rendered audits,      │
│  exposes spark mcp serve to the editor and to agents        │
└────────────────────────────────────────────────────────────┘
```

Note what this buys: **the editor is a client of the same server an agent talks to.** If the
editor uses `spark mcp serve` (or a local HTTP equivalent) instead of a special-purpose backend,
then the fourth MCP direction pays for itself a second time, and there is no second API to keep
honest.

---

## 5. Choosing the web-app stack without naming products

Ranked by the three criteria that matter here — verifiability, incremental delivery, and the
price of being wrong.

| Option | Verdict |
|---|---|
| **Zero-dependency web app + the engine in a worker** (recommended) | The editor is HTML/CSS/DOM plus one worker. Nothing to audit but our own code, no framework to upgrade, and the engine is reusable verbatim across CLI/CI/MCP. Boring on purpose. |
| A component runtime (the incumbent or any of its rivals) | Fine *if* the layer count stays low, but it adds a dependency graph and a second upgrade cadence to a product whose pitch is fewer moving parts. Justifiable only if the editor's UI complexity demands it — and it can be adopted later without touching the engine. |
| A Rust-native UI toolkit | Strong rendering and small binaries, hostile to web layout fidelity, and drags Rust from "accelerator" to "prerequisite." Rejected for the reasons in §2. |
| A native shell + webview, UI written once in web tech | Good as a *packaging* choice later (§3), wrong as the architecture. Two engines to verify, two accessibility trees. |
| A hosted-only web app | Wrong for a different reason: it makes an account the price of entry, and the whole plan is built on "correctness must not require a key." |

**The precise recommendation:**

1. **Web app, dependency-light, engine in a worker** — the editor is a *surface*, exactly like
   the CLI: it collects edits and renders findings; it never invents them.
2. **File-system access API for save/open**, so no shell is required to do real work on day one.
3. **A thin desktop shell in Phase 4/5** — distribution and filesystem only, same web app inside,
   no divergent logic.
4. **Rust → WASM only on measured hot paths**, compiled in CI, optional at runtime, reused by the
   CLI.
5. **The editor talks to the engine through the same protocol an agent does** — one API, not two.

---

## 6. What this decision is *not*

- It is **not** a commitment to build a design tool next quarter. It is the answer to "what shape
  would it take," so that Phase 1's engine is built in a form the editor can reuse. The editor
  itself remains Phase 3 in [VISION.md](VISION.md#4-roadmap-with-exit-criteria-not-dates).
- It does **not** reopen the surface decision. The extension stays a Phase 2 lens;
  [SURFACES.md](SURFACES.md) is unchanged.
- It does **not** make Rust a prerequisite. The recommendation actively avoids that.

---

## 7. Risks of choosing the web app

| Risk | Mitigation |
|---|---|
| Browser sandbox limits filesystem ergonomics | Filesystem API now; shell later for the rest. Accept slight friction early. |
| A web-rendered editor can feel slower than a native canvas at scale | WASM hot paths; virtualise the document; measure before optimising. |
| Editor and engine drift (the same risk as any surface) | Same rule as everywhere else: the engine is the only place truth is computed, and surfaces are tested against a fake surface. |
| Shell arrives and quietly forks behaviour | The shell may only add capabilities (files, offline), never logic. Enforced in review. |
| Scope creep: "editor" becomes "design tool for everyone" | Non-goals hold: we author *conformant* pages, not arbitrary art. |

---

## 8. The decision this document needs

1. **Confirm web app + local engine, native shell only as packaging + filesystem.**
2. **Confirm the editor consumes the same protocol as agents** (no bespoke backend).
3. **Confirm Rust stays a WASM accelerator**, CI-built, never a build prerequisite.
4. **Confirm the editor stays Phase 3** — Phase 1a (accessibility-only `check`) is still the next
   commit, and this decision only constrains how the engine is packaged, not what ships first.
