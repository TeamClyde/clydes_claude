---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes — requires reproducing the issue, isolating root cause, and validating the fix rather than guessing.
allowed-tools: Read, Bash, Grep, Glob, WebSearch, WebFetch
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue:
- Test failures
- Bugs in production
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Use this ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

**Don't skip when:**
- Issue seems simple (simple bugs have root causes too)
- You're in a hurry (rushing guarantees rework)
- Manager wants it fixed NOW (systematic is faster than thrashing)

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - They often contain the exact solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence in Multi-Component Systems**

   **WHEN system has multiple components (CI → build → signing, API → service → database):**

   **BEFORE proposing fixes, add diagnostic instrumentation:**
   ```
   For EACH component boundary:
     - Log what data enters component
     - Log what data exits component
     - Verify environment/config propagation
     - Check state at each layer

   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify failing component
   THEN investigate that specific component
   ```

   **Example (multi-layer system):**
   ```bash
   # Layer 1: Workflow
   echo "=== Secrets available in workflow: ==="
   echo "IDENTITY: ${IDENTITY:+SET}${IDENTITY:-UNSET}"

   # Layer 2: Build script
   echo "=== Env vars in build script: ==="
   env | grep IDENTITY || echo "IDENTITY not in environment"

   # Layer 3: Signing script
   echo "=== Keychain state: ==="
   security list-keychains
   security find-identity -v

   # Layer 4: Actual signing
   codesign --sign "$IDENTITY" --verbose=4 "$APP"
   ```

   **This reveals:** Which layer fails (secrets → workflow ✓, workflow → build ✗)

5. **Trace Data Flow**

   **WHEN error is deep in call stack:**

   See `root-cause-tracing.md` in this directory for the complete backward tracing technique.

   **Quick version:**
   - Where does bad value originate?
   - What called this with bad value?
   - Keep tracing up until you find the source
   - Fix at source, not at symptom

6. **Search Online for Library Quirks**

   If local code does not explain the error, web search the specific error message or
   framework behavior. Third-party library quirks (YAML date roundtrip, TOML escape
   sequences, regex backtracking, subprocess argument handling) are common root causes
   documented online but absent from the codebase.

7. **Enumerate All Candidate Hypotheses**

   **Before reading any implementation source files**, form a complete hypothesis table from
   the error output, stack traces, logs, and recent changes gathered above.

   | # | Hypothesis | Probability | Confirming signal to look for |
   |---|-----------|-------------|-------------------------------|
   | 1 | "X fails because Y" | High/Med/Low | What file/log would prove it |
   | … | … | … | … |

   Each hypothesis must be:
   - **Specific and falsifiable** — "navigation fails because DeviceSelector is absent when
     getMyDevices() returns empty" not "navigation is broken"
   - **Distinct** — if two hypotheses have the same confirming signal, merge them

   Do NOT proceed to Phase 2 until the table has at least one hypothesis. Do NOT fix anything
   until Phase 3 is complete.

   **When 3+ hypotheses exist:** Consider parallel investigation — dispatch one agent per
   hypothesis via `dispatching-parallel-agents`. Each agent reads the files relevant to its
   hypothesis and returns CONFIRMED / DENIED. Main context collects results and proceeds to
   Phase 4. This is faster than sequential investigation for multi-failure test runs.

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working code in same codebase
   - What works that's similar to what's broken?

2. **Compare Against References**
   - If implementing pattern, read reference implementation COMPLETELY
   - Don't skim - read every line
   - Understand the pattern fully before applying

3. **Identify Differences**
   - What's different between working and broken?
   - List every difference, however small
   - Don't assume "that can't matter"

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, environment?
   - What assumptions does it make?

### Phase 3: Hypothesis Validation

**Goal: confirm or deny every hypothesis in the table before fixing anything.**

For each hypothesis:

1. **Identify the 1–2 implementation files most likely to confirm or deny it**
   - Read them. Mark the hypothesis: **CONFIRMED / DENIED / UNRESOLVED**
   - One variable at a time — test each hypothesis independently

2. **3-file escalation rule**
   - If a hypothesis is still UNRESOLVED after reading 3 implementation files, stop reading
   - Do not add more files hoping to find confirmation
   - Mark it UNRESOLVED and escalate: state "I cannot confirm or deny this without more
     context" before proceeding

3. **Do not fix until the full table is marked**
   - Complete CONFIRMED / DENIED / UNRESOLVED for every row before touching any code
   - The goal is a complete picture, not the first actionable finding

4. **When You Don't Know**
   - Say "I don't understand X"
   - Don't pretend to know — mark the hypothesis UNRESOLVED
   - Ask for help or use `dispatching-parallel-agents` for parallel investigation

### Phase 4: Implementation

**Fix the root cause, not the symptom:**

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - Automated test if possible
   - One-off test script if no framework
   - MUST have before fixing
   - Use the `superpowers:test-driven-development` skill for writing proper failing tests

2. **Implement All Confirmed Fixes**
   - Address every CONFIRMED root cause from Phase 3 in a single code pass
   - One logical change per root cause — no "while I'm here" improvements
   - Apply all confirmed fixes before re-running tests
   - Do NOT re-run after fixing only some confirmed hypotheses — finish the batch first

3. **Verify Fix**
   - Test passes now?
   - No other tests broken?
   - Issue actually resolved?

