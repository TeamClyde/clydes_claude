#!/usr/bin/env bash
# verify-restructure.sh — Acceptance tests for the personal-workflow-repo restructure plan.
#
# Run after all 8 tasks are complete:
#   bash scripts/verify-restructure.sh
#
# Each check exits non-zero and prints a FAIL message on the first failure, or
# prints PASS and continues. A final summary reports the total pass/fail count.
#
# Scenarios covered (from plans/personal-workflow-repo/PLAN.md Testing Contract
# and Manual Verification Steps):
#   1.  setup.sh syntax valid
#   2.  setup.sh has no stale output/ references
#   3.  Agents count == 7
#   4.  todo-manager.md present in ~/.claude/agents/
#   5.  Skills count == 19
#   6.  skills/git-manager symlink target contains no "output/" segment
#   7.  Rules .md count == 7
#   8.  rules/filesystem/ directory symlink present and target contains no "output/"
#   9.  rules/filesystem/efficiency.md resolves through the directory symlink
#  10.  CLAUDE.md symlink target contains no "output/" segment
#  11.  pre-commit hook symlink target contains no "output/" segment
#  12.  docs/ contains exactly 10 .md files
#  13.  plans/ contains only personal-workflow-repo/ (or is absent after Task 8)
#  14.  PII: no "woosh air" or "wooshair" in tracked files
#  15.  PII: no "@wooshair" or "jason@" in tracked files
#  16.  PII: no "wooshair.atlassian" or ".atlassian.net" in tracked files
#  17.  mcp-settings.json has no real credential values
#  18.  git working tree is clean
#
# NOTE: Checks 3-11 require that setup.sh has already been run (--force) at least
# once so that ~/.claude/ symlinks exist. Run setup.sh before this script.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

# ── helpers ────────────────────────────────────────────────────────────────────

pass() { echo "  PASS  $1"; ((PASS++)) || true; }
fail() { echo "  FAIL  $1"; ((FAIL++)) || true; }

check_count() {
  local label="$1" actual="$2" expected="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    pass "$label — count $actual (expected $expected)"
  else
    fail "$label — count $actual (expected $expected)"
  fi
}

# ── 1. setup.sh syntax ─────────────────────────────────────────────────────────

echo ""
echo "=== 1. setup.sh syntax ==="
if bash -n "$REPO_ROOT/scripts/setup.sh" 2>/dev/null; then
  pass "bash -n scripts/setup.sh exits 0 with no output"
else
  fail "bash -n scripts/setup.sh reported syntax errors"
fi

# ── 2. No stale output/ references in setup.sh ─────────────────────────────────

echo ""
echo "=== 2. No stale output/ references in setup.sh ==="
hits=$(grep -c "output/" "$REPO_ROOT/scripts/setup.sh" 2>/dev/null || true)
if [[ "$hits" -eq 0 ]]; then
  pass "grep output/ scripts/setup.sh — no hits"
else
  fail "grep output/ scripts/setup.sh — found $hits hit(s); stale SOURCE_DIR or hardcoded path remains"
fi

# ── 3. Agents count ────────────────────────────────────────────────────────────

echo ""
echo "=== 3. Agents count ==="
if [[ -d "$HOME/.claude/agents" ]]; then
  agent_count=$(ls "$HOME/.claude/agents/" | wc -l | tr -d ' ')
  check_count "~/.claude/agents/ entry count" "$agent_count" 7
else
  fail "~/.claude/agents/ directory not found — run setup.sh --force first"
fi

# ── 4. todo-manager.md present ─────────────────────────────────────────────────

echo ""
echo "=== 4. todo-manager.md present in ~/.claude/agents/ ==="
if [[ -e "$HOME/.claude/agents/todo-manager.md" ]]; then
  pass "~/.claude/agents/todo-manager.md exists"
else
  fail "~/.claude/agents/todo-manager.md not found — Task 2 may be incomplete"
fi

# ── 5. Skills count ────────────────────────────────────────────────────────────

echo ""
echo "=== 5. Skills count ==="
if [[ -d "$HOME/.claude/skills" ]]; then
  skill_count=$(ls "$HOME/.claude/skills/" | wc -l | tr -d ' ')
  check_count "~/.claude/skills/ entry count" "$skill_count" 19
else
  fail "~/.claude/skills/ directory not found — run setup.sh --force first"
fi

