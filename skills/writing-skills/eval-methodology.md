# Eval Methodology — Pulser CLI

**Load this when:** Phase 3 of the skill creation cycle — after RED-GREEN-REFACTOR is green and all loopholes are closed.

## Overview

Pulser is a local CLI tool for static skill linting, runtime eval, and trigger conflict detection. It uses the local `claude` CLI — no API key, no HTTP session required.

Install once: `npm install -g pulser-cli`

Source: https://github.com/TheStack-ai/pulser

## Phase 3 Steps

### Step 1: Static Lint

```bash
pulser --strict
```

Checks 8 rules:
1. Frontmatter integrity (`name` and `description` fields present, max 1024 chars)
2. Description quality (starts with "Use when", under 500 chars)
3. File size (under 500 lines)
4. Gotchas / common mistakes section present
5. Tool restrictions documented if skill invokes tools
6. Supporting file structure (no orphaned files)
7. Trigger keyword conflicts with existing skills
8. Usage logging hooks (if configured)

`--strict` treats warnings as errors. Always use `--strict` before deploying.

Auto-fix: `pulser --fix` (creates `.bak` backup). Rollback: `pulser undo`.

### Step 2: Write eval.yaml

Place alongside `SKILL.md` in the skill directory. Minimum 8 tests — mix positive (should trigger / produce expected output) and negative (adjacent topics that must NOT trigger).

```yaml
tests:
  - name: "core use case — should trigger"
    input: "I want to create a new skill"
    assert:
      - contains: "writing-skills"
      - min-length: 50

  - name: "editing existing skill — should trigger"
    input: "I need to improve my skill's description"
    assert:
      - contains: "writing-skills"

  - name: "negative — creating an agent is not this skill"
    input: "create an agent that reviews pull requests"
    assert:
      - not-contains: "writing-skills"

  - name: "negative — adjacent topic should not trigger"
    input: "how do I use the architect agent"
    assert:
      - not-contains: "writing-skills"
```

**Assertion types:**

| Type | Description |
|---|---|
| `contains: "text"` | Response must include this string |
| `not-contains: "text"` | Response must not include this string |
| `min-length: N` | Response must be at least N characters |
| `max-length: N` | Response must be at most N characters |
| `matches: "regex"` | Response must match the regex pattern |

### Step 3: Run Eval

```bash
pulser eval                        # all skills
pulser eval --skill <skill-name>   # single skill
```

Exit codes:
- `0` — all tests pass → proceed to deployment
- `1` — test failures → fix before deploying
- `3` — regression detected (previously passing test now fails) → block deployment

All tests must pass (exit 0). Regressions (exit 3) are hard blockers.

### Step 4: Resolve Trigger Conflicts

```bash
pulser                             # reports overlapping keywords between skills
```

If a conflict is flagged:
1. Refine the description to narrow the trigger.
2. Re-run `pulser` to confirm the conflict is resolved.
3. Re-run `pulser eval` to confirm tests still pass after the description change.

Do not deploy while a trigger conflict is unresolved.

### Step 5: Note Eval in Commit Message

```
feat: add writing-agents skill [pulser eval: 12/12 pass, no conflicts]
```

## Fallback Path (No API Key)

If `ANTHROPIC_API_KEY` is not set:
- Static lint (`pulser --strict`) runs normally — no API key needed.
- `pulser eval` runs in accuracy-only mode: grader logic fires, `improve_description.py` is skipped.
- Process completes without blocking.
- Note in commit message: `[pulser eval: accuracy-only, 12/12 pass]`

Accuracy-only mode is the standard path for this repo. It is not degraded behavior.

---

## Testing All Skill Types

Different skill types need different test approaches:

### Discipline-Enforcing Skills (rules/requirements)

**Examples:** TDD, verification-before-completion, designing-before-coding

**Test with:**
- Academic questions: Do they understand the rules?
- Pressure scenarios: Do they comply under stress?
- Multiple pressures combined: time + sunk cost + exhaustion
- Identify rationalizations and add explicit counters

**Success criteria:** Agent follows rule under maximum pressure

### Technique Skills (how-to guides)

**Examples:** condition-based-waiting, root-cause-tracing, defensive-programming

**Test with:**
- Application scenarios: Can they apply the technique correctly?
- Variation scenarios: Do they handle edge cases?
- Missing information tests: Do instructions have gaps?

**Success criteria:** Agent successfully applies technique to new scenario

### Pattern Skills (mental models)

**Examples:** reducing-complexity, information-hiding concepts

**Test with:**
- Recognition scenarios: Do they recognize when pattern applies?
- Application scenarios: Can they use the mental model?
- Counter-examples: Do they know when NOT to apply?

**Success criteria:** Agent correctly identifies when/how to apply pattern

### Reference Skills (documentation/APIs)

**Examples:** API documentation, command references, library guides

**Test with:**
- Retrieval scenarios: Can they find the right information?
- Application scenarios: Can they use what they found correctly?
- Gap testing: Are common use cases covered?

**Success criteria:** Agent finds and correctly applies reference information

---

## Common Rationalizations for Skipping Testing

