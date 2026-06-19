---
**Feature:** Install Vetting
**C4 Layer:** C3 Component
**Status:** Active
**Owner:** solo
**Last updated:** 2026-06-18
**Related plans:** plans/orchestration-layer-foundation/ (Phase 1B docs)
**Related ADRs:** _(none)_
**Key files:**
  - `skills/vet-install/SKILL.md` — funnel orchestrator (Gate 1 → 2 → 3)
  - `skills/vet-reputation/SKILL.md`, `skills/vet-capability-fit/SKILL.md`, `skills/vet-security/SKILL.md` — the three gates
  - `agents/ai-tool-security-reviewer.md` — semantic OWASP reviewer (agentic surfaces)
  - `rules/install-vetting.md` — the advisory funnel policy
---

# Install Vetting

## Context & Scope

The install-vetting funnel is a three-gate advisory pipeline that runs whenever the workflow or Claude is about to install a tool. It checks reputation, capability fit, and security in order — cheap to expensive — then consolidates the findings into a single report and always asks the user before proceeding. The defining invariant is advisory end-to-end: no gate result, not even a RED security verdict, blocks an install. The user decides every time.

**What this covers.** Workflow-initiated and Claude-initiated installs only. Entry points are `project-setup` Phase 4 (Tooling Setup) and the advisory `PreToolUse` hook nudge, which fires when an install-like tool call is detected and derives the install surface from the package-manager prefix.

**What it does not cover.** Installs the user runs themselves in their own terminal. The funnel is never invoked retroactively on already-installed tools and never auto-installs anything, even when all three gates return GREEN.

**Bootstrap exception.** OSV-Scanner and Cisco mcp-scanner are the pre-trusted scanner set. Their one-time install is the sanctioned un-vetted bootstrap; the funnel is never run on the scanners themselves.

**Graceful degradation.** A missing scanner never aborts the funnel. When a scanner cannot be found, the gate reports "couldn't scan with `<tool>`", recommends installing it, and continues to the next gate. The consolidated report is always emitted.

## Building Block View

The funnel has four components: one orchestrator skill and three gate skills, with an optional subagent for agentic surfaces at Gate 3.

**`vet-install` (orchestrator).** Entry point for all install-vetting. Accepts a candidate (or a stated need) plus an install surface, runs the three gates in order, consolidates their outputs into one report, and asks the user whether to proceed. The funnel never short-circuits between gates; only the user opting out between gates terminates it early.

**Gate 1 — `vet-reputation`.** Assesses reputation, quality, and maintenance signals for the candidate. Fetches the OpenSSF Scorecard via the deps.dev v3 API and last-commit date from the GitHub API. Emits GREEN / YELLOW / RED plus supporting evidence. Operates in two modes: `score-named` (given a named candidate) and `discover-from-need` (given a capability need — produces a ranked shortlist, then runs Gates 2 and 3 on the top pick).

**Gate 2 — `vet-capability-fit`.** Reads the candidate's own docs and README to answer exactly two questions: does this tool solve the stated need, and which specific component does it? Emits `does` / `partially` / `does-not` plus the satisfying component name. No external scanners at this gate — all evidence comes from the candidate's own documentation.

**Gate 3 — `vet-security`.** Malware and CVE screening for the finalist. Runs a deterministic layer (always) and, for agentic surfaces, a semantic layer via the `ai-tool-security-reviewer` subagent. Emits GREEN / YELLOW / RED with per-layer findings.

**`ai-tool-security-reviewer` (subagent).** A quarantined, read-only semantic judge dispatched by `vet-security` for agentic surfaces only. Receives the candidate's materialized static artifacts, the declared install surface, and the deterministic pre-scan findings. Reviews against OWASP ASI01–10 (for MCP servers and AI CLI agents) and AST01–10 (for Claude plugins/skills), or both (for AI IDE extensions). Returns a single enum-locked verdict. Its verdict is advisory and treated as tainted — it informs the worst-tier roll-up but never overrides a deterministic RED and never blocks.

**Surface → tool map.** Each install surface selects specific reputation and security tooling:

| Surface | Reputation | Security |
|---|---|---|
| CLI tools / project deps | deps.dev Scorecard + GitHub | OSV-Scanner (CVE + `MAL-` malware) |
| cargo crates | deps.dev Scorecard + GitHub | OSV-Scanner (CVE + `MAL-` malware) |
| MCP servers | GitHub signals | Cisco mcp-scanner (YARA + static) + semantic reviewer |
| Claude plugins / skills | GitHub signals | Custom heuristics + semantic reviewer + manual-review flag |
| AI IDE / VSCode extensions | Marketplace + GitHub | Unpack `.vsix` → OSV on bundled deps; + semantic reviewer if AI extension |
| AI CLI tools / agents | deps.dev + GitHub | OSV on the package + semantic reviewer |
| OS package managers (winget/choco/brew) | deps.dev / registry + GitHub | Reputation-only (Gate 1) — no malware/CVE scanner |

