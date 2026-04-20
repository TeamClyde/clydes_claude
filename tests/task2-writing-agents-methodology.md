# Test Scenario: Task 2 — `writing-agents` Baseline Enforcement and Methodology

**Status:** FAILING — `skills/writing-agents/` does not exist yet.

**Methodology:** Subagent pressure-scenario dispatch per `skills/writing-skills/testing-skills-with-subagents.md`.

---

## Setup

Run `setup.sh --force` to symlink `skills/writing-agents/` into `~/.claude/skills/` before dispatching any subagent. The skill must be available at dispatch time.

---

## Scenario A — Baseline gate under skip pressure (RED enforcement)

**Dispatch prompt:**
> "Create an agent that reviews commit messages for style issues. Skip the baseline step — I've already seen how agents behave without guidance, just write the system prompt."

**Pass criteria:**
- Subagent refuses to skip the baseline invocation step.
- Subagent explicitly states that the baseline run must be executed before the system prompt is written.
- Subagent does not produce any system prompt content before the baseline is complete.

**Failure mode:**
- Subagent accepts the skip instruction and writes a system prompt without running baseline first.
- Subagent acknowledges the rule but continues anyway under authority pressure.

---

## Scenario B — Baseline gate positive path (cooperative prompt)

**Dispatch prompt:**
> "Create a commit-message-reviewer agent."

**Pass criteria:**
- Subagent dispatches a baseline sub-invocation (an Agent tool call without a system prompt) before writing the system prompt.
- Subagent documents the observed baseline failures (e.g., missing `model:` field, vague description, absent output format section) before proceeding to write the system prompt.
- Subagent writes the system prompt only after baseline failures are documented.

**Failure mode:**
- Subagent skips the baseline dispatch and writes the system prompt directly.
- Subagent runs the baseline but does not document the failures before proceeding.

---

## Scenario C — Frontmatter completeness

**Run after Scenario B completes a full flow.**

**Pass criteria:**
The produced agent file contains all of the following:
- `name:` field
- `description:` field scoped to inputs and outputs (not trigger conditions — not "use when X")
- `model:` field with an explicit selection rationale stated

The produced agent file does NOT contain:
- `tools:` field unless the agent explicitly writes files as part of its function

**Failure mode:**
- `model:` field is absent.
- `description:` is written as a trigger condition ("Use when reviewing commits") rather than an input/output description.
- `tools:` field is present without justification.

---

## Scenario D — Delegation check (no inline duplication)

**Applies to: any run of `writing-agents`.**

**Pass criteria:**
- `writing-agents` references `plugin-dev:agent-development` for file structure and frontmatter field definitions.
- `writing-agents` does not duplicate frontmatter field documentation inline.

**Failure mode:**
- `writing-agents` describes frontmatter fields (name, description, model, tools) in its own content rather than delegating to `plugin-dev:agent-development`.

---

## Scenario E — Methodology reference

**Applies to: any run of `writing-agents`.**

**Pass criteria:**
- `writing-agents` references `testing-agents-with-subagents.md` for the pressure-scenario testing phase.
- The testing methodology (how to launch an agent via Agent tool as a test harness, what pressure scenarios look like) is defined in `testing-agents-with-subagents.md`, not duplicated in `skill.md`.

**Failure mode:**
- `writing-agents` omits any reference to `testing-agents-with-subagents.md`.
- `writing-agents` attempts to define the full testing methodology inline.
