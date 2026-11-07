# Publishing `schema/` — and what a laptop can prove

`$schema` is a required `const` in all three formats, so
`https://mr-spark.pages.dev/schema/scene-0.1.json` is not a comment about where the schemas live. It is
part of what a valid document *is*: every document ever written will carry that string, and
`npm run formats:check` pins the bytes it points at. Which means the address has two properties — it must
**answer**, and it must keep answering **the same bytes and the same headers** for as long as documents in
the wild name it. The host is a free Cloudflare Pages project, chosen in
[ADR 0004](adr/0004-one-name-one-host.md): it answers today, and nobody has to buy anything to test it.

This document is about testing that promise, on one machine or against the deployment, with the permanent
rules written down so nobody mistakes the former for the latter. The tool is `src/publish.js`; the npm
scripts are `schema:serve`, `schema:verify`, `schema:bundle`, and `node src/publish.js urls`.

## What this proves, and what it does not

| Proves | Does not prove |
|---|---|
| Every published URL resolves, with the right media type and cache policy | That anyone off your network can fetch it — a laptop on a LAN is not a host |
| The bytes served equal the bytes `npm run formats:generate` produced, in this build | That a *stale* deployment still matches; that is the nightly job in §5 |
| No `$ref` in any schema points at a URL this publisher does not serve | That a document you email to someone validates for them; their editor will resolve the real domain |
| A schema that disagrees with its generator refuses to be published | Nothing about the permanence promise in §5 — a laptop can be turned off |

The line worth keeping: **an address in a format is a promise to strangers.** Everything below is about
testing the promise honestly, which includes saying where the test stops.

## 1. Serve it

```powershell
npm ci
npm run schema:serve
```

```
  serving 6 generated files · schema format 0.1 · http (no --cert: routing only, not the const URL)
  http://127.0.0.1:8788/schema/
  http://192.168.1.20:8788/schema/
  check it: node src/publish.js verify --base http://127.0.0.1:8788
```

It binds `0.0.0.0` and prints the LAN addresses too, because "reachable from the phone on the same
Wi-Fi" is a real thing to want and guessing the IP is how people give up. Then:

```powershell
npm run schema:verify -- --base http://127.0.0.1:8788
#   ✓ 6 files at http://127.0.0.1:8788 are byte-identical to schema/ in this checkout
```

**The server refuses to start on a stale `schema/`.** Not a warning — a refusal with the command that
fixes it, because the failure mode this project exists to prevent is a published artifact that disagrees
with the thing that generates it. (`--allow-drift` exists for the minutes when you are mid-edit and know
exactly what you are doing.)

## 2. If what you actually want is editor validation, do not use the server

Almost every "is the URL working?" question is really "why isn't VS Code telling me my document is
wrong?" — and the answer that costs nothing is the copy inside the package, which is why `package.json`
exports `./schema/*` in the first place:

```json
// .vscode/settings.json in a project that holds MR-Spark documents
{
  "json.schemas": [
    { "fileMatch": ["*.spark.scene.json"], "url": "../<checkout>/schema/scene-0.1.json" },
    { "fileMatch": ["*.spark.motion.json"], "url": "../<checkout>/schema/motion-0.1.json" },
    { "fileMatch": ["*.spark.settings.json"], "url": "../<checkout>/schema/settings-0.1.json" }
  ]
}
```

The package is `mr-spark` now, and it is not on npm yet — publishing needs the maintainer's account and
a version to publish (the name it had before, `webspark`, has belonged to an unrelated blog engine since
2019, which is why the checkout is the only honest path today). Once it is published, this becomes
`"./node_modules/mr-spark/schema/scene-0.1.json"` and the sentence above stops applying.

Offline, instant, and version-locked to the copy you have — which is *better* than the URL for local work,
and the reason the URL is for people who did not install us rather than instead of it.

## 3. Test the address over TLS

The const is an `https://` URL, so plain HTTP on a port proves routing and not the promise. Two ways to
get an HTTPS answer, in the order you should reach for them.

**Ask the deployment.** `npm run schema:bundle` writes `dist/` — the committed `schema/` bytes, the index
page, and a `_headers` file with the media types and cache policy — and CI pushes it to Cloudflare Pages
(`.github/workflows/pages.yml`), which has a real certificate on `https://mr-spark.pages.dev`. Verifying
against that is the whole point of the deploy:

```powershell
npm run schema:verify -- --base https://mr-spark.pages.dev
```

`verify` compares bytes *and* headers. It fails on `application/json` where an editor probes for
`application/schema+json`, on a versioned file without `immutable`, and on a missing
`access-control-allow-origin`, because each of those is a schema that looks perfect in the repository and
does nothing in a stranger's editor.

**Or pretend, on a name that is not the real one.** For practising, or before the first deploy:

```powershell
# 1. Resolve a local-only name. Needs an elevated editor; the hosts file is owned by SYSTEM.
#    C:\Windows\System32\drivers\etc\hosts
127.0.0.1   mr-spark.test

# 2. A certificate your OS will trust. `mkcert -install` writes a local root CA into the trust stores,
#    which is the step that makes the browser and the editor stop objecting.
choco install mkcert
mkcert -install
mkcert mr-spark.test

# 3. Serve over TLS. Port 443 needs an elevated shell on Windows (or `sudo` on macOS/Linux).
node src/publish.js serve --cert mr-spark.test.pem --key mr-spark.test-key.pem

# 4. Verify, telling Node where the CA lives — never disable certificate checking to make this pass.
$env:NODE_EXTRA_CA_CERTS = "$(mkcert -CAROOT)\rootCA.pem"
node src/publish.js verify --base https://mr-spark.test
```

