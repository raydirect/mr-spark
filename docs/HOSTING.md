# Publishing `schema/` — and what a laptop can prove

`$schema` is a required `const` in all three formats, so `https://web-spark.dev/schema/scene-0.1.json`
is not a comment about where the schemas live. It is part of what a valid document *is*: every document
ever written will carry that string, and `npm run formats:check` pins the bytes it points at. Which
means the address has two properties we do not currently have — it must **answer**, and it must keep
answering **the same bytes** for as long as documents in the wild name it.

This document is about the first property, tested on one machine, with the second one written down so
nobody mistakes the former for the latter. The tool is `src/publish.js`; the npm scripts are
`schema:serve`, `schema:verify`, and `node src/publish.js urls`.

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
// .vscode/settings.json in a project that holds web-spark documents
{
  "json.schemas": [
    { "fileMatch": ["*.spark.scene.json"], "url": "./node_modules/webspark/schema/scene-0.1.json" },
    { "fileMatch": ["*.spark.motion.json"], "url": "./node_modules/webspark/schema/motion-0.1.json" },
    { "fileMatch": ["*.spark.settings.json"], "url": "./node_modules/webspark/schema/settings-0.1.json" }
  ]
}
```

Offline, instant, and version-locked to the install — which is *better* than the URL for local work, and
the reason the URL is for people who did not install us rather than instead of it.

## 3. Test the real address on one machine

The address is `https://`, so plain HTTP on a port proves routing and not the promise. To have your own
machine answer the actual URL:

```powershell
# 1. Resolve the name to this machine. Needs an elevated editor; the hosts file is owned by SYSTEM.
#    C:\Windows\System32\drivers\etc\hosts
127.0.0.1   web-spark.dev

# 2. A certificate your OS will trust. `mkcert -install` writes a local root CA into the
#    trust stores — that is the step that makes the browser and the editor stop objecting.
choco install mkcert
mkcert -install
mkcert web-spark.dev

# 3. Serve over TLS. Port 443 needs an elevated shell on Windows (or `sudo` on macOS/Linux).
node src/publish.js serve --cert web-spark.dev.pem --key web-spark.dev-key.pem

# 4. Verify, telling Node where the CA lives — do NOT disable certificate checking to make this pass.
$env:NODE_EXTRA_CA_CERTS = "$(mkcert -CAROOT)\rootCA.pem"
node src/publish.js verify --base https://web-spark.dev
```

`NODE_EXTRA_CA_CERTS` is the whole trick, and it matters: a verification step that runs with
`NODE_TLS_REJECT_UNAUTHORIZED=0` would pass against a man-in-the-middle as happily as against your own
laptop, which is the same reasoning that makes us refuse `--no-verify` patterns elsewhere.

**Two costs, both worth knowing before you get used to the setup.** While that hosts line exists, *this
machine* cannot reach a real `web-spark.dev` — there is no other one today, but there will be, and the
entry is easy to forget. And every other device on the network still resolves the name publicly, so a
colleague's editor gets nothing: that is the boundary, not a bug to fix with `netsh`.

## 4. From another device, if you only need it reachable

```powershell
netsh advfirewall firewall add rule name="web-spark schema" dir=in action=allow protocol=TCP localport=8788
```

Then `curl http://192.168.1.20:8788/schema/scene-0.1.json` from anything on the Wi-Fi. Use this to check
the bytes and the headers; do not use it to claim the format's address works, because no document can
name that URL — it is a `const`, and the const says `https://web-spark.dev/…`.

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
4. **A nightly job runs `schema:verify --base https://web-spark.dev` against the live host**, and its
   failure is a release blocker. Deliberately not per-PR: `check.yml` answers requests to nobody, and a
   CI that depends on the network is a CI that fails on the network.
5. **Moving the host is a format amendment,** not an ops task. `SCHEMA_HOST` appears in each schema's
   `$id`, in every `$ref` between them, and in the required `$schema` const of every document. If the
   domain has to change, it changes in `src/formats/common.js` + `generate.js`, `formats:generate`
   rewrites `schema/`, and the corpus of existing documents is migrated — which is exactly the kind of
   cost that should be paid once, before the first stranger writes a document, not after.

## 6. So: is a laptop enough?

For Phase 1's exit criterion, yes — the open row in `PHASE-PLAN §9` is "there is no address at all", and
one that answers, on a machine you control, with a check that fails on drift, is a different state of
affairs from a name in a string. What a laptop cannot be is the answer anyone else relies on: it is not
reachable, not durable, and not neutral territory between two people debugging a document.

Which is the argument for the cheap half now (this server, this document, this check) and the expensive
half as a five-minute decision rather than a project: **who owns `web-spark.dev`, and is it registered?**
Until it is, step 3 above is theatre for an audience of one, and the honest label on this whole file is
"how to test the address", not "how to host the schemas".
