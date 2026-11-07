# Running web-spark on Windows

Verified against Node 22 on Windows 11 with PowerShell. If you follow this and something fails,
that is a bug worth reporting — see the end.

## 0. The one-line version

```powershell
git clone https://github.com/raydirect/web-spark.git
cd web-spark
npm ci
node bin/spark.js check fixtures/bad.html
```

If a folder with that name already exists, `git clone` refuses to write into it. **Close VS Code
(or whatever has the folder open) before moving it** — Windows will not rename a folder that is
in use, and the error is `The process cannot access the file because it is being used by another
process`. Then, from `D:\Ray`:

```powershell
Move-Item web-spark web-spark-mine     # only if web-spark is your own folder of pages
git clone https://github.com/raydirect/web-spark.git
Move-Item .\web-spark-mine\html-bak .\web-spark\html-bak
```

Or skip all of it: clone beside the folder and pass the page path to the tool, which takes an
absolute path and does not care where it lives (see step 2).

Nothing is published to a registry yet, so there is no package to install. Git and Node are the
only prerequisites.

You should see `ACCESSIBLE 53 ✗`, then `CONFORMANCE 53 poor (1/5 pillars measured)`.

## 1. Prerequisites

| Need | Check | Notes |
|---|---|---|
| Git | `git --version` | Required: there is no published package, so a clone is the only way to get the code. |
| Node 20 or newer | `node -v` | `package.json` sets `"engines": { "node": ">=20" }`. A Node 16 install from an old project will fail on the first `import`. |
| npm (bundled with Node) | `npm -v` | Nothing else is required. No build step, no compiler, no Rust, no browser. |

### If `npm ci` fails

**`EUSAGE: can only install with an existing package-lock.json`** means npm is not inside a
checkout of this repository. Check, in this order:

```powershell
Get-Location                       # should be your clone, e.g. D:\Ray\web-spark
Test-Path .\package-lock.json      # must print True
git rev-parse --show-toplevel      # must print a path, not "fatal: not a git repository"
```

If `git rev-parse` prints **`fatal: not a git repository`**, the folder is not a clone at all —
it is just a folder. That is the most common cause, and it is easy to miss because the path
*looks* right. You may have created `D:\Ray\web-spark` yourself and put files in it. Clone into
it properly (see step 1 above), or clone elsewhere and copy your files into `html-bak\`.

If it *is* a clone but `Test-Path` still prints `False`, the clone predates the lockfile, which
was added in an early commit: `git pull`.

`npm ci` also takes **no directory argument**. `npm ci somewhere\else` does not install into that
folder; it treats the extra word as something else entirely. Change directory first.

`npm install` also works and will generate a lockfile, but prefer `npm ci`: it installs exactly
what CI installs, which is the point of testing locally.

## 2. Run it

From the repository root (PowerShell):

```powershell
# audit a file
node bin/spark.js check fixtures/bad.html

# audit your own page (absolute paths and spaces are fine)
node bin/spark.js check .\html-bak\001.html
node bin/spark.js check "D:\Ray\somewhere else\page.html"

# machine-readable
node bin/spark.js check fixtures/bad.html --format json

# one tab-separated line per finding, for scripts
node bin/spark.js check fixtures/bad.html --quiet

# fail a build when the score is too low (exit code 1)
node bin/spark.js check fixtures\bad.html --fail-under 90
Write-Host "exit code: $LASTEXITCODE"

# the shareable report
node bin/spark.js report fixtures/bad.html --out spark-report.html
Start-Process spark-report.html

# serve it instead of opening the file
node bin/spark.js report fixtures/bad.html --serve
```

The `--serve` command prints a URL of the form `http://127.0.0.1:4321/`. It is the IPv4 loopback
on purpose: on Windows, `localhost` can resolve to the IPv6 address `::1` first, and nothing is
listening there, so `http://localhost:4321` may be refused while the server is perfectly healthy.

## 3. Install it as a command (optional)