`NODE_EXTRA_CA_CERTS` is the trick, and it matters: a verification step running with
`NODE_TLS_REJECT_UNAUTHORIZED=0` passes against a man-in-the-middle as happily as against your own
laptop, which is the same reasoning behind refusing `--no-verify` patterns elsewhere.

**Do not put `mr-spark.pages.dev` in the hosts file.** Pointing the real address at `127.0.0.1` was
harmless while nothing lived at it; after the first deploy it means this machine silently grades its own
cache instead of the published one, and the entry is easy to forget. Use `.test`.

## 4. From another device, if you only need it reachable

```powershell
netsh advfirewall firewall add rule name="MR-Spark schema" dir=in action=allow protocol=TCP localport=8788
```

Then `curl http://192.168.1.20:8788/schema/scene-0.1.json` from anything on the Wi-Fi. Use this to check
the bytes and the headers; do not use it to claim the format's address works, because no document can
name that URL — it is a `const`, and the const says `https://mr-spark.pages.dev/schema/…`.

## 5. The rules the permanent host has to satisfy

Decided now, so whoever sets it up (or buys the domain) is not inventing policy under time pressure:

1. **A versioned file name is immutable, forever.** `scene-0.1.json` must never be overwritten and never
   deleted, because a document written in 2027 will name it. That is why `cache-control` on those files is
   `public, max-age=31536000, immutable` and why the file name carries the version instead of a `latest`.
   Fixing a mistake in a published minor is an amendment — a new file, not an edit.
2. **`index.json` is the only mutable path**, served `no-store`. It is the catalogue of what versions
   exist; a client that wants "current" asks that, and nothing versioned changes meaning.
3. **The media types are part of the interface**: `application/schema+json` for schemas (that is what a
   JSON-Schema-aware editor probes for), `application/json` for the catalogue, `text/plain` for
   `types-0.1.d.ts`, and `access-control-allow-origin: *`, without which an editor validating a document
   on `file:///` fails in a way that looks like a broken schema.
4. **A nightly job runs `schema:verify --base https://mr-spark.pages.dev` against the live host**, and
   its failure is a release blocker. That is the `watch` job in `.github/workflows/pages.yml`.
   Deliberately not per-PR: `check.yml` answers requests to nobody, and a CI that depends on the network
   is a CI that fails on the network. It checks headers as well as bytes, because on a static host the
   headers are the only place the media-type contract lives.
5. **Moving the host is a format amendment,** not an ops task. `SCHEMA_HOST` appears in each schema's
   `$id`, in every `$ref` between them, and in the required `$schema` const of every document. If the
   domain has to change, it changes in `src/formats/common.js`, `formats:generate` rewrites `schema/`, and
   every document that names the old address is rewritten with it. This has been done once, on 2026-11-07,
   and the bill was: one line of code, six regenerated artifacts, six authored documents
   (`src/config/tokens.json` and the five fixtures), and eleven prose mentions across seven files. That is
   what "pay it before the first stranger writes a document" buys — the same work, with no migration
   guide, because there is nobody to migrate.

**What the first enforcement run taught, 2026-11-07.** The host is live, and Pages honoured every rule
above — `verify` at `https://mr-spark.pages.dev/schema/` answers with the generated bytes and the media
types, cache policy and CORS header as written. What broke was the checking, in three ways worth recording
because none of them is a defect in the contract:

- The alias of a Pages project that has never been deployed takes *minutes* to route, and the step that
  verified a fresh deployment retried for 60 seconds. A deployment that was correct in every byte went red.
  The workflow now waits for a 200 on a published path before it reads a single header, and prints each
  attempt's HTTP status: a check of something just created has to budget for the creating, or its first
  green run is a coin flip.
- Verifying "the deployment URL" is not verifying the promise. A production deploy prints a per-deployment
  address and the alias, and taking whichever appeared first means possibly checking an expiring preview of
  the right bytes. The address inside a document is the alias, so the alias is what gets checked.
- `watch` and `deploy` had no order between them, so a manual run checked the address while the job that
  creates it was still running. `watch` now depends on `deploy`.

Rules 1 to 3 are about bytes and headers. These three are about time, which is the part of §5.4 that
nobody had exercised — a nightly check is only trustworthy if it can tell "not yet" from "not ever", and
on the first day it could not.

## 6. So: is a laptop enough?

For Phase 1's exit criterion, yes — the open row in `PHASE-PLAN §9` is "there is no address at all", and
one that answers, on a machine you control, with a check that fails on drift, is a different state of
affairs from a name in a string. What a laptop cannot be is the answer anyone else relies on: it is not
reachable, not durable, and not neutral territory between two people debugging a document.

Which is the argument for the cheap half now: a host that answers, on infrastructure nobody has to keep
alive, checked by a command that fails on drift. `https://mr-spark.pages.dev` is that host, and the
deploy is a workflow rather than a project. What is *not* settled is permanence: a free `pages.dev`
subdomain belongs to a Cloudflare project name, which can be renamed, deleted, or lost to a ToS change.
So the honest label on this file is "how to publish the schemas to a host we are renting for free", and
the remaining decision is the one that makes §5.1 true for a decade: buy a domain, then move the const
once, deliberately, as an amendment.
