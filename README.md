# web-spark

**A conformance score for the web — and a CI gate that stops you merging a regression.**

> ⚠️ **Status: design proposal.** There is no code yet. This repo currently contains the
> research and the plan, deliberately written to be argued with before anything is built.
> Read [docs/RESEARCH.md](docs/RESEARCH.md), then [docs/PLAN.md](docs/PLAN.md).

---

## The problem, in one paragraph

Every stage of web development has a world-class tool. But the **outcome** — *"this site is
accessible, fast, safe, and usable by humans and by AI agents"* — has no owner, no single
number, and no CI gate anyone can install in five minutes. So: 95.9% of the top million home
pages fail automated WCAG checks and it's getting *worse*; the median mobile page ships 632 KB
of JavaScript and only 48% of mobile sites pass Core Web Vitals; and agents now generate code
faster than anyone can verify it (35% of AI-written code ships before the team understands it).

## The idea

One command. Zero config. A number you can gate on.

```bash
npx webspark check https://example.com
```

```
  web-spark  https://example.com

  ACCESSIBILITY   38/100   ✗  14 errors
    ✗ image-alt       3 elements
    ✗ color-contrast  9 elements    .muted (2.1:1, needs 4.5:1)
    ✗ label           2 elements
  PERFORMANCE     55/100   ~  LCP 3.8s · 612 KB JS
  SECURITY        88/100   ✓  1 advisory (moderate)
  AGENT READINESS 41/100   ✗  no main landmark · 12 unlabeled controls · no llms.txt

  CONFORMANCE 52/100  ✗  FAIL (budget: 70)
```

And in CI — no browser, ~300 ms, fails only on *new* problems:

```yaml
- uses: webspark/check-action@v1
```

```
web-spark  72 → 78 (+6)   ✓ passed
  +2  accessibility   fixed 4 contrast issues
  -3  performance     entry bundle +38 KB
```

Not a framework. Not a linter clone. **The missing verification layer**, built on the engines
the ecosystem already trusts (axe-core, Lighthouse, OSV) — plus the thing nobody has packaged
yet: a report designed to be read by **AI agents**, about whether your site is legible to them.

## Why this and not another framework

Because the #1 and #2 free-text pain points in State of JavaScript 2025 are *cognitive
overload* and *ecosystem issues*. Another mental model loses. One `npx` command that
tells the truth wins. Full reasoning, including the anti-goals, is in
[docs/RESEARCH.md](docs/RESEARCH.md#what-this-research-says-not-to-build).

## Honest limits

- Automated checks cover roughly **30% of WCAG success criteria**. web-spark will never claim
  a site is compliant, and the report says so in the output itself.
- The score is only as good as its published weights. They're public and versioned, by
  design — a gamed score is a dead project.
- We are a wrapper around great engines. That's the point: it's why we can be trustworthy on
  day one.

## Contribute to the thinking

The most useful thing you can do right now is disagree well — open an issue with the section
of the plan you think is wrong, or add a pain point we missed. See
[docs/PLAN.md §9](docs/PLAN.md#9-decisions-i-need-from-you) for the open decisions.

## License

Apache-2.0 — see [LICENSE](LICENSE). Patent grant included on purpose: this is meant to be a
standard, not a product.
