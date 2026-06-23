---
name: adherence-audit
description: >
  Use when adding new workflow components, after modifying rules or skills, or periodically
  to check for drift. Audits semantic consistency across all skills, agents, rules, and CLAUDE.md:
  finds dead references, invocation mismatches, convention conflicts, priority conflicts,
  orphaned components, trigger gaps, and workflow gaps. Triggers on "audit workflow",
  "check consistency", "adherence audit", "find conflicts", "workflow audit", "check for drift".
allowed-tools: Read, Glob, Grep, Agent
---

# Adherence Audit

Semantic consistency checker for the Claude workflow. Goes beyond Pulser (structural quality)
to check whether cross-references resolve, conventions agree across sources, invocations match
what the target expects, and rule priorities don't produce silent contradictions.

Run periodically and whenever a new component is added or an existing one is modified.

**Architecture:** This skill is a dimensional-review panel. Phase 1 builds the inventory in the
main context. Phase 2 dispatches 7 lens-prompt agents in parallel (one per check dimension,
model-pinned to Haiku). After all lens agents return, Phase 3 runs ONE batched verify over all
collected findings. Phase 4 synthesizes the tiered report. This follows
`dispatching-parallel-agents` §"Dispatching in prose" **Shape A** — see the five rules below.

---

## What This Audits

Seven check dimensions, in order of typical severity:

1. **Dead references** — names that appear in one file but no longer exist anywhere
2. **Invocation mismatches** — component A says it calls B with method X; B expects method Y
3. **Convention conflicts** — two sources define the same convention differently (file paths,
   naming, status values, tool names)
4. **Priority conflicts** — a rule mandates X; a skill says Y; rule wins silently
5. **Orphaned components** — skills/agents that no other component references or invokes
6. **Trigger gaps** — skills meant to auto-trigger whose description doesn't match the context
   they'd be called in
7. **Workflow gaps** — steps described in CLAUDE.md or rules with no skill/agent handler

---

## Fan-Out Rules (Shape A — Dimensional-review panel)

This skill owns its fan-out and applies the five rules from
`dispatching-parallel-agents` §"Dispatching in prose":

| Rule | Application here |
|---|---|
| 1. Model-pin leaves | Every lens agent and the verify agent use `model: "claude-haiku-4-5-20251001"`. Never Opus. |
| 2. Cap concurrency | 7 lenses fit in a single parallel block (7 ≤ min(16, cores−2) ≈ 16–20). No batching needed. |
| 3. Per-agent timeout | Each lens prompt includes: "Complete within 90 s or return findings so far." Mark non-responding agents ABANDONED and proceed. |
| 4. One batched verify | After all 7 lenses return, run ONE verify/dedup agent over all findings. No per-finding voting. |
| 5. Citation | This skill cites `dispatching-parallel-agents` as the canonical front-door (Shape A). |

---

## How to Run

### Phase 1 — Collect Inventory (main context)

Read every component file and extract structured data:

```
Read: CLAUDE.md
Read: rules/*.md (all rule files)
Read: rules/filesystem/*.md
Read: skills/*/SKILL.md (all skill files)
Read: agents/*.md (all agent files)
```

For each file, extract:
- **Name** — from frontmatter `name:` field or filename
- **Type** — skill | agent | rule | global
- **Invokes** — every `Skill { skill: "X" }`, `Agent { subagent_type: "X" }`, or prose reference
  like "invoke X skill" or "call the Y agent"
- **Conventions stated** — file paths (`plans/<slug>/...`), tool names, status values, naming patterns
- **Trigger conditions** — from frontmatter `description:` field (for skills/agents)
- **Allowed tools** — from frontmatter `allowed-tools:` field

Build an inventory: `{ name, type, file, invokes: [], conventions: [], trigger, allowed_tools }`

