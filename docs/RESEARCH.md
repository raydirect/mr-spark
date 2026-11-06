# What Actually Hurts in Web Development

Research compiled 2026-11-06. Every number below is sourced (see [Sources](#sources)).
Numbers I measured myself in this repo's sandbox are marked **[measured]**.

The goal of this document is not to list complaints. It is to separate the pain points
that are *structural* (a missing abstraction, a missing standard) from the ones that are
just *unpleasant but solved* — because only the structural ones can carry a new open
source project.

---

## Method

For each pain point I scored four things:

| Dimension | Question |
|---|---|
| **Frequency** | Does every team hit it, on every project? |
| **Severity** | Does it ship bugs, break users, or cost money/legal exposure? |
| **Unserved** | Is it genuinely unsolved, or is there a good tool people just don't use? |
| **Traction** | Can a stranger get value in under 5 minutes, with no migration? |

"Unserved but low frequency" produces a tool. "Unserved and universal" produces a movement.
Very few things are in the second bucket. Below are the ones that are.

---

## 1. The accessibility gap is not a knowledge gap. It's a *verification* gap.

This is the strongest dataset on the web, and it is brutal.

The **WebAIM Million 2026** scanned the home pages of the top 1,000,000 websites in
February 2026 using the WAVE engine against the rendered DOM:

- **95.9% of home pages had detectable WCAG 2 A/AA failures** — up from 94.8% in 2025,
  reversing six straight years of improvement.
- **56.1 errors per page on average**, a **+10.1%** increase year over year
  (56,114,377 distinct errors total).
- Home page complexity rose to **1,437 elements per page, +14.3% in one year**. Elements
  have nearly doubled in seven years. Affected users "would expect to encounter errors on
  **1 in every 26** home page elements."
- **96% of all detected errors fall into six categories, and they have been the same six
  for seven years**: low contrast text (83.9% of pages), missing alt text (53.1%), missing
  form labels (51%), empty links (46.3%), empty buttons (30.6%), missing document
  language (13.5%).

Read that last bullet again. The web's dominant failure mode is *six repeated, mechanically
detectable mistakes*, on almost every site, for seven years, while the tooling to catch all
six has existed since 2017 and is free (axe-core is embedded in the major browser's DevTools and
Lighthouse).

Meanwhile the legal pressure is no longer theoretical. The European Accessibility Act
became enforceable on **28 June 2025**. One year in: a French court has ordered Carrefour
to remediate under threat of daily fines, Norway's regulator is charging ~50,000 NOK/day
against a health portal, Germany's BFSG allows fines up to €100,000 with the option to
prohibit a service entirely, and market-surveillance authorities in Germany, Sweden, the
Netherlands, Ireland and Poland are opening cases.

**Root cause.** Accessibility tooling is *available* but not *present at the point of
decision*. It lives in a separate CI job people disable, in a browser panel people close,
in an audit PDF that arrives after launch. And the coverage ceiling is real: automated
checks cover roughly **20–31% of WCAG success criteria** (W3C ACT: 17 of 55 criteria), or
~57% of issue *volume* because the automatable failures are so common (Deque's study of
2,000+ audits). The UK GDS tested 13 checkers against a page with 142 known barriers; axe
caught 29%. So "just run axe" is not a solution — which is exactly why the six-category
concentration matters. We know *where* the automated win is; nobody has made capturing it
default.

**Verdict: structural, universal, legally urgent, highly tractable.** The missing thing is
not a checker. It's a checker that arrives *already running*, in ~300ms, with zero config,
in the environment every project already has (CI), and reports in the artifact developers
already read (the pull request).

---

## 2. Pages keep getting heavier, and the pass rate has flatlined near a coin flip

From the **Web Almanac 2025** (HTTP Archive, July 2025 crawl):

- Median **mobile home page: 2.56 MB**; desktop: 2.86 MB. Up ~8% year over year.
- Median mobile page ships **632 KB of JavaScript** (697 KB desktop); the 90th percentile
  is ~1.9 MB.
- Only **48% of mobile sites and 56% of desktop sites pass all three Core Web Vitals.**
  Mobile progress has been ~+3 points/year since 2023 (36% → 44% → 48%).
- LCP remains the gating metric: only ~62% of mobile sites have "good" LCP.

**Root cause.** There is no *budget*, only *advice*. Every performance tool tells you what
your numbers are after the fact. Almost no project has a committed, enforced ceiling on
JS bytes, or a CI that fails when a PR adds 40 KB to the entry bundle. Performance
regression is a silent failure mode: nothing turns red, so the number drifts, and the
median page gets 8% heavier every year while tooling "improves."

INP specifically is now the metric that fails most often, and its main causes are
structural to modern frameworks — hydration cost, long tasks, client component trees that
re-render on route change. That is not something a developer "forgets"; it is something the
default architecture produces.

**Verdict: structural (missing enforcement mechanism), universal, tractable.** The gap is
between *measuring* and *being unable to merge a regression*.

---

## 3. The dependency supply chain is now an active attack surface, not a hygiene issue

- Sonatype's 2026 State of the Software Supply Chain report counted **454,600+ new
  malicious open-source packages in 2025**, a ~75% year-over-year jump, with cumulative
  blocked packages past 1.2 million.
- **Shai-Hulud** (September 2025) was the registry's first genuinely self-propagating
  worm:
  ~187 packages at first detection, expanded to 400–500+ within days, spread by stealing
  maintainer tokens and republishing. Payload executed via `postinstall`.
- **Shai-Hulud 2.0** (November 2025) hit ~796 packages and 1,092 versions in 72 hours,
  including packages from Zapier, PostHog, Postman and ENS Domains; 25,000+ GitHub repos
  were created to exfiltrate stolen secrets; GitGuardian found 2,349 distinct secrets and
  ~90% of exposed GitHub tokens were still valid days later. A single package
  (`@postman/tunnel-agent`) was present in **27%** of cloud/code environments scanned.
- Why it spreads so well: the ecosystem's install-time execution model plus grotesque transitive
  fan-out. **[measured]** In this sandbox, a package-lock for a *single package* resolves
  to: a meta-framework's runtime → 54 packages, a component-based UI stack → 43, a
  full-stack SSR kit → 71, a content-site generator → 282. A realistic small app (UI
  library, router, HTTP client, schema validator, CSS engine, unit tests, a component test
  harness, types, dev server) → **133 packages, 132 MB of `node_modules`** for a todo-scale
  application.

**Root cause.** Installing dependencies runs arbitrary code from strangers, and the only
defenses offered are advisory ("audit", "use a cooldown", "commit the lockfile"). None of
them are default, none are enforceable, and all of them require the developer to become a
supply-chain analyst.

**Verdict: structural, worsening fast, but crowded.** Commercial supply-chain security
vendors, automated dependency-update bots, package provenance and lockfile-based scanners all
live here, and the well-funded ones have the registry data advantage. A new OSS project should *consume* these signals, not compete
with them. **This is a feature, not the wedge.**

---

## 4. The contract between client and server still drifts silently

Ask a hundred full-stack teams what breaks in production and you'll hear a small set of
shapes: a field renamed on the server that the client still reads as `undefined`; a field
that became nullable; a number that became a string; an enum gaining a value; a paginated
array wrapped in an object. Each one type-checks fine on both sides, and blows up at
runtime in the UI.

The tooling answer has existed for years — end-to-end inferred types inside a TypeScript
monorepo, generated clients from an OpenAPI document when the backend is another language,
shared schema validation, generated types straight from the database — and every one of them
requires **someone to choose an architecture and
keep a codegen step honest**. one such library (~2M weekly downloads) solved it *for one shape of
team*, and explicitly does not work for non-TS clients, public APIs, or independent deploy
cadences.

**Root cause.** The contract is not an artifact; it's a convention. Nothing in CI says
"these two sides disagree." And the moment a second consumer exists (mobile app, partner,
AI agent), the convention breaks.

**Verdict: universal, structural-ish, but the market is fragmented by language and already
has good answers per-language.** Hard to make a *movement* out of; easy to make a feature.

---

## 5. The developer's cognitive load is the actual scarce resource

This is the pain point that people under-rate because it doesn't produce a stack trace.

**State of JavaScript 2025** (11,952 respondents answered the framework happiness question;
3,748+ wrote free-text pain points). Front-end framework happiness sits at **3.7/5** —
remarkably stable, and remarkably mediocre. The free-text pain point ranking:

| Rank | Topic | Mentions |
|---|---|---|
| 1 | Cognitive overload | 1,066 |
| 2 | Ecosystem issues | 759 |
| 3 | Breaking changes | 274 |
| 4 | Education | 241 |
| 5 | Performance | 235 |
| 6 | State management | 215 |
| 7 | Bloat | 173 |
| 8 | Tooling | 159 |
| 9 | Fragmentation | 134 |
| 10 | Dependencies | 133 |

Note what's at the top: not "the dominant UI library is bad" — *cognitive overload* and *ecosystem issues*.
The average respondent has used **2.6 front-end frameworks over their whole career**, which
kills the "devs are hype-chasers" story and supports the real one: **developers want
stability and are exhausted by the cost of just staying current.** Building a serious
2026 app means choosing and wiring a bundler, a TS config, a linter, a formatter, hooks, a
test runner, an e2e runner, a CI pipeline, a router, a data-fetching strategy, a form
library, a validation library, a state solution, and a styling system — and then
re-verifying all of it annually.

**Root cause.** Every tool owns one stage of the pipeline, and the *seams* between stages
are the developer's problem. Nobody owns the promise "this website is correct, fast, and
accessible" — they own "this build produced output."

**Verdict: universal, structural, and mostly *unserved* — because the industry keeps
answering it with frameworks, which adds to the load rather than removing it.** This is the
most important strategic insight in this document, and it argues *against* building a
framework.

---

## 6. AI agents can now write code faster than anyone can verify it

The 2026 consensus reports converge on the same finding: the bottleneck moved.

- JetBrains study (600+ developers): **"lack of context" and "limited understanding of
  complex code"** were the top failure points for AI tooling — above hallucinations.
- Moderne webinar poll: 41% of respondents named context as the root problem (21% "agents
  struggle with our large, complex codebase due to lack of context" + 21% "agents produce
  code that looks correct but doesn't fit our architecture").
- Undo/Coleman Parkes survey of 300 senior engineering leaders: **35% of AI-generated code
  reaches production before the team fully understands it**; 80% say agents struggle on
  difficult problems in complex codebases; **79% say the release cycle is no faster than
  before** because effort shifted into debugging and unpicking.

**Root cause.** Agents are excellent at *producing* code and poor at *proving properties of
the result*. Humans, meanwhile, have lost the reading habit that used to catch the
difference. Documentation doesn't fix this (docs go stale, and agents now consume them).
Architecture diagrams don't fix this. What fixes it is **executable assertions that fail
loudly** — the one artifact that an agent, a reviewer, and CI all read the same way.

**Verdict: the newest and most underserved pain point, and the one that creates a durable
moat.** If we make the *verification artifact* machine-readable and cheap, we become the
guardrail that agentic development needs. Anyone can generate a page; almost nobody can
prove it's accessible, fast, and safe.

---

## 7. The web's newest visitors are machines, and the web is invisible to them

A fast-emerging pain point with no incumbent:

- Only **~8.7% of the top 1,000 websites** publish an `llms.txt` (other scans put the whole
  web at ~5–15%), and the largest search vendor's May 2026 AI-optimization guide explicitly lists it among
  tactics to ignore for AI search. one major browser's Lighthouse added an experimental *agentic
  browsing* audit in 13.3.0 that checks for it anyway.
- **WebMCP** (W3C Web Machine Learning CG draft, authored by browser vendors) is the capability
  layer: `navigator.modelContext.registerTool({name, description, inputSchema, execute})`
  lets a site expose real actions to browser agents instead of making them guess at divs.
  It is in a browser origin trial, with native support in a second browser engine; the spec churned
  as recently as March 2026 (the `provideContext`/`clearContext` API was removed in favor of
  `registerTool`/`unregisterTool`).
- The underlying requirement is unglamorous and mostly ignored: **a clean accessibility
  tree and semantic HTML are what agents read.** Screen readers and AI agents consume the
  same structure. Pages built out of unlabeled divs are invisible to both.

**Root cause.** The web has one semantic layer (HTML/ARIA) serving three audiences —
humans, assistive tech, and now agents — and almost no project tests the machine view.

**Verdict: emerging, cheap to serve, and a fantastic narrative on-ramp**, because it lets us
say something concrete and true: *fixing accessibility also makes your site work for AI
agents.* That's the sentence that gets a project shared.

---

## 8. Agent-to-tool plumbing is the newest artifact class, and it has zero verification

The protocol that connects agents to tools has moved from novelty to infrastructure in under
two years, and its consensus revision is now **2026-07-28**: a stateless core (no handshake, no
sessions), `server/discover`, header-based routing (`Mcp-Method`/`Mcp-Name`), cacheable list
results, and a single `subscriptions/listen` stream. Roots, Sampling and Logging are deprecated;
tasks moved to an extension. Revisions land roughly quarterly.

What the research says about its trust model is the important part:

- **Tool poisoning** — instructions hidden in tool descriptions, which the model reads and the
  user never sees. Public research puts MCP-specific attack vectors in roughly **5.5% of
  surveyed servers**, with a further **7.2%** carrying general security vulnerabilities.
- **Rug pulls** — approve a benign definition, receive a malicious one later. The specification
  provides **no re-approval trigger, no version pinning and no content hash for tool
  definitions**; `notifications/tools/list_changed` exists, but nothing obliges a client to
  re-review.
- **Cross-server tool shadowing** — one malicious server redefines the meaning of a trusted
  one's tools.
- The general rule from security research: **no field a server controls is safe** — names,
  descriptions, schemas, results, error strings are all injection channels.
- A full CVE trail in a single year, including a CVSS 9.6 remote code execution in a
  widely-used client bridge.

**Root cause.** MCP artifacts are the newest class of web artifact with *no proof attached*.
There is a lockfile format for code dependencies and nothing equivalent for the definitions an
agent is told to trust. Definitions are approved once and then drift silently, and a
defensive-minded team has nowhere to record "this is the definition I reviewed."

There is also a measurable cost to sprawl: published research shows agent accuracy dropping
from **87% to 54%** as context fills with tool definitions.

**Verdict: structural, brand-new, and unserved — the strongest addition since the original
research.** It is the same defect as everything else in this document, on a surface that did
not exist three years ago, with no incumbent. This is why MCP is treated as load-bearing in
[VISION.md](VISION.md) and specified in [MCP.md](MCP.md).

---

## What this research says NOT to build

Being explicit about anti-goals is how the plan stays credible.

| Tempting idea | Why not |
|---|---|
| **Another framework / meta-framework** | The pain point ranking (#1 cognitive overload, #2 ecosystem issues) is an argument *against* adding a new mental model. Also: the graveyard is full — the Rails-inspired full-stack kit of 2020 pivoted away from its meta-framework fork and went quiet, a GraphQL-first full-stack kit is in maintenance mode, and the leading router-first framework was absorbed into a plain routing library. A framework must win the framework war. |
| **Another bundler** | Rolldown and Rspack are consolidating this space with VC-scale engineering teams. Zero chance of winning, and it's not where the pain is. |
| **Another component library** | Infinite competition, no moat, no structural pain. |
| **Another dependency scanner** | Commercial supply-chain vendors and update bots own it. Consume them. |
| **Another MCP gateway/proxy** | Crowded and commoditized. We do not route traffic; we *verify definitions* — the gap the spec itself leaves open. |
| **A hosted platform / CMS** | Not open source, and adds the thing developers fear most: lock-in (it appears in the pain-point list explicitly). |
| **An AI site builder** | Saturated, value accrues to the model vendors, and it *increases* the verification problem we're solving. |

The pattern in every rejection: they all require the developer to **replace** something and
**trust** something new. The winning shape requires them to **add one command**.

---

## The structural gap, stated once

> Every stage of web development has a world-class tool.
> The **outcome** — "this site is accessible, fast, safe, and usable by humans and agents" —
> has no owner, no single number, and no CI gate that anyone can install in five minutes.
> And the newest surface of all, the tool definitions an agent is told to trust, has no
> lockfile, no hash, and no drift detection anywhere in the ecosystem.

We measure after the fact, in separate tools, in separate tabs, with separate configs, and
we act on it only during audits. Meanwhile pages get heavier, accessibility gets worse, and
agents ship code faster than anyone verifies it.

The missing layer is small, boring, and standardizable: **a conformance score for a web
page, and a way to prove it in CI in under a second.**

---

## Sources

- WebAIM, *The WebAIM Million 2026* (Feb 2026 scan, published 2026) — https://webaim.org/projects/million/
- HTTP Archive, *Web Almanac 2025 — Page Weight* (data July 2025, published Jan 2026) — https://almanac.httparchive.org/en/2025/page-weight
- HTTP Archive, *Web Almanac 2025 — Performance* — https://almanac.httparchive.org/en/2025/performance
- Devographics, *State of JavaScript 2025 — Front-end Frameworks* (pain points, happiness, cardinality) — https://2025.stateofjs.com/en-US/libraries/front-end-frameworks/
- Devographics, *State of JavaScript 2024/2025 — Build Tools, Testing, Meta-Frameworks* — https://2024.stateofjs.com/en-US/libraries/build_tools/
- Sonatype, *2026 State of the Software Supply Chain* (454,600+ malicious packages in 2025) — as reported 2026
- Wiz Research, *Shai-Hulud 2.0: 25K+ repos exposing secrets* (Nov 2025) — https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack
- Deque, *Automated Accessibility Coverage Report* (2021, 2,000+ audits / 13,000+ pages / ~300k issues); W3C ACT rules coverage (17/55 criteria); UK GDS 13-checker study
- European Accessibility Act enforcement reporting (Deque, UsableNet, Härting) — enforcement from 28 June 2025
- InfoQ, *Survey finds AI-generated code increases debugging and failure rates* (Coleman Parkes / Undo, 300 leaders) — Oct 2026
- Moderne, *Context engineering: why AI coding agents spend most of their tokens reading* (webinar poll, 2026)
- JetBrains developer survey on AI tooling failure modes (600+ developers, 2026)
- W3C Web Machine Learning CG, *WebMCP* draft; browser origin trial; `navigator.modelContext` API reference (2026)
- MCP specification revision **2026-07-28** and its changelog (stateless core, `server/discover`, header routing, cacheable lists, `subscriptions/listen`, deprecations) — modelcontextprotocol.io/specification/2026-07-28/
- MCP security research, 2026: tool-poisoning prevalence (7.2% general / 5.5% MCP-specific vectors in surveyed servers), rug-pull and shadowing analyses, the STDIO command-injection disclosure, and the CVE trail (including CVSS 9.6); Cloud Security Alliance research note; OWASP agentic risk mapping (ASI01)
- MCP context-overload measurement (agent accuracy 87% → 54% as tool definitions fill context)
- llms.txt adoption scans (Rankability top-1,000: 8.7%; ~10% of 300k domains) and the largest search vendor's AI-optimization guidance (May 2026)
- **[measured]** Sandbox measurements, 2026-11-06: dependency graphs from package-lock analysis (meta-framework runtime 54, UI stack 43, SSR kit 71, site generator 282, realistic app 133 packages / 132 MB); jsdom + axe-core audit of a 6-error fixture in 331 ms with no browser, catching 4 of the 6 top WebAIM error types (contrast returned as `incomplete` without canvas).
