# Claude Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly and proceed on them.
- If multiple reasonable interpretations exist, pick the most likely one and name it.
- If a simpler approach exists, say so. Push back when warranted.
- Stop and ask when proceeding would cause real rework: destructive actions, ambiguity that can't be resolved by reasonable inference, or choices where being wrong wastes significant work.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
  1. [Step] → verify: [check]
  2. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Delegation — Mandatory

Route every operation through the correct abstraction. Never run git commands directly. Never call Jira MCP tools directly.

| Operation | Tool |
|-----------|------|
| Git commit, branch, push, PR, tag | `git-manager` skill (`Skill` tool) |
| Jira ticket creation, status transitions, updates | `jira-workflow-manager` agent (`Agent` tool) |
| Plan doc registration, TODO.md updates, archival | `plan-management` skill (`Skill` tool) |
| Independent plan/code review | `architect` agent (`Agent` tool, `subagent_type: architect`) |

## Architect Review — Mandatory

Invoke `architect` before:
- Execution begins (via `plan-gate` after `writing-plans`, or manually before `ExitPlanMode`)
- Any task transitions to Testing or Done

**Form A sub-plans require architect review identically to top-level plans.** When `writing-plans` runs for a sub-plan, plan-gate enters sub-plan mode and still runs architect (+ adherence-audit by default; architect-only with `mode: minimal`). See `skills/plan-gate/SKILL.md` § Sub-Plan Mode.

Skip for S-sized mechanical tasks (renaming, config-only, single-line fixes). Maximum 3 review iterations — surface BLOCKING issues to user after the third pass.

## Hard Prohibitions

- Never skip commit hooks (`--no-verify`) unless explicitly asked.
- Never stage with `git add -A` or `git add .` — always stage specific files.
- When `test-runner` returns FAILURE: invoke `systematic-debugging` before any fix attempt.
- One task in progress at a time. Complete and commit before starting the next.
