# web-spark

**Every artifact proves itself.**

A design document, a motion timeline, a settings file, a component tree, a rendered scene, a
shipped bundle — each should carry its own proof that it is accessible, fast, safe, legible to
machines, and resilient. Today none of them do. web-spark is the missing layer that makes that
proof a property of the pipeline instead of an audit after the fact.

> ⚠️ **Status: design proposal.** No code yet, on purpose. Three documents carry the thinking:
> - [docs/VISION.md](docs/VISION.md) — the unified plan: one intermediate representation, five pillars
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

## The five pillars, in build order

| | Pillar | What it does |
|---|---|---|
| 1 | **Verify** | audit any URL or source tree, score it honestly, gate the PR |
| 2 | **Manifest** | emit machine-facing declarations and content maps *from the IR* |
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
- Phase 1 is a CLI and a CI gate. Design, motion and rendering are a published roadmap, not a
  shipped claim.

## Contribute to the thinking

Right now the most useful contribution is disagreement — open an issue against the part of the
plan you think is wrong. The open decisions are listed at the end of
[VISION.md](docs/VISION.md#7-decisions-needed-before-any-code).

## License

Apache-2.0. The patent grant is deliberate: the intent is that the format and the score outlive
this repository.