**Optional plan-doc extension:** If a `plan-doc` path was passed as input, also read that file
and extract:
- **Proposed new components** — files the plan intends to create (skill, agent, rule, hook files)
- **Proposed modifications** — existing components the plan intends to edit (from "Files to
  modify", task-level edits, or implementation notes)
- **Names and paths referenced** — any skill names, agent names, rule paths, or tool names
  mentioned in the plan
- **Invocations described** — how the plan proposes to invoke new or modified components

Store this as `plan_scope: { creates: [], modifies: [], references: [], proposed_invocations: [] }`.
This data is used exclusively in Phase 9 (Plan-Drift Check). Phases 2–4 run on the existing
inventory only.

---

### Phase 2 — 7-Lens Fan-Out (parallel Agent calls, Haiku-pinned)

Serialize the full inventory to a compact JSON or markdown block. Then dispatch all 7 lens agents
in ONE parallel block via the Agent tool. Pass the serialized inventory to every agent as
self-contained context (agents have no session memory).

Full lens-agent prompt templates and per-dimension `TASK:` blocks are in
`skills/adherence-audit/references/lens-prompts.md`. Use the template there; substitute the
appropriate `TASK:` block for each of the 7 dimensions listed below.

**Severity mapping for lens agents:**
- `BLOCKING` — actionable failures: broken references, invocation type mismatches, blocking
  convention conflicts, blocking plan-introduced drift
- `WARNING` — drift signals: priority conflicts, ambiguous convention disagreements, latent risk
- `INFO` — informational: orphans with plausible user-invocation, minor trigger wording
  gaps, workflow-map staleness

**The 7 lens dimensions (dispatch all in one parallel block):**

| # | Dimension | Severity on hit |
|---|-----------|-----------------|
| 1 | **Dead References** — missing names in invokes[], stale file paths | BLOCKING |
| 2 | **Invocation Mismatches** — wrong tool type, casing/hyphen mismatch | BLOCKING |
| 3 | **Convention Conflicts** — path, status value, naming pattern disagreements | BLOCKING (rule vs skill) / WARNING |
| 4 | **Priority Conflicts** — rule overrides skill silently | WARNING / BLOCKING |
| 5 | **Orphaned Components** — unreferenced, no clear standalone purpose | INFO |
| 6 | **Trigger Gaps** — auto-trigger description mismatches | WARNING / BLOCKING |
| 7 | **Workflow Gaps** — CLAUDE.md steps with no handler; stale workflow-map entries | BLOCKING / WARNING / INFO |

See `references/lens-prompts.md` for the full `TASK:` instruction text for each dimension.

**Collect results:** Wait for all 7 agents to return. For any agent that does not respond within
90 s, mark it ABANDONED and log: "Lens N (dimension name) ABANDONED — findings skipped."
If fewer than ceil(7/2) = 4 lenses return, surface a `degraded` warning before the report.

---

### Phase 3 — ONE Batched Verify (Haiku-pinned)

After collecting findings from all non-ABANDONED lens agents, run a single verify agent:

```
Agent prompt:
You are a deduplication and ranking agent. You have no memory of prior conversation.
Complete within 90 seconds or return deduplicated findings collected so far.

Below are raw findings from 7 semantic-consistency lens agents. Your tasks:
1. Deduplicate: merge findings that describe the same issue (same source file + same root cause).
   Keep the most specific description. Note how many lenses flagged it.
2. Re-rank within each severity tier (BLOCKING / WARNING / INFO) by impact.
3. Preserve severity — do not promote or demote between tiers.
4. Return the deduplicated, ranked list in the same format:
   SEVERITY: BLOCKING|WARNING|INFO
   FINDING: <source file> — <description>
   IMPACT: <one sentence>
   FLAGGED_BY: <lens numbers, e.g. "Lens 1, Lens 3">

RAW FINDINGS:
<all findings from Phase 2 lenses>
```

If the verify agent is ABANDONED, surface findings as unverified: prepend the report with
`> **Note:** Verify agent timed out — findings below are raw (not deduplicated).`

---

### Phase 4 — Synthesize Tiered Report (main context)

Using the verified (or raw) findings, emit the final report:

```
## Adherence Audit Report

### BLOCKING (actionable failures)

**[Dead Reference]** rules/workflow-phases.md
Line 32: invokes `todo-manager` — no agent with this name exists in agents/
Impact: callers following this rule will fail to update TODO.md

---

### WARNING (drift signals / latent risk)

**[Convention Conflict]** plan doc location
rules/planning.md says: `plans/<slug>/<slug>-plan.md`
skills/some-skill/SKILL.md says: `plans/<slug>/PLAN.md`
Rule wins by priority — skill is silently wrong.

---

### INFO (aspirational / informational)

**[Orphaned Component]** skills/some-skill/SKILL.md
No other component invokes this skill and description doesn't explain standalone use.

---

### SUMMARY
X findings: Y blocking, Z warnings, W info
Lenses: 7 dispatched, N completed, M abandoned
Verify: COMPLETED | PARTIAL | ABANDONED (unverified)
```

If no findings: report "No adherence issues found."

Include at the bottom of the report:
```
Fan-out: 7 lens agents (Haiku-pinned) + 1 batched verify — Shape A per dispatching-parallel-agents
```

---

### Phase 9 — Plan-Drift Check (optional) {#plan-drift-check}

> **Only runs when `plan-doc` is set.**

Using `plan_scope` from Phase 1, evaluate each proposed change for drift against the current
inventory. This phase runs in the main context (no additional agents needed — the inventory is
already loaded).

**For each component the plan proposes to CREATE:**
- Does the proposed name conflict with an existing component name? → **BLOCKING**
- Does the proposed invocation pattern (tool, method, frontmatter name) match what the workflow
  expects? → mismatch is **WARNING**
- Does the proposed component introduce a new convention (file path, status value, naming
  pattern) that conflicts with existing conventions? → **BLOCKING** (convention conflict) or
  **WARNING** (ambiguous)
- Is the proposed component never referenced by any existing component and has no auto-trigger
  description? → **INFO** (potential orphan)

**For each component the plan proposes to MODIFY:**
- Would the modification break existing callers that depend on the current interface? (e.g.,
  changing a frontmatter `name:`, removing a parameter, changing output format) → **BLOCKING**
- Would the modification introduce a convention that disagrees with existing convention
  statements in other files? → **WARNING**
- Would the modification cause a priority conflict (rule vs. skill disagree on same action)?
  → **WARNING**

**For names and paths referenced in the plan:**
- Do all referenced skill/agent names exist in the current inventory? Missing names are
  **BLOCKING** (dead reference the plan would introduce)
- Do all referenced file paths follow existing conventions? Deviations are **WARNING**

Report findings under the same tier headings (BLOCKING / WARNING / INFO), prefixed with
`[Plan-Introduced]` to distinguish from findings about existing components.

If the plan does not propose creating or modifying any workflow components (skills, agents,
rules, hooks), or if all proposed changes are purely conventional, output one INFO
entry: "No plan-introduced drift detected."

---

## Gotchas

1. Rules have higher priority than skills — always note which side wins in a priority conflict,
   not just that the conflict exists.
2. Some components are intentionally standalone (like `pulser`) — check context before flagging
   as orphaned.
3. Prose references ("invoke the architect agent") count as invocations — don't only check
   formal `Skill { }` / `Agent { }` syntax.
4. Do not fix issues during the audit — report only. Fixing during audit contaminates the
   inventory you built in Phase 1.
5. Run Pulser separately for structural quality — this skill checks semantic consistency only.
6. When `plan-doc` is set, Phase 9 findings are prefixed `[Plan-Introduced]` in the output —
   they describe drift the plan *would* introduce, not drift that already exists. Don't mix
   them with findings from Phases 2–4.
7. If `plan-doc` is absent, the skill is identical to its pre-plan-doc behavior — no Phase 9
   runs, no empty section is emitted.
8. Pass the full serialized inventory to each lens agent — agents have no session memory and
   cannot read files themselves without Read in their allowed-tools. Serialize compactly (JSON
   or condensed markdown) to stay within each agent's context budget.
9. If fewer than 4 lenses complete (degraded), note it prominently at the top of the report
   before BLOCKING — the audit coverage is incomplete.
