---
name: vet-install
description: Use when the workflow or Claude is about to install a tool and needs to vet it before proceeding. Entry point for the 3-gate install-vetting funnel — runs vet-reputation, vet-capability-fit, and vet-security in order, consolidates ONE report, and always asks the user before any install. Never auto-installs.
allowed-tools: Skill
---

# vet-install — Install-Vetting Funnel Orchestrator

## Overview

Entry point for all workflow/Claude-initiated install vetting. Given a candidate (or a stated need) and an install surface, runs the 3-gate funnel cheap-to-expensive, consolidates the three gates' outputs into ONE report, and always asks the user before any install proceeds. **Advisory only — the funnel never blocks and never auto-installs. The user decides every time.**

See `rules/install-vetting.md` for the full tier definitions, surface map, and bootstrap exception.

**Two entry points for this skill:**
- `/project-setup` Phase 2b — the prompt-first installer calls `vet-install` before adding any tool.
- The advisory `PreToolUse` hook nudge (Task 6) — surfaces this skill when an install-like tool call is detected.

## Inputs

| Input | Required | Values |
|---|---|---|
| Candidate | Yes (or stated need) | Package name, `github.com/<owner>/<repo>`, or a capability need |
| Install surface | Yes | `CLI dep`, `MCP server`, `VSCode extension`, `Claude plugin/skill`, `cargo crate` |

If only a **stated need** is given (no named candidate), invoke `vet-reputation` in `discover-from-need` mode first to produce a ranked shortlist, then run Gates 2 and 3 on the top pick.

## Funnel Steps

Run in this order. **The funnel itself never short-circuits — only the USER opting out between gates does.**

### Gate 1 — Reputation

```
Skill { skill: "vet-reputation", args: "<candidate or need> [surface: <surface>]" }
```

Produces: GREEN / YELLOW / RED tier + supporting signals.

### Gate 2 — Capability Fit

```
Skill { skill: "vet-capability-fit", args: "candidate: <candidate> need: <stated need>" }
```

Produces: `does` / `partially` / `does-not` verdict + satisfying component.

### Gate 3 — Security

```
Skill { skill: "vet-security", args: "<candidate> surface: <surface>" }
```

Produces: GREEN / YELLOW / RED security verdict + scan findings.

### Consolidate and Ask

After all three gates complete, compose the consolidated report (see Output Format) and ALWAYS ask the user before any install. Do not proceed automatically — not even on all-GREEN.

## Output Format

```
## vet-install: <candidate>

Surface: <install surface>

### Gate 1 — Reputation
Tier: GREEN | YELLOW | RED
<1-sentence summary from vet-reputation>

### Gate 2 — Capability Fit
Verdict: does | partially | does-not
<1-sentence summary from vet-capability-fit>

### Gate 3 — Security
Verdict: GREEN | YELLOW | RED
<1-sentence summary from vet-security, including any confidence/gap notes>

### Confidence & Gaps          ← include this section whenever any gate has low confidence or a gap
- Gate 1: <reduced-confidence note, e.g. "registry-only — Scorecard unavailable">
- Gate 3: <lower-confidence note, e.g. "plugin/skill surface — custom heuristics only; manual review recommended">
- <any couldn't-scan paths or coverage gaps>

### Overall Recommendation
PROCEED | PROCEED WITH CAUTION | INVESTIGATE BEFORE INSTALLING

<2–3 sentences composing the three gate verdicts into a recommendation>

---
Advisory — this report informs; it does not install or block. You decide.

**Proceed with install?** (yes / no / see Gate N details)
```

### Recommendation Mapping

| Gate outcomes | Recommendation |
|---|---|
| All three GREEN | PROCEED |
| Any YELLOW, no RED | PROCEED WITH CAUTION — list caveats |
| Any RED | INVESTIGATE BEFORE INSTALLING — list what to resolve |

### Confidence & Gaps — When to Include

Include the `### Confidence & Gaps` section whenever:
- Gate 1 returns reduced-confidence (registry-only package, no Scorecard available)
- Gate 3 is on the `Claude plugin/skill` surface (always lower-confidence — heuristics only)
- Gate 3 is on `cargo crate` (malware gap — CVE scan only)
- Any gate couldn't run a scanner ("couldn't scan — tool missing")
- A gate-skill returned an error (surface as a gap, not a silent failure)

**Never silently drop a low-confidence signal.** The `### Confidence & Gaps` section is the place to surface it.

## Graceful Degradation

If a gate-skill fails or returns an error:
1. Note it in `### Confidence & Gaps`: "Gate N failed — `<error summary>`".
2. Continue to the next gate.
3. Emit a partial consolidated report with the gap noted.
4. Never abort the funnel on a gate failure.

## Gotchas

1. **Advisory-only is load-bearing.** The funnel never halts on any gate's output. No gate result — not even RED — blocks the install. Only the USER opting out (replying "no" to the always-ask prompt) stops the install. State this explicitly every time.
2. **Never auto-install, not even on all-GREEN.** Always-ask is an explicit design decision. An "auto-proceed on all-GREEN" path does not exist and must not be added.
3. **Low-confidence signals must be surfaced, not dropped.** Gate 3's plugin/skill heuristic path is always lower-confidence — it must appear in `### Confidence & Gaps` every time. Gate 1's registry-only reduced confidence likewise. Silently omitting these signals defeats the funnel's purpose.
4. **Scope: workflow/Claude-initiated installs only.** This funnel covers tools that the workflow or Claude is about to install. It does not apply to the user's own terminal commands. Per `rules/install-vetting.md`: "Scope: workflow/Claude-initiated installs only, never the user's own terminal."
5. **Bootstrap exception.** GuardDog, OSV-Scanner, and Cisco mcp-scanner are the pre-trusted scanner set. Do not run this funnel on them — their one-time install is the sanctioned un-vetted bootstrap. Per `rules/install-vetting.md`.
6. **Gate-skill failures are gaps, not crashes.** If a gate-skill errors, surface it in `### Confidence & Gaps` and continue. Never abort the consolidated report.
7. **One report, not three.** The orchestrator's job is consolidation. Do not present three separate gate reports to the user — compose them into the single consolidated format above.
