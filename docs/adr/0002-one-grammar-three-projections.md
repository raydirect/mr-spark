# ADR 0002 — One grammar, three projections

Status: accepted · Applies to: `src/formats/`, `schema/`, every document a person authors · Date: 2026-11-07

## Context

Phase 1 asks for three frozen formats: `scene`, `motion`, `settings`. "Frozen" meant, in the plan,
"JSON Schema files plus TypeScript types", which describes the obvious way to do it: write a schema,
write a validator that reads the schema, write types by hand to match.

That shape has three copies of one design. Every one of them is editable, and none of them can check
the others:

- Hand-written JSON Schema cannot express the rules that make this project worth anything. "Every
  `button` needs a `focus-visible` state", "a `layout` key must name a component that exists", "a
  theme must mirror another theme's keys" are not shape facts, and a schema that omits them is
  routinely *wrong* about validity while being perfectly valid JSON Schema.
- A validator written against that schema either reimplements a subset of JSON Schema (so we own a
  parser nobody specified) or agrees with the schema only as long as nobody edits one of them.
- Hand-maintained `.d.ts` files drift from both, silently, and drift in types is invisible until
  someone's editor stops helping.

There was a second problem, found by starting to write the schemas at all. `DOCUMENTS.md §3` sketched
the settings document as flat dotted keys — `"color.accent": { "value": "#0b5fd0", "type": "color",
"contrastOn": [...] }` — while `src/config/tokens.json`, the file the report actually renders from and
the one ADR 0001 declares the single token store, is a nested, theme-mirrored shape with
`contrast.pairs` beside it. Two shapes for one concept, one of them already load-bearing, and the
format spec was not the load-bearing one. Sketching `"type": "color"` on every token plus
`"contrastOn"` on some of them also proposed two places to declare a contrast commitment, and then
proposed *checking both* — which is not a guarantee, it is a tie-break waiting to happen.

Neither problem is a typo. Both are what happens when a format's definition is prose.

## Decision

**The format is a descriptor graph in `src/formats/`, and everything else is generated from it.**

One node type per construct (`string`, `const`, `integer`, `number`, `boolean`, `enum`, `object`,
`array`, `map`, `union`, `tokenRef`, `tokenOr`, `ref`), declared once, projected three ways:

1. **A runtime validator** — the authority. It reports three buckets, because there are three
   different facts: `errors` (the document is wrong), `notices` (legal and worth arguing with),
   `unresolved` (a check that could not run, e.g. a token reference with no settings document).
   `valid: true, complete: false` is a result a surface must be able to print honestly; `complete`
   exists so it can.
2. **JSON Schema 2020-12** — `schema/*.json`, published for editors and third-party tools. Shape
   only, and each file says so in its own `$comment`, naming the semantic rules it does *not* contain.
   A format that overstates what its schema checks teaches people to trust the wrong artifact.
3. **TypeScript declarations** — `schema/types-0.1.d.ts`, one file for all three formats, so shared
   vocabulary is declared once.

`schema/` is committed and asserted byte-identical to what the generator produces, in `npm test` and
in CI (`npm run formats:check`). The generated files are artifacts, not sources; a PR that edits one
is a PR that will be closed with a one-line reply.

**Rules the grammar encodes rather than the prose recommends:**

- **Unknown keys are rejected** (`additionalProperties: false` everywhere). A design document that
  ignores a typo is a design document that loses decisions.
- **`version` and `$schema` are `const`s.** The format version is not a checked string: an
  unimplemented version is refused before a single shape error is computed, so the one fact that
  matters is the first thing read.
- **Semantics get ids.** `SCENE001…`, `MOTION001…`, `SETTINGS001…`, each with a message, like every
  verifier rule. A check you cannot name is a check you cannot dispute.
- **A check that throws is reported as our bug**, not as a document error, and never swallowed.

**And the settings document *is* the token store.** `settings-0.1.json` describes
`src/config/tokens.json` as it already exists: nested groups, `color.<theme>`, mirrored themes,
`contrast.pairs` with paths relative to a theme block. `DOCUMENTS.md §3`'s flat `{value, type}` sketch
and the redundant per-token `contrastOn` were dropped. The dogfood test is the proof: our own brand
file validates as a settings document, so the format cannot be a theory about a file nobody has.

## Consequences

**What this buys**

- One place to change a format. Adding a field is one line in one file, and the schema, the types and
  the validator's behaviour move together — the class of bug ADR 0001 was written for cannot recur in
  the formats layer.
- The published schemas are honest *about their own limits*, which is worth more than schemas that
  are complete but silent.
- Error messages are the format's real interface. Because validation is ours, a message can carry
  reasoning: a rejected `2px solid #14181d` says the rule protects contrast, not that a regex
  disagreed. A `did you mean "space.lg"?` for `space.larg` is a lookup, not a guess.
- Discriminated unions report the *chosen* shape's errors (`Checked as the "heading" shape.`), which
  is the difference between a message and a wall of `anyOf`.

**What this costs**

- We own the validator. A JSON-Schema-complete implementation would be more standard and more
  portable; we traded that for the ability to check the rules that matter, and paid for it by making
  the schema a projection nobody may hand-edit.
- `schema/*.json` cannot be the sole input to a third party's tool. Anyone building against the
  formats needs `src/formats/` (or must reimplement the semantic rules, which they are then free to
  get wrong — visibly, and never with our seal).
- Three projections means a generator, and a generator means a CI step whose failure looks
  self-inflicted. `npm run formats:check` exists so the failure says exactly what to run.
- Internal token names are now public API (`colorBlock`, `propertyValue`, `tokenRef`) because they are
  `$defs` names in a published file. Renaming one is a format change, not a refactor.

**What this forces next**

- `lower()` must resolve `defaults` inheritance, and it must be the only resolver. A check that
  resolves inheritance the way the schema does, and an emitter that resolves it slightly
  differently, would validate one document and emit another. That is the same defect as ADR 0001's
  tie-break disagreement, wearing a different hat.
- Cross-document rules — a motion `target.id` that must exist in the scene, a `tokens.$ref` that must
  point at a real file — are `lower`'s job. They are *not* currently checked, and no document should
  be described as fully verified until they are.
- `docs/SCENE.md` is now the only place the *meaning* of a component type can live. A vocabulary in
  code with no prose is a vocabulary that gets quietly reinterpreted.

## Alternatives rejected

- **Hand-written schemas + `ajv`.** Standard, and it makes the semantic rules unrepresentable — they
  would live in a second place anyway, so we would own a drift problem and a dependency. `ajv` and
  its three sub-packages also buy nothing over a validator we already need.
- **TypeScript types as the source**, compiled to JSON Schema (or the reverse). Attractive to a
  codebase that wants types, but `.d.ts` files have no runtime presence and no way to express a
  required state on an interactive component; and we would be adding a compiler toolchain to a project
  whose install story is `npm i -g webspark`.
- **Schema-first with a validation test-suite as the "second opinion".** Two definitions of one thing
  is what produced the two token shapes in the first place.
- **Keeping `DOCUMENTS.md §3`'s flat token shape and rewriting `tokens.json` to match.** It would have
  made the format prettier and the report wrong for a release, and it would have needed a migration
  for a file nobody outside this repository has ever read.
