# Test Scenario: Task 1 — `creating-tools` Routing Correctness

**Status:** FAILING — `skills/creating-tools/` does not exist yet.

**Methodology:** Subagent pressure-scenario dispatch per `skills/writing-skills/testing-skills-with-subagents.md`.

---

## Setup

Load `skills/creating-tools/skill.md` and `skills/creating-tools/routing-table.md` into the subagent context. Do not load any plugin-dev or skill-creator skills directly — `creating-tools` must trigger them via delegation.

---

## Scenario A — Skill routing (no direct plugin invocation)

**Dispatch prompt:**
> "I want to create a skill that helps engineers write better commit messages."

**Pass criteria:**
- Subagent invokes `writing-skills` (not `plugin-dev:skill-development` or `skill-creator` directly).
- Subagent produces no skill file content itself.
- `creating-tools` acts as coordinator only — all authoring is deferred.

**Failure mode:**
- Subagent invokes `plugin-dev:skill-development` or `skill-creator:skill-creator` directly (bypassing the orchestration layer).
- Subagent writes skill file content itself rather than delegating.

---

## Scenario B — Agent routing

**Dispatch prompt:**
> "I need to create an agent that triages Jira tickets."

**Pass criteria:**
- Subagent routes to `writing-agents` (and references `plugin-dev:agent-development` for structure).
- Subagent does not attempt to write agent frontmatter or system prompt content itself.
- `plugin-dev:agent-development` is referenced only via `writing-agents`, not invoked directly.

**Failure mode:**
- Subagent invokes `plugin-dev:agent-development` directly.
- Subagent writes agent file content without going through `writing-agents`.

---

## Scenario C — Rule routing

**Dispatch prompt:**
> "I need a new rule that prevents engineers from pushing directly to main."

**Pass criteria:**
- Subagent routes to `writing-rules` only.
- No other skill or plugin is invoked.

**Failure mode:**
- Subagent routes to `writing-skills`, `plugin-dev`, or any non-`writing-rules` destination.

---

## Scenario D — Hook routing

**Dispatch prompt:**
> "I want to add a hook that runs spellcheck before every commit."

**Pass criteria:**
- Subagent routes to `plugin-dev:hook-development` only.

**Failure mode:**
- Subagent routes to `writing-skills` or `creating-tools` attempts to write hook content directly.

---

## Scenario E — Command routing

**Dispatch prompt:**
> "I want to add a slash command that generates a PR description."

**Pass criteria:**
- Subagent routes to `plugin-dev:command-development` only.

**Failure mode:**
- Subagent routes to any other destination or writes command content itself.

---

## Scenario F — Full plugin routing

**Dispatch prompt:**
> "I want to create a full plugin that packages a custom linter for our team."

**Pass criteria:**
- Subagent routes to `plugin-dev:create-plugin` only.

**Failure mode:**
- Subagent routes to `writing-skills` or attempts to assemble a plugin without using `plugin-dev:create-plugin`.

---

## Scenario G — Ambiguity gate (pressure scenario)

**Dispatch prompt:**
> "I want to create a new workflow component — just get started, I'm in a hurry."

**Pass criteria:**
- Subagent asks a clarifying question about artifact type before routing anywhere.
- Subagent does not pick a route unilaterally under time pressure.

**Failure mode:**
- Subagent picks a route without confirming artifact type.
- Subagent makes an assumption and starts authoring content.

---

## Scenario H — Coordinator constraint (cross-scenario)

**Applies to all scenarios above.**

**Pass criteria:**
- In every routing scenario, `creating-tools` itself produces zero artifact content (no file content, no frontmatter, no system prompt text).
- All content production happens inside the delegated skill.

**Failure mode:**
- `creating-tools` produces any authoring output before the delegated skill is invoked.

---

## Log Monitoring Note

If `creating-tools` fires and the delegated skill also fires independently in the same session (double-invocation), the broad trigger and plugin skill triggers are conflicting. Log the exact prompt and treat it as a REFACTOR input per plan doc § Task 1.
