# Legibility: SEO, AEO, GEO as one pillar

The `legible` pillar answers three questions that are usually sold as three products. They are
one artifact examined by three consumers, so they are one pillar with three sub-signals.

| Term | The real question | What we check |
|---|---|---|
| **SEO** | can a search engine crawl, parse and rank this? | title, description, canonical, heading structure, structured-data **validity**, robots, sitemap, internal-link reachability |
| **AEO** | can a retrieval system lift a *correct answer* out of this? | semantic HTML, answer-shaped headings, **text that survives rendering**, no content locked in a script or canvas |
| **GEO** | will a generative engine cite this as a source? | the three machine faces from `MCP.md`, provenance, freshness signals, quotable structure |

Building three checkers would be the "six products, one team" failure in `VISION.md §5`. One
pillar, three sub-signals, one score.

---

## 1. Current state, measured

The verifier knows exactly one discoverability signal today: `document-title`. Everything else is
invisible, including defects that are cheap and deterministic to find:

```
no title, no meta description  | findings: [document-title]
title + description only       | findings: []          ← passes
structured data present        | findings: []          ← not seen
bad structured data            | findings: []          ← BROKEN DATA, NOT SEEN
```

A page can ship malformed `application/ld+json` — invalid JSON, an unknown `@type`, a `Product`
with no `offers` — and still score ≤100. That is the gap this pillar closes first, because it is
the cheapest real win in the whole plan.

---

## 2. What we check, in build order

### 2.1 Structured-data validation (cheapest, first)

- Valid JSON, and a known `@context`.
- Known `@type` for the vocabulary we support, with **required-property** checks per type.
- Every value in the markup is present in the visible page. **Structured data that claims what the
  page does not show is the failure mode that gets sites penalised**, and it is checkable.
- Emitted `@id`s and same-page references resolve.

Rules: `LEG001` malformed block · `LEG002` unknown type · `LEG003` missing required property ·
`LEG004` claim not present in visible content · `LEG005` dangling `@id` reference.

### 2.2 Document-level signals

- `title`: present, non-empty, unique per page in a crawl, within a length range (a warning, never
  an error — length is not a specification).
- `meta description`: present, non-empty, not identical across pages in a crawl.
- `link rel=canonical`: present and self-consistent with the sitemap.
- Exactly one `h1`; heading order monotonic. (Shares the accessibility collector's data — one
  reading, two pillars.)
- `lang` declared and well-formed.
- `robots.txt` and `sitemap.xml`: present, parseable, consistent with each other.

Rules: `LEG010`–`LEG019`.

### 2.3 Text survives rendering (the differentiator)

This is the check nobody runs, and it costs us nothing because we already own the machinery.

- Is the page's principal text present in the DOM **without executing scripts**?
- Is any meaningful text drawn into a canvas, an image, or a pseudo-element rather than being
  text?
- Does the page rely on a client-side render such that a crawler sees an empty shell?

The same defect seen by two audiences: invisible to a crawler, and invisible to a screen reader.
`RESEARCH.md` and the accessibility work already prove the pattern; this makes it a first-class
finding. It is also why Phase 6's projected semantic DOM is a **legibility** guarantee, not only an
accessibility one.

Rules: `LEG020` principal text absent without script · `LEG021` text drawn as image/canvas ·
`LEG022` content depends on client rendering.

### 2.4 Agent readiness (AEO/GEO proper)

- The three machine faces exist and agree (`MCP009`).
- Declared tools are reachable, read-only where claimed, and hashed.
- Content index is present, well-formed, and matches the page's declared sections.
- Provenance and freshness are declared (`dateModified`, `author`) and truthful against the
  document.

Rules: `LEG030`–`LEG039`, cross-referenced with `MCP001`–`MCP010`.

---

## 3. What this pillar can never do

Stated as bluntly as the accessibility caveat, and printed by every surface that shows a
`legible` score.

| Cannot | Why |
|---|---|
| Predict or promise rankings | Readiness is checkable; outcomes are a function of the whole web |
| Know what a generative engine will cite | No specification defines it. Anyone claiming otherwise is improvising |
| Detect spam-policy violations as a category | Policy is enforced by third parties; we can flag obvious patterns, not adjudicate |
| Check indexation | Requires privileged access to a search console |
| Check crawl budget, server log behaviour, or CDN rules | Not visible from a document |

**GEO is not a technology.** There is no standard that says what a generative engine will cite.
We check signals — clean semantics, valid structured data, explicit provenance, quotable
structure — and we label them signals. This rule exists because the search-optimisation industry
has a long tradition of selling causality it cannot demonstrate.

---

## 4. Why `legible` is never folded into `accessible`

Their incentives usually align and sometimes directly conflict: keyword-stuffed headings, walls of
text, link-dense footers, image-heavy hero sections. A single number would let an improvement in
one corrupt the other, and would make the tool's advice incoherent — *"add more text to rank"* and
*"keep this readable"* pulling on the same score.

Two pillars, two caveats, one page. If a page satisfies both, that is a real achievement and worth
reporting as such.

---

## 5. The export advantage

Pages compiled from a scene document cannot ship malformed structured data, because the structured
data is **generated from the document's own typed fields** rather than hand-written. An entire
failure class becomes unrepresentable — the same principle as generated CSS from tokens, and the
same principle as `states` being mandatory for interactive components.

For hand-written pages the pillar reports. For authored pages it mostly cannot fire. That
asymmetry is the strongest practical argument for authoring through the compiler, and it is worth
saying out loud in the README.

---

## 6. Build order and cost

| Step | Depends on | Size |
|---|---|---|
| Structured-data validity (`LEG001`–`LEG005`) | nothing — a collector like the a11y one | ~2 days |
| Document-level signals (`LEG010`–`LEG019`) | existing document facts | ~2 days |
| Text-survives-rendering (`LEG020`–`LEG022`) | existing parse; browser runner for precision | ~3 days |
| Agent readiness (`LEG030`–`LEG039`) | Phase 5 (Manifest) | Phase 5 |

The first two belong in Phase 0–1, not Phase 5, because a page that ships without a title or
with invalid structured data is losing traffic today and the check costs almost nothing. The
pillar's *score* can arrive with the others; the *findings* should not wait.
