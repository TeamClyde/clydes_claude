# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable).

**Only dispatch after spec compliance review passes.**

The methodological prefix is auto-prepended by `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs` when the prompt's first non-empty line is `[role: code-quality-reviewer]`. Dispatch authors construct only the variable suffix below.

**Dispatch contract:** Use the Agent tool (subagent_type as appropriate for code review in the current repo's plugin set — e.g., `general-purpose` or a code-reviewer subagent). The `[role: ...]` marker MUST be the first non-empty line of the `prompt` parameter — anything before it (template references, comments) breaks the hook's marker detection.

```
Agent dispatch:
  subagent_type: <code-reviewer agent>
  prompt: |
    [role: code-quality-reviewer]

    Use template at requesting-code-review/code-reviewer.md

    WHAT_WAS_IMPLEMENTED: [from implementer's report]
    PLAN_OR_REQUIREMENTS: Task N from [plan-file]
    BASE_SHA: [commit before task]
    HEAD_SHA: [current commit]
    DESCRIPTION: [task summary]
    ACTIVE_STACK_HATS: [repo's active hats, one line each; omit this line if no stacks declared — flag code violating any listed hat as an Issue]
```

**What the auto-prepended prefix contains** (`prefixes/code-quality-reviewer.md`, version-tracked):
- Role declaration
- In-addition-to-standard checks (file responsibility, decomposition, plan structure adherence, change-bounded file size)
- Report Format (Strengths / Issues / Assessment)

**Variable suffix authoring rules:**
- First non-empty line MUST be the marker `[role: code-quality-reviewer]`. Anything before the marker (including the legacy `Task tool (superpowers:code-reviewer):` directive, if used) blocks the hook from firing.
- The `Use template at requesting-code-review/code-reviewer.md` reference goes INSIDE the prompt (after the marker) as a directive to the subagent, not before the marker as a meta-comment.
- Only the per-task SHA range and task identifier go in the suffix below the template reference.
- The `ACTIVE_STACK_HATS:` line lists the repo's active hats (resolved by the orchestrator from `project.json` `stacks` + `~/.claude/stacks/<name>.md` `## Hat`). The reviewer flags any code that violates an active hat's best-practice as an Issue. Omit the line if no stacks are declared. See `rules/stack-hats.md`.
