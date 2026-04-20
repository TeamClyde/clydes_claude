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
