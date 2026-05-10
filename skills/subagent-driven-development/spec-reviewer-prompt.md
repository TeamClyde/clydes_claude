# Spec Compliance Reviewer Prompt Template

Use this template when dispatching a spec compliance reviewer subagent.

**Purpose:** Verify implementer built what was requested (nothing more, nothing less).

The methodological prefix is auto-prepended by `.claude/hooks/preToolUse/subagent-prefix-prepend.mjs` when the prompt's first non-empty line is `[role: spec-reviewer]`. Dispatch authors construct only the variable suffix below.

```
Task tool (general-purpose):
  description: "Review spec compliance for Task N"
  prompt: |
    [role: spec-reviewer]

    ## What Was Requested

    [FULL TEXT of task requirements]

    ## What Implementer Claims They Built

    [From implementer's report]
```

**What the auto-prepended prefix contains** (`prefixes/spec-reviewer.md`, version-tracked):
- Role declaration
- "Do Not Trust the Report" verification stance
- Scope: missing requirements / extra work / misunderstandings
- Report Format (✅ compliant / ❌ issues with file:line)

**Variable suffix authoring rules:**
- First non-empty line MUST be the marker `[role: spec-reviewer]`.
- Only "What Was Requested" + "What Implementer Claims" go in the suffix.
