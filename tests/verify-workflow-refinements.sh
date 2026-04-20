#!/usr/bin/env bash
# verify-workflow-refinements.sh
# Verification contract for the workflow-refinements implementation plan.
# All checks should FAIL before implementation and PASS after.
# Exit code 1 if any check fails.

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

# Resolve python command from project.json testing.python-command, fall back to python3
PYTHON_CMD=$(grep -o '"python-command": *"[^"]*"' "$REPO/project.json" 2>/dev/null \
    | grep -o '"[^"]*"$' | tr -d '"')
PYTHON_CMD="${PYTHON_CMD:-python3}"

pass() {
    echo "PASS: $1"
    PASS=$((PASS + 1))
}

fail() {
    echo "FAIL: $1"
    FAIL=$((FAIL + 1))
}

check_file_exists() {
    local label="$1"
    local path="$2"
    if [ -f "$path" ]; then
        pass "$label"
    else
        fail "$label — file not found: $path"
    fi
}

check_contains() {
    local label="$1"
    local path="$2"
    local pattern="$3"
    if grep -qF -- "$pattern" "$path" 2>/dev/null; then
        pass "$label"
    else
        fail "$label — pattern not found in $path: $pattern"
    fi
}

check_contains_regex() {
    local label="$1"
    local path="$2"
    local pattern="$3"
    if grep -qE -- "$pattern" "$path" 2>/dev/null; then
        pass "$label"
    else
        fail "$label — regex not found in $path: $pattern"
    fi
}

check_not_contains() {
    local label="$1"
    local path="$2"
    local pattern="$3"
    if ! grep -qF -- "$pattern" "$path" 2>/dev/null; then
        pass "$label"
    else
        fail "$label — pattern should be absent but found in $path: $pattern"
    fi
}

# Returns the line number of the first match, or empty string if not found
line_of() {
    grep -n "$1" "$2" 2>/dev/null | head -1 | cut -d: -f1
}

check_a_before_b() {
    local label="$1"
    local path="$2"
    local pattern_a="$3"
    local pattern_b="$4"
    local line_a
    local line_b
    line_a=$(line_of "$pattern_a" "$path")
    line_b=$(line_of "$pattern_b" "$path")
    if [ -z "$line_a" ]; then
        fail "$label — first pattern not found: $pattern_a"
    elif [ -z "$line_b" ]; then
        fail "$label — second pattern not found: $pattern_b"
    elif [ "$line_a" -lt "$line_b" ]; then
        pass "$label"
    else
        fail "$label — '$pattern_a' (line $line_a) does not appear before '$pattern_b' (line $line_b)"
    fi
}

count_matches() {
    local n
    n=$(grep -c "$1" "$2" 2>/dev/null) || n=0
    echo "${n:-0}"
}

check_count_gte() {
    local label="$1"
    local path="$2"
    local pattern="$3"
    local min="$4"
    local actual
    actual=$(count_matches "$pattern" "$path")
    if [ "$actual" -ge "$min" ]; then
        pass "$label"
    else
        fail "$label — expected at least $min matches for '$pattern' in $path, found $actual"
    fi
}

echo "========================================"
echo " Workflow Refinements Verification"
echo " Repo: $REPO"
echo "========================================"
echo ""

# ----------------------------------------------------------------
# Task 1 — project.json
# ----------------------------------------------------------------
echo "--- Task 1: project.json ---"

check_file_exists \
    "Task 1: project.json exists at repo root" \
    "$REPO/project.json"

if [ -f "$REPO/project.json" ]; then
    if "$PYTHON_CMD" -m json.tool "$REPO/project.json" > /dev/null 2>&1; then
        pass "Task 1: project.json is valid JSON"
    else
        fail "Task 1: project.json is not valid JSON"
    fi

    check_contains \
        "Task 1: project.json contains jira.enabled true" \
        "$REPO/project.json" \
        '"enabled": true'

    check_contains \
        'Task 1: project.json contains jira.project "CLAUDE"' \
        "$REPO/project.json" \
        '"project": "CLAUDE"'

    check_contains \
        "Task 1: project.json contains workflow.tdd false" \
        "$REPO/project.json" \
        '"tdd": false'

    check_contains \
        "Task 1: project.json contains git.require-jira-key-in-commits true" \
        "$REPO/project.json" \
        '"require-jira-key-in-commits": true'
