# web-spark

**Every artifact proves itself.**

A design document, a motion timeline, a settings file, a component tree, a rendered scene, a
shipped bundle — each should carry its own proof that it is accessible, fast, safe, legible to
machines, and resilient. Today none of them do. web-spark is the missing layer that makes that
proof a property of the pipeline instead of an audit after the fact.

> ⚠️ **Status: design proposal.** No code yet, on purpose. Four documents carry the thinking:
> - [docs/VISION.md](docs/VISION.md) — the unified plan: one intermediate representation, five pillars
> - [docs/SURFACES.md](docs/SURFACES.md) — why the product is the engine, and where it runs
> - [docs/SHELL.md](docs/SHELL.md) — what hosts the authoring UI, and why it is not a native app
> - [docs/EASE.md](docs/EASE.md) — how anyone, anywhere, gets a true answer in seconds
> - [docs/MCP.md](docs/MCP.md) — how the Model Context Protocol is threaded through every layer
> - [docs/RESEARCH.md](docs/RESEARCH.md) — the evidence base, for why this and not something else
> - [docs/INSPIRATIONS.md](docs/INSPIRATIONS.md) — 100 influences as *borrow this / avoid that*, brand-free

---

## The one-sentence thesis

> **web-spark is a conformance compiler for the web.** Many front-ends lower into one typed
> intermediate representation. It is analyzed against a published rule set, scored publicly,
> and emitted back out as diagnostics, safe fixes, machine-facing manifests, and renderable
> scenes.

That single sentence is what makes this one product instead of six. Single-artifact tools can
never tell you this:

> *"This button is 2.9:1 from the design token, animates a property that triggers vestibular
> symptoms, has no accessible name in the shipped DOM, and declares no machine-callable action."*

An IR can. So can we.

## MCP is a load-bearing wall, not an integration

The Model Context Protocol runs through the architecture in **four directions**, specified in
[MCP.md](docs/MCP.md):

1. **Spark is an MCP server.** `audit`, `explain`, `fix`, `verify_tools`, `emit_faces`,
   `baseline` — the whole product is machine-callable, stateless, with the IR content hash as
   the handle.
2. **MCP servers are a verified surface.** The protocol ships no content hashing, no version
   pinning and no re-approval for tool definitions — which is why *tool poisoning* and *rug
   pulls* are its signature attacks. We fix that with a rule family (`MCP001`–`MCP010`) and a
   small, boring artifact: `.spark-tools.lock`.
3. **One declaration → three machine faces.** An app declares its capabilities once; we emit
   browser-side tools, an MCP server, and a content index — then **fail the build if they
   disagree**.
4. **MCP is the federation layer.** The five pillars are one tool family, so an agent can drive
   verify → manifest → author → animate → render.

And one cultural rule: **Spark passes its own MCP conformance rules in CI, permanently.**

## Where it starts

```bash
npx webspark check https://example.com
```

```
  web-spark  https://example.com

  ACCESSIBLE  38/100  ✗ 14 errors   image-alt ×3 · color-contrast ×9 (2.1:1) · label ×2
  FAST        55/100  ~ LCP 3.8s · 612 KB JS
  SAFE        88/100  ✓ 1 advisory (moderate)
  LEGIBLE     41/100  ✗ no main landmark · 12 unlabeled controls · 0 declared actions

  CONFORMANCE 52/100  ✗ FAIL (budget 70)
  automated checks only — roughly 30% of WCAG criteria can be machine-tested
```

Then in CI, gating only on *new* problems:

```
web-spark  72 → 78 (+6)   ✓ passed
  +2 accessible   fixed 4 contrast issues
  -3 fast         entry bundle +38 KB
```

## Where it runs

One engine, four surfaces — **CLI → CI gate → MCP server → browser extension**, in that order.
The extension is the best *lens* (logged-in pages, real interactions, one-second demo) and the
worst *authority* (non-deterministic, requires someone watching, users run stale builds). So it
ships second, not first, and it computes nothing: it captures, and the engine judges.
Reasoning in [SURFACES.md](docs/SURFACES.md). The authoring UI follows the same logic: it is a
**browser-based web app driven by the local engine**, because the design surface must *be* the
runtime — a native host would mean reimplementing CSS or verifying a second engine. A thin
desktop shell arrives later for filesystem and offline only; Rust stays a WASM accelerator, never
the host. See [SHELL.md](docs/SHELL.md).

## Easy for anyone, anywhere

A ladder of nine rungs, cheapest first — **none requiring an account, an install, or a
toolchain** ([EASE.md](docs/EASE.md)):

| Rung | Path | Ships |
|---|---|---|
| 1 | **a shared link** — a URL, no session, server-rendered, deterministic | P1b |
| 2 | a continuously updated public statement of the state of the web | P1 |
| 3 | `npx` — one command, zero config | P1a |
| 4 | paste-one-snippet capture for logged-in pages | P2 |
| 5 | **a gate on the merge** — the moat | P1c |
| 6 | the audit as an agent tool | P1d |
| 7 | docs where every rule page embeds its own failing example | P2 |
| 8 | an embedded scorecard that degrades to plain HTML | P2 |
| 9 | localized first-run, in the user's language and script | P2 |

Rung 1 is how the world hears about it; rung 5 is how it stays. And because every rung reports
the same findings from the same IR, a link pasted in one country means the same thing in another
— which is the most globalizing feature there is.

## The five pillars, in build order

| | Pillar | What it does |
|---|---|---|
| 1 | **Verify** | audit any URL or source tree, score it honestly, gate the PR |
| 2 | **Manifest** | one declaration → three machine faces, plus MCP conformance and `.spark-tools.lock` |
| 3 | **Author** | declarative design/settings documents that compile to conformant pages |
| 4 | **Animate** | an open motion format where reduced-motion safety is a checked property |
| 5 | **Render** | drawn scenes with a real projected semantic DOM — accessible pixels |

Order is not taste. Verification is the only pillar that needs nobody's adoption to be useful,
and it is the trust credential for the four that follow. The full argument, including the
cautionary tale of a dead animation ecosystem, is in
[VISION.md §3](docs/VISION.md#3-the-architecture).

## Honest limits

- Automated checks cover roughly **30% of WCAG success criteria**. web-spark will never claim a
  site is compliant, and the report says so in its own output.
- Scores get gamed. Ours uses public, versioned weights, four subscores that are never merged,
  and always ships the raw findings alongside.
- Phase 1 is a CLI, a CI gate, and an MCP server. Design, motion and rendering are a published
  roadmap, not a shipped claim.
- We audit MCP servers but cannot certify them. A clean `MCP*` report means the definition layer
  is honest and drift-free — not that a server is trustworthy in every respect.

## Contribute to the thinking

Right now the most useful contribution is disagreement — open an issue against the part of the
plan you think is wrong. The open decisions are listed at the end of
[VISION.md](docs/VISION.md#7-decisions-needed-before-any-code).

## License

Apache-2.0. The patent grant is deliberate: the intent is that the format and the score outlive
this repository.