# ── 6. git-manager symlink target has no output/ ──────────────────────────────

echo ""
echo "=== 6. git-manager symlink has no output/ in target ==="
if [[ -L "$HOME/.claude/skills/git-manager" ]]; then
  target=$(readlink "$HOME/.claude/skills/git-manager")
  if echo "$target" | grep -q "output/"; then
    fail "readlink ~/.claude/skills/git-manager contains 'output/': $target"
  else
    pass "readlink ~/.claude/skills/git-manager — no 'output/' segment: $target"
  fi
else
  fail "~/.claude/skills/git-manager is not a symlink or does not exist"
fi

# ── 7. Rules .md count ─────────────────────────────────────────────────────────

echo ""
echo "=== 7. Rules .md count ==="
if [[ -d "$HOME/.claude/rules" ]]; then
  rule_count=$(ls "$HOME/.claude/rules/"*.md 2>/dev/null | wc -l | tr -d ' ')
  check_count "~/.claude/rules/*.md count" "$rule_count" 7
else
  fail "~/.claude/rules/ directory not found — run setup.sh --force first"
fi

# ── 8. rules/filesystem/ directory symlink ─────────────────────────────────────

echo ""
echo "=== 8. rules/filesystem/ directory symlink ==="
if [[ -L "$HOME/.claude/rules/filesystem" ]]; then
  target=$(readlink "$HOME/.claude/rules/filesystem")
  if echo "$target" | grep -q "output/"; then
    fail "readlink ~/.claude/rules/filesystem contains 'output/': $target"
  else
    pass "readlink ~/.claude/rules/filesystem — no 'output/' segment: $target"
  fi
else
  fail "~/.claude/rules/filesystem is not a symlink — directory symlink step may be missing from setup.sh"
fi

# ── 9. rules/filesystem/efficiency.md resolves ────────────────────────────────

echo ""
echo "=== 9. rules/filesystem/efficiency.md resolves through directory symlink ==="
if [[ -f "$HOME/.claude/rules/filesystem/efficiency.md" ]]; then
  pass "~/.claude/rules/filesystem/efficiency.md exists and is a regular file"
else
  fail "~/.claude/rules/filesystem/efficiency.md not accessible — directory symlink may be broken"
fi

# ── 10. CLAUDE.md symlink target has no output/ ───────────────────────────────

echo ""
echo "=== 10. CLAUDE.md symlink has no output/ in target ==="
if [[ -L "$HOME/.claude/CLAUDE.md" ]]; then
  target=$(readlink "$HOME/.claude/CLAUDE.md")
  if echo "$target" | grep -q "output/"; then
    fail "readlink ~/.claude/CLAUDE.md contains 'output/': $target"
  else
    pass "readlink ~/.claude/CLAUDE.md — no 'output/' segment: $target"
  fi
else
  fail "~/.claude/CLAUDE.md is not a symlink or does not exist"
fi

# ── 11. pre-commit hook symlink target has no output/ ─────────────────────────

echo ""
echo "=== 11. pre-commit hook symlink has no output/ in target ==="
if [[ -L "$HOME/.claude/hooks/pre-commit" ]]; then
  target=$(readlink "$HOME/.claude/hooks/pre-commit")
  if echo "$target" | grep -q "output/"; then
    fail "readlink ~/.claude/hooks/pre-commit contains 'output/': $target"
  else
    pass "readlink ~/.claude/hooks/pre-commit — no 'output/' segment: $target"
  fi
else
  fail "~/.claude/hooks/pre-commit is not a symlink or does not exist"
fi

# ── 12. docs/ contains exactly 10 .md files ───────────────────────────────────

echo ""
echo "=== 12. docs/ contains 10 .md files ==="
if [[ -d "$REPO_ROOT/docs" ]]; then
  doc_count=$(ls "$REPO_ROOT/docs/"*.md 2>/dev/null | wc -l | tr -d ' ')
  check_count "docs/*.md count" "$doc_count" 10
else
  fail "docs/ directory not found — Task 4 may not be complete"
fi

# ── 13. plans/ contains only personal-workflow-repo/ (or is absent) ───────────

echo ""
echo "=== 13. plans/ contains only personal-workflow-repo/ (or is absent) ==="
if [[ ! -d "$REPO_ROOT/plans" ]]; then
  pass "plans/ directory is absent — fully cleaned up (Task 8 complete)"
