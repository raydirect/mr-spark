# MCP Is a Load-Bearing Wall

MCP (the Model Context Protocol) is not a feature of MR-Spark. It is the layer the whole
architecture is threaded through, in **four distinct directions**. This document specifies
each one, because conflating them is the mistake most projects will make.

| Direction | What it means | Where it lives |
|---|---|---|
| **1. Spark *as* an MCP server** | Our whole product surface is machine-callable | every pillar |
| **2. MCP *as* a verified surface** | We audit MCP servers the way we audit pages | SAFE pillar, new rule family |
| **3. One declaration → three machine faces** | An app declares capabilities once; we emit browser-side tools, an MCP server, and a content index — and prove they agree | MANIFEST pillar |
| **4. MCP *as* the federation layer** | Agents drive verify → manifest → author → animate → render through one protocol | cross-pillar |

Plus a fifth, cultural rule: **Spark must pass its own MCP conformance rules.** Dogfooding is
the demonstration.

---

## 0. Ground truth about the protocol (as of 2026-11-06)

Facts that constrain the design, because they are recent and sharp:

- Current revision is **2026-07-28** — the largest change since launch. The core is now
  **stateless**: no `initialize` handshake, no protocol-level sessions, no `Mcp-Session-Id`.
  Every request carries protocol version and client capabilities in `_meta`. Servers that need
  cross-call state must **mint explicit handles** and pass them as ordinary tool arguments.
- Servers expose a **`server/discover`** method; requests carry **`Mcp-Method` / `Mcp-Name`
  headers** so gateways can route and meter without parsing bodies.
- List results are **cacheable** (`ttlMs`, `cacheScope`), and servers **SHOULD** return tools in
  **deterministic order** to maximize prompt-cache hits.
- Long-lived change notifications moved to a single `subscriptions/listen` stream. Server-initiated
  requests (old sampling/elicitation) became **Multi Round-Trip Requests**. `Roots`, `Sampling`
  and `Logging` are **deprecated**. Tasks moved into the `io.modelcontextprotocol/tasks` extension.
- Governance: the protocol is stewarded by a foundation under the Linux Foundation and its
  revisions land roughly **quarterly**. Any tool built on it must be *revision-aware*, not
  version-pinned to one shape.
- Security reality: a year of public research establishes **tool poisoning** (hidden
  instructions in descriptions the model reads and the user never sees), **rug pulls**
  (approve a benign definition on Monday, receive a malicious one on Thursday), **cross-server
  tool shadowing**, and the general rule that **no field a server controls is safe** — names,
  descriptions, schemas, results, error strings.
- The specification provides **no re-approval trigger, no version pinning, and no content hash
  for tool definitions.** `notifications/tools/list_changed` exists, but nothing obliges a
  client to re-review.
- Tool sprawl has a measurable cost: published research shows agent accuracy dropping from
  **87% to 54%** as context fills with tool definitions.

That last bullet pair is the whole opportunity. **MCP artifacts are the newest class of web
artifact with no proof attached to them** — which is exactly the defect MR-Spark exists to fix.

---

## 1. Spark as an MCP server

`spark mcp serve` exposes the product as a protocol-native server, using the stateless
2026-07-28 shape.

### Tools (deterministic, no model inside)

| Tool | Arguments | Returns | Notes |
|---|---|---|---|
| `audit` | `target`, `runners[]`, `budget?` | `{ irRef, score, findings[] }` | `target` = URL, path, or IR ref. The core operation. |
| `explain` | `ruleId` or `findingRef` | `{ why, evidence, fixGuidance, specRef }` | Makes every finding self-teaching. |
| `fix` | `findingRef`, `scope` | `{ patch, applied: false }` | **Safe codemods only.** Returns a diff; never silently writes. |
| `verify_tools` | `server`, or `configPath` | `{ conformance, findings[] }` | Direction 2 — the MCP audit. |
| `emit_faces` | `irRef` | `{ mcp, browser, index }` | Direction 3 — all three machine faces from one IR. |
| `baseline` | `action: read\|write`, `irRef?` | `{ baseline, delta }` | Regression semantics as a tool. |