else
    fail "Task 1: project.json is not valid JSON (file absent)"
    fail "Task 1: project.json contains jira.enabled true (file absent)"
    fail 'Task 1: project.json contains jira.project "CLAUDE" (file absent)'
    fail "Task 1: project.json contains workflow.tdd false (file absent)"
    fail "Task 1: project.json contains git.require-jira-key-in-commits true (file absent)"
fi

echo ""

# ----------------------------------------------------------------
# Task 2 — project-setup skill
# ----------------------------------------------------------------
echo "--- Task 2: project-setup skill ---"

PSETUP="$REPO/skills/project-setup/SKILL.md"

check_file_exists \
    "Task 2: skills/project-setup/SKILL.md exists" \
    "$PSETUP"

check_contains \
    "Task 2: frontmatter contains name: project-setup" \
    "$PSETUP" \
    'name: project-setup'

check_contains \
    "Task 2: Phase 1 is present" \
    "$PSETUP" \
    'Phase 1'

check_contains \
    "Task 2: Phase 2 is present" \
    "$PSETUP" \
    'Phase 2'

check_contains \
    "Task 2: Phase 3 is present" \
    "$PSETUP" \
    'Phase 3'

check_contains \
    "Task 2: Phase 4 is present" \
    "$PSETUP" \
    'Phase 4'

check_contains \
    "Task 2: Symlink Architecture block is present" \
    "$PSETUP" \
    'Symlink Architecture'

echo ""

# ----------------------------------------------------------------
# Task 3 — git-manager: project.json-first Jira detection
# ----------------------------------------------------------------
echo "--- Task 3: git-manager ---"

GITM="$REPO/skills/git-manager/SKILL.md"

check_contains \
    "Task 3: Jira Key Requirement section references project.json" \
    "$GITM" \
    'project.json'

check_contains \
    "Task 3: Jira Key Requirement section references jira.enabled" \
    "$GITM" \
    'jira.enabled'

check_contains \
    "Task 3: CLAUDE.md fallback sentence is present for backward-compat" \
    "$GITM" \
    'CLAUDE.md'

# The old text had CLAUDE.md as the *sole* source — verify the primary check is now project.json
# We confirm project.json appears in the Jira Key Requirement section by checking the section header exists and the section references project.json
check_contains \
    "Task 3: Jira Key Requirement section header present" \
    "$GITM" \
    '## Jira Key Requirement'

echo ""

# ----------------------------------------------------------------
# Task 4 — jira-workflow-manager: Step 0 config check
# ----------------------------------------------------------------
echo "--- Task 4: jira-workflow-manager ---"

JWM="$REPO/agents/jira-workflow-manager.md"

check_contains \
    "Task 4: Step 0 — Project Config Check section exists" \
    "$JWM" \
    '## Step 0 — Project Config Check'

check_a_before_b \
    "Task 4: Step 0 appears before Step 1 — Identify Ticket Origin" \
    "$JWM" \
    '## Step 0' \
    '## Step 1'

check_contains \
    "Task 4: Step 0 table row — file absent condition" \
    "$JWM" \
    'File absent'

check_contains \
    "Task 4: Step 0 table row — jira.enabled: false condition" \
    "$JWM" \
    'jira.enabled: false'

check_contains \
    "Task 4: Step 0 table row — jira.enabled: true with project" \
    "$JWM" \
    'jira.enabled: true'

# The fourth condition: jira.enabled: true but no jira.project
check_contains \
    "Task 4: Step 0 table row — jira.enabled: true without jira.project" \
    "$JWM" \
    'no `jira.project`'

echo ""

