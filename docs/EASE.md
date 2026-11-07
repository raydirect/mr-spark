# "Super Easy, Everywhere": The Reduced-Friction Model

**Decision document.** The question: what makes MR-Spark usable *easily* by people all over the
world? Past decisions fixed *what* the product is and *where truth lives*. This one fixes the
**activation path** — the distance between hearing about it and receiving a true answer.

Recommendation up front: **a ladder of nine rungs, where each rung costs less than the one above
it and none requires an account, a toolchain, or permission from anyone.** Five rungs ship in
Phase 1. The most important design decision inside this document is not a technology — it is
that **a shared link is the primary distribution mechanism, and the zero-config one-command path
is the shortest one.**

---

## 1. First, the trap to avoid

"Easy for everyone" is where good projects die, because the obvious implementations are all
traps:

| Trap | Why it fails |
|---|---|
| A friendly web app as the *only* door | It makes correctness depend on our uptime, our bandwidth bill, and a form. A stranger in a country we cannot reach cheaply gets nothing. |
| A generated site that runs nothing | Looks like product, teaches nothing, has no exit to the gate. |
| "Sign in to save your report" | Converts a diagnostic into a data-collection event. Kills adoption and violates the plan's "no key required for correctness". |
| AI chat as the interface | Most people do not want a conversation; they want one number and three fixes. |
| Heavy install (editor plugin, desktop app) as the entry | Every install is a drop-off, and the toolchain is exactly what we are trying to remove from the path. |

The principle that resolves them:

> **Ease must never come from a dependency.** Every rung must deliver a true answer with no
> account, no install, no toolchain, and no relationship with us.

---

## 2. The ladder

Ranked by friction, cheapest first. "Time to truth" is measured from a cold start: nothing
installed, no account, first visit.

| # | Rung | Time to truth | Needs | Ships | Truthfulness |
|---|---|---|---|---|---|
| 1 | **Shared link** — a URL, no session, nothing to read | as fast as a message | a link | P1 | a real score object, deterministically rendered |
| 2 | **Nothing shipped at all** — a running public statement of the state of the web, updated continuously by our own scanner | zero | a visit | P1 | reproducible, methodology + data published |
| 3 | **Zero-config command** — one command against a URL or a repo | seconds | a terminal | P1a | full report |
| 4 | **Paste-one-snippet capture** — for authenticated and localhost pages, a single inline script `src` produces the same IR, then prints and shares | seconds | a browser | P2 | the *same* engine, so the same findings |
| 5 | **Gate on the merge** — a reusable CI action, baseline-ratcheted | zero for the developer | nothing (CI does it) | P1b | the authority |
| 6 | **Agent tool** — the audit as a callable tool, so agents produce and consume it | zero | an MCP-capable host | P1c | the same audit, second interface |
| 7 | **Docs that *are* the tool** — every rule page embeds its own live example: "this is what triggers this rule" | seconds | a visit | P2 | self-proving: the example fails the rule, always |
| 8 | **Embedded scorecard** — a snippet that shows the live score of a repository or page, and degrades to a plain server-rendered card | seconds | a page | P2 | server-rendered first paint, so it works without our JS |
| 9 | **Localized first-run**, in the user's language and script, with the report itself translatable | n/a | nothing | P2 | findings are machine-generated from a rule id, then localized |

Two observations about that table, and they are the whole answer:

- **Rung 1 is the marketing, rung 5 is the moat.** A shared link is how the world hears about
  this; a gate on the merge is how it stays. Most projects build only one of them.
- **Rungs 3–4 produce the *same* artifact** (an IR), which is why a person with no terminal and a
  person in a CI pipeline get answers that agree. That is not a feature; it is the reason the
  score can be trusted at all.

---

## 3. The link, specified (because this is the product's front door)

A shared report is a first-class surface and must be designed like one:

- **A real page, rendered on the server.** No client-side app is required to read it. Works in a
  text browser, works with the scripting disabled, works behind a strict proxy.
- **Deterministic content.** The report is a pure function of `(target, engine version, rule-set
  version)`. Same inputs, same page — so a link shared six months ago still explains itself.
- **Provenance printed on the page:** engine version, rule-set version, timestamp, the exact
  command that produced it, and a one-click "reproduce locally" line.
- **No session, no account, and no gate.** The link is the whole experience.
- **Honest by construction:** the page carries the automated-coverage caveat and the raw findings,
  not just a number — the same discipline as any other reporter.
- **Untrusted text is inert.** Rule messages and target excerpts are derived from the *rule id*,
  never interpolated raw from the scanned site, so the report cannot be used as an attack surface.
- **Opt-out is one header.** Any site owner can decline to be scanned or displayed; the scanner
  honours it and says so.

**A report URL that anyone can paste is worth more than a landing page, a launch post, or an
install funnel** — because it is the only artifact a stranger can verify without trusting us.

---

## 4. What "all over the world" actually requires (and it is not a translation plugin)

Global ease is an engineering property, not a language switcher. The concrete list:

