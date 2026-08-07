---
name: writing-agents
description: Applies TDD to agent system prompts — baseline invocation first, then a prompt targeting the observed failures. Use when creating a new agent, editing an existing agent's system prompt, or determining agent frontmatter conventions and testing approach. Route through creating-tools, not directly.
allowed-tools: Agent, Read
---

# Writing Agents

## Overview

**Writing agents IS Test-Driven Development applied to agent system prompts.**

Agents are dispatched as autonomous workers — not loaded as context. Testing means invoking the agent without a system prompt first, documenting what breaks, then writing the system prompt to address those specific failures.

**REQUIRED BACKGROUND:** You MUST understand `test-driven-development` before using this skill. This skill adapts TDD specifically to agent creation.

**REQUIRED BACKGROUND:** Read `creating-tools/frontmatter-reference.md` for the verified field
inventory covering both agents and skills. Agent and skill frontmatter use different key names
in different casing for similar concepts, and an unrecognized key is silently ignored rather
than rejected — that reference is where the differences are recorded.

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
- Missing `model:` field — no explicit model selection (repo policy; the platform defaults to `inherit`)
- Vague `description:` — does not say what the agent is for or when Claude should delegate to it
- No output format section — unstructured response
- `tools:` declared without the tools the agent actually needs — the allowlist is strict, so
  omitted tools are simply absent
- Scope creep — agent takes on adjacent tasks outside its intended scope

**Record what actually fails.** Do not assume the expected failures — observe them.

## GREEN Phase: Write the System Prompt

Write the system prompt targeting the specific failures you documented. Use this section structure:

1. **Role** — one sentence: what this agent is and what it does
2. **Inputs** — what the agent receives (explicit parameter names and types)
3. **Behavioral sections** — the actual logic (varies by agent purpose)
4. **Output format** — exact structure of what the agent returns
5. **Constraints** — what the agent must NOT do

Dispatch the agent again WITH the system prompt. Verify it no longer exhibits the documented failures.

## Frontmatter Conventions (Agent-Specific)

**Full field inventory: `creating-tools/frontmatter-reference.md`.** Only `name` and
`description` are platform-required. The conventions below are what an agent author decides.

**`description` — what it is for, and when Claude should delegate to it.** The official
contract for the agent field is *"When Claude should delegate to this subagent."* Write the
capability and the trigger together, in third person. Do not narrate the agent's internal
steps — a procedure summary becomes a shortcut Claude takes instead of reading the body.
`agents/architect.md` and `agents/researcher.md` are the reference examples.

**`tools` — a strict allowlist when present.**

- **Omit it** and the agent inherits every tool available to subagents. This is correct for
  most agents.
- **Declare it** and the agent receives *only* what you list. There are no implicit additions:
  if the agent needs `Read`, `Grep`, or `Glob`, list them. Omitting them does not fall back to
  a default — the agent simply will not have them.
- An entry that resolves to no real tool makes the agent fail to launch, naming the entry.
- To preload skills, use `skills:` — do not list `Skill` here.
- To deny specific tools from an inherited set, use `disallowedTools` (camelCase).

> **`allowed-tools` is a skill field and is silently ignored in an agent file.** It is not an
> error — the key is dropped and the agent runs with every tool. After declaring tool
> frontmatter, diff what you declared against what the agent listing renders. They must match.

**`model` — repo policy, not a platform requirement.** The platform defaults to `inherit`. This
repo requires an explicit pin so dispatch cost is a deliberate choice and the model-pinning hook
can see it. Both short aliases (`sonnet`, `haiku`) and full IDs are platform-valid; repo-authored
agents use full IDs. Check the model-pinning hook before choosing a form — it may match only one.

- `claude-sonnet-4-6` — complex multi-step reasoning, plan review, cross-file analysis
- `claude-haiku-4-5-20251001` — lookups, simple extraction, single-pass tasks

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

## Gotchas

1. **Writing the system prompt before the baseline invocation.** The Iron Law has no exceptions. If you start drafting content before running the bare dispatch, you are building without evidence — delete it and run the baseline first.
2. **Describing the agent's internal procedure in its description.** Say what the agent is for and when Claude should delegate to it. A description that narrates the steps becomes a shortcut Claude follows instead of reading the system prompt.
3. **Declaring `tools:` without listing everything the agent needs.** The allowlist is strict — omitted tools are absent, including `Read`, `Grep`, and `Glob`. Omit the field entirely if the agent should inherit the full set.
4. **Writing `allowed-tools:` in an agent file.** That is the skill field. In an agent it is silently ignored and the agent runs unrestricted. Agents use `tools:` to allow and `disallowedTools:` to deny.
5. **Omitting `model:`.** Repo policy requires an explicit pin with rationale. The platform would default to `inherit` — that is why the policy exists, not a reason to skip it.
6. **Trusting a declaration you have not seen rendered.** Frontmatter keys that Claude Code does not recognize are dropped without error. Diff declared against rendered before assuming a restriction is in force.

## STOP: Deployment Checklist

After writing the agent, complete all of these before starting any other work:

- [ ] Baseline invocation run and failures documented verbatim
- [ ] System prompt written addressing documented failures
- [ ] Agent dispatched WITH system prompt — baseline failures resolved
- [ ] `name:` field present, lowercase-with-hyphens, no `:` character
- [ ] `description:` states what the agent is for and when Claude should delegate to it
- [ ] `model:` field present with explicit selection rationale (repo policy)
- [ ] `tools:` either absent (inherits all) or lists **every** tool the agent needs
- [ ] No `allowed-tools:` key — that is the skill field and is ignored here
- [ ] Declared tool frontmatter diffed against what the agent listing renders
- [ ] Pressure scenarios run per `testing-agents-with-subagents.md`
- [ ] Agent file placed at `agents/<name>.md`
- [ ] Committed to git
