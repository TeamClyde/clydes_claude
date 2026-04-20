# Test Scenario: Task 3 — `writing-rules` Authoring Guidance

**Status:** FAILING — `skills/writing-rules/` does not exist yet.

**Methodology:** Subagent pressure-scenario dispatch per `skills/writing-skills/testing-skills-with-subagents.md`.

---

## Setup

Run `setup.sh --force` to symlink `skills/writing-rules/` into `~/.claude/skills/` before dispatching any subagent.

**Reference files for format comparison:**
- `rules/mcp-governance.md` — canonical global rule (no frontmatter)
- `rules/cspell.md` — canonical global rule (no frontmatter)

---

## Scenario A — Global rule path

**Dispatch prompt:**
> "Create a rule that prevents Claude from calling Jira MCP tools directly — all Jira operations must go through the jira-workflow-manager agent."

**Pass criteria:**
- Produced file has no `paths:` frontmatter field.
- Produced file format matches existing global rules (`rules/mcp-governance.md`, `rules/cspell.md`) — no YAML frontmatter block at all.
- Content is a directive (procedural, scannable), not philosophical prose.
- File is placed in `rules/`.

**Failure mode:**
- Produced file includes a `paths:` frontmatter field when none was requested.
- Produced file includes any YAML frontmatter when the rule should be global.
- Content is written as prose paragraphs rather than a decision table or short procedural steps.

---

## Scenario B — Path-scoped rule path

**Dispatch prompt:**
> "Create a rule that applies only inside the `src/lambdas/` directory — require a docstring on every Lambda handler function."

**Pass criteria:**
- Produced file includes `paths:` frontmatter with a pattern covering `src/lambdas/`.
- Produced file is otherwise formatted as a scannable directive.

**Failure mode:**
- Produced file has no `paths:` frontmatter (treated as a global rule when it should be scoped).
- `paths:` pattern is malformed or does not match the requested directory.

---

## Scenario C — Authoring principles applied

**Applies to produced files from Scenarios A and B.**

**Pass criteria:**
- Rule file is scannable: uses a decision table or short procedural steps rather than paragraph prose.
- Rule file addresses a single concern (no multi-topic rules).
- Rule is procedural and specific — tells Claude what to do, not what values to hold.

**Failure mode:**
- Rule file contains philosophical framing ("It is important that...", "Claude should strive to...").
- Rule file addresses multiple unrelated concerns in one file.

---

## Scenario D — No eval loop recommendation

**Applies to any run of `writing-rules`.**

**Pass criteria:**
- `writing-rules` does not recommend running `skill-creator` eval, automated scoring, or any automated pipeline for rules.
- `writing-rules` explicitly states that rule validation is observational (watch compliance in live sessions).

**Failure mode:**
- `writing-rules` recommends running `run_eval.py`, `skill-creator:skill-creator`, or any automated scoring tool for a rules file.
- `writing-rules` omits any guidance on how rules are validated.

---

## Scenario E — Correct discrimination (skill vs rule boundary)

**Dispatch prompt:**
> "Guide me through creating a new REST service endpoint — I want step-by-step instructions for building the handler, writing tests, and deploying it."

**Pass criteria:**
- `writing-rules` recognizes this as a process guide request, not a constraint rule.
- Skill redirects: explains this should be a skill (on-demand process guide), not a rule (always-on constraint), and declines to produce a rule file.

**Failure mode:**
- `writing-rules` attempts to produce a rule file for an on-demand process workflow.
- `writing-rules` accepts the request without questioning whether a rule is the right artifact type.

---

## Scope Boundary Note

Registration of new rules in `rules/new-repo-setup.md` is Task 5's responsibility. Do not test or assert that criterion as part of Task 3. Test only the file format, placement, and authoring guidance provided by `writing-rules`.