| Requirement | Why it matters | Implementation stance |
|---|---|---|
| **One-command bootstrap** | A region-blocked or slow package host must not be the gate to trying it | Ship a single-file bundle and a container image alongside the package; both are pinned and hash-published |
| **Tiny payload** | The median mobile page is ~2.5 MB; a diagnostic tool has no right to be heavy | Core is a small dependency footprint; heavy engines are lazy, optional peers |
| **Runs on the hardware people have** | Not everyone has a second monitor and 16 GB | No daemon, no database, no browser required for rung 3 |
| **Metadata-only by default** | Sending a page elsewhere is a decision, not a default | Never send page content to a third party; opt-in only, and say so |
| **Byte-diffable, deterministic output** | CI caching, diffing, and reproducibility | Stable ordering, stable ids, no timestamps inside equality-sensitive fields |
| **Localized messages, machine-generated ids** | Findings that read correctly in any language, without breaking diffing | Message = f(rule id, args, locale); the id is the stable key |
| **A report you can send at low bandwidth** | Sharing should not require a good connection | Plain, semantic HTML; no custom fonts, no client JS required |
| **Accessible by default, deliberately** | A tool that preaches accessibility and ships an inaccessible report is finished | Every surface meets the same bar it sells; this is a test in our CI |
| **Works with scripting disabled, and with a screen reader** | Same reason | Server-rendered first, enhancement second |
| **Opt-out and privacy respect** | Scanning other people's sites is a privilege | One-header opt-out, no content retention beyond the report, and a plain-language policy |

The unglamorous truth: **the most globalizing feature is determinism.** If the same target
yields the same report in Lagos, Osaka, and São Paulo, then a link can be shared across those
places and mean the same thing.

---

## 5. The product-surface map, revised

Adding the activation surfaces to the existing engine/surface model. Truth is still computed in
exactly one place.

```
                         ┌───────────────────────────────┐
                         │        spark engine           │  ← the only source of truth
                         └───────────────┬───────────────┘
   ┌─────────────┬───────────┬───────────┼───────────┬───────────┬──────────────┐
   ▼             ▼           ▼           ▼           ▼           ▼              ▼
 CLI          CI gate    MCP server   shared-link   snippet    embed card    editor
 (rung 3)     (rung 5)   (rung 6)     report (1)    (rung 4)   (rung 8)      (Phase 3)
   └─────────────┴───────────┴───────────┴───────────┴───────────┴──────────────┘
                        all report the same findings, from the same IR
```

Rung 4 deserves a note, because it is how the effort stays small: **the snippet does not compute
its own verdict.** It collects a capture (rendered DOM, computed styles, the accessibility tree,
timings) and a *live* audit run hands that to the engine. That is the same capture format the
extension will use later — so the snippet is a small, shippable slice of a surface already
planned, not a new product.

---

## 6. Phase 1, re-cut around activation

The order changes slightly, and for a good reason: the front door comes before the moat.

| Step | Ships | Why in this order |
|---|---|---|
| **1a** | `check` (accessibility first) + IR + terminal/JSON reporter | the engine, provable in a second |
| **1b** | **the shared report page** (server-rendered, deterministic, provenance-printed) | the world's first contact; also the best demo we can give |
| **1c** | the CI action + `baseline` (ratcheted, regression-only) | the moat |
| **1d** | `.spark-tools.lock` + `spark mcp serve` + self-conformance | agents, and the loop closing on ourselves |

Note what moved: **the shared report moved ahead of the CI gate.** A gate is worthless until
people trust the score, and the cheapest way to earn that trust is a link anyone can open and
read the provenance of. This is a deliberate reordering of the roadmap and it needs approval.

---

## 7. Risks specific to being "easy"

| Risk | Assessment | Mitigation |
|---|---|---|
| **Free-scanning service becomes an unbounded cost and abuse target** | High — link previews and bots will hammer it | Aggressive caching keyed by `(target, engine, ruleset)`, per-IP and per-target rate limits, no unbounded scanning of arbitrary hosts, and a documented allowlist mode for embeds |
| **Fragility: reports depend on our uptime** | Real, and it is why the link must never be the only door | Determinism means anyone can regenerate the same report locally with one command; the page always prints that command |
| **Scanning other people's sites invites legal and ethical complaints** | Moderate | One-header opt-out, published methodology, no content retention, and a plain-language policy. Ask forgiveness is not the plan; publish first |
| **Localization drifts from the rule set** | Moderate | Messages are functions of rule id + args; a rule cannot ship without its message catalogue entry |
| **Embed cards become a badge economy** | Real (see the score-gaming risk in the vision) | Embedded cards always show the finding counts and the coverage caveat; a card without findings is not renderable |
| **Rung 4 tempts us to fork the engine into the browser** | High — the easy path is to "just run axe in the page" | Forbidden by the surface rule: the snippet collects, the engine judges. The same rule that governs the extension |

---

## 8. The decisions this document needs

1. **Confirm the ladder**, in particular that **no rung requires an account** — permanently.
2. **Confirm the reshuffle of Phase 1**: the shared report page ships *before* the CI gate.
3. **Confirm rung 4's constraint**: the snippet collects, the engine judges, no browser-side
   verdicts. (This is what lets the snippet be extended into the extension later without a
   rewrite.)
4. **Confirm the free public scanner's limits** — caching, rate limits, opt-out honouring — as
   product requirements rather than operational afterthoughts.
5. **Decide the first locale beyond English**, and whether the report page is localized before the
   CLI. (My recommendation: the report page first — it is read by the most people and needs no
   install.)