### Resources

`spark://ir/{sha256}` · `spark://rule/{id}` · `spark://score/spec/{version}` ·
`spark://baseline/{repo}` · `spark://conformance/mcp`

**Statelessness note (important, and idiomatic):** we do not keep server-side sessions. The
**IR content hash is the handle**. `audit` returns `irRef`, every later tool takes `irRef`, and
because the ref is a content hash it is verifiable, cacheable, and impossible to forge
silently. This is precisely the "mint explicit handles" pattern the spec recommends, and it
means Spark farms out to N replicas behind a round-robin load balancer with no session store.

### Prompts (user-invoked)

`review-accessibility` · `harden-mcp-server` · `fix-finding` · `plan-migration`

### Server behavior we commit to

- **Deterministic tool ordering** and **honest TTLs**: rule docs and the score spec get long
  `ttlMs`; `audit` results get a short one; `baseline` gets `cacheScope: private`.
- **Read-only by default.** `fix` requires an explicit opt-in flag, because a tool that can
  write on behalf of an agent is a liability by default.
- **No network egress** except the target being audited, and that host must be allowlisted in
  config for CI use.
- **Every tool result is structured** and carries `irRef` + `findings[].ruleId` so an agent can
  chain `audit → explain → fix` without re-deriving context. This is the "agents lack context"
  problem answered with an artifact instead of a longer prompt.
- **Self-conformance:** Spark's own server runs `spark verify_tools` against itself in CI. If it
  fails its own rule set, the build is red.

---

## 2. MCP as a verified surface (the new rule family)

This is the sharpest strategic addition in this revision. Direction 2 turns our SAFE pillar
from "dependency hygiene" into **"the conformance layer for agent-facing surfaces"** — a
category with no incumbent and a clear, urgent need.

### `spark verify_tools` — rule family `MCP*`

| Rule | What it asserts | Why it matters |
|---|---|---|
| **MCP001 discovery** | `server/discover` present and well-formed; `protocolVersion` declared | Without it a client cannot know what it is talking to |
| **MCP002 description hygiene** | descriptions free of imperative hijack patterns, hidden/zero-width unicode, and over-long embeddings of instructions | Tool poisoning is the signature attack; the description layer is where it lives |
| **MCP003 definition attestation** | every tool definition has a SHA-256 recorded in `.spark-tools.lock` and matches on re-check | The spec's missing control: **content hash + re-approval = rug-pull detection** |
| **MCP004 schema quality** | typed params, `required` declared, enums bounded, no `any`, parameter descriptions present | A vague schema is where an agent hallucinates arguments |
| **MCP005 context budget** | total token cost of the tool list, flagging sprawl against a configurable ceiling | Accuracy degrades measurably with tool-definition bloat |
| **MCP006 capability honesty** | destructive vs read-only annotated per tool; no wildcard scopes; side effects documented | An agent cannot ask permission it does not know it needs |
| **MCP007 shadowing** | across a client's configured server set, detect name collisions and definitions that redefine another server's tools | One malicious server can poison the meaning of a trusted one |
| **MCP008 output trust** | results/error strings that echo untrusted input are flagged as injection surface | No field a server controls is safe |
| **MCP009 face agreement** | browser-declared tools ≡ MCP tools ≡ content index (Direction 3) | Three surfaces drifting is the new contract drift |
| **MCP010 auth posture** | audience-bound tokens, declared scopes, no token passthrough hints | Confused-deputy and passthrough attacks are the documented failure mode |

### `.spark-tools.lock` — the artifact nobody has

```json
{
  "version": 1,
  "generated": "2026-11-06T14:40:00Z",
  "servers": {
    "acme-storefront": {
      "protocol": "2026-07-28",
      "tools": {
        "searchProducts": { "sha256": "…", "readOnly": true },
        "addToCart":      { "sha256": "…", "readOnly": false }
      }
    }
  }
}
```

`spark tools lock` writes it; `spark tools verify` fails CI on any drift. This is a *small,
boring artifact* — which is exactly why it can become standard. It is the lockfile idea applied
to the one class of dependency that currently has no lockfile at all: **the definitions an agent
is told to trust.**

