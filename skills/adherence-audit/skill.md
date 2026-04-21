---
name: adherence-audit
description: >
  Use when adding new workflow components, after modifying rules or skills, or periodically
  to check for drift. Audits semantic consistency across all skills, agents, rules, and CLAUDE.md:
  finds dead references, invocation mismatches, convention conflicts, priority conflicts,
  orphaned components, trigger gaps, and workflow gaps. Triggers on "audit workflow",
  "check consistency", "adherence audit", "find conflicts", "workflow audit", "check for drift".
allowed-tools: Read, Glob, Grep
---

# Adherence Audit

Semantic consistency checker for the Claude workflow. Goes beyond Pulser (structural quality)
to check whether cross-references resolve, conventions agree across sources, invocations match
what the target expects, and rule priorities don't produce silent contradictions.

Run periodically and whenever a new component is added or an existing one is modified.

---

## What This Audits

Seven check types, in order of typical severity:

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

## How to Run

### Phase 1 — Collect inventory

Read every component file and extract structured data:

```
Read: CLAUDE.md
Read: rules/*.md (all rule files)
Read: rules/filesystem/*.md
Read: skills/*/skill.md (all skill files)
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

### Phase 2 — Check 1: Dead references

For every name found in `invokes[]` across all components:
- Check if a component with that name exists in the inventory
- If not: **DEAD REFERENCE** — report the source file, the reference text, and what's missing

Also check:
- File paths mentioned in any file: do those paths exist? (spot-check key ones like plan doc paths,
  docs/ paths, scripts/ paths)
- Agent names in `subagent_type:` calls: does an agent with that name exist in `agents/`?

### Phase 3 — Check 2: Invocation mismatches

For each invocation `A invokes B via method M`:
- Look up B's definition
- Check: does B's type match M? (skill invoked via Skill tool, agent via Agent tool)
- Check: does B's frontmatter `name:` match exactly the name used in the invocation?

Common mismatch patterns to look for:
- `Task` tool used to invoke an agent (correct tool: `Agent`)
- Skill invoked with `Agent` tool
- Name in invocation differs from name in frontmatter by casing or hyphenation

### Phase 4 — Check 3: Convention conflicts

Collect all convention statements (file paths, naming patterns, status values) from all files.
Group by subject:
- "Where do design docs go?" — collect all answers across rules and skills
- "Where do implementation plans go?" — same
- "What TODO.md sections exist?" — same
- "What status values does plan-management accept?" — same

For each group: if two or more sources disagree, report as **CONVENTION CONFLICT** citing both
sources verbatim.

### Phase 5 — Check 4: Priority conflicts

Identify all places where a rule and a skill disagree on the same action:
- Rule says "always use X" — skill says "use Y"
- Rule specifies a file path — skill specifies a different path

Rules override skills. Report the conflict and note which side wins.

### Phase 6 — Check 5: Orphaned components

For each component in the inventory:
- Check if any other component's `invokes[]` contains this component's name
- If no component invokes it AND it has no auto-trigger description: **ORPHANED**

Note: some skills are user-invoked directly (no auto-trigger needed). Flag as orphaned only if
the description doesn't explain when users would invoke it directly.

### Phase 7 — Check 6: Trigger gaps

For skills that state auto-trigger conditions in their description:
- Does the trigger description use language that would match the context it's meant to fire in?
- Example gap: a skill says it fires "after writing-plans" but writing-plans doesn't explicitly
  invoke it and its trigger description doesn't match any natural user phrase

### Phase 8 — Check 7: Workflow gaps

Read CLAUDE.md's Workflow Sequence section. For each numbered step:
- Identify what skill or agent is supposed to handle it
- Verify that component exists and its trigger/invocation matches the step description

Also read `docs/workflow-map.md` if it exists — compare its agent registry and skill registry
against the current inventory. Flag components in the map that no longer exist, and components
that exist but aren't in the map.

---

## Output Format

Group findings by severity. Within each group, list findings in source-file order.

```
## Adherence Audit Report

### BLOCKING (causes incorrect behavior)

**[Dead Reference]** rules/workflow-phases.md
Line 32: invokes `todo-manager` — no agent with this name exists in agents/
Impact: callers following this rule will fail to update TODO.md

---

### WARNING (causes confusion or latent risk)

**[Convention Conflict]** plan doc location
rules/planning.md says: `plans/<slug>/<slug>-plan.md`
skills/some-skill/skill.md says: `plans/<slug>/PLAN.md`
Rule wins by priority — skill is silently wrong.

---

### INFO (minor inconsistency)

**[Invocation Mismatch]** CLAUDE.md line 12
Uses `Task` tool for architect — correct tool is `Agent`

---

### SUMMARY
X findings: Y blocking, Z warnings, W info
```

If no findings: report "No adherence issues found."

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