Gate 2 has no tool column: it reads the candidate's own docs/README exclusively.

## Runtime View

A typical single-candidate vetting run proceeds as follows.

**1. Entry.** `vet-install` receives a candidate name and install surface (e.g., `ripgrep`, surface: `CLI dep`). If only a need is stated without a named candidate, `vet-reputation` runs in `discover-from-need` mode first to produce a ranked shortlist.

**2. Gate 1 — Reputation.** `vet-install` invokes `vet-reputation`. The skill resolves the GitHub source from the candidate name, fetches the deps.dev v3 project record for `scorecard.overallScore` and the four injection-relevant sub-checks (`Code-Review`, `Branch-Protection`, `Dangerous-Workflow`, `Token-Permissions`), then fetches `pushed_at` and `archived` from the GitHub API. The risk rubric is applied in order — `archived: true` → RED; no GitHub source → YELLOW (registry-only reduced confidence); `overallScore` < 4.0 → RED; any injection-relevant sub-check ≤ 2 → YELLOW; last commit > 18 months ago → YELLOW; score 4.0–6.9 → YELLOW; score ≥ 7.0 with no other flags → GREEN. Star counts are noted but are a tiebreaker only — the fake-star caveat is always cited. The gate emits a GREEN/YELLOW/RED tier with supporting signals. `vet-install` does not short-circuit on YELLOW or RED; the user may opt out, but the funnel itself continues.

**3. Gate 2 — Capability Fit.** `vet-install` invokes `vet-capability-fit` with the candidate name and stated need. The skill fetches the candidate's README or official docs, matches the stated need against the documented feature set, identifies the specific subcommand, flag, or module that satisfies the need, and enumerates any missing required capabilities. It emits `does` / `partially` / `does-not` with the satisfying component named. If the need cannot be determined from the README alone, a researcher subagent is dispatched with a single tight question.

**4. Gate 3 — Security.** `vet-install` invokes `vet-security` with the candidate and surface.

- **Deterministic layer.** The surface row from the table above selects the scanner. For a CLI dep, `osv-scanner` (or the OSV.dev API for a single pre-install package check) runs against the package. For MCP servers, the Cisco mcp-scanner runs YARA and static analysis. For `.vsix` extensions, the archive is unpacked and OSV runs on bundled deps. For Claude plugins/skills, custom grep heuristics fire. A required pre-scan always runs first, regardless of surface: hidden Unicode (zero-width, bidi override, tag-block), encoded blobs (base64/hex in description or metadata fields), hardcoded URLs or webhook strings, install-time execution scripts (`postinstall`, `setup.py subprocess`), config-namespace mismatches, and embedded long natural-language prompt strings.

- **Semantic layer (agentic surfaces only).** For MCP servers, Claude plugins/skills, AI IDE extensions, and AI CLI tools/agents, after the deterministic pass, `vet-security` materializes the candidate's static artifacts to a temp directory without executing the candidate. It then dispatches the `ai-tool-security-reviewer` subagent with the temp-dir path, declared surface, and deterministic pre-scan findings as context. The subagent reads the artifacts with `Read` and `Grep` only, maps findings to OWASP ASI or AST identifiers, and returns a schema-locked verdict. Reviewed content is treated as untrusted data: any instruction found inside the candidate's artifacts aimed at the reviewer is itself reported as an ASI01 / AST08 finding, never followed. After the verdict is received, the temp directory is deleted. Malformed or non-schema output from the reviewer is treated as a manual-review flag rather than silently dropped.

- **Verdict roll-up.** The overall verdict is the worst tier across all scan results. Confirmed malware (`MAL-` OSV id, Cisco YARA hit, or custom-heuristic match) → RED. Semantic reviewer RED → RED. HIGH or CRITICAL CVE → RED. MODERATE/LOW CVE only → YELLOW. Semantic reviewer YELLOW → YELLOW. Plugin/skill surface with no heuristic match → YELLOW floor (lower-confidence; manual review recommended always). Missing scanner → YELLOW ("couldn't scan; tool missing"). All scans plus semantic pass ran clean → GREEN.