---

## 3. One declaration, three machine faces

The MANIFEST pillar's real job, and the most novel thing in the plan:

```
              ┌─────────────────────────────┐
   app source │  declared capabilities       │  (typed, in the IR)
              └──────────────┬──────────────┘
                             │  one lowering
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  browser-side tool     MCP server          content index
  registration          definition          (+ structured data)
  (in-page, for          (for coding/        (for retrieval/
   browser agents)        desktop agents)     discovery)
        └────────────────────┼────────────────────┘
                             ▼
                  MCP009: prove all three agree
```

Today a team that wants to be legible to agents must hand-write three separate, drifting
artifacts. We generate all three from the same declaration and then **fail the build if they
disagree**. Nobody does this, and it falls out of the IR almost for free.

---

## 4. MCP as the federation layer

The five pillars are not just CLI commands; they are **tool families on one server**, so an
agent can drive the entire lifecycle:

```
verify   → audit, explain, baseline
manifest → verify_tools, emit_faces
author   → (phase 3) generate_from_document, apply_fix
animate  → (phase 4) validate_motion
render   → (phase 5) render_scene
```

Consequence for the roadmap: **the MCP surface ships in Phase 1, not Phase 2.** Verification is
first because it needs no adoption — but the moment it exists, it must exist as a tool, because
the users we are building for increasingly arrive as agents rather than as people typing.

---

## 5. Risks specific to being MCP-first

| Risk | Assessment | Mitigation |
|---|---|---|
| **Spec churn** — quarterly revisions, and 2026-07-28 broke sessions, sampling, roots, logging and the GET endpoint | High. A server written to one revision will look obsolete in six months | Revision-aware adapters behind one internal interface; conformance rules keyed to a declared revision; never cache assumptions about transport |
| **Guilt by association** — a year of CVEs and poisoning incidents makes "MCP" feel unsafe to some buyers | Real | Position as the *honesty layer*: we hash definitions, detect drift, and report posture. Our own server is minimal, deterministic, read-only by default |
| **Our server becomes an attack surface** | Real — we would be shipping exactly the class of thing we audit | No write tools without explicit opt-in; allowlisted egress; no secrets in tool arguments; self-conformance in CI |
| **Ecosystem immaturity** — many servers expose full tool listings unauthenticated | Helps us; it is the finding, not the bug | Report it as `MCP010`, with remediation guidance |
| **Deprecated feature adjacency** (roots/sampling/logging) | Medium | We implement none of them; we *flag* servers still relying on them |

---

## 6. What this changes in the plan

1. IR v0 gains a **`tools` section** with `faces`, per-tool `sha256`, `readOnly`, and schema —
   alongside `motion`, `data`, `document`, `tokens`, `findings`.
2. The **SAFE** score gains a **`mcp` sub-dimension** (the `MCP*` rules), reported separately
   from dependency advisories.
3. **MANIFEST** is renamed in spirit: it is not "emit an llms.txt", it is "emit all three
   machine faces and prove they agree".
4. **Phase 1** grows one deliverable: `spark mcp serve` + `.spark-tools.lock`.
5. **Phase 2** becomes MCP conformance: `verify_tools`, `emit_faces`, and the `MCP*` rule
   family with published rationale for each rule.
6. A new standing commitment: **Spark passes its own MCP rules in CI, permanently.**

---

## 7. Decisions this document needs

1. **Confirm the four directions** as the definition of "MCP-intertwined" — in particular
   Direction 2 (auditing MCP servers), which is a category we would be creating rather than
   joining.
2. **`.spark-tools.lock` as the artifact name**, and whether the lockfile should also record
   *resource* and *prompt* definitions (my recommendation: tools first, resources next, prompts
   last — tools are where the attacks land).
3. **`spark mcp serve` in Phase 1** versus Phase 2. I recommend Phase 1: it is the same audit
   behind a second interface, and it is the difference between a tool agents can use and a tool
   agents can only read about.
4. **Read-only-by-default for `fix`** — a small decision with large trust consequences. I
   recommend yes, permanently.
