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

You should see `ACCESSIBLE 53 ✗`, then `CONFORMANCE 53 poor (1/5 pillars measured)`.

## 1. Prerequisites

| Need | Check | Notes |
|---|---|---|
| Node 20 or newer | `node -v` | `package.json` sets `"engines": { "node": ">=20" }`. A Node 16 install from an old project will fail on the first `import`. |
| npm (bundled with Node) | `npm -v` | Nothing else is required. No build step, no compiler, no Rust, no browser. |

`npm ci` needs `package-lock.json`, which is committed. If it complains the lockfile is out of
sync, use `npm install` once — and please open an issue, because that means the lockfile drifted.

## 2. Run it

From the repository root (PowerShell):

```powershell
# audit a file
node bin/spark.js check fixtures/bad.html

# audit your own page
node bin/spark.js check .\html-bak\001.html

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

## 8. If something breaks

Please include:

1. the exact command,
2. the full output (not a screenshot of the last line),
3. `node -v` and `npm -v`,
4. whether the path contains spaces or non-ASCII characters — target paths are resolved with
   `node:path`, which handles both, but a failure here is worth knowing about.

Exit codes are a contract, so they are a good first check: `0` means the audit ran and thresholds
were met, `1` means it ran and they were not, `2` means it could not run at all (bad path,
unreachable URL, missing dependency). An unexpected `2` is always a bug on our side.
