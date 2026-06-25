---
name: adherence-audit
description: >
  Use when adding new workflow components, after modifying rules or skills, or periodically
  to check for drift. Audits semantic consistency across all skills, agents, rules, and CLAUDE.md:
  finds dead references, invocation mismatches, convention conflicts, priority conflicts,
  orphaned components, trigger gaps, and workflow gaps. Triggers on "audit workflow",
  "check consistency", "adherence audit", "find conflicts", "workflow audit", "check for drift".
allowed-tools: Read, Glob, Grep, Bash, Agent
---

# Adherence Audit

Semantic consistency checker for the Claude workflow. Goes beyond Pulser (structural quality)
to check whether cross-references resolve, conventions agree across sources, invocations match
what the target expects, and rule priorities don't produce silent contradictions.

Run periodically and whenever a new component is added or an existing one is modified.

**Architecture:** This skill is a dimensional-review panel. Phase 1 loads the component spine
from `docs/reference/component-inventory.json`. Phase 2 dispatches 7 lens-prompt agents in
parallel (one per check dimension, model-pinned to Haiku). After all lens agents return, Phase 3
runs the tiered adversarial verify over all collected findings. Phase 4 synthesizes the tiered
report. This follows `dispatching-parallel-agents` §"Dispatching in prose" **Shape A** — see the
five rules below.

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
| 1. Model-pin leaves | Every lens agent uses `model: "claude-haiku-4-5-20251001"` (never Opus). The tiered verify (Phase 3) follows the model spec in `verify-protocol.md` — Haiku/Sonnet across its tiers, never Opus. |
| 2. Cap concurrency | 7 lenses fit in a single parallel block (7 ≤ min(16, cores−2) ≈ 16–20). No batching needed. |
| 3. Per-agent timeout | Each lens prompt includes: "Complete within 90 s or return findings so far." Mark non-responding agents ABANDONED and proceed. |
| 4. Tiered adversarial verify | After all 7 lenses return, run the tiered adversarial verify (Phase 3) over all findings. No per-finding voting. |
| 5. Citation | This skill cites `dispatching-parallel-agents` as the canonical front-door (Shape A). |

---

## How to Run

### Phase 1 — Load the component spine from the harvested inventory (main context)

Read `docs/reference/component-inventory.json` — the authoritative `[{ type, name, file }]` list
produced by `npm run harvest` — as the SET of components to audit. Do NOT hand-assemble by
globbing each directory (that omits components and causes silent false negatives).
**Stale-inventory guard:** if the file is missing, or older than the newest file under
`skills/`/`agents/`/`rules/`/`.claude/hooks/`, run `npm run harvest` first and note it.
Then, per component, the lenses read the source `file` for content (triggers, invokes,
conventions, allowed_tools) as before — the inventory fixes membership; the lenses fill detail.

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

**Severity mapping for lens agents** (canonical vocabulary — see `docs/explanation/features/orchestration-gating.md` §"Severity, Verdict & Enforcement — the one taxonomy"):
- `error` — actionable failures: broken references, invocation type mismatches, blocking
  convention conflicts, blocking plan-introduced drift
- `warning` — drift signals: priority conflicts, ambiguous convention disagreements, latent risk
- `note` — informational: orphans with plausible user-invocation, minor trigger wording
  gaps, workflow-map staleness

**The 7 lens dimensions (dispatch all in one parallel block):**

| # | Dimension | Severity on hit |
|---|-----------|-----------------|
| 1 | **Dead References** — missing names in invokes[], stale file paths | error |
| 2 | **Invocation Mismatches** — wrong tool type, casing/hyphen mismatch | error |
| 3 | **Convention Conflicts** — path, status value, naming pattern disagreements | error (rule vs skill) / warning |
| 4 | **Priority Conflicts** — rule overrides skill silently | warning / error |
| 5 | **Orphaned Components** — unreferenced, no clear standalone purpose | note |
| 6 | **Trigger Gaps** — auto-trigger description mismatches | warning / error |
| 7 | **Workflow Gaps** — CLAUDE.md steps with no handler; stale workflow-map entries | error / warning / note |

See `references/lens-prompts.md` for the full `TASK:` instruction text for each dimension.

