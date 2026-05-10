# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent.

The methodological prefix is auto-prepended by `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs` when the prompt's first non-empty line is `[role: implementer]`. Dispatch authors construct only the variable suffix below — the prefix is stable across dispatches and shows up in the prompt cache.

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  model: <selected per Task Reference Complexity column; A1 frontmatter pinning may override>
  prompt: |
    [role: implementer]

    Task N: [task name]
    **Model:** <chosen-model> — <one-line rationale, e.g. "mechanical: 1 file, clear spec">
    Work from: <directory>

    ## Task Description

    [FULL TEXT of task from plan — paste it here, don't make subagent read file]

    ## Context

    [Scene-setting: where this fits, dependencies, architectural context]

    [Optional: any task-specific guidance, e.g., "this task touches a hook — match existing patterns in .claude/hooks/preToolUse/"]
```

**What the auto-prepended prefix contains** (`prefixes/implementer.md`, version-tracked):
- Role declaration
- Before You Begin (ask-before-guessing guidance)
- Your Job (1–6 step checklist)
- Code Organization principles
- When You're In Over Your Head (escalation criteria)
- Self-Review checklist (Completeness / Quality / Discipline / Testing)
- Report Format (Status enum, what to include)

**Variable suffix authoring rules:**
- First non-empty line MUST be the marker `[role: implementer]`. The hook strips it.
- The Plan Anchor block (Task 3 / B2) sits immediately above `Task N:` once that task ships.
- Everything else is per-task variable content — never methodological.
