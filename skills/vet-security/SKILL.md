---
name: vet-security
description: Use when you need to scan a finalist tool for malware or known CVEs before installing it. Gate 3 of the install-vetting funnel.
allowed-tools: Bash, Read, Grep, Agent
---

# vet-security — Install-Vetting Gate 3

## Overview

Malware and CVE screening for the single finalist candidate, immediately before install. Gate 3 is **two layers**:

1. **Deterministic layer (always).** Surface-selected scanners + a required pre-scan, run as subprocesses; un-injectable, fast.
2. **Semantic layer (agentic surfaces only).** An isolated `ai-tool-security-reviewer` subagent reviews the candidate's static artifacts against OWASP ASI/AST for the natural-language manipulation signatures structurally miss (OWASP AST08).

It emits per-surface findings plus an overall GREEN / YELLOW / RED verdict. **Advisory only — never blocks; the funnel never halts on this gate's output. The orchestrator or user decides.**

See `rules/install-vetting.md` for tier definitions, the surface→tool map, the bootstrap exception, and the full 3-gate funnel this skill feeds. Gate 3 runs only on the finalist that cleared Gate 1 (`vet-reputation`) and Gate 2 (`vet-capability-fit`).

## Scope

Gate 3 answers exactly one question: **is the finalist safe to install?** — malware (supply-chain) + known-CVE risk, plus (for agentic surfaces) instruction-manipulation risk. It does not re-assess reputation (Gate 1) or capability fit (Gate 2).

## Deterministic layer — Surface → Scanner

Pick the row matching the finalist's install surface. Each external scanner is invoked as a **subprocess via Bash** with JSON output, then parsed.

| Surface | Malware scan | CVE scan | Semantic pass? |
|---|---|---|---|
| CLI tools / project deps (pypi, npm) | OSV (`MAL-` feed) | OSV | No |
| cargo / Rust crates | OSV (`MAL-` feed) | OSV | No |
| MCP servers | Cisco mcp-scanner (YARA + static) | — | **Yes** |
| Claude plugins / skills | **Custom heuristics** (no external scanner) | — | **Yes** |
| AI IDE / VSCode extensions | unpack `.vsix` → OSV on bundled deps | OSV (bundled deps) | **Yes** |
| AI CLI tools / agents | OSV on the package + lifecycle-script inspection | OSV | **Yes** |
| **OS package managers (winget / choco / brew)** | **none — reputation-only (Gate 1)** | **none** | No |

> **Exact per-surface invocations live in [`scanners.md`](scanners.md)** — the OSV.dev API + `osv-scanner` commands (with the Windows PATH/BOM caveats), the Cisco mcp-scanner command, the `.vsix` unpack, the plugins/skills heuristics table, the **required deterministic pre-scan** checklist, the OS-package-manager reputation-only note, and the graceful-degradation probe. Load it when running the deterministic pass.

**Load-bearing facts** (detail in `scanners.md`):
- **OSV does both, across all three ecosystems** — CVE **and** `MAL-` malware for PyPI, npm, and crates.io. Cargo malware is **not** a gap (verified — `rustdecimal` → `MAL-2022-1`).
- **Pre-install single-package check = the OSV.dev API** (`POST https://api.osv.dev/v1/query`, name+version) — no binary; a name lookup against a public DB (local-only-safe). Use the `osv-scanner` binary for lockfile/unpacked-dir scans.
- **Required pre-scan** before every semantic pass: Unicode / encoded-blob / hardcoded-URL / install-time-exec / config-namespace-mismatch / embedded-NL-prompt checks; hits are passed to the reviewer.
- **OS package managers (winget/choco/brew) are reputation-only** (Gate 1) — no Gate-3 scanner row; do not mark them couldn't-scan-YELLOW.

## Semantic layer — `ai-tool-security-reviewer` (agentic surfaces only)

For the four agentic surfaces (MCP servers, Claude plugins/skills, AI IDE extensions, AI CLI tools/agents), after the deterministic pass, run the semantic review. Ordinary `CLI dep` / `cargo crate` / OS-package-manager surfaces do **not** get this pass.

1. **Materialize the candidate's static artifacts to a temp dir WITHOUT executing it:**
   - **MCP server** → construct the `tools/list` + `prompts/list` + `resources/list` JSON (Cisco `static`-subcommand shape) by parsing the server source with `Read`/`Grep` — the registration calls (`server.tool(...)` / `server.setRequestHandler('tools/list', …)` / FastMCP `@mcp.tool`/`@mcp.prompt`/`@mcp.resource` decorators); or copy a pre-shipped `tools.json`/manifest. **Never run the server.**
   - **AI IDE extension** → `unzip` the `.vsix` (already done for the OSV pass).
   - **AI CLI agent** → `pip download` / `npm pack` (no install), then `tar xf <pkg>.tgz -C <tmp>` so lifecycle scripts and the entry point are readable.
   - **Claude plugin/skill** → copy the skill dir as-is.
2. **Dispatch the reviewer:**
   ```
   Agent { subagent_type: "ai-tool-security-reviewer", prompt: "<temp-dir path> + surface: <surface> + pre-scan findings: <deterministic hits>" }
   ```
   It returns an enum-locked verdict (`verdict` GREEN/YELLOW/RED, `agentic`, `confidence`, `findings[]`, `summary`).
   - **Runtime caveat:** a newly-created agent is not dispatchable by `subagent_type` in the session that created it — the registry is fixed at session start. This path works at runtime / in a fresh session; an in-session "agent not found" right after authoring is not a defect.
