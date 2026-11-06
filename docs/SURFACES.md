# Which Surface Is the Product?

**Decision document. The question: should the main app be a browser extension, or something
else?** Recommendation at the bottom; the reasoning is the point, because this choice is
expensive to reverse.

Short answer: **no, the extension is not the main app — and it is also not optional.** It is the
last of four surfaces, on a **shared engine**, and the reason it cannot be the main app is the
most important thing in this document.

---

## 1. First principle: we ship *evidence*, not *pixels*

Every surface question collapses into one test:

> **Which surface can deliver a truth about a web page that is trustworthy, cheap, and
> repeatable — for a person, a CI pipeline, and an agent?**

A browser extension is exceptional at *looking*. It is structurally incapable of being the
place where the truth is decided:

| Property | Extension | CI / CLI | Consequence |
|---|---|---|---|
| Deterministic | No — the user's profile, extensions, logins, GPU, network and viewport all change results | Yes — pinned browser, fixed viewport, no extensions | A gate cannot be built on a surface with no fixed baseline |
| Unattended | No — someone must be looking at a page in a real browser | Yes | Evidence has to be produced while nobody is watching |
| Versioned | Weak — users run stale builds for months | Yes — lockfiles, pinned actions | A score must be reproducible to mean anything |
| Bot-defeating **for** us | No — automation gets rate-limited and challenged | Partly | Verification of *other people's* pages will be blocked in a browser tab |
| Deep analysis | No — CORS, cross-origin isolation and memory limits block real engines | Yes — unrestricted Node process | The heavy analysis cannot live in an extension |

That table is the whole argument. **An extension is a lens. A pipeline is a source of truth.**

There is a sharper way to say it: an extension reports what happens *on one person's machine,
in one browser profile, right now*. A gate reports what happens *to everyone*, on every merge,
forever. The second is the product; the first is a view of it.

---

## 2. But the extension is a *category leader* at three things we need

Dismissing it entirely would be the second-worst mistake. It wins, uniquely:

1. **Authenticated, logged-in, real-user pages.** Half the web is behind a session. A CI job
   cannot reach your staging dashboard; a developer's own browser already is. This is the only
   surface where "audit *my* view of the app" is trivially possible — and it is why the earliest
   entrants in this space were extensions and not CLIs.
2. **Interacting with reality.** Hovering, opening a modal, filling a form, dragging a
   sortable — colour contrast on a hover state, focus order in an open dialog, and label
   quality inside a checkout flow all require *doing* things. A page at rest is the easy 30%.
3. **Zero-install demos and distribution.** Click "add to browser", land on your own site, see a
   score in one second. That is a better funnel than `npx` for a non-engineer, and it is the
   cheapest possible trial.

So the extension is the **best exploratory instrument** and the **best capture device**, and the
**worst possible authority**.

---

## 3. The architecture that resolves it: one engine, many surfaces

This is the decision, and it is a *seam* decision rather than a platform decision:

```
                    ┌───────────────────────────────┐
                    │        spark engine           │  ← all truth lives here
                    │  IR builder · analyzers ·     │     no DOM, no browser, no UI
                    │  rule set · score · reporters │
                    └───────────────┬───────────────┘
        ┌───────────────┬───────────┼────────────┬─────────────────┐
        ▼               ▼           ▼            ▼                 ▼
   CLI (`npx`)     CI action    MCP server   Editor ext.     Extension
   the wedge       the gate     the agents   inline hints    the lens
                                                              (+ capture)
```

Rules that make this safe:

- **The engine never imports a surface.** It takes an IR or a DOM snapshot in, and returns
  findings out. No browser-extension APIs, no `window`, no `document` outside the injected
   collector.
- **The extension computes nothing.** It *collects* — serialises the rendered DOM, computed
  styles, the accessibility tree, network timings, and user interactions — and hands that to
  the **same engine**, bundled as a shared module. Anything the extension can compute, CI can
  compute from the same input, and vice versa. That is what makes the score comparable.