**Collect results:** Wait for all 7 agents to return. For any agent that does not respond within
90 s, mark it ABANDONED and log: "Lens N (dimension name) ABANDONED — findings skipped."
If fewer than ceil(7/2) = 4 lenses return, surface a `degraded` warning before the report.

---

### Phase 3 — Tiered adversarial verify

Run the tiered protocol over the lenses' findings, per
`skills/dispatching-parallel-agents/references/verify-protocol.md` (`audit` profile):

1. **Triage (batched):** label each finding `supported`/`uncertain`/`unsupported`; merge
   duplicates (same source file + same root cause), preserving severity tiers; drop `unsupported`.
2. **Clustered re-check:** group the `uncertain`/disagreed findings by source file; for each
   cluster, re-read the cited file and keep/drop each member against its premise.
3. **Minority-veto consensus:** escalate the still-contested tail to 3 structurally-diverse voters
   that each try to refute; survive iff ≥2/3 keep, else drop + log `contested`.

Output the surviving findings, re-ranked within severity tier, plus the `contested` list (the
false-negative trail). No per-finding loops — each tier is one batched/clustered pass.

If the verify agent is ABANDONED, surface findings as unverified: prepend the report with
`> **Note:** Verify tier timed out — findings below are raw (unverified — triage / re-check / consensus not applied).`

---

### Phase 4 — Synthesize Tiered Report (main context)

Using the verified (or raw) findings, emit the final report:

```
## Adherence Audit Report

### error (actionable failures)

**[Dead Reference]** rules/workflow-phases.md
Line 32: invokes `todo-manager` — no agent with this name exists in agents/
Impact: callers following this rule will fail to update TODO.md

---

### warning (drift signals / latent risk)

**[Convention Conflict]** plan doc location
rules/planning.md says: `plans/<slug>/<slug>-plan.md`
skills/some-skill/SKILL.md says: `plans/<slug>/PLAN.md`
Rule wins by priority — skill is silently wrong.

---

### note (aspirational / informational)

**[Orphaned Component]** skills/some-skill/SKILL.md
No other component invokes this skill and description doesn't explain standalone use.

---

### SUMMARY
X findings: Y errors, Z warnings, W notes
Lenses: 7 dispatched, N completed, M abandoned
Verify: COMPLETED | PARTIAL | ABANDONED (unverified)
```

If no findings: report "No adherence issues found."

Include at the bottom of the report:
```
Fan-out: 7 lens agents (Haiku-pinned) + tiered adversarial verify — Shape A per dispatching-parallel-agents
```

---

### Phase 9 — Plan-Drift Check (optional) {#plan-drift-check}

> **Only runs when `plan-doc` is set.**

Using `plan_scope` from Phase 1, evaluate each proposed change for drift against the current
inventory. This phase runs in the main context (no additional agents needed — the inventory is
already loaded).

**For each component the plan proposes to CREATE:**
- Does the proposed name conflict with an existing component name? → **error**
- Does the proposed invocation pattern (tool, method, frontmatter name) match what the workflow
  expects? → mismatch is **warning**
- Does the proposed component introduce a new convention (file path, status value, naming
  pattern) that conflicts with existing conventions? → **error** (convention conflict) or
  **warning** (ambiguous)
- Is the proposed component never referenced by any existing component and has no auto-trigger
  description? → **note** (potential orphan)

**For each component the plan proposes to MODIFY:**
- Would the modification break existing callers that depend on the current interface? (e.g.,
  changing a frontmatter `name:`, removing a parameter, changing output format) → **error**
- Would the modification introduce a convention that disagrees with existing convention
  statements in other files? → **warning**
- Would the modification cause a priority conflict (rule vs. skill disagree on same action)?
  → **warning**

**For names and paths referenced in the plan:**
- Do all referenced skill/agent names exist in the current inventory? Missing names are
  **error** (dead reference the plan would introduce)
- Do all referenced file paths follow existing conventions? Deviations are **warning**

Report findings under the same tier headings (error / warning / note), prefixed with
`[Plan-Introduced]` to distinguish from findings about existing components.

If the plan does not propose creating or modifying any workflow components (skills, agents,
rules, hooks), or if all proposed changes are purely conventional, output one note
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
   before error — the audit coverage is incomplete.