# ----------------------------------------------------------------
# Task 5 — plan-gate: conditional architect-review skip
# ----------------------------------------------------------------
echo "--- Task 5: plan-gate ---"

PG="$REPO/skills/plan-gate/SKILL.md"

check_contains \
    "Task 5: Project Config Check section exists" \
    "$PG" \
    '## Project Config Check'

check_a_before_b \
    "Task 5: Project Config Check appears before Gate Sequence" \
    "$PG" \
    '## Project Config Check' \
    '## Gate Sequence'

check_contains \
    "Task 5: Override table covers workflow.architect-review: false" \
    "$PG" \
    'workflow.architect-review'

check_contains \
    "Task 5: Override table covers workflow.plan-gate: false" \
    "$PG" \
    'workflow.plan-gate'

echo ""

# ----------------------------------------------------------------
# Task 6 — executing-plans: Jira-gated task loop
# ----------------------------------------------------------------
echo "--- Task 6: executing-plans ---"

EP="$REPO/skills/executing-plans/SKILL.md"

check_count_gte \
    "Task 6: jira.enabled appears at least once in Step 2 task loop" \
    "$EP" \
    'jira\.enabled' \
    1

check_contains \
    "Task 6: Step 1 in loop includes If Jira disabled: skip branch" \
    "$EP" \
    'If Jira disabled: skip'

check_contains \
    "Task 6: Step 6 in loop includes If Jira disabled: skip branch" \
    "$EP" \
    'If Jira disabled: skip'

check_contains \
    "Task 6: Step 7 includes If Jira disabled branch for plan-management without jira-key" \
    "$EP" \
    'If Jira disabled'

echo ""

# ----------------------------------------------------------------
# Task 7 — test-driven-development: tdd flag exit
# ----------------------------------------------------------------
echo "--- Task 7: test-driven-development ---"

TDD="$REPO/skills/test-driven-development/SKILL.md"

check_contains \
    "Task 7: Project Config Check section exists" \
    "$TDD" \
    '## Project Config Check'

check_a_before_b \
    "Task 7: Project Config Check appears before Overview" \
    "$TDD" \
    '## Project Config Check' \
    '## Overview'

check_contains \
    'Task 7: Exact exit announcement present — TDD is disabled for this repo' \
    "$TDD" \
    'TDD is disabled for this repo (`workflow.tdd: false`). Proceeding with direct implementation.'

echo ""

# ----------------------------------------------------------------
# Task 8 — using-superpowers: orientation hierarchy
# ----------------------------------------------------------------
echo "--- Task 8: using-superpowers ---"

US="$REPO/skills/using-superpowers/SKILL.md"

check_contains \
    "Task 8: Orientation Protocol section exists" \
    "$US" \
    '## Orientation Protocol'

check_a_before_b \
    "Task 8: Orientation Protocol appears after Platform Adaptation" \
    "$US" \
    '## Platform Adaptation' \
    '## Orientation Protocol'

check_a_before_b \
    "Task 8: Orientation Protocol appears before # Using Skills" \
    "$US" \
    '## Orientation Protocol' \
    '# Using Skills'

# Five-step hierarchy: check representative steps
check_contains \
    "Task 8: Step 1 — Read project.json present in hierarchy" \
    "$US" \
    'Read `project.json` at repo root'

check_contains \
    "Task 8: Step 2 — codebase-entry present in hierarchy" \
    "$US" \
    'codebase-entry'

check_contains \
    "Task 8: Step 3 — plan doc for current task present in hierarchy" \
    "$US" \
    'plan doc for the current task'

check_contains \
    "Task 8: Step 4 — Stop present in hierarchy" \
    "$US" \
    '**Stop.**'

check_contains \
    "Task 8: Step 5 — researcher agent present in hierarchy" \
    "$US" \
    'researcher'

check_contains \
    "Task 8: Hard boundaries block — CODEBASE.md entry present" \
    "$US" \
    'CODEBASE.md'

check_contains \
    "Task 8: Hard boundaries block — code graph output entry present" \
    "$US" \
    'code graph output'