- **"Capture → share" is a first-class export.** From the extension: an IR JSON file, a
  baseline-entry patch, or a one-line reproduction. A page you could only reach while logged in
  becomes a test in CI. Nobody in this space does that properly, and it is the single most
  valuable thing an extension can contribute to a gate.
- **The extension is an MCP *client and a capture host*.** Remember the four directions: an
  extension is a natural host for browser-side tool registration, which makes it the perfect
  recording surface for the third machine face.

---

## 4. The four surfaces, ranked by when they ship

| # | Surface | Role | Ships |
|---|---|---|---|
| 1 | **CLI** (`npx`) | the wedge: zero config, seconds to a score | Phase 1 |
| 2 | **CI action** | the gate: only place a regression can actually be stopped | Phase 1 |
| 3 | **MCP server** | the agents: the audit as a callable tool | Phase 1 |
| 4 | **Extension** | the lens: authenticated pages, interactions, capture, demo | Phase 2 |
| — | Editor extension, desktop shell | convenience, later, thin | Phase 3+ |

Note what is *absent*: a hosted web app. A dashboard is a convenience layer (history, org
reporting), never the product, and never a key. That stance is already in the vision and this
document does not change it.

---

## 5. Why the extension cannot be first, in one paragraph

The extension depends on a trustworthy engine, a published score, and a rule set people already
run in CI. Arriving first means shipping a verdict with no credibility behind it, in a
distribution channel full of abandoned accessibility checkers, and then discovering that our
most valuable users — CI pipelines and agents — cannot use the thing we built. The order in §4
is not a preference; it is a dependency graph.

There is a second, colder reason: **store review latency and policy risk are real**, and a
survival-critical first release should not sit behind someone else's approval queue.

---

## 6. The honest downside of each path

| If we make the extension the main app | If we make it the last surface (recommended) |
|---|---|
| Instant gratification, great demo, real "wow" | Slower to a visible artifact; a terminal is not shareable |
| Dead end for CI, agents, and history — the three things that make evidence useful | Slower adoption in the "check my own logged-in app" use case until Phase 2 |
| Store policy, permissions review, and manifest churn become existential | We carry four surfaces sooner than a tiny team would like |
| Re-authorising and re-verifying across every browser engine fork | The engine seam must be disciplined from day one (test it with a fake surface) |

---

## 7. What we would have to build first if the answer were "extension"

Listed to make the cost concrete, and to show it is the same work in a different order:

1. An engine with no browser dependencies (so a background service worker can run it).
2. A capture format (DOM + styles + a11y tree) precise enough to reproduce findings in CI.
3. A published score and rule set — otherwise the extension's number means nothing to anyone.
4. A permissions model minimal enough to pass review (active-tab only, no broad host access).
5. A sync story for baselines, or the extension cannot participate in the gate at all.

Every item is on the roadmap anyway. The extension does not save work; it only changes which
work is visible first.

---

## 8. Recommendation

1. **The product is the engine. The main app is the CLI + CI gate.**
2. **The extension ships in Phase 2 as "the lens"** — authenticated page audits, interaction
   capture, and `capture → baseline patch` export into CI.
3. **Hard architectural rule:** the extension contains no analysis. If a rule cannot run from a
   captured IR, it does not belong in the extension.
4. **Manifest V3, active-tab only, no remote code, minimal permissions** — permissions are a
   trust signal, and we are selling trust.
5. **Cross-browser later, deliberately.** Ship for one browser engine first; port to the others
   only after the capture format is stable.
6. **No hosted dashboard as the main app, ever.** Convenience layer only.

The one-line version:

> **The extension is how people *see* the truth. The pipeline is where the truth *lives*.**

---

## 9. The decision this document needs

Confirm **engine-first, extension-as-lens, Phase 2** — or say "extension-first" and accept the
consequences in §6 knowingly, in which case the roadmap in
[VISION.md](VISION.md#4-roadmap-with-exit-criteria-not-dates) has to be reordered and Phase 1
becomes the capture format rather than the CLI.
