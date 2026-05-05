---
name: using-superpowers
description: Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions
allowed-tools: Read
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

This is not negotiable. This is not optional. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## Instruction Priority

Rules and skills override default system prompt behavior, but **user instructions always take precedence**. The full hierarchy:

1. **User's explicit instructions** (CLAUDE.md, GEMINI.md, AGENTS.md, direct requests) — highest priority
2. **Rules** (files in `~/.claude/rules/` and `rules/` in the project) — load with the system prompt and override skill triggers when they disagree
3. **Skills** (Superpowers and plugin-provided) — override default system behavior where they conflict
4. **Default system prompt** — lowest priority

If CLAUDE.md, GEMINI.md, or AGENTS.md says "don't use TDD" and a skill says "always use TDD," follow the user's instructions. The user is in control. If a rule says "always route through git-manager" and a skill suggests calling git directly, follow the rule — rules outrank skill triggers.

## How to Access Skills

**In Claude Code:** Use the `Skill` tool. When you invoke a skill, its content is loaded and presented to you—follow it directly. Never use the Read tool on skill files.

**In Copilot CLI:** Use the `skill` tool. Skills are auto-discovered from installed plugins. The `skill` tool works the same as Claude Code's `Skill` tool.

**In Gemini CLI:** Skills activate via the `activate_skill` tool. Gemini loads skill metadata at session start and activates the full content on demand.

**In other environments:** Check your platform's documentation for how skills are loaded.

## Platform Adaptation

Skills use Claude Code tool names. Non-CC platforms: see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex) for tool equivalents. Gemini CLI users get the tool mapping loaded automatically via GEMINI.md.

## Orientation Protocol

Before exploring any repo, follow this hierarchy — stop as soon as you have what you need:

1. Read `project.json` at repo root (small, always fast — tells you what features are enabled)
2. Read the file at `codebase-entry` in project.json if set (typically CODEBASE.md, 50–200 lines — safe to read directly)
3. Read the plan doc for the current task if one exists (`plans/<slug>/<slug>-plan.md`)
4. **Stop.** Do not explore further unless a specific detail is genuinely absent from all three sources
5. For specific symbol/file lookups beyond that: dispatch `researcher` agent — never Grep or run bash on large codebases

**Hard boundaries:**
- `CODEBASE.md` → read directly (purpose-built for AI orientation, designed to be short)
- code graph output from `infra-init` (can be 250K+ lines) → researcher agent only, never read directly
- Plan doc → always read during execution; it supersedes all filesystem exploration

# Using Skills

## The Rule

**Invoke relevant or requested skills BEFORE any response or action.** Even a 1% chance a skill might apply means that you should invoke the skill to check. If an invoked skill turns out to be wrong for the situation, you don't need to use it.

```dot
digraph skill_flow {
    "User message received" [shape=doublecircle];
    "About to EnterPlanMode?" [shape=doublecircle];
    "Already brainstormed?" [shape=diamond];
    "Invoke brainstorming skill" [shape=box];
    "Might any skill apply?" [shape=diamond];
    "Invoke Skill tool" [shape=box];
    "Announce: 'Using [skill] to [purpose]'" [shape=box];
    "Has checklist?" [shape=diamond];
    "Create TodoWrite todo per item" [shape=box];
    "Follow skill exactly" [shape=box];
    "Respond (including clarifications)" [shape=doublecircle];

    "About to EnterPlanMode?" -> "Already brainstormed?";
    "Already brainstormed?" -> "Invoke brainstorming skill" [label="no"];
    "Already brainstormed?" -> "Might any skill apply?" [label="yes"];
    "Invoke brainstorming skill" -> "Might any skill apply?";

    "User message received" -> "Might any skill apply?";
    "Might any skill apply?" -> "Invoke Skill tool" [label="yes, even 1%"];
    "Might any skill apply?" -> "Respond (including clarifications)" [label="definitely not"];
    "Invoke Skill tool" -> "Announce: 'Using [skill] to [purpose]'";
    "Announce: 'Using [skill] to [purpose]'" -> "Has checklist?";
    "Has checklist?" -> "Create TodoWrite todo per item" [label="yes"];
    "Has checklist?" -> "Follow skill exactly" [label="no"];
    "Create TodoWrite todo per item" -> "Follow skill exactly";
}
```

## Red Flags

These thoughts mean STOP—you're rationalizing:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "Let me gather information first" | Skills tell you HOW to gather information. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "This doesn't count as a task" | Action = task. Check for skills. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This feels productive" | Undisciplined action wastes time. Skills prevent this. |
| "I know what that means" | Knowing the concept ≠ using the skill. Invoke it. |

## Skill Priority

When multiple skills could apply, use this order:

1. **Process skills first** (brainstorming, debugging) - these determine HOW to approach the task
2. **Implementation skills second** (frontend-design, mcp-builder) - these guide execution

"Let's build X" → brainstorming first, then implementation skills.
"Fix this bug" → debugging first, then domain-specific skills.

## Skill Types

**Rigid** (TDD, debugging): Follow exactly. Don't adapt away discipline.

**Flexible** (patterns): Adapt principles to context.

The skill itself tells you which.

## User Instructions

Instructions say WHAT, not HOW. "Add X" or "Fix Y" doesn't mean skip workflows.

## Extended Agents (repo workflow)

These agents are available in addition to superpowers skills:

| Agent | Purpose | When to use |
|---|---|---|
| `architect` | Independent plan reviewer — design soundness, logic completeness, self-containment | Invoked automatically by plan-gate; also available for ad-hoc plan review |
| `test-strategy` | Defines testing contract from plan doc — what to test, black-box | Invoked automatically by plan-gate after architect APPROVED |
| `test-builder` | Writes failing tests from Testing section before execution starts | Invoked automatically by plan-gate after test-strategy |
| `researcher` | Single-question codebase/AWS lookup via MCP | Use during brainstorming and planning for symbol/file/infra lookups |
| `jira-workflow-manager` | All Jira operations — ticket creation, status transitions | Invoked by plan-gate for ticket creation; use directly for status transitions during execution |
| `git-manager` | All git operations — commit, branch, push, PR | Use for all commits during executing-plans |
| `integration-engineer` | Cross-repo contract analysis | Use when a change has cross-repo impact |

## Skills Registry Addition

- `plan-gate`: Runs automatically after writing-plans. Gates the plan through architect review, test-strategy, test-builder, Jira ticket creation, and TODO.md registration before execution begins. Can also be invoked manually against any plan doc at `plans/<slug>/<slug>-plan.md`.

## Gotchas

1. Skills listed in this orientation may not be symlinked yet on a fresh install — run setup.sh first.
2. Plugin skills (like `plugin-dev:*`) that are in Integrated state must be invoked via `creating-tools`, not directly — see `rules/plugin-lifecycle.md`.
3. If a skill doesn't trigger when expected, check the description trigger pattern — it must match the user's phrasing.