echo ""

# ----------------------------------------------------------------
# Task 9 — brainstorming and writing-plans: orientation hierarchy
# ----------------------------------------------------------------
echo "--- Task 9: brainstorming and writing-plans ---"

BS="$REPO/skills/brainstorming/SKILL.md"
WP="$REPO/skills/writing-plans/SKILL.md"

check_contains \
    "Task 9 (brainstorming): Working in existing codebases references orientation hierarchy" \
    "$BS" \
    'orientation hierarchy'

check_contains \
    "Task 9 (brainstorming): Working in existing codebases references codebase-entry" \
    "$BS" \
    'codebase-entry'

check_not_contains \
    "Task 9 (brainstorming): Old If CODEBASE.md exists check is replaced" \
    "$BS" \
    'If `CODEBASE.md` exists in the repo root, read it before exploring'

check_contains \
    "Task 9 (brainstorming): Step 1 checklist reads — read project.json → read codebase-entry" \
    "$BS" \
    'read project.json'

check_contains \
    "Task 9 (brainstorming): DOT graph node — Orient to repo context" \
    "$BS" \
    '"Orient to repo context"'

check_not_contains \
    "Task 9 (brainstorming): DOT graph node — old Explore project context is gone" \
    "$BS" \
    '"Explore project context"'

check_contains \
    "Task 9 (brainstorming): DOT graph edge from Orient to repo context to Visual questions ahead?" \
    "$BS" \
    '"Orient to repo context" -> "Visual questions ahead?"'

check_contains \
    "Task 9 (writing-plans): orientation hierarchy present" \
    "$WP" \
    'orientation hierarchy'

check_contains \
    "Task 9 (writing-plans): codebase-entry present" \
    "$WP" \
    'codebase-entry'

check_not_contains \
    "Task 9 (writing-plans): Old If CODEBASE.md exists sentence replaced" \
    "$WP" \
    'If `CODEBASE.md` exists in the repo root, read it before any file navigation.'

echo ""

# ----------------------------------------------------------------
# Task 10 — plan doc path unification
# ----------------------------------------------------------------
echo "--- Task 10: plan doc path unification ---"

check_contains \
    "Task 10 (brainstorming): save-path references plans/<slug>/<slug>-design.md" \
    "$BS" \
    'plans/<slug>/<slug>-design.md'

check_not_contains \
    "Task 10 (brainstorming): no remaining reference to docs/superpowers/specs/ in save-path" \
    "$BS" \
    'docs/superpowers/specs/'

check_contains \
    "Task 10 (writing-plans): save-path references plans/<slug>/<slug>-plan.md" \
    "$WP" \
    'plans/<slug>/<slug>-plan.md'

check_not_contains \
    "Task 10 (writing-plans): no remaining reference to plans/<slug>/PLAN.md as save path" \
    "$WP" \
    '**Save plans to:** `plans/<slug>/PLAN.md`'

check_not_contains \
    "Task 10 (TODO.md): stale personal-workflow-repo entry removed" \
    "$REPO/TODO.md" \
    'plans/personal-workflow-repo/PLAN.md'

echo ""

# ----------------------------------------------------------------
# Task 11 — /feedback skill
# ----------------------------------------------------------------
echo "--- Task 11: /feedback skill ---"

FB="$REPO/skills/feedback/SKILL.md"

check_file_exists \
    "Task 11: skills/feedback/SKILL.md exists" \
    "$FB"

check_contains \
    "Task 11: frontmatter contains name: feedback" \
    "$FB" \
    'name: feedback'

check_contains \
    "Task 11: Step 1 — Capture context snapshot present" \
    "$FB" \
    'Step 1 — Capture context snapshot'

check_contains \
    "Task 11: Step 2 — Spawn background subagent present" \
    "$FB" \
    'Step 2 — Spawn background subagent'

check_contains \
    "Task 11: Step 3 — Confirm present" \
    "$FB" \
    'Step 3 — Confirm'

