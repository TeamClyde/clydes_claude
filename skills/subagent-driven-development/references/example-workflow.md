# Example Workflow

A step-by-step walkthrough of a 2-task plan execution using Subagent-Driven Development.

```
You: I'm using Subagent-Driven Development to execute this plan.

[Read plan file once: docs/superpowers/plans/feature-plan.md]
[Extract all 5 tasks with full text and context]
[Create TodoWrite with all tasks]

Task 1: Hook installation script

[Get Task 1 text and context (already extracted)]
[Assert entry gate: E1 ✅ active-plan confirmed, E2 ✅ no prior task (Task 1), E3 ✅ prompt read]
[Dispatch implementation subagent with full task text + context]

Implementer: "Before I begin - should the hook be installed at user or system level?"

You: "User level (~/.config/superpowers/hooks/)"

Implementer: "Got it. Implementing now..."
[Later] Implementer:
  - Implemented install-hook command
  - Added tests, 5/5 passing
  - Self-review: Found I missed --force flag, added it
  - Committed

[Dispatch spec compliance reviewer + code quality reviewer IN PARALLEL (Shape A, two lenses)]
Spec reviewer:    ✅ Spec compliant - all requirements met, nothing extra
Code reviewer:    ✅ Strengths: Good test coverage, clean. Issues: None. Approved.
[Both lenses clean — no combined findings to fix]

[Mark Task 1 row ✅ in plan Task Reference]
[Pulser n/a — no skill created in this task]
[Assert exit gate: X1 ✅ row marked, X2 n/a (no divergence), X3 ✅ handoff refreshed, X4 n/a (no test-mechanics change)]
[Mark Task 1 complete in TodoWrite]

Task 2: Recovery modes

[Get Task 2 text and context (already extracted)]
[Assert entry gate: E1 ✅ active-plan confirmed, E2 ✅ Task 1 row marked, E3 ✅ prompt read]
[Dispatch implementation subagent with full task text + context]

Implementer: [No questions, proceeds]
Implementer:
  - Added verify/repair modes
  - 8/8 tests passing
  - Self-review: All good
  - Committed

[Dispatch spec compliance reviewer + code quality reviewer IN PARALLEL (Shape A, two lenses)]
Spec reviewer:    ❌ Issues:
  - Missing: Progress reporting (spec says "report every 100 items")
  - Extra: Added --json flag (not requested)
Code reviewer:    ⚠ Issues (Important): Magic number (100)

[Compile combined findings from both lenses]
Combined: (1) Missing progress reporting, (2) Spurious --json flag, (3) Magic number 100

[Implementer fixes all combined findings in one pass]
Implementer: Removed --json flag, added progress reporting with PROGRESS_INTERVAL constant

[Re-dispatch BOTH reviewers IN PARALLEL again (Shape A re-review)]
Spec reviewer:    ✅ Spec compliant now
Code reviewer:    ✅ Approved

[Both lenses clean]

[Mark Task 2 row ✅ in plan Task Reference]
[Pulser n/a — no skill created in this task]
[Assert exit gate: X1 ✅ row marked, X2 ✅ journal entry appended via plan-management:divergence (scope shift: removed --json flag, added progress reporting), X3 ✅ handoff refreshed, X4 n/a]
[Mark Task 2 complete in TodoWrite]

...

[After all tasks]
[Dispatch final code-reviewer]
Final reviewer: All requirements met, ready to merge

Done!
```