| Excuse | Reality |
|--------|---------|
| "Skill is obviously clear" | Clear to you ≠ clear to other agents. Test it. |
| "It's just a reference" | References can have gaps, unclear sections. Test retrieval. |
| "Testing is overkill" | Untested skills have issues. Always. 15 min testing saves hours. |
| "I'll test if problems emerge" | Problems = agents can't use skill. Test BEFORE deploying. |
| "Too tedious to test" | Testing is less tedious than debugging bad skill in production. |
| "I'm confident it's good" | Overconfidence guarantees issues. Test anyway. |
| "Academic review is enough" | Reading ≠ using. Test application scenarios. |
| "No time to test" | Deploying untested skill wastes more time fixing it later. |

**All of these mean: Test before deploying. No exceptions.**

---

## Bulletproofing Skills Against Rationalization

Skills that enforce discipline (like TDD) need to resist rationalization. Agents are smart and will find loopholes when under pressure.

**Psychology note:** Understanding WHY persuasion techniques work helps you apply them systematically. See persuasion-principles.md for research foundation (Cialdini, 2021; Meincke et al., 2025) on authority, commitment, scarcity, social proof, and unity principles.

### Close Every Loophole Explicitly

Don't just state the rule - forbid specific workarounds:

**❌ Bad:**
```markdown
Write code before test? Delete it.
```

**✅ Good:**
```markdown
Write code before test? Delete it. Start over.

**No exceptions:**
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Don't look at it
- Delete means delete
```

### Address "Spirit vs Letter" Arguments

Add foundational principle early:

```markdown
**Violating the letter of the rules is violating the spirit of the rules.**
```

This cuts off entire class of "I'm following the spirit" rationalizations.

### Build Rationalization Table

Capture rationalizations from baseline testing. Every excuse agents make goes in the table:

```markdown
| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Tests after achieve same goals" | Tests-after = "what does this do?" Tests-first = "what should this do?" |
```

### Create Red Flags List

Make it easy for agents to self-check when rationalizing:

```markdown
## Red Flags - STOP and Start Over

- Code before test
- "I already manually tested it"
- "Tests after achieve the same purpose"
- "It's about spirit not ritual"
- "This is different because..."

**All of these mean: Delete code. Start over with TDD.**
```

### Update CSO for Violation Symptoms

Add to description: symptoms of when you're ABOUT to violate the rule:

```yaml
description: use when implementing any feature or bugfix, before writing implementation code
```

---

## RED-GREEN-REFACTOR for Skills

Follow the TDD cycle:

### RED: Write Failing Test (Baseline)

Run pressure scenario with subagent WITHOUT the skill. Document exact behavior:
- What choices did they make?
- What rationalizations did they use (verbatim)?
- Which pressures triggered violations?

This is "watch the test fail" - you must see what agents naturally do before writing the skill.

### GREEN: Write Minimal Skill

Write skill that addresses those specific rationalizations. Don't add extra content for hypothetical cases.

Run same scenarios WITH skill. Agent should now comply.

### REFACTOR: Close Loopholes

Agent found new rationalization? Add explicit counter. Re-test until bulletproof.

**Testing methodology:** See @testing-skills-with-subagents.md for the complete testing methodology:
- How to write pressure scenarios
- Pressure types (time, sunk cost, authority, exhaustion)
- Plugging holes systematically
- Meta-testing techniques

---

## Skill Creation Checklist (TDD Adapted)

**RED Phase - Write Failing Test:**
- [ ] Create pressure scenarios (3+ combined pressures for discipline skills)
- [ ] Run scenarios WITHOUT skill - document baseline behavior verbatim
- [ ] Identify patterns in rationalizations/failures

**GREEN Phase - Write Minimal Skill:**
- [ ] Name uses only letters, numbers, hyphens (no parentheses/special chars)
- [ ] YAML frontmatter with required `name` and `description` fields (max 1024 chars)
- [ ] Description starts with "Use when..." and includes specific triggers/symptoms
- [ ] Description written in third person
- [ ] Keywords throughout for search (errors, symptoms, tools)
- [ ] Clear overview with core principle
- [ ] Address specific baseline failures identified in RED
- [ ] Code inline OR link to separate file
- [ ] One excellent example (not multi-language)
- [ ] Run scenarios WITH skill - verify agents now comply

**REFACTOR Phase - Close Loopholes:**
- [ ] Identify NEW rationalizations from testing
- [ ] Add explicit counters (if discipline skill)
- [ ] Build rationalization table from all test iterations
- [ ] Create red flags list
- [ ] Re-test until bulletproof

**Phase 3 — Pulser Eval:**
- [ ] Run `pulser --strict` — fix all flagged issues
- [ ] Write `eval.yaml` with 8+ tests (positive and negative trigger coverage)
- [ ] Run `pulser eval --skill <skill-name>` — all tests pass (exit 0)
- [ ] Trigger conflict check: run `pulser` — no overlapping keywords with existing skills
- [ ] Note eval pass in commit message

**Quality Checks:**
- [ ] Small flowchart only if decision non-obvious
- [ ] Quick reference table
- [ ] Common mistakes section
- [ ] No narrative storytelling
- [ ] Supporting files only for tools or heavy reference