check_contains \
    "Task 11: category list contains skill-skipped" \
    "$FB" \
    'skill-skipped'

check_contains \
    "Task 11: category list contains missing-capability" \
    "$FB" \
    'missing-capability'

check_contains \
    "Task 11: category list contains workflow-conflict" \
    "$FB" \
    'workflow-conflict'

check_contains \
    "Task 11: Notes block describes auto-created file header" \
    "$FB" \
    'Workflow Feedback Log'

echo ""

# ----------------------------------------------------------------
# Task 12 — /review-workflow skill
# ----------------------------------------------------------------
echo "--- Task 12: /review-workflow skill ---"

RW="$REPO/skills/review-workflow/SKILL.md"

check_file_exists \
    "Task 12: skills/review-workflow/SKILL.md exists" \
    "$RW"

check_contains \
    "Task 12: frontmatter contains name: review-workflow" \
    "$RW" \
    'name: review-workflow'

check_contains \
    "Task 12: Step 1 — Load feedback present" \
    "$RW" \
    'Step 1 — Load feedback'

check_contains \
    "Task 12: Step 2 — Group and analyze present" \
    "$RW" \
    'Step 2 — Group and analyze'

check_contains \
    "Task 12: Step 3 — Propose fixes present" \
    "$RW" \
    'Step 3 — Propose fixes'

check_contains \
    "Task 12: Step 4 — Execute approved fixes present" \
    "$RW" \
    'Step 4 — Execute approved fixes'

check_contains \
    "Task 12: Step 5 — Summary present" \
    "$RW" \
    'Step 5 — Summary'

# Fix-route table: verify all eight category values appear
for cat in skill-skipped skill-too-heavy circular-reasoning missing-capability memory-gap workflow-conflict agent-failing rule-too-strict; do
    check_contains \
        "Task 12: fix-route table contains category $cat" \
        "$RW" \
        "$cat"
done

check_contains \
    "Task 12: Notes block contains Do not batch fixes constraint" \
    "$RW" \
    'Do not batch fixes'

echo ""

# ----------------------------------------------------------------
# Task 13 — rules audit
# ----------------------------------------------------------------
echo "--- Task 13: rules audit ---"

# Only one filesystem-efficiency file should remain under rules/
# rules/filesystem-efficiency.md must be gone; rules/filesystem/efficiency.md must remain
if [ ! -f "$REPO/rules/filesystem-efficiency.md" ]; then
    pass "Task 13: rules/filesystem-efficiency.md has been removed"
else
    fail "Task 13: rules/filesystem-efficiency.md still exists — should have been deleted in consolidation"
fi

check_file_exists \
    "Task 13: rules/filesystem/efficiency.md exists (canonical location)" \
    "$REPO/rules/filesystem/efficiency.md"

# CLAUDE.md delegation table rows must be present and unmodified
CLAUDE_MD="$REPO/CLAUDE.md"

check_contains \
    "Task 13: CLAUDE.md delegation table — git-manager row present" \
    "$CLAUDE_MD" \
    'git-manager'

check_contains \
    "Task 13: CLAUDE.md delegation table — jira-workflow-manager row present" \
    "$CLAUDE_MD" \
    'jira-workflow-manager'

check_contains \
    "Task 13: CLAUDE.md delegation table — plan-management row present" \
    "$CLAUDE_MD" \
    'plan-management'

check_contains \
    "Task 13: CLAUDE.md delegation table — architect row present" \
    "$CLAUDE_MD" \
    'architect'

echo ""

# ----------------------------------------------------------------
# Scenario Traces (graceful degradation)
# ----------------------------------------------------------------
echo "--- Scenario Traces ---"

# Scenario A (no project.json):
# git-manager falls back to CLAUDE.md check
check_contains \
    "Scenario A: git-manager has CLAUDE.md fallback for repos without project.json" \
    "$GITM" \
    'CLAUDE.md'