```powershell
npm link          # puts `spark` on your PATH
spark check fixtures/bad.html
spark --help
```

To undo: `npm unlink -g webspark` (or remove the shim from your npm prefix, which
`npm prefix -g` will tell you).

## 4. Test the project itself

```powershell
npm test
```

Expected: **48 tests, 48 pass**. Two things that trip people up:

- **Run it from the repository root.** The tests and CI resolve paths relative to the package
  root, so `cd test; npm test` will not work.
- **Do not hand-run `node --test test` or `node --test test\`.** On this Node version a bare
  directory argument is treated as a module path and fails with `Cannot find module`. The glob in
  `package.json` is quoted so PowerShell passes it through untouched and Node expands it itself.
  If `npm test` ever fails this way, that is a bug in our script, not in your setup.

Some tests are slow on first run on Windows (a few seconds each) because a DOM implementation is
being constructed. That is expected; there is nothing to tune.

## 5. What is likely to look wrong, and is not

| Symptom | Why |
|---|---|
| `FAST`, `SAFE`, `LEGIBLE`, `RESILIENT` all show `—` | Only the accessibility pillar is built. `—` means *not measured*, which is a gap in the tool, not a pass. This is deliberate and printed on purpose. |
| "1 undecided" on every run | Computed contrast needs a canvas, which the current runner does not have. Undecided is excluded from the score and is never a violation. The browser runner in a later phase decides it. |
| `ACCESSIBLE 53` on a page that looks fine to you | The fixture is deliberately bad. Your own page will score differently. |
| No colour in the terminal | Expected when output is redirected, when `NO_COLOR` is set, or in some Windows terminal hosts. Use `FORCE_COLOR=1` to override. |
| Piping to `Select-String` loses the score column | ANSI colour is disabled on a pipe, but the text is identical. Use `--format json` if you need to parse it. |
| `Dependencies are not installed for the copy at …` | The tool checked before running. It names the folder that contains `package.json`, which is the one you must run `npm ci` in. |

## 6. Editor setup

`.vscode/settings.json` is committed with Windows-friendly defaults and the two settings that
matter for this repo:

- `files.eol` (`\n`) — matches `.gitattributes`, so your checkout and CI produce the same bytes.
  Line endings do not change findings or scores (the parser normalises them), but they do change
  the *hash of the source file*, if you ever hash source outside the tool.
- `search.exclude` hides `node_modules`, so `Ctrl+Shift+F` finds the token you meant to change.

Useful tasks: **Ctrl+Shift+B** runs the test suite (`npm test`). The terminal panel should be
PowerShell — nothing here needs Git Bash or WSL.

## 7. Editor-only workflow

`F5` launches the CLI against the currently open HTML file, in the integrated terminal, so you can
audit whatever you are editing without typing a path. The launch configuration passes
`${file}` as the target.

## 8. Serving the schemas from this machine

```powershell
npm run schema:serve                                   # http://127.0.0.1:8788/schema/ + your LAN address
npm run schema:verify -- --base http://127.0.0.1:8788  # every byte must match schema/ in this checkout
```

The server refuses to start if `schema/` disagrees with `src/formats/`, which is `npm run
formats:check` expressed as a refusal to publish. Two Windows-specific notes, both in
[docs/HOSTING.md](docs/HOSTING.md): port 443 needs an elevated shell (only for the `mkcert` path that
tests the real `https://` address), and `C:\Windows\System32\drivers\etc\hosts` is owned by SYSTEM, so
the editor has to be run as Administrator to edit it.

## 9. If something breaks

Please include:

1. the exact command,
2. the full output (not a screenshot of the last line),
3. `node -v` and `npm -v`,
4. whether the path contains spaces or non-ASCII characters — target paths are resolved with
   `node:path`, which handles both, but a failure here is worth knowing about.

Exit codes are a contract, so they are a good first check: `0` means the audit ran and thresholds
were met, `1` means it ran and they were not, `2` means it could not run at all (bad path,
unreachable URL, missing dependency). An unexpected `2` is always a bug on our side.
