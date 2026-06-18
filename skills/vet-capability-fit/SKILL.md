---
name: vet-capability-fit
description: Use when you need to determine whether a candidate tool actually covers a stated need and which component of it provides that capability. Gate 2 of the install-vetting funnel.
allowed-tools: Read, WebFetch, Agent
---

# vet-capability-fit — Install-Vetting Gate 2

## Overview

Capability and fit assessment for a candidate tool against a stated need. Emits a **does / partially / does-not** verdict, the specific component that satisfies the need, and any missing required features. **Advisory only — never blocks; the orchestrator or user decides.**

See `rules/install-vetting.md` for the full 3-gate funnel this skill feeds. Gate 2 has no external scanner — it reads the candidate's own docs/README only.

## Scope

Gate 2 answers exactly two questions:

1. Does this tool do the needed thing?
2. Which specific part of it provides that capability?

**Out of scope for this gate:**
- Reputation, Scorecard, or trust signals → Gate 1 (`vet-reputation`)
- Malware / CVE scanning → Gate 3 (`vet-security`)
- Multi-tool feature-matrix comparison → out of scope entirely

## Steps

1. **Collect the stated need.** If it is absent or too vague to test against (e.g., "does it work for me"), ask for clarification before proceeding. The need must be specific enough to match against evidence (e.g., "parse TOML files", "manage GitHub PRs from CLI", "scan Python deps for CVEs").

2. **Fetch the candidate's own evidence.** In order of preference:
   - Project README (via `WebFetch` on the GitHub/registry page)
   - Official docs or feature list
   - CLI `--help` output or package description field
   - Declared feature list in `package.json` / `pyproject.toml` / `Cargo.toml`

   Do **not** query external reputation databases — that is Gate 1's job.

3. **Match the stated need against the evidence.** Identify:
   - The specific module, subcommand, flag, or feature that covers the need
   - Any required capability explicitly missing from the docs

4. **Assign the verdict:**

   | Verdict | Meaning |
   |---------|---------|
   | `does` | Evidence confirms the tool covers the need; satisfying component identified |
   | `partially` | Tool covers part of the need; enumerate what IS and IS NOT covered |
   | `does-not` | No evidence the tool covers the need; missing features listed |

5. **Dispatch a `researcher` if needed.** When the README/docs don't answer the question and the answer may exist in a linked doc, changelog, or issue tracker, dispatch an `Agent` with a tight, single-question prompt. Do not ask the researcher to "explore the tool broadly."

6. **Emit the fit report** (see Output Format).

## Output Format

```
## vet-capability-fit: <candidate>

Need: <stated need>
Verdict: does | partially | does-not

### Satisfying Component
<which specific part — module, subcommand, flag, or feature — satisfies the need>
<For "does-not": write "none identified">

### Missing Features
<Explicit list of required capabilities not found in the docs, or "none">

### Evidence
<1–3 sentences citing the specific README section, docs page, or --help output reviewed>

Advisory — this report informs; it does not install or block. If proceeding, Gate 3 (vet-security) runs via vet-install.
```

## Graceful Degradation

- **README missing or behind auth wall** → state "docs unavailable via WebFetch"; try the registry page (npm, PyPI, crates.io) as fallback; emit verdict at reduced confidence and note it.
- **Tool has no docs at all** → `does-not` at reduced confidence; note "no documentation found — capability unverifiable."
- **Researcher Agent times out or fails** → continue without it; state "researcher lookup failed"; do not error the report.

Never let a fetch failure abort the report. Always emit a verdict, even if confidence is low.

## Gotchas

1. **Advisory-only is load-bearing.** The skill emits a report; it never installs or blocks. State this explicitly in every output.
2. **Read the candidate's own docs first.** Gate 2 has no external scanner — per `rules/install-vetting.md`: "Gate 2 has no tool column — it reads the candidate's own docs/README."
3. **Scope discipline.** Do not score reputation or scan for CVEs inside this gate; those belong to Gates 1 and 3 respectively.
4. **Satisfying component is required output.** Even a `does` verdict must name the specific component, subcommand, or feature that satisfies the need. The orchestrator uses this field to scope the install to the minimal needed component, so a vague "yes it works" answer is incomplete.
5. **Partial fit must enumerate both sides.** A `partially` verdict without explicit "IS covered" and "IS NOT covered" lists is incomplete.
6. **Researcher dispatch is focused, not exploratory.** Give the Agent a single tight question (e.g., "Does ripgrep's `--multiline` flag support zero-width assertions?"). Do not ask it to summarize the tool or explore its feature set.
7. **Bootstrap exception.** Per `rules/install-vetting.md`: OSV-Scanner and Cisco mcp-scanner are the pre-trusted scanner set. Do not run this skill on them.
