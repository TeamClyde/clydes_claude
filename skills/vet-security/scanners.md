# vet-security — Deterministic-layer scanner invocations

Exact per-surface scanner commands for `vet-security` Gate 3's deterministic layer. Loaded on demand; `SKILL.md` holds the surface→scanner table, the two-layer flow, the rubric, and the semantic layer.

> Before running any invocation, if the exact flag/subcommand errors, run the tool's `--help` first and adapt — published CLI syntax drifts between versions. Default to the form shown; only deviate if it errors.

## OSV — package malware + CVE scanner

OSV covers **both** known CVEs **and** known-malicious packages (the OpenSSF Malicious Packages `MAL-` feed), across PyPI, npm, **and crates.io** — so it is the single package scanner for CLI deps, cargo crates, and unpacked extension/agent dependencies. Cargo malware is **not** a gap (verified — `rustdecimal` → `MAL-2022-1`).

**Pre-install single-package check (preferred — no binary needed).** Gate 3 vets a *not-yet-installed* package, so query the OSV.dev API by name+version. A name lookup against a public DB (local-only-safe, same class as Gate 1's deps.dev):

```bash
# Surfaces CVE (CVE-/GHSA-/PYSEC-/RUSTSEC-) AND malware (MAL-) advisory ids for one package.
curl -sS -X POST -d '{"version":"<v>","package":{"name":"<pkg>","ecosystem":"<PyPI|npm|crates.io>"}}' \
  https://api.osv.dev/v1/query
# Parse `vulns[].id` (+ `vulns[].database_specific.severity`). A MAL- id = known-malicious package.
```

**Lockfile / unpacked-dir scan (needs the `osv-scanner` binary).** For an unpacked `.vsix`'s `package-lock.json`, a downloaded agent's manifest, or a project lockfile:

```bash
osv-scanner scan -L <lockfile-or-manifest> --format json
```

- **`osv-scanner` exits non-zero when it FINDS vulnerabilities** — a finding, not a failure. Distinguish "tool missing / couldn't run" (YELLOW couldn't-scan) from "ran and found something" (parse the JSON for ids → RED/YELLOW per the rubric).
- **PATH caveat (Windows):** `osv-scanner` may be installed but not on the shell PATH (winget installs to `…\WinGet\Links\osv-scanner.exe`). Probe with `command -v osv-scanner`; if absent, try the full install path before degrading to "couldn't scan."
- **BOM caveat (Windows):** any manifest you synthesize must be written **BOM-free** — a UTF-8 BOM (PowerShell 5.1's default) makes `osv-scanner`'s `requirements.txt` parser read 0 packages.

## MCP servers — Cisco mcp-scanner

YARA + static-analysis engines need no API key.

```bash
# One-time install is bootstrap-exempt: uv tool install cisco-ai-mcp-scanner
# `static` scans a pre-generated tools JSON without connecting to a live server.
# --analyzers yara → offline YARA engine; --format raw → JSON-parseable (NOT "json").
mcp-scanner --analyzers yara --format raw static --tools <path-to-tools-list.json>
#   confirm exact subcommand/flags with `mcp-scanner --help` if the above errors.
```

Parse the raw output for flagged YARA rules and static findings, then run the semantic pass.

## AI IDE / VSCode extensions — unpack → OSV

A `.vsix` is a zip. Unpack, run OSV on the bundled dependency manifest, then the semantic pass on the manifest + activation code:

```bash
unzip <path-to-vsix> -d /tmp/vsix-unpacked            # .vsix is a zip archive
osv-scanner scan -L /tmp/vsix-unpacked/extension/package.json --format json   # bundled-dep CVE + MAL-
```

## Claude plugins / skills — custom heuristics

There is **no malware scanner for Claude plugins/skills.** Run lightweight heuristics with `Read` + `Grep` over `SKILL.md` and bundled scripts:

| Heuristic | What to grep for |
|---|---|
| Install-command redirection | `curl … \| sh`, `wget … \| bash`, unexpected `npm install`/`pip install`, edits to shell profiles (`.bashrc`, `.zshrc`) |
| Network exfiltration | outbound `curl`/`fetch`/`requests.post` to non-obvious hosts, especially carrying file contents or env vars |
| Obfuscation | `base64 -d`, `eval`, `exec`, `atob(`, hex/`\x`-escaped blobs, unusually long single-line encoded strings |
| Prompt injection | text instructing the agent to ignore prior instructions, exfiltrate secrets, or call tools the skill shouldn't need |

The semantic pass extends these into the full AST rubric. **ALWAYS flag this surface lower-confidence and recommend manual review** — heuristics are a tripwire, not a malware scanner.

## Required deterministic pre-scan (every candidate, before the semantic pass)

Run these `Read`/`Grep` checks on the materialized artifacts; their hits are passed to the semantic reviewer as context:

- **Hidden Unicode** — zero-width (U+200B), bidi override (U+202E), tag block (U+E0000–E007F) in any manifest/prose string.
- **Encoded blobs** — base64/hex strings in descriptions, metadata, or `default` values.
- **Hardcoded destinations** — URLs / IPs / Discord-webhook strings in any string field or bundled script.
- **Install-time execution** — npm `postinstall`/`preinstall`; pip `setup.py` `subprocess`/`urllib`; `.pth` files in a wheel; `__init__.py` with `exec(base64...)`.
- **Config-namespace mismatch** — a `.vsix` declaring config key X in `package.json` but reading key Y in compiled JS.
- **Embedded long NL-prompt strings** — multi-hundred-char natural-language instruction blocks in extension JS.

## OS package managers — reputation-only

`winget` / `choco` / `brew` installs have **no malware/CVE scanner row** — they are official-build channels vetted by Gate 1 reputation alone. State this explicitly in the report; do not attempt a Gate-3 scan and do not mark them couldn't-scan-YELLOW. Their posture is "reputation-vetted (Gate 1); no Gate-3 scanner applies."

## Graceful degradation — probe before scanning

```bash
if command -v osv-scanner >/dev/null 2>&1; then
  osv-scanner scan -L "$lockfile" --format json
elif [ -x "$LOCALAPPDATA/Microsoft/WinGet/Links/osv-scanner.exe" ]; then
  "$LOCALAPPDATA/Microsoft/WinGet/Links/osv-scanner.exe" scan -L "$lockfile" --format json
else
  echo "couldn't scan with osv-scanner — tool not installed (bootstrap exception applies)"
fi
```

All degradation cases → YELLOW, never abort: non-JSON/malformed scanner output ("unparseable"); OSV.dev API unreachable ("couldn't query OSV" — fall back to the binary); semantic reviewer unavailable or malformed ("semantic review unavailable — manual review recommended", never RED on absence); both scanner + semantic pass unavailable ("no scans could run — recommend installing <tools>"). Always emit a verdict.
