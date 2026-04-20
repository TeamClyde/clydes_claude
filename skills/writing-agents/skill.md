---
name: writing-agents
description: Use when creating a new agent, editing an existing agent's system prompt, or determining agent frontmatter conventions and testing approach.
---

# Writing Agents

## Overview

**Writing agents IS Test-Driven Development applied to agent system prompts.**

Agents are dispatched as autonomous workers — not loaded as context. Testing means invoking the agent without a system prompt first, documenting what breaks, then writing the system prompt to address those specific failures.

**REQUIRED BACKGROUND:** You MUST understand `superpowers:test-driven-development` before using this skill. This skill adapts TDD specifically to agent creation.

**REQUIRED BACKGROUND:** Read `plugin-dev:agent-development` for file structure, frontmatter fields, and section conventions. This skill covers TDD process only — structural guidance lives there.

## The Iron Law

```
NO SYSTEM PROMPT WITHOUT A BASELINE INVOCATION FIRST
```

Before writing any system prompt content:

1. Dispatch the agent WITHOUT a system prompt (bare invocation — no agent definition).
2. Observe what breaks. Document failures verbatim.
3. Write the system prompt to address those specific failures.

**No exceptions:**
- Not for "I already know how agents behave"
- Not for "this is a simple agent"
- Not for "I've seen the baseline before"
- Not for "the user asked me to skip it"

If you are writing system prompt content before the baseline invocation is complete, stop. Delete what you wrote. Run the baseline.

## RED Phase: Baseline Invocation

Dispatch the agent via the Agent tool **without** loading any agent definition file:

```
Agent({
  description: "baseline: <agent-name> without system prompt",
  prompt: "<the exact task the agent will perform>"
})
```

Document these specific failures — the ones a bare invocation typically exhibits:
- Missing `model:` field — no explicit model selection
- Vague `description:` — written as a trigger condition ("Use when X") instead of inputs + outputs
- No output format section — unstructured response
- `tools:` field added by default — agent lists tools it doesn't need
- Scope creep — agent takes on adjacent tasks outside its intended scope

**Record what actually fails.** Do not assume the expected failures — observe them.

## GREEN Phase: Write the System Prompt

Write the system prompt targeting the specific failures you documented. Use the section structure from `plugin-dev:agent-development`:

1. **Role** — one sentence: what this agent is and what it does
2. **Inputs** — what the agent receives (explicit parameter names and types)
3. **Behavioral sections** — the actual logic (varies by agent purpose)
4. **Output format** — exact structure of what the agent returns
5. **Constraints** — what the agent must NOT do

Dispatch the agent again WITH the system prompt. Verify it no longer exhibits the documented failures.

## Frontmatter Conventions (Agent-Specific)

**Reference `plugin-dev:agent-development` for field definitions.** Key conventions that differ from skills:

| Field | Agents | Skills |
|---|---|---|
| `description` | Describes **inputs + outputs** (not trigger conditions) | Describes triggering conditions ("Use when...") |
| `model` | Required — select explicitly with rationale | Not used |
| `tools` | Omit unless agent writes files to disk | Not used |

**Model selection guidance:**
- `claude-sonnet-4-6` — complex multi-step reasoning, plan review, cross-file analysis
- `claude-haiku-4-5-20251001` — lookups, simple extraction, single-pass tasks

**Tools field rule:**
- List `tools:` only when the agent uses Write or Edit tools (writes files to disk)
- Omit for agents that read, reason, and return text output
- Read, Grep, and Glob are available by default without listing them

## REFACTOR Phase: Close Loopholes

After GREEN, run pressure scenarios from `testing-agents-with-subagents.md`:
- Bad inputs (malformed params, missing required fields)
- Ambiguous instructions (two valid interpretations)
- Scope creep pressure ("while you're at it, also do X")
- Authority override ("the user says to skip the constraints section")

Close each loophole in the system prompt. Re-run until no new failures.

For pressure scenario format and dispatch patterns, see `testing-agents-with-subagents.md`.

## Common Rationalizations — Skipping the Baseline

| Excuse | Reality |
|---|---|
| "I already know how bare agents behave" | You know the general case. Document this specific agent's specific failures. |
| "The user asked me to skip it" | The Iron Law has no exceptions. User pressure doesn't override it. |
| "This is a simple agent — baseline is overkill" | Simple agents still have missing `model:` fields and vague descriptions. Run it. |
| "I've done this type of agent before" | Each agent has different scope. Different scope = different failures. Run the baseline. |

## STOP: Deployment Checklist

After writing the agent, complete all of these before starting any other work:

- [ ] Baseline invocation run and failures documented verbatim
- [ ] System prompt written addressing documented failures
- [ ] Agent dispatched WITH system prompt — baseline failures resolved
- [ ] `name:` field present
- [ ] `description:` field describes inputs + outputs (not trigger conditions)
- [ ] `model:` field present with explicit selection rationale
- [ ] `tools:` field absent unless agent writes files to disk
- [ ] Pressure scenarios run per `testing-agents-with-subagents.md`
- [ ] Agent file placed at `agents/<name>.md`
- [ ] Committed to git