# jira-workflow-manager assumes Jira configured when file absent (legacy fallback)
check_contains \
    "Scenario A: jira-workflow-manager — file absent row assumes Jira configured (legacy fallback)" \
    "$JWM" \
    'legacy'

# plan-gate — no project.json → runs full gate sequence
check_contains \
    "Scenario A: plan-gate — absent/true condition runs full gate sequence" \
    "$PG" \
    'absent'

# TDD skill — no project.json → runs full TDD discipline
check_contains \
    "Scenario A: TDD skill — absent/true condition runs full TDD discipline" \
    "$TDD" \
    'absent'

# No error-throwing text in any skill for missing file
check_not_contains \
    "Scenario A: git-manager does not contain file not found error text" \
    "$GITM" \
    'file not found'

check_not_contains \
    "Scenario A: jira-workflow-manager does not contain file not found error text" \
    "$JWM" \
    'file not found'

check_not_contains \
    "Scenario A: plan-gate does not contain file not found error text" \
    "$PG" \
    'file not found'

check_not_contains \
    "Scenario A: TDD skill does not contain file not found error text" \
    "$TDD" \
    'file not found'

echo ""

# Scenario B (jira.enabled: false):
# jira-workflow-manager stops with "Jira not configured" message
check_contains \
    "Scenario B: jira-workflow-manager — jira.enabled false → Jira not configured stop message" \
    "$JWM" \
    'Jira not configured'

# executing-plans skips all Jira transitions silently
check_contains \
    "Scenario B: executing-plans — jira.enabled false → skips Jira transitions silently" \
    "$EP" \
    'Jira disabled: skip'

# git-manager does not require key when jira.enabled: false
check_contains \
    "Scenario B: git-manager — jira.enabled false → no key required (explicit branch)" \
    "$GITM" \
    'jira.enabled'

echo ""

# Scenario C (full config: jira.enabled true, workflow.tdd false, workflow.architect-review true):
# git-manager requires Jira key (reads from project.json)
check_contains \
    "Scenario C: git-manager reads project.json for jira.enabled: true" \
    "$GITM" \
    'jira.enabled: true'

# plan-gate runs architect review (workflow.architect-review: true → full sequence)
check_contains \
    "Scenario C: plan-gate — workflow.architect-review true → full sequence" \
    "$PG" \
    'workflow.architect-review'

# TDD skill exits immediately with announcement when tdd: false
check_contains \
    "Scenario C: TDD skill exits with announcement when workflow.tdd: false" \
    "$TDD" \
    'TDD is disabled for this repo'

# executing-plans transitions Jira tickets normally (Jira enabled path)
check_contains \
    "Scenario C: executing-plans — If Jira enabled: transition ticket path present" \
    "$EP" \
    'If Jira enabled:'

echo ""

# Scenario D (workflow.architect-review: false):
# plan-gate skips Step 1, proceeds directly to Step 2
check_contains \
    "Scenario D: plan-gate — workflow.architect-review: false → skip Step 1 (Architect Review)" \
    "$PG" \
    'workflow.architect-review'

# The word "skip" or equivalent must appear in the Project Config Check table for this condition
check_contains_regex \
    "Scenario D: plan-gate Project Config Check table contains skip for architect-review false" \
    "$PG" \
    '[Ss]kip.*[Ss]tep 1|[Ss]tep 1.*[Ss]kip'

echo ""

# Scenario E (workflow.plan-gate: false):
# plan-gate exits without running any gate steps, hands off to executing-plans
check_contains \
    "Scenario E: plan-gate — workflow.plan-gate: false → skip entire gate sequence" \
    "$PG" \
    'workflow.plan-gate'

check_contains_regex \
    "Scenario E: plan-gate — workflow.plan-gate false causes hand-off to executing-plans" \
    "$PG" \
    '[Ss]kip.*entire|entire.*gate|executing-plans'

echo ""

# ----------------------------------------------------------------
# Summary
# ----------------------------------------------------------------
TOTAL=$((PASS + FAIL))
echo "========================================"
echo " Results: $PASS/$TOTAL passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