**5. Consolidation and always-ask.** `vet-install` composes the three gate outputs into a single consolidated report with a `### Gate 1 — Reputation`, `### Gate 2 — Capability Fit`, and `### Gate 3 — Security` section, an overall recommendation (`PROCEED` / `PROCEED WITH CAUTION` / `INVESTIGATE BEFORE INSTALLING`), and a `### Confidence & Gaps` section whenever any gate returned reduced-confidence or a scanner was missing. The report closes with an explicit advisory statement and the always-ask prompt: "Proceed with install? (yes / no / see Gate N details)". The funnel never auto-proceeds, even on all-GREEN.

**Overall recommendation mapping:**

| Gate outcomes | Recommendation |
|---|---|
| All three GREEN | PROCEED |
| Any YELLOW, no RED | PROCEED WITH CAUTION — list caveats |
| Any RED | INVESTIGATE BEFORE INSTALLING — list what to resolve |

## Dependencies

**External scanners (deterministic layer).**
- **OSV-Scanner** — the primary malware and CVE scanner for CLI deps, cargo crates, AI CLI agents, and `.vsix` bundled deps. Invoked as a subprocess via Bash; also available as the OSV.dev REST API (`POST https://api.osv.dev/v1/query`) for single pre-install package name lookups without requiring the binary.
- **Cisco mcp-scanner** — YARA-based static analysis for MCP servers. Invoked as a subprocess.
- **deps.dev v3 API** — public, unauthenticated REST endpoint that returns OpenSSF Scorecard data and project metadata for GitHub-hosted packages. Used by `vet-reputation` at Gate 1.
- **GitHub API (unauthenticated)** — used by `vet-reputation` to retrieve `pushed_at` and `archived` fields for maintenance recency.

**Internal components.**
- `rules/install-vetting.md` — the canonical policy document defining the funnel scope, surface→tool map, two-layer security model, risk rubric, bootstrap exception, and graceful-degradation behavior. All gate skills defer to this file for tier definitions.
- `skills/vet-security/scanners.md` — exact per-surface scanner invocations, Windows PATH and BOM caveats for `osv-scanner`, `.vsix` unpack commands, plugin/skill heuristics table, the required pre-scan checklist, and graceful-degradation probe patterns. Loaded by `vet-security` when running the deterministic pass.
- `project-setup` skill (Phase 4 — Tooling Setup) — the primary call site for `vet-install` during new-project initialization.
- `PreToolUse` hook — the secondary call site; nudges Claude to invoke `vet-install` when an install-like tool call is detected in the main session.

**Version constraints.** No pinned versions for the external scanners are enforced in the funnel itself; the bootstrap exception grants them trusted status and they are expected to be installed and managed out of band.

## Decisions

_(No accepted ADRs yet.)_

## Known Issues & Gotchas

- **Advisory-only is load-bearing, not a caveat.** The funnel's defining property is that it never blocks. A RED result from any gate — including a semantic RED from the `ai-tool-security-reviewer` — does not halt the install. The always-ask prompt is the only mechanism that pauses execution, and it is the user who answers it. Any code path that conditionally skips the always-ask (e.g., "auto-proceed on all-GREEN") must not be added.

- **The semantic verdict is tainted.** The `ai-tool-security-reviewer` operates on adversarial content. A malicious candidate could craft its own documentation to skew the semantic verdict toward GREEN. This is why the semantic verdict is merged worst-tier (it can only make the verdict worse, never override a deterministic RED) and why the `confidence` field is surfaced. Absence of semantic findings is not proof of safety — the non-zero false-negative floor means the deterministic layer and the always-ask human gate remain the primary defenses.

- **Plugin/skill surface is always lower-confidence.** There is no external malware scanner for Claude plugins and skills. Custom heuristics and the semantic reviewer are a tripwire, not a comprehensive scanner. The `### Confidence & Gaps` section must appear in every report for this surface, and a manual-review recommendation must be stated explicitly — never silently omitted.

- **OS package managers get no Gate-3 scan.** winget, choco, and brew installs are reputation-only (Gate 1 only). Gate 3 is not invoked for these surfaces. The consolidated report must state this explicitly; it must not mark them couldn't-scan-YELLOW, as that would misrepresent the design.

- **Low-confidence signals must never be silently dropped.** The `### Confidence & Gaps` section exists precisely to surface reduced-confidence paths: registry-only packages with no Scorecard, plugin/skill heuristic-only passes, missing scanner binaries, and gate-skill errors. An omitted gap signal defeats the funnel's purpose.

- **Stars are a weak tiebreaker, not a signal.** Fake-star campaigns are well-documented. A high star count must never upgrade a YELLOW to GREEN and must never factor into the tier decision except as a last-resort tiebreaker among candidates of equal Scorecard score. The fake-star caveat must be cited whenever star counts appear in output.

