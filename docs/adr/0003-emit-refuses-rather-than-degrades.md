# ADR 0003 — `emit` refuses rather than degrades, and reads the IR

**Date:** 2026-11-07
**Deciders:** repo maintainer, in review with Arena
**Supersedes:** nothing. Extends [ADR 0002](0002-one-grammar-three-projections.md), which froze what a
document may say; this one decides what happens when a document says something CSS cannot honour.

## Context

`src/emit.js` is the first place in the product that turns an intention into an artifact a person will
load. Three questions arrived together while writing it, and each has a "convenient" answer that this
project should not be in the business of giving.

1. A document declares `trigger.on: "state"`, or a machine with `effects`. CSS has no equivalent — it
   needs something running at play time, which is Phase 4. Do we emit the rest of the page and warn?
2. A scene declares `hover: { transform: "translateY(-2px)" }`… it cannot, the format refuses it, but
   the same shape of question appears legitimately: a `fade` reduced-motion fallback on a motion that
   never touches `opacity`. Do we substitute the nearest thing we *can* express?
3. Who is `emit`'s input? The documents (so it can re-check them) or the IR (so a design tool holding an
   IR can emit without the source files)?

The precedent inside this repository is unambiguous. `REVOLUTION.md` opens with one non-negotiable rule —
*you cannot emit an artifact the verifier has not judged* — and §14.2 records the maintainer's standing
correction: a refusal is never allowed to be the last word, because *there are always solutions that
work*. Both of those point the same direction here, which is why this is an ADR rather than a comment in
a function.

## Decision

**A refusal writes nothing, is fatal, and names the alternative in its own message.**

```
  ✗ motion.machines.menu: machine "menu" plays effects, which needs the runtime (Phase 4) [EMIT001]
    nothing was written: a page with a dropped motion is not a partial result, it is a wrong one
```

- **`EMIT001`** — a motion needing play-time behaviour (`state`/`click`/`scroll`, a machine with
  effects, a state with no CSS selector). The alternative is in the message: use `load`, `visible`,
  `hover` or `focus`, or leave it a scene state with no animation.
- **`EMIT002`** — `repeatDelay`. The alternative: fold the pause into `duration`. Faking it by padding
  the duration would emit a different motion than the one authored, which is worse than no motion.
- **`EMIT003`** — a fact with no emission mapping: an unknown layout property or component type (a format
  and emitter out of step is a build error, not a page), a `responsive` key with no declared breakpoint,
  a skip link with no `main`, two animations claiming one element's single CSS animation list.

Three rules follow from that decision, and they are the reason it is worth recording:

**No silent substitution, anywhere in the pipeline.** An ease outside the table becomes `null` from
`cssTimingFunction`, and `emit` refuses rather than reaching for `ease-out`. A `fade` fallback with no
`opacity` in the motion emits `animation: none` and files a notice saying so — the safe reading of the
author's intent, announced, rather than a guess dressed up as the same thing. This is the same rule that
makes `sampled` eases bake into `linear(…)` instead of fitting a `cubic-bezier()` (§2 of
`DOCUMENTS.md`).

**`emit` consumes the IR; `lower` is not allowed inside it.** `spark emit <set>` runs `lower` first
because that is the ergonomic path, and `spark emit page.ir.json` skips straight to emission. The IR
carries `ir: "0.1"` and `emit` refuses a mismatch instead of guessing forward: a stale IR means the
tokens, the defaults and the sequencing were resolved by different code, and re-deriving them at the last
step would make "the IR is the only path" a slogan. The IR is where `defaults` resolution lands (ADR
0002), so if `emit` re-resolved anything, two answers would exist.

**Emission is a pure function, and the CLI proves it in the process that ships the files.** `emit` runs
twice and compares; a difference is reported as a bug in the emitter and exits 2. Doing the check inside
the command rather than only in a test is deliberate — determinism is the property CI is supposed to
protect for *users*, not for the fixture we happen to test with.

## Consequences

- `test/spine.test.js` asserts the emitted page has **zero decided findings** under our own engine, and CI
  runs `emit → check --fail-under 95 → diff` between two output directories. The dogfood is now the
  compiler's, not only the report's.
- A refusal is an exit code, so an author's editor or an agent's tool call cannot mistake "wrote
  something" for "succeeded". The studio, when it lands, has to show the refusal the same way — the
  emitter already returns `refusals` alongside `files` so the UI can render a card per refusal without
  parsing stderr.
- Some valid documents have no page yet. That is the honest state of the format-vs-runtime boundary, and
  it shrinks in Phase 4 on its own schedule rather than being papered over by a degraded emission.
- `ir.motion.machines` is emitted *into* the IR even when it cannot be emitted to CSS, so the facts a
  later phase needs already survive lowering. The refusal is about the page, not about the data.
- The emitter's own floor (a `box-sizing` reset, `body { margin: 0 }`, the skip-link pattern) is CSS that
  no document authored. That is permitted — and it is *listed*, in comments, so the next reviewer can
  argue about the exact set rather than discover it. Anything visual still has to come from a token; the
  skip link borrows `--color-accent` on `--color-bg`, which is a pair the settings document already
  promises.
- Notices are not refusals. `as: "lead"` with no `size` emits a paragraph and says so; the format's own
  `literalValue` lints pass through. A refusal is reserved for "the page would be a lie".

## Alternatives rejected

**Emit the CSS-emittable subset and warn.** The most-requested answer and the one this project exists to
refuse. A page that is missing an entrance animation looks finished: the content is there, the hover
states work, and the section that was supposed to fade in sits at `opacity: 0` in the source of truth but
visible in the browser — a discrepancy only a reader with both files open would notice. `LIMITS.md` says
we report what we could not check instead of quietly deciding it was fine; a build that drops declared
intent is the same failure with better manners.

**Downgrade an ease to the nearest keyword.** Cheaper output, and it makes every document that used
`bounce.out` a document whose page is subtly different from its spec — which also makes "byte-identical"
a claim about a substitution rather than about the authored thing.

**Let `emit` take the documents only, and re-check them there.** One function fewer, but it puts
resolution inside emission, which is how a compiler ends up with two resolvers. `lower` is the sole place
defaults, tokens and cross-document identity are decided (ADR 0002); `emit` reading the IR is what keeps
that promise checkable — and it is what makes `spark emit page.ir.json` possible for anything that holds
an IR and not the sources.

**Refuse at validation instead of emission** — i.e. make `MOTION008` reject `trigger.on: "state"` until
Phase 4 exists. Rejected because the *document* is fine: it states an intent, a machine and an effect, all
resolvable, and the format's job is to describe pages, not to encode which parts of the compiler happen to
be built this quarter. Freezing the format to today's emitter is how a schema becomes a changelog. The
refusal lives at the seam where the capability is missing, and it names the phase that closes it.