4. **Phase 4 Exit Gate — Record Root Cause (mandatory before declaring debugging complete)**

   Once fix verification passes, invoke `plan-management:divergence` before closing out the debugging session:

   ```
   Skill {
     skill: "plan-management",
     args: "status: divergence plan-doc: <active-plan-path> summary: '<root cause confirmed + fix applied>' tag: [bug] plan-section: '<task or section where the bug was found>'"
   }
   ```

   The journal entry must include:
   - The confirmed root cause (from Phase 3's hypothesis table)
   - The fix that was applied
   - The commit hash(es) that contain the fix
   - Tag: `[bug]` for a single defect, or `[debug-cascade]` for a sequence of related bugs uncovered in the same debugging session

   **This call is mandatory.** Do not declare debugging complete, mark any task ✅, or return to the orchestrator until the divergence call has been made.

   **Exceptions (state explicitly when applying — never skip silently):**
   1. **One-off environmental glitch** with no learning to preserve (e.g., a flaky network blip that self-resolved, a CI restart that fixed a transient lock).
   2. **No active plan** (`.claude/active-plan` does not exist) — debugging is occurring outside a plan execution context. Record the root cause in the commit message body instead. State explicitly: "No active plan — recording root cause in commit message only."

   **Exit gate failure message:**
   > DEBUGGING EXIT GATE FAILED — plan-management:divergence not invoked. Cannot declare debugging complete until root cause and fix are journaled.

5. **If Fix Doesn't Work**
   - STOP
   - Count: How many fixes have you tried?
   - If < 3: Return to Phase 1, re-analyze with new information
   - **If ≥ 3: STOP. Surface root-cause hypothesis and remaining unknowns to the user. Do not attempt a fourth fix.** If the failure pattern fits step 6 below, frame the handoff as an architectural discussion.
   - DON'T attempt Fix #4 without surfacing to the user first

6. **If 3+ Fixes Failed: Question Architecture**

   **Pattern indicating architectural problem:**
   - Each fix reveals new shared state/coupling/problem in different place
   - Fixes require "massive refactoring" to implement
   - Each fix creates new symptoms elsewhere

   **STOP and question fundamentals:**
   - Is this pattern fundamentally sound?
   - Are we "sticking with it through sheer inertia"?
   - Should we refactor architecture vs. continue fixing symptoms?

   **Discuss with your human partner before attempting more fixes**

   This is NOT a failed hypothesis - this is a wrong architecture.

## Red Flags - STOP and Follow Process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- Fixing one confirmed hypothesis before all hypotheses are marked (skips the batch)
- Re-running tests after partial fixes rather than completing the full confirmed batch
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow
- **"One more fix attempt" (when already tried 2+)**
- **Each fix reveals new problem in different place**

**ALL of these mean: STOP. Return to Phase 1.**

**If 3+ fixes failed:** Question the architecture (see Phase 4.6)

## your human partner's Signals You're Doing It Wrong

**Watch for these redirections:**
- "Is that not happening?" - You assumed without verifying
- "Will it show us...?" - You should have added evidence gathering
- "Stop guessing" - You're proposing fixes without understanding
- "Ultrathink this" - Question fundamentals, not just symptoms
- "We're stuck?" (frustrated) - Your approach isn't working

**When you see these:** STOP. Return to Phase 1.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question pattern, don't fix again. |

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence, enumerate ALL hypotheses as table | Complete hypothesis table before reading implementation files |
| **2. Pattern** | Find working examples, compare working vs broken | Identify differences that map to hypotheses |
| **3. Validation** | Confirm/deny each hypothesis (3-file limit per hypothesis), parallel dispatch for 3+ | Every hypothesis marked CONFIRMED / DENIED / UNRESOLVED |
| **4. Implementation** | Create test, fix ALL confirmed hypotheses in one pass, verify with single re-run, invoke `plan-management:divergence` at exit | All confirmed root causes fixed, tests pass, root cause journaled with `[bug]` or `[debug-cascade]` tag |

## When Process Reveals "No Root Cause"

If systematic investigation reveals issue is truly environmental, timing-dependent, or external:

1. You've completed the process
2. Document what you investigated
3. Implement appropriate handling (retry, timeout, error message)
4. Add monitoring/logging for future investigation

**But:** 95% of "no root cause" cases are incomplete investigation.

## Supporting Techniques

These techniques are part of systematic debugging and available in this directory:

- **`root-cause-tracing.md`** - Trace bugs backward through call stack to find original trigger
- **`defense-in-depth.md`** - Add validation at multiple layers after finding root cause
- **`condition-based-waiting.md`** - Replace arbitrary timeouts with condition polling

**Related skills:**
- **superpowers:test-driven-development** - For creating failing test case (Phase 4, Step 1)
- **superpowers:verification-before-completion** - Verify fix worked before claiming success

## Real-World Impact

From debugging sessions:
- Systematic approach: 15-30 minutes to fix
- Random fixes approach: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%
- New bugs introduced: Near zero vs common

## Gotchas

1. Do not skip the baseline — reproduce the bug before attempting a fix, or you may fix the wrong thing.
2. Diagnose root cause before switching approaches — one failed attempt is not sufficient evidence to abandon the approach.
3. If three focused fixes fail, surface the diagnosis to the user before trying a fourth.
