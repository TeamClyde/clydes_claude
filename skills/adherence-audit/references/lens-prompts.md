# Lens Prompts — Full Reference

Supporting reference for `skills/adherence-audit/SKILL.md`.

Each prompt below maps to one of the 7 lens agents dispatched in Phase 2.
Paste the relevant `TASK:` block into the agent prompt template in `SKILL.md §Phase 2`.

---

## Lens Agent Prompt Template

```
You are a semantic-consistency lens agent. You have no memory of prior conversation.
Complete your analysis within 90 seconds or return findings collected so far — do not hang.

DIMENSION: <dimension name>
TASK: <dimension-specific instruction below>

INVENTORY:
<serialized inventory>

OUTPUT FORMAT (return only this):
DIMENSION: <name>
STATUS: COMPLETED | PARTIAL | NO_FINDINGS
FINDINGS:
- SEVERITY: error|warning|note
  FINDING: <source file> — <description>
  IMPACT: <one sentence>
```

---

## Lens 1 — Dead References

```
TASK: For every name in invokes[] across all components, check if a component with that name
exists in the inventory. For agent names in subagent_type: calls, verify an agent with that
name exists in agents/. Spot-check key file paths mentioned in any file (plan doc paths,
docs/ paths, scripts/ paths) — report ones that look stale or fabricated. Report each missing
name as error with source file, reference text, and what's missing.
```

---

## Lens 2 — Invocation Mismatches

```
TASK: For each invocation "A invokes B via method M", look up B in the inventory.
Check: (a) does B's type match M? (skill → Skill tool, agent → Agent tool); (b) does B's
frontmatter name: match exactly the name used in the invocation (casing, hyphenation)?
Common patterns: Task tool used for an agent (correct: Agent); skill invoked with Agent tool;
name differs by casing. Report mismatches as error.
```

---

## Lens 3 — Convention Conflicts

```
TASK: Collect all convention statements (file paths, naming patterns, status values) from all
files. Group by subject: "Where do design docs go?", "Where do plans go?", "What TODO.md
sections exist?", "What status values does plan-management accept?", etc. For each group where
two or more sources disagree, report as warning citing both sources verbatim. If the conflict
is between a rule and a skill (rule wins by priority), report as error instead.
```

---

## Lens 4 — Priority Conflicts

```
TASK: Identify all places where a rule and a skill disagree on the same action:
- Rule says "always use X" — skill says "use Y"
- Rule specifies a file path — skill specifies a different path
Rules override skills. For each conflict, report which side wins. Output as warning (latent
risk) unless the conflict would cause silent incorrect behavior, in which case error.
```

---

## Lens 5 — Orphaned Components

```
TASK: For each component in the inventory, check if any other component's invokes[] contains
this component's name. If no component invokes it AND its description doesn't explain when
users would invoke it directly (no auto-trigger, no clear user-facing purpose), report as
note. Note: some skills are intentionally standalone (e.g., pulser) — flag only if
the description doesn't justify standalone existence.
```

---

## Lens 6 — Trigger Gaps

```
TASK: For skills that state auto-trigger conditions in their description, evaluate: does the
trigger description use language that would match the context it's meant to fire in? Example
gap: a skill says it fires "after writing-plans" but writing-plans doesn't explicitly invoke it
and its trigger description doesn't match any natural user phrase. Report gaps as warning.
Report clear mismatches (trigger fires in the wrong context) as error.
```

---

## Lens 7 — Workflow Gaps

```
TASK: (a) Read CLAUDE.md's Workflow Sequence / Delegation table. For each step or row,
identify the skill or agent supposed to handle it; verify that component exists in the
inventory and its trigger/invocation matches the step description. (b) If docs/workflow-map.md
appears in the inventory, compare its agent registry and skill registry against the current
inventory — flag components in the map that no longer exist (error) and components that exist
but aren't in the map (note). Report missing handlers as error, stale map entries as
warning, unlisted-but-existing components as note.
```