3. **Merge** the reviewer's verdict into the worst-tier roll-up (below), validating the returned schema. **Malformed / non-schema output → treat as a manual-review flag** (do not silently drop it). The semantic verdict is **advisory and tainted** — it informs the roll-up; it never blocks.
4. **Delete the temp dir** after the verdict is received.

## Verdict Rubric

Apply per scan/layer, then roll up. The overall verdict is the **worst** per-scan tier (one RED makes the finalist RED).

| Condition | Tier |
|---|---|
| Confirmed malware (OSV `MAL-` id, mcp-scanner YARA hit, or a custom-heuristic match that survives inspection) | RED |
| Semantic reviewer returns RED (tool-poisoning / exfiltration / goal-hijack confirmed) | RED |
| Any CVE of HIGH or CRITICAL severity | RED |
| CVE of MODERATE/LOW severity only | YELLOW (list IDs) |
| Semantic reviewer returns YELLOW | YELLOW (carry its findings) |
| Custom-heuristic surface (plugins/skills) with no match | YELLOW floor — lower-confidence, manual review recommended |
| A required scanner was missing → couldn't scan | YELLOW — "couldn't scan; tool missing" (never RED, never error) |
| All applicable scans + the semantic pass ran and returned no findings | GREEN |

Tiers inform; none block. The semantic verdict is advisory — a GREEN semantic result does not override a RED deterministic finding, and vice versa: worst-tier wins.

## Output Format

```
## vet-security: <finalist>

Surface: <CLI dep | cargo crate | MCP server | Claude plugin/skill | AI IDE extension | AI CLI agent | OS package manager>
Overall verdict: GREEN | YELLOW | RED

### Deterministic layer
- <scanner>: <ran / couldn't scan — tool missing> — <one-line result>
- Pre-scan: <Unicode/blob/URL/exec/namespace/NL-prompt hits, or "clean">

### Semantic layer (agentic surfaces only)
- ai-tool-security-reviewer: <verdict + 1-line summary, or "N/A — non-agentic surface">

### Findings
- Malware: <OSV MAL- ids / YARA / heuristic hits, or "none">
- CVEs: <ids + severities, or "none">
- Semantic: <OWASP-anchored findings from the reviewer, or "none">

### Confidence & Gaps
<couldn't-scan paths; plugins/skills lower-confidence + manual-review flag; OS-package-manager reputation-only note;
the semantic layer's advisory + LLM-judge-false-negative caveat. "none" if a full scan + semantic pass ran cleanly.>

### Summary
<1–3 sentences explaining the verdict>

Advisory — this report informs; it does not install or block. The funnel does not halt on this gate. The orchestrator or user decides whether to proceed.
```

## Graceful Degradation

**The defining behavior of this gate.** A missing scanner — or an unavailable semantic reviewer — must NEVER throw or abort the funnel. Probe before scanning (incl. the `osv-scanner` Windows full-path fallback), report the absent tool's one-time install as the **bootstrap exception** (`rules/install-vetting.md`), set that scan to YELLOW "couldn't scan", run whatever else can, and **always emit a verdict**. The probe pattern and per-case handling (unparseable output, OSV.dev unreachable, reviewer unavailable, both unavailable — all → YELLOW, never abort) are in [`scanners.md`](scanners.md) § Graceful degradation.

## Gotchas

1. **Advisory-only is load-bearing.** The skill emits a report; it never installs, never blocks, and the funnel never halts on it — not even on RED, and not on a semantic-reviewer RED. State this explicitly in every output.
2. **The semantic verdict is advisory and tainted.** It is the worst-case-skewable LLM layer — merge it worst-tier, validate its schema, flag malformed output for manual review, and never let it override a deterministic RED. It has a non-zero false-negative floor; absence of semantic findings is not proof of safety.
3. **OSV does both, across all three ecosystems.** One tool covers CVE **and** `MAL-` malware for PyPI, npm, and crates.io — cargo malware is **not** a gap. Prefer the OSV.dev API for the pre-install single-package check (no binary, name lookup); use the `osv-scanner` binary (Windows full-path fallback) for lockfile/unpacked-dir scans. A non-zero exit means it *found* something — a finding, not a failure.
4. **Never run the candidate to materialize MCP artifacts.** Construct the `tools/list` JSON by parsing source statically (Read/Grep), or copy a shipped manifest — the reviewer is read-only and the orchestrator must not execute an unvetted server.
5. **Plugins/skills are ALWAYS lower-confidence.** The heuristics + semantic pass are a tripwire, not a malware scanner — flag lower-confidence and recommend manual review every time.
6. **OS package managers have no Gate-3 scanner.** winget/choco/brew are reputation-only (Gate 1). Report that explicitly; do not mark them couldn't-scan-YELLOW.
7. **Bootstrap exception.** Per `rules/install-vetting.md`: OSV-Scanner and Cisco mcp-scanner are the pinned trusted scanner set. Do not run this skill — or any gate — on the scanners themselves. If a documented CLI form errors, run `--help` and adapt rather than reporting a false "couldn't scan". Verdict roll-up is worst-tier — one RED makes the finalist RED.