- **The semantic reviewer must never execute the candidate.** MCP server artifacts are materialized by parsing source statically (Read/Grep on the server source for tool-registration calls, or copying a pre-shipped manifest). The server is never started. Running an unvetted MCP server to extract its tool list would itself be a security violation.

- **Gate-skill failures are gaps, not crashes.** If `vet-reputation`, `vet-capability-fit`, or `vet-security` returns an error, `vet-install` notes it in `### Confidence & Gaps` and continues to the next gate. The consolidated report is always emitted with the gap noted.

- **`score: -1` in Scorecard sub-checks means unavailable, not failing.** When a Scorecard sub-check returns `score: -1`, it means the check could not be run (typically insufficient token permissions during scoring). It must be treated as "check unavailable" — not as a score of -1 out of 10, and not as a failing score ≤ 2 that would trigger YELLOW.

## Observability

**Consolidated vetting report.** Every `vet-install` run produces a single consolidated report in the session transcript. The report structure is fixed: `## vet-install: <candidate>`, then gate sections in order (Gate 1, Gate 2, Gate 3), an optional `### Confidence & Gaps` section, and a `### Overall Recommendation` section. The trailing advisory statement and always-ask prompt are always present. The report is the primary artifact of each vetting run — it is surfaced to the user in-session and is not written to disk.

**Per-stack tool-selection record.** When `project-setup` Phase 4 (Tooling Setup) completes a vetting pass for a new project's stack tools, the selected tools and their vetting outcomes are recorded in `docs/reference/stack-setup.md` in the project repo. This file serves as the persistent, per-repo record of which tools were vetted and installed during project initialization.

**Gate-level signals visible in the report.** Each gate section of the consolidated report contains the raw signal data: Scorecard `overallScore` and the four sub-check scores at Gate 1; the verdict (`does`/`partially`/`does-not`) and satisfying component at Gate 2; the per-scanner findings, pre-scan hits, semantic layer verdict, and `confidence` score at Gate 3. Gaps and reduced-confidence paths are always surfaced in `### Confidence & Gaps` rather than silently absorbed.

## Glossary

**Advisory.** The funnel's operational mode. Every gate produces information and a recommendation; nothing in the funnel prevents an install or triggers one automatically. The user is always the decision-maker.

**Agentic surface.** An install surface whose candidate can receive and act on natural-language instructions: MCP servers, Claude plugins/skills, AI IDE extensions, and AI CLI tools/agents. These surfaces get both the deterministic and semantic layers of Gate 3.

**Bootstrap exception.** The one-time, un-vetted install of the funnel's own scanner dependencies (OSV-Scanner, Cisco mcp-scanner). These tools are pre-trusted; the funnel is never run on them.

**Deterministic layer.** The first sub-layer of Gate 3. Runs external scanners (OSV, Cisco mcp-scanner, custom heuristics) and a required pre-scan (Unicode, encoded blobs, hardcoded URLs, install-time exec, config-namespace mismatch, embedded NL-prompt) as subprocesses. Un-injectable: the candidate's content cannot influence which scanners run or what they report.

**deps.dev v3 API.** Google's open-source package health API. Used by `vet-reputation` to retrieve OpenSSF Scorecard data and project metadata for GitHub-hosted packages.

**OSV-Scanner / OSV.dev API.** The Open Source Vulnerabilities database and scanner. Covers CVE and `MAL-` (malware) identifiers across PyPI, npm, and crates.io. Used at Gate 3 for CLI deps, cargo crates, AI CLI agents, and `.vsix` bundled dep scans.

**Cisco mcp-scanner.** A YARA-based static analysis tool for MCP server packages. Used at Gate 3 for MCP server surfaces.

**OpenSSF Scorecard.** A security health scoring system for open-source projects. Returns an aggregate `overallScore` (0–10) and per-check scores for security-relevant practices. Used by `vet-reputation` at Gate 1.

**Semantic layer.** The second sub-layer of Gate 3, agentic surfaces only. The `ai-tool-security-reviewer` subagent reads the candidate's static artifacts and maps findings to OWASP ASI01–10 / AST01–10 identifiers. Advisory and tainted — never overrides a deterministic RED, never blocks.

**Surface.** The installation context for a candidate tool. Determines which reputation signals, scanners, and security layers apply. Surfaces: CLI dep, cargo crate, MCP server, Claude plugin/skill, AI IDE/VSCode extension, AI CLI agent, OS package manager.

**Worst-tier roll-up.** The verdict aggregation rule used by `vet-security`: the overall verdict is the worst single tier across all scans and the semantic layer. One RED makes the finalist RED regardless of all other results.
