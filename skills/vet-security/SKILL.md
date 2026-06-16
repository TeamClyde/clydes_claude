---
name: vet-security
description: Use when you need to scan a finalist tool for malware or known CVEs before installing it. Gate 3 of the install-vetting funnel.
allowed-tools: Bash, Read, Grep
---

# vet-security — Install-Vetting Gate 3

## Overview

Malware and CVE scanning for the single finalist candidate, immediately before install. Selects the scanner by install surface, runs it as a subprocess, parses its JSON output, and emits per-surface findings plus an overall GREEN / YELLOW / RED security verdict. **Advisory only — never blocks; the funnel never halts on this gate's output. The orchestrator or user decides.**

See `rules/install-vetting.md` for the tier definitions, the surface→tool map, the bootstrap exception, and the full 3-gate funnel this skill feeds. Gate 3 runs only on the finalist that already cleared Gate 1 (`vet-reputation`) and Gate 2 (`vet-capability-fit`).

## Scope

Gate 3 answers exactly one question: **is the finalist safe to install?** — split into malware (supply-chain) and known-CVE risk. It does not re-assess reputation (Gate 1) or capability fit (Gate 2).

## Surface → Scanner

Pick the row matching the finalist's install surface. Each external scanner is invoked as a **subprocess via Bash** with JSON (or SARIF) output, then parsed.

| Surface | Malware scan | CVE scan |
|---|---|---|
| CLI tools / project deps (pip, npm) | GuardDog | OSV-Scanner |
| MCP servers | Cisco mcp-scanner (YARA + static) | — |
| IDE / VSCode extensions | GuardDog (on the `.vsix`) | — |
| Claude plugins / skills | **Custom heuristics** (no external scanner) | — |
| cargo / Rust crates | **gap — flag it** (no malware scanner) | OSV-Scanner |

> Before running any documented invocation below, if the exact flag/subcommand errors, run the tool's `--help` first and adapt — published CLI syntax drifts between versions. Default to the form shown; only deviate if it errors.

### CLI tools / project deps — GuardDog + OSV-Scanner

GuardDog catches malware heuristics (typosquat, malicious install-scripts, obfuscation, data exfiltration). OSV-Scanner catches known CVEs from the lockfile.

```bash
# Malware heuristics — scan a published package by ecosystem (pypi | npm).
# uvx runs GuardDog without a persistent install; the container form is equivalent.
uvx guarddog <ecosystem> scan <package> --output-format json
#   container alternative: docker pull ghcr.io/datadog/guarddog
# Or verify an entire manifest (requirements.txt / package.json):
uvx guarddog <ecosystem> verify <manifest-path> --output-format json

# Known CVEs — scan the project lockfile.
osv-scanner scan -L <lockfile> --format json
#   if `scan -L` errors on the installed version, try: osv-scanner --lockfile <lockfile> --format json
```

Parse GuardDog JSON for non-empty findings per rule (e.g. `npm-exfiltrate-sensitive-data`, `code-execution`). Parse OSV JSON `results[].packages[].vulnerabilities[]` for CVE IDs and severities.

### MCP servers — Cisco mcp-scanner

YARA + static-analysis engines need no API key. (LLM-judge engines do — skip them; the static engines are sufficient for this gate.)

```bash
# One-time install is bootstrap-exempt: uv tool install cisco-ai-mcp-scanner
mcp-scanner --format json <path-or-config-of-mcp-server>
#   confirm subcommand/flags with `mcp-scanner --help` if the above errors.
```

Parse the JSON for flagged YARA rules and static findings.

### IDE / VSCode extensions — GuardDog on the .vsix

```bash
# A .vsix is a zip; GuardDog scans the unpacked package tree for the same
# malware heuristics (install-scripts, obfuscation, exfil).
uvx guarddog npm scan <path-to-unpacked-vsix> --output-format json
```

### Claude plugins / skills — Custom heuristics (NO external scanner)

There is **no malware scanner for Claude plugins/skills.** Run lightweight custom heuristics with `Read` + `Grep` over the skill's `SKILL.md` and any bundled scripts, looking for four pattern classes:

| Heuristic | What to grep for |
|---|---|
| Install-command redirection | `curl … \| sh`, `wget … \| bash`, `npm install` / `pip install` of unexpected packages, edits to shell profiles (`.bashrc`, `.zshrc`) |
| Network exfiltration | outbound `curl`/`fetch`/`requests.post` to non-obvious hosts, especially carrying file contents or env vars |
| Obfuscation | `base64 -d`, `eval`, `exec`, `atob(`, hex/`\x`-escaped blobs, unusually long single-line encoded strings |
| Prompt injection | text instructing the agent to ignore prior instructions, exfiltrate secrets, or call tools the skill shouldn't need |

```bash
# Example sweep over a plugin/skill directory (adapt patterns; this is illustrative):
grep -rEn 'curl .*\| *(sh|bash)|base64 +-d|\beval\b|requests\.post|ignore (all|previous) instructions' <plugin-dir>
```

**ALWAYS flag this surface lower-confidence and recommend manual review.** These heuristics are a tripwire, not a malware scanner — a clean result does NOT mean the plugin is safe, only that the obvious patterns are absent. State this in the report every time.