else
  unexpected=$(ls "$REPO_ROOT/plans/" | grep -v "^personal-workflow-repo$" || true)
  if [[ -z "$unexpected" ]]; then
    pass "plans/ contains only personal-workflow-repo/ — all numbered subdirectories removed"
  else
    fail "plans/ contains unexpected entries: $unexpected — Task 4 git mv may be incomplete"
  fi
fi

# ── 14. PII: no wooshair / woosh air ──────────────────────────────────────────

echo ""
echo "=== 14. PII audit: no 'woosh air' or 'wooshair' ==="
pii_hits=$(git -C "$REPO_ROOT" grep -i -l "woosh air\|wooshair" -- '*.md' '*.json' '*.sh' '*.py' '*.yaml' '*.yml' 2>/dev/null || true)
if [[ -z "$pii_hits" ]]; then
  pass "git grep 'woosh air|wooshair' — no hits in tracked files"
else
  fail "git grep found 'woosh air' or 'wooshair' in: $pii_hits"
fi

# ── 15. PII: no @wooshair / jason@ ────────────────────────────────────────────

echo ""
echo "=== 15. PII audit: no '@wooshair' or 'jason@' ==="
pii_hits=$(git -C "$REPO_ROOT" grep -i -l "@wooshair\|jason@" -- '*.md' '*.json' '*.sh' '*.py' '*.yaml' '*.yml' 2>/dev/null || true)
if [[ -z "$pii_hits" ]]; then
  pass "git grep '@wooshair|jason@' — no hits in tracked files"
else
  fail "git grep found '@wooshair' or 'jason@' in: $pii_hits"
fi

# ── 16. PII: no wooshair.atlassian / .atlassian.net ──────────────────────────

echo ""
echo "=== 16. PII audit: no internal Atlassian workspace URLs ==="
pii_hits=$(git -C "$REPO_ROOT" grep -i -l "wooshair\.atlassian\|\.atlassian\.net" -- '*.md' '*.json' '*.sh' 2>/dev/null || true)
if [[ -z "$pii_hits" ]]; then
  pass "git grep Atlassian workspace URLs — no hits in tracked files"
else
  fail "git grep found internal Atlassian URLs in: $pii_hits"
fi

# ── 17. mcp-settings.json has no real credentials ─────────────────────────────

echo ""
echo "=== 17. mcp-settings.json has no real credential values ==="
mcp_file="$REPO_ROOT/templates/mcp-settings.json"
if [[ ! -f "$mcp_file" ]]; then
  fail "templates/mcp-settings.json not found"
else
  # Check that BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD are absent or empty/placeholder
  username_val=$(python3 -c "
import json, sys
with open('$mcp_file') as f:
    d = json.load(f)
servers = d.get('mcpServers', {})
bb = servers.get('bitbucket', {})
env = bb.get('env', {})
u = env.get('BITBUCKET_USERNAME', '')
p = env.get('BITBUCKET_APP_PASSWORD', '')
# Non-empty values that aren't obvious placeholders are suspicious
suspicious = []
for name, val in [('BITBUCKET_USERNAME', u), ('BITBUCKET_APP_PASSWORD', p)]:
    if val and val not in ('', '<your-username>', '<your-app-password>', 'YOUR_USERNAME', 'YOUR_APP_PASSWORD'):
        suspicious.append(name)
if suspicious:
    print('SUSPICIOUS:' + ','.join(suspicious))
else:
    print('OK')
" 2>/dev/null || echo "PARSE_ERROR")
  if [[ "$username_val" == "OK" ]]; then
    pass "templates/mcp-settings.json — no real credential values detected"
  elif [[ "$username_val" == "PARSE_ERROR" ]]; then
    fail "templates/mcp-settings.json — failed to parse JSON (python3 required)"
  else
    fail "templates/mcp-settings.json — suspicious credential fields: ${username_val#SUSPICIOUS:}"
  fi
fi

# ── 18. Clean working tree ─────────────────────────────────────────────────────

echo ""
echo "=== 18. Git working tree is clean ==="
status=$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | grep -v "^??" || true)
if [[ -z "$status" ]]; then
  pass "git status — nothing to commit (untracked files ignored per .gitignore)"
else
  fail "git status — working tree has staged or modified files:
$status"
fi

# ── Summary ────────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "══════════════════════════════════════════════"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