### cargo / Rust — OSV CVE-only

```bash
osv-scanner scan -L Cargo.lock --format json
```

Malware scanning is a **gap** for cargo — no equivalent of GuardDog is wired in. State the gap explicitly in the report; the CVE result alone is not a clean bill of health.

## Verdict Rubric

Apply per surface, then roll up. The overall verdict is the **worst** per-scan tier (one RED makes the finalist RED).

| Condition | Tier |
|---|---|
| Confirmed malware finding (GuardDog rule hit, mcp-scanner YARA hit, or a custom-heuristic match that survives inspection) | RED |
| Any CVE of HIGH or CRITICAL severity | RED |
| CVE of MODERATE/LOW severity only | YELLOW (list IDs) |
| Custom-heuristic surface (plugins/skills) with no match | YELLOW floor — lower-confidence, manual review recommended |
| cargo malware gap (CVE scan clean, no malware scanner available) | YELLOW — note the gap |
| A required scanner was missing → couldn't scan | YELLOW — "couldn't scan; tool missing" (never RED, never error) |
| All applicable scans ran and returned no findings | GREEN |

Tiers inform; none block.

## Output Format

```
## vet-security: <finalist>

Surface: <CLI dep | MCP server | VSCode extension | Claude plugin/skill | cargo crate>
Overall verdict: GREEN | YELLOW | RED

### Scans Run
- <scanner>: <ran / couldn't scan — tool missing> — <one-line result>
- <scanner>: <ran / couldn't scan — tool missing> — <one-line result>

### Findings
- Malware: <rule/heuristic hits, or "none">
- CVEs: <IDs + severities, or "none">

### Confidence & Gaps
<Note any couldn't-scan paths, the plugins/skills lower-confidence + manual-review flag,
or the cargo malware gap. "none" if a full scan ran with a real scanner.>

### Summary
<1–3 sentences explaining the verdict>

Advisory — this report informs; it does not install or block. The funnel does not halt on this gate. The orchestrator or user decides whether to proceed.
```

## Graceful Degradation

**This is the defining behavior of this gate.** A missing scanner must NEVER throw or abort the funnel.

For every scanner-absent path:

1. Detect absence cheaply — check exit code / "command not found" before relying on output.
2. Report exactly: **"couldn't scan with `<tool>` — tool not installed"**.
3. Recommend installing it, and note its one-time install is the **bootstrap exception** in `rules/install-vetting.md` (the scanners are a pinned trusted set — do not run the funnel on them).
4. **Continue.** Run the other applicable scanner(s), set the per-scan tier to YELLOW ("couldn't scan"), and still emit a full report.

```bash
# Probe before scanning; degrade gracefully instead of erroring.
if command -v osv-scanner >/dev/null 2>&1; then
  osv-scanner scan -L "$lockfile" --format json
else
  echo "couldn't scan with osv-scanner — tool not installed (bootstrap exception applies)"
fi
```

Other degradation cases:
- Scanner runs but returns non-JSON / malformed output → state "scanner output unparseable"; set that scan to YELLOW; do not crash.
- Scanner exits non-zero because it *found something* (some tools signal findings via exit code) → that is a finding, not a failure — parse it as RED/YELLOW per the rubric, not a couldn't-scan.
- Both scanners for a surface missing → YELLOW overall with "no scans could run — recommend installing <tools>"; never error.

Never let a scanner failure abort the report. Always emit a verdict, even when nothing could be scanned.

## Gotchas

1. **Advisory-only is load-bearing.** The skill emits a report; it never installs, never blocks, and the funnel never halts on it. State this explicitly in every output.
2. **Graceful degradation never errors the funnel.** A missing scanner is a YELLOW "couldn't scan", not an exception. Probe with `command -v` first, report the bootstrap exception, and continue with whatever else can run.
3. **Plugins/skills are ALWAYS lower-confidence.** The custom heuristics are a tripwire, not a malware scanner. A clean grep does NOT mean safe — flag lower-confidence and recommend manual review every single time.
4. **cargo malware is a known gap.** OSV covers CVEs only; there is no malware scanner for crates here. A clean OSV run is YELLOW with the gap noted, not GREEN.
5. **A finding is not a scan failure.** Some scanners exit non-zero when they detect something. Distinguish "tool missing / couldn't run" (YELLOW couldn't-scan) from "tool ran and found malware/CVEs" (RED/YELLOW finding) by checking for parseable findings, not exit code alone.
6. **Verify CLI syntax before trusting it.** Published flags drift (`osv-scanner scan -L` vs `--lockfile`; GuardDog `scan` vs `verify`). If the documented form errors, run `--help` and adapt rather than reporting a false "couldn't scan".
7. **Verdict roll-up is worst-tier.** One RED scan makes the finalist RED even if other scans are GREEN. Do not average tiers.
8. **Bootstrap exception.** Per `rules/install-vetting.md`: GuardDog, OSV-Scanner, and Cisco mcp-scanner are the pre-trusted scanner set. Do not run this skill — or any gate — on the scanners themselves.
