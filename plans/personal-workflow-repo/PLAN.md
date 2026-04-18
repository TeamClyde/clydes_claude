# Personal Workflow Repo Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT use the `superpowers:` prefix — invoke the local forked versions which have git-manager and plan-gate integration.

**Goal:** Transform this repo from a workflow design project into a living personal dotfiles repo for Claude Code, where `setup.sh` on a fresh machine fully restores all skills, agents, rules, hooks, and plugins.

**Architecture:** Flatten `output/` to repo root so the directory structure mirrors `~/.claude/` directly. Move internal design artifacts to `_archive/` (gitignored). Convert `plans/` design docs to public-readable `docs/`. Update `setup.sh` to reflect new paths, add plugin installation, and print a credentials reminder instead of merging secrets.

**Tech Stack:** Bash, git, JSON (mcp-settings.json), Markdown

---

## Task Reference

| # | Task | Size | Scope | Jira Key |
|---|------|------|-------|----------|
| 1 | Move `output/` deliverables to repo root | M | git mv agents, skills, rules, hooks, templates, CLAUDE.md | _(assigned at plan-gate)_ |
| 2 | Copy 5 untracked workflow files from `~/.claude/` | S | agents/todo-manager.md, rules/{mcp-governance,plan-docs,workflow-phases}.md, rules/filesystem/efficiency.md | _(assigned at plan-gate)_ |
| 3 | Archive internal artifacts + clean up local files | S | _archive/, .gitignore, ref_docs/ removal, empty output/ removal | _(assigned at plan-gate)_ |
| 4 | Build `docs/` from `plans/` | M | git mv 10 PLAN.md files to docs/, clean up plans/ | _(assigned at plan-gate)_ |
| 5 | Update `setup.sh` | M | scripts/setup.sh — path fix, rules subdir, plugins step, MCP notice | _(assigned at plan-gate)_ |
| 6 | Update `CLAUDE.md` and `README.md` | S | Root CLAUDE.md (global), README.md | _(assigned at plan-gate)_ |
| 7 | Security audit | S | All tracked files — grep for PII, credentials, internal company refs | _(assigned at plan-gate)_ |
| 8 | Verify: run `setup.sh --force` and check symlinks | S | scripts/setup.sh execution, ~/.claude/ symlink verification | _(assigned at plan-gate)_ |

---

## Current vs. Target State

### Current layout (tracked files)
```
claude-workflow-improvements/
├── CLAUDE.md                          ← project-specific instructions (to be replaced)
├── README.md
├── output/
│   ├── CLAUDE.md                      ← global CLAUDE.md (symlinked to ~/.claude/CLAUDE.md)
│   ├── agents/                        ← 6 agent .md files
│   ├── skills/                        ← 19 skill directories
│   ├── rules/                         ← 3 rule .md files (missing 4 untracked ones)
│   ├── hooks/pre-commit
│   └── templates/                     ← .pre-commit-config.yaml + 6 other files/dirs
├── plans/                             ← MAIN-PLAN.md + 9 numbered PLAN.md files + graphify-wrap/PLAN.md
├── docs/superpowers/specs/            ← spec files only (this plan's spec lives here)
└── scripts/setup.sh
```

### Target layout (after this plan)
```
claude-workflow-improvements/
├── CLAUDE.md                          ← global CLAUDE.md (symlinked to ~/.claude/CLAUDE.md)
├── README.md
├── agents/                            ← 7 agent .md files (6 existing + todo-manager)
├── skills/                            ← 19 skill directories
├── rules/                             ← 7 rule .md files + filesystem/ subdir
│   └── filesystem/
│       └── efficiency.md
├── hooks/pre-commit
├── templates/                         ← .pre-commit-config.yaml + 6 other files/dirs
├── docs/                              ← 10 public .md files + superpowers/
│   └── superpowers/specs/             ← unchanged
├── scripts/setup.sh
└── _archive/                          ← gitignored; holds internal design artifacts
```

---

## Task 1: Move `output/` deliverables to repo root

**Files:**
- Move (git mv): `output/agents/` → `agents/`
- Move (git mv): `output/skills/` → `skills/`
- Move (git mv): `output/rules/` → `rules/`
- Move (git mv): `output/hooks/` → `hooks/`
- Move (git mv): `output/templates/` → `templates/`
- Replace (git rm + git mv): root `CLAUDE.md` → removed; `output/CLAUDE.md` → `CLAUDE.md`
- Delete: `output/` directory (only untracked BUILD-STATUS.md and scripts/ remain)

- [ ] **Step 1: git mv all output/ subtrees to root**

Run these commands in order (each must succeed before the next):

```bash
cd /path/to/repo   # adjust to your actual repo root

git mv output/agents agents
git mv output/skills skills
git mv output/rules rules
git mv output/hooks hooks
git mv output/templates templates
```

Expected: no output, exit code 0 for each. If any reports "fatal: destination exists", stop and investigate — it means the target directory already has content.

- [ ] **Step 2: Replace the project CLAUDE.md with the global one**

The current root `CLAUDE.md` is project-specific instructions. `output/CLAUDE.md` is the global CLAUDE.md that should live at root and be symlinked to `~/.claude/CLAUDE.md`.

```bash
git rm CLAUDE.md
git mv output/CLAUDE.md CLAUDE.md
```

Expected: git rm shows `rm 'CLAUDE.md'`, git mv shows no output.

- [ ] **Step 3: Inspect remaining output/ contents before deleting**

After the git mv's, `output/` should contain only gitignored files. Verify before deleting:

```bash
ls -la output/
```

Expected: only `BUILD-STATUS.md` and `scripts/` remain. Both are gitignored (`output/BUILD-STATUS.md` and `output/scripts/` are in `.gitignore`). `output/scripts/` is an outdated duplicate of `scripts/` (superseded by the root `scripts/setup.sh`). Confirm its content is expendable:

```bash
ls output/scripts/
```

If `output/scripts/` contains anything unexpected (not a duplicate of `scripts/setup.sh`), investigate before deleting. Otherwise, proceed.

- [ ] **Step 4: Remove the now-empty output/ directory**

```bash
rm -rf output/
```

Verify it's gone:
```bash
ls output/ 2>&1
# Expected: "ls: cannot access 'output/': No such file or directory"
```

- [ ] **Step 5: Verify staging**

```bash
git status --short | head -30
```

Expected output shape: many lines of `R  output/agents/foo.md -> agents/foo.md` renames. No unexpected `D` or `??` lines for files that should have moved. CLAUDE.md should show as renamed from output/CLAUDE.md.

- [ ] **Step 6: Commit**

All renames are already staged by the `git mv` and `git rm` commands above. No additional staging needed.

```bash
git commit -m "chore: flatten output/ to repo root — mirror ~/.claude/ layout"
```

---

## Task 2: Copy 5 untracked workflow files from `~/.claude/`

**Files:**
- Create: `agents/todo-manager.md`
- Create: `rules/mcp-governance.md`
- Create: `rules/plan-docs.md`
- Create: `rules/workflow-phases.md`
- Create: `rules/filesystem/efficiency.md`

These 5 files exist in `~/.claude/` as real (non-symlinked) files that were never committed to the repo.

- [ ] **Step 1: Verify the source files exist in ~/.claude/**

```bash
ls -la ~/.claude/agents/todo-manager.md
ls -la ~/.claude/rules/mcp-governance.md
ls -la ~/.claude/rules/plan-docs.md
ls -la ~/.claude/rules/workflow-phases.md
ls -la ~/.claude/rules/filesystem/efficiency.md
```

Expected: all 5 show as regular files (not symlinks). If any shows as a symlink, check where it points — if it already points into this repo, it's already tracked and you can skip that one.

- [ ] **Step 2: Create the rules/filesystem/ subdirectory if needed**

After Task 1, `git mv output/rules rules` will have moved `output/rules/` to `rules/`, including any `output/rules/filesystem/` subdirectory if one existed. Check before creating:

```bash
ls rules/filesystem/ 2>/dev/null && echo "already exists" || mkdir -p rules/filesystem
```

Note: `rules/filesystem-efficiency.md` (a flat file) and `rules/filesystem/efficiency.md` (nested) are two distinct rule files that intentionally coexist. The flat `filesystem-efficiency.md` was already tracked in `output/rules/` and moves to `rules/` via Task 1. The nested `rules/filesystem/efficiency.md` is a separate rule file being added in this task. Both will be symlinked to `~/.claude/rules/` — the flat one as `~/.claude/rules/filesystem-efficiency.md`, the nested one's parent directory as `~/.claude/rules/filesystem/` (a directory symlink). The spec lists both in the target structure.

- [ ] **Step 3: Copy the files**

```bash
cp ~/.claude/agents/todo-manager.md agents/todo-manager.md
cp ~/.claude/rules/mcp-governance.md rules/mcp-governance.md
cp ~/.claude/rules/plan-docs.md rules/plan-docs.md
cp ~/.claude/rules/workflow-phases.md rules/workflow-phases.md
cp ~/.claude/rules/filesystem/efficiency.md rules/filesystem/efficiency.md
```

- [ ] **Step 4: Verify the copies look correct**

Spot-check each file — confirm they contain actual content (not empty, not just a path):

```bash
head -5 agents/todo-manager.md
head -5 rules/mcp-governance.md
head -5 rules/plan-docs.md
head -5 rules/workflow-phases.md
head -5 rules/filesystem/efficiency.md
```

Expected: each starts with a markdown heading or description of the agent/rule.

- [ ] **Step 5: Verify final rules/ count**

```bash
ls rules/*.md rules/filesystem/*.md
```

Expected: 6 .md files at `rules/*.md` — `filesystem-efficiency.md`, `mcp-governance.md`, `new-repo-setup.md`, `plan-docs.md`, `planning.md`, `workflow-phases.md` — plus `rules/filesystem/efficiency.md` (shown by the second glob). Total: 7 rule files across both paths. Both `rules/filesystem-efficiency.md` (flat, moved from output/ in Task 1) and `rules/filesystem/efficiency.md` (nested, copied here) intentionally coexist — they are distinct rule files. The flat file gets a flat symlink in `~/.claude/rules/`; the nested directory gets a directory symlink. Do not remove either one.

- [ ] **Step 6: Commit**

```bash
git add agents/todo-manager.md rules/mcp-governance.md rules/plan-docs.md rules/workflow-phases.md rules/filesystem/efficiency.md
git commit -m "chore: add 5 previously untracked workflow files from ~/.claude/"
```

---

## Task 3: Archive internal artifacts + clean up local files

**Files:**
- Create (local only): `_archive/`
- Modify: `.gitignore`

The following files are gitignored (exist locally, never committed). They're internal design artifacts that should be moved to `_archive/` so they're preserved locally but clearly separated:

- `plans/BENCHMARK-HANDOFF.md`
- `plans/BENCHMARK-RESULTS.md`
- `plans/REVIEW-PLAN.md`
- `plans/REVIEW-RESULTS.md`
- `plans/SETUP-TEST-RESULTS.md`
- `plans/TRACK3-HANDOFF.md`
- `plans/review/`
- `plans/test-fixtures/`
- `plans/06-plan-management/CATEGORIZATION-2026-03-18.md` (if it exists)

`ref_docs/` should be deleted entirely (internal company code, gitignored, never committed).

- [ ] **Step 1: Create _archive/ and move internal artifacts**

```bash
mkdir -p _archive

# Move internal plan artifacts (only if they exist locally)
for f in \
  plans/BENCHMARK-HANDOFF.md \
  plans/BENCHMARK-RESULTS.md \
  plans/REVIEW-PLAN.md \
  plans/REVIEW-RESULTS.md \
  plans/SETUP-TEST-RESULTS.md \
  plans/TRACK3-HANDOFF.md; do
  [ -f "$f" ] && mv "$f" _archive/ && echo "moved: $f"
done

# Move directories
[ -d plans/review ] && mv plans/review _archive/ && echo "moved: plans/review/"
[ -d plans/test-fixtures ] && mv plans/test-fixtures _archive/ && echo "moved: plans/test-fixtures/"
[ -f plans/06-plan-management/CATEGORIZATION-2026-03-18.md ] && mv plans/06-plan-management/CATEGORIZATION-2026-03-18.md _archive/ && echo "moved: CATEGORIZATION"
```

- [ ] **Step 2: Delete ref_docs/**

```bash
rm -rf ref_docs/
```

Confirm it's gone:
```bash
ls ref_docs/ 2>&1
# Expected: No such file or directory
```

- [ ] **Step 3: Update .gitignore**

Open `.gitignore` and make these changes:

**Add near the top (after the first comment block):**
```
# Local-only internal design artifacts (moved here during restructure)
_archive/
```

**Remove these now-obsolete entries** (paths that no longer exist after the restructure):
- `output/BUILD-STATUS.md` — `output/` is deleted in Task 1
- `output/scripts/` — same; `output/` is gone
- `ref_docs/` — directory deleted in Task 3 Step 2

**Add `_archive/`** near the top.

After editing, the complete `.gitignore` should be exactly:

```
# Local-only internal design artifacts (moved here during restructure)
_archive/

# Repo-specific Claude Code permissions (not part of the deliverable)
.claude/

# Internal design review artifacts (now moved to _archive/)
plans/review/
plans/test-fixtures/
plans/REVIEW-PLAN.md
plans/REVIEW-RESULTS.md
plans/BENCHMARK-HANDOFF.md
plans/BENCHMARK-RESULTS.md
plans/SETUP-TEST-RESULTS.md
plans/TRACK3-HANDOFF.md
plans/**/CATEGORIZATION-*.md
plans/**/HANDOFF.md
plans/**/TESTING.md

# Test harness for setup script
scripts/setup-test.sh

# Standard ignores
node_modules/
.DS_Store
*.pyc
__pycache__/
```

Removed from old .gitignore: `output/BUILD-STATUS.md`, `output/scripts/`, `ref_docs/`.

- [ ] **Step 4: Verify .gitignore works correctly**

```bash
git status --short
```

Expected: `_archive/` does NOT appear as `??` (it's ignored). `ref_docs/` does NOT appear. No unexpected tracked deletions.

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: add _archive/ for internal artifacts, remove stale .gitignore entries"
```

---

## Task 4: Build `docs/` from `plans/`

**Files:**
- Create (git mv): `docs/overview.md` ← `plans/MAIN-PLAN.md`
- Create (git mv): `docs/codebase-graph.md` ← `plans/01-infrastructure-as-code/PLAN.md`
- Create (git mv): `docs/jira-workflow.md` ← `plans/02-jira-integration/PLAN.md`
- Create (git mv): `docs/testing-system.md` ← `plans/03-testing-system/PLAN.md`
- Create (git mv): `docs/git-workflow.md` ← `plans/04-git-workflow/PLAN.md`
- Create (git mv): `docs/agent-architecture.md` ← `plans/05-agent-architecture/PLAN.md`
- Create (git mv): `docs/plan-management.md` ← `plans/06-plan-management/PLAN.md`
- Create (git mv): `docs/rules.md` ← `plans/07-rules/PLAN.md`
- Create (git mv): `docs/skills.md` ← `plans/08-skills/PLAN.md`
- Create (git mv): `docs/setup.md` ← `plans/09-setup/PLAN.md`
- Archive (git rm): `plans/01-infrastructure-as-code/graphify-wrap/PLAN.md` (implementation detail, not public doc)
- Delete: empty `plans/` subdirectories after moves

- [ ] **Step 1: git mv all PLAN.md files to docs/**

```bash
git mv plans/MAIN-PLAN.md docs/overview.md
git mv plans/01-infrastructure-as-code/PLAN.md docs/codebase-graph.md
git mv plans/02-jira-integration/PLAN.md docs/jira-workflow.md
git mv plans/03-testing-system/PLAN.md docs/testing-system.md
git mv plans/04-git-workflow/PLAN.md docs/git-workflow.md
git mv plans/05-agent-architecture/PLAN.md docs/agent-architecture.md
git mv plans/06-plan-management/PLAN.md docs/plan-management.md
git mv plans/07-rules/PLAN.md docs/rules.md
git mv plans/08-skills/PLAN.md docs/skills.md
git mv plans/09-setup/PLAN.md docs/setup.md
```

- [ ] **Step 2: Remove the graphify-wrap sub-plan (implementation detail)**

```bash
git rm plans/01-infrastructure-as-code/graphify-wrap/PLAN.md
```

This is an implementation detail plan for a specific tool wrapper — not appropriate as a public-facing doc. If you want to preserve it, move it to `_archive/` instead.

- [ ] **Step 3: Remove now-empty plans/ subdirectories**

```bash
rm -rf plans/01-infrastructure-as-code
rm -rf plans/02-jira-integration
rm -rf plans/03-testing-system
rm -rf plans/04-git-workflow
rm -rf plans/05-agent-architecture
rm -rf plans/06-plan-management
rm -rf plans/07-rules
rm -rf plans/08-skills
rm -rf plans/09-setup
```

The `plans/personal-workflow-repo/` directory (this plan doc) will still remain. That is expected — leave it in place until execution of the full plan is complete. It can be removed with `git rm -r plans/personal-workflow-repo/` at the end of Task 8 after all verifications pass, since the plan doc serves no purpose in the restructured dotfiles repo.

Verify remaining plans/ contents:
```bash
ls plans/
```

Expected: only `personal-workflow-repo/` remains (the current plan doc directory).

The `plans/` directory cannot yet be deleted since `personal-workflow-repo/` is still tracked.

- [ ] **Step 4: Verify docs/ has all 10 expected files**

```bash
ls docs/*.md
```

Expected output:
```
docs/agent-architecture.md
docs/codebase-graph.md
docs/git-workflow.md
docs/jira-workflow.md
docs/overview.md
docs/plan-management.md
docs/rules.md
docs/setup.md
docs/skills.md
docs/testing-system.md
```

`docs/superpowers/` directory should still be present (not affected by this task).

- [ ] **Step 5: Clean up internal content from docs/ files**

Read and edit each doc for public readability. The goal: remove internal task-tracking artifacts, keep architecture and rationale. This step requires judgment — treat these as design documentation, not project histories.

**Universal edits (apply to all 10 files):**
1. Remove any "Task Reference" or "Epic / Task Reference" table containing CLAUDE-N Jira keys
2. Remove all task checkboxes (`- [ ]`, `- [x]`) and their step content
3. Remove mentions of "Woosh Air", `@wooshair.com`, personal names, Jira workspace URLs
4. Remove "Status:", "Priority:", "Jira Project:" header fields if present
5. Keep: architecture descriptions, design rationale, how-it-works explanations, dependency graphs, file structure diagrams

**Per-file notes** (read each file and apply these on top of the universal edits):

**`docs/overview.md`** (from MAIN-PLAN.md): Has a subsystem index table with status columns. Remove the Status column — keep the subsystem name, description, and dependency relationships. Keep the dependency order diagram (the arrow graph showing subsystem build sequence).

**`docs/codebase-graph.md`** (from 01-infrastructure-as-code/PLAN.md): Covers the graphify tool and codebase knowledge graph. Keep the tool architecture, schema description, and how the knowledge graph works. Remove any internal deployment notes or references to specific internal repos.

**`docs/jira-workflow.md`** (from 02-jira-integration/PLAN.md): Covers the jira-workflow-manager agent. Keep the agent's interface contract, what operations it handles, and why Jira calls are delegated. Remove any internal workspace URLs or Jira project keys specific to this project.

**`docs/testing-system.md`** (from 03-testing-system/PLAN.md): Covers the test-strategy / test-builder pipeline. Keep the TDD sequence description, agent roles, and what the testing contract format looks like. Remove specific internal test fixtures or ticket references.

**`docs/git-workflow.md`** (from 04-git-workflow/PLAN.md): Covers the git-manager skill. Keep the commit format spec, branching conventions, and why git ops are delegated. Remove any Bitbucket workspace-specific details beyond the generic pattern.

**`docs/agent-architecture.md`** (from 05-agent-architecture/PLAN.md): Covers how agents are designed and invoked. Keep the agent invocation patterns, agent-vs-skill distinction, and agent definition format. This file likely has the most durable architecture content — be conservative about what you remove.

**`docs/plan-management.md`** (from 06-plan-management/PLAN.md): Covers TODO.md and plan doc lifecycle. Keep the plan doc structure requirements, TODO.md format, and the three-source sync (Jira + plan doc + TODO.md). Remove internal status tracking rows.

**`docs/rules.md`** (from 07-rules/PLAN.md): Covers the rules system. Keep descriptions of each rule file, what it enforces, and how rules load. Remove any internal ordering or delivery notes.

**`docs/skills.md`** (from 08-skills/PLAN.md): Covers the skills system. Keep skill format, invocation pattern, and descriptions of each skill's purpose. Remove internal delivery sequencing.

**`docs/setup.md`** (from 09-setup/PLAN.md): Covers setup.sh. Keep the install sequence description, what each step does, and prerequisites. Update any paths that still reference `output/` to reflect the new flat structure.

- [ ] **Step 6: Commit**

```bash
git add docs/ plans/
git commit -m "chore: promote plans/ to public docs/, remove internal task tracking"
```

---

## Task 5: Update `setup.sh`

**Files:**
- Modify: `scripts/setup.sh`

Four changes needed:
1. **Path fix**: `SOURCE_DIR="$REPO_ROOT/output"` → `SOURCE_DIR="$REPO_ROOT"` (and remove the variable entirely — just use `$REPO_ROOT`)
2. **rules/filesystem/ subdirectory**: Add symlink step for the directory unit
3. **Plugin installation**: New step after symlink steps, before MCP packages
4. **MCP credentials notice**: Step 8/9 prints a manual-setup reminder

- [ ] **Step 1: Fix SOURCE_DIR references**

In `scripts/setup.sh`, find and replace:

```bash
# BEFORE (line ~14):
SOURCE_DIR="$REPO_ROOT/output"

# AFTER: remove the SOURCE_DIR variable entirely.
# Replace every occurrence of "$SOURCE_DIR" with "$REPO_ROOT" throughout the file.
```

Every occurrence of `$SOURCE_DIR` in the file must become `$REPO_ROOT`. Use your editor's find-replace. After the change, verify `SOURCE_DIR` no longer appears in the file:

```bash
grep "SOURCE_DIR" scripts/setup.sh
# Expected: no output
```

- [ ] **Step 2: Add rules/filesystem/ directory symlink to Step 5**

Find the Step 5 block in `setup.sh` (around `echo "Step 5 — Symlinking rules and CLAUDE.md"`). After the loop that symlinks individual `.md` files, add:

```bash
# Symlink rules/filesystem/ subdirectory as a unit
install_symlink "$REPO_ROOT/rules/filesystem" "$HOME/.claude/rules/filesystem" "rules/filesystem/"
```

The complete Step 5 block should look like:

```bash
echo ""
echo "Step 5 — Symlinking rules and CLAUDE.md"

for rule_file in "$REPO_ROOT/rules/"*.md; do
  [[ -e "$rule_file" ]] || continue
  name=$(basename "$rule_file")
  install_symlink "$rule_file" "$HOME/.claude/rules/$name" "rules/$name"
done

# Symlink rules/filesystem/ subdirectory as a unit
install_symlink "$REPO_ROOT/rules/filesystem" "$HOME/.claude/rules/filesystem" "rules/filesystem/"

install_symlink "$REPO_ROOT/CLAUDE.md" "$HOME/.claude/CLAUDE.md" "CLAUDE.md"
```

- [ ] **Step 3: Add plugin installation step (new Step 7)**

The current steps 7–9 are MCP packages, MCP settings merge, and Summary. Insert a new "Step 7 — Installing Claude Code plugins" block **before** the current MCP packages step. Renumber the subsequent steps.

Add this block (insert it between the pre-commit hook step and the MCP packages step):

```bash
# ---------------------------------------------------------------------------
# Step 7 — Install Claude Code plugins
# ---------------------------------------------------------------------------

echo ""
echo "Step 7 — Installing Claude Code plugins"

PLUGINS=(
  "atlassian@claude-plugins-official"
  "aws-serverless@claude-plugins-official"
  "claude-code-setup@claude-plugins-official"
  "claude-md-management@claude-plugins-official"
  "commit-commands@claude-plugins-official"
  "context7@claude-plugins-official"
  "explanatory-output-style@claude-plugins-official"
  "feature-dev@claude-plugins-official"
  "plugin-dev@claude-plugins-official"
  "pyright-lsp@claude-plugins-official"
  "security-guidance@claude-plugins-official"
  "skill-creator@claude-plugins-official"
  "superpowers@claude-plugins-official"
)

for plugin in "${PLUGINS[@]}"; do
  if claude plugin install "$plugin" 2>/dev/null; then
    success "installed plugin: $plugin"
  else
    warn "plugin install may have failed: $plugin — run manually with: claude plugin install $plugin"
  fi
done
```

Then renumber the remaining steps:
- Old Step 7 (MCP packages) → **Step 8**
- Old Step 8 (MCP settings merge) → **Step 9**
- Old Step 9 (Summary) → **Step 10**

- [ ] **Step 4: Update the MCP settings step to print a credentials notice**

Find the MCP settings merge step (now Step 9). After the Python merge block that writes `settings.json`, add a credentials notice print statement:

```bash
# After the Python merge block closes (after the PYEOF line), add:
echo ""
echo "  ℹ  Add Bitbucket credentials manually to ~/.claude/settings.json:"
echo "       mcpServers.bitbucket.env.BITBUCKET_USERNAME"
echo "       mcpServers.bitbucket.env.BITBUCKET_APP_PASSWORD"
```

The merge logic itself stays — only credentials-setting code is removed (and there is none currently, since the template has no credentials). This step just adds the notice.

- [ ] **Step 5: Verify MCP template path is correct**

In the updated setup.sh, find the line that sets `MCP_TEMPLATE`. It should now be:

```bash
MCP_TEMPLATE="$REPO_ROOT/templates/mcp-settings.json"
```

Confirm this references the correct new path (not `$SOURCE_DIR/templates/...`).

- [ ] **Step 6: Syntax check setup.sh**

```bash
bash -n scripts/setup.sh
```

Expected: no output, exit code 0. If there are syntax errors, fix them before continuing.

- [ ] **Step 7: Commit**

```bash
git add scripts/setup.sh
git commit -m "chore: update setup.sh — flat paths, rules/filesystem symlink, plugin install, MCP notice"
```

---

## Task 6: Update `CLAUDE.md` and `README.md`

**Files:**
- Modify: `CLAUDE.md` (root — now the global CLAUDE.md)
- Modify: `README.md`

- [ ] **Step 1: Update root CLAUDE.md**

Read the current `CLAUDE.md` (which was moved from `output/CLAUDE.md` in Task 1). It contains the global Claude Code instructions (delegation table, architect review gates, workflow sequence).

Update these specific sections:

**Repository Structure section** — replace the old structure block with the new flat structure:

```markdown
## Repository Structure

```
claude-workflow-improvements/
├── CLAUDE.md                   — this file (global instructions, symlinked to ~/.claude/CLAUDE.md)
├── README.md                   — repo overview and restoration guide
├── agents/                     — agent definition files → symlinked to ~/.claude/agents/
├── skills/                     — skill directories → each symlinked to ~/.claude/skills/<name>/
├── rules/                      — rule .md files + filesystem/ subdir → symlinked to ~/.claude/rules/
│   └── filesystem/             — subdirectory, symlinked as a unit
├── hooks/
│   └── pre-commit              — global pre-commit hook → symlinked to ~/.claude/hooks/pre-commit
├── templates/                  — project templates (not symlinked; copied on use)
├── docs/                       — public-facing documentation
│   └── superpowers/specs/      — brainstorming and design specs
└── scripts/
    └── setup.sh                — idempotent installer
```
```

Remove any references to `output/` or `plans/MAIN-PLAN.md` in the Working in This Repo section. Update to reference `docs/overview.md` for the system overview.

**Working in This Repo section** — update to reflect new structure:

```markdown
## Working in This Repo

- Read `docs/overview.md` when starting a new session — it contains the system overview and integration picture.
- Workflow components live at the repo root, mirroring `~/.claude/` directly. Edit in place; symlinks keep ~/.claude/ in sync automatically.
- After adding or modifying a component, run `setup.sh --force` to recreate symlinks if needed.
```

Remove the "Sub-plan dependency order" diagram and "Cross-Plan Synchronization" section (those were project-specific planning artifacts, not relevant to the dotfiles repo).

- [ ] **Step 2: Update README.md**

Replace the full contents of `README.md` with the following (fill in the repo URL on the clone line):

```markdown
# claude-workflow-improvements

Personal Claude Code workflow dotfiles — agents, skills, rules, hooks, and plugins that install to `~/.claude/` via symlinks. Run `setup.sh` on any machine to restore the full workflow.

---

## Restore on a New Machine

```bash
git clone <repo-url>
cd claude-workflow-improvements
bash scripts/setup.sh
```

See [Prerequisites](#prerequisites) if the script reports missing tools.

---

## What Gets Installed

### Agents (7)

Invoked via the `Agent` tool with `subagent_type: <name>`.

| Agent | Role |
|-------|------|
| `architect` | Plan reviewer — returns BLOCKING / MINOR / APPROVED before ExitPlanMode or task completion |
| `integration-engineer` | Maps cross-repo endpoints and contracts using local codebase MCPs |
| `jira-workflow-manager` | All Jira operations: ticket creation, status transitions, comments |
| `researcher` | Codebase and infrastructure lookups — keeps search out of the main context window |
| `test-builder` | Writes failing tests from the test strategy before implementation begins |
| `test-strategy` | Derives per-plan validation criteria after architect approval |
| `todo-manager` | Maintains TODO.md as a pointer registry for active plans |

### Skills (19)

Invoked via the `Skill` tool with `skill: <name>`.

| Skill | Role |
|-------|------|
| `brainstorming` | Interactive spec authoring with a visual companion |
| `dispatching-parallel-agents` | Pattern for fanning out independent tasks to parallel agents |
| `e2e-init` | Per-repo testing backbone — produces `testing-plan.md` and `run-tests.sh` |
| `executing-plans` | Step-by-step plan execution with task tracking |
| `finishing-a-development-branch` | Pre-merge checklist: tests, review, PR creation |
| `git-manager` | All git operations: commits, branching, push, PR creation |
| `infra-init` | Codebase graph generation — produces `codebase-graph.json` and `CODEBASE.md` |
| `plan-gate` | Bridges planning to execution: architect review, test strategy, Jira tickets |
| `plan-management` | TODO.md maintenance and plan doc status tracking |
| `receiving-code-review` | Structured response to code review feedback |
| `requesting-code-review` | Pre-review checklist and review request formatting |
| `subagent-driven-development` | Implementation via parallel subagents with spec review |
| `systematic-debugging` | Root-cause-first debugging protocol |
| `test-driven-development` | TDD cycle: failing test → minimal impl → passing test |
| `using-git-worktrees` | Isolated feature work in git worktrees |
| `using-superpowers` | Session initialization — loads available skills and conventions |
| `verification-before-completion` | Pre-commit checklist before claiming work is done |
| `writing-plans` | Comprehensive implementation plan authoring |
| `writing-skills` | Skill definition authoring and testing |

### Rules (7)

Always-on instructions loaded by Claude Code in every session:

| Rule | What it enforces |
|------|-----------------|
| `filesystem-efficiency.md` | Targeted reads, scoped globs, no speculative file exploration |
| `filesystem/efficiency.md` | Filesystem efficiency rules (subdirectory variant, loaded as a unit) |
| `mcp-governance.md` | Route Jira through jira-workflow-manager; no wildcard MCP queries |
| `new-repo-setup.md` | Onboarding checklist when starting in a new repository |
| `plan-docs.md` | When and how to create plan docs; size thresholds |
| `planning.md` | Plan doc structure, architect review gates, task sizing |
| `workflow-phases.md` | Jira + Git workflow phases: planning, execution, commits |

### Plugins (13)

Installed automatically by `setup.sh` via `claude plugin install`:

| Plugin | Purpose |
|--------|---------|
| `atlassian` | Jira and Confluence via browser session auth |
| `aws-serverless` | AWS Lambda, API Gateway, SAM/CDK deployment |
| `claude-code-setup` | Claude Code automation recommender |
| `claude-md-management` | CLAUDE.md auditing and improvement |
| `commit-commands` | Commit, push, and PR slash commands |
| `context7` | Fetches current library/framework documentation |
| `explanatory-output-style` | Response formatting conventions |
| `feature-dev` | Feature development with codebase exploration |
| `plugin-dev` | Plugin and skill authoring |
| `pyright-lsp` | Python type checking and symbol resolution |
| `security-guidance` | Security review guidance |
| `skill-creator` | Skill creation and improvement tooling |
| `superpowers` | Core workflow skills (writing-plans, plan-gate, etc.) |

### Global CLAUDE.md

Root `CLAUDE.md` is symlinked to `~/.claude/CLAUDE.md`. It sets mandatory delegation (git → `git-manager`, Jira → `jira-workflow-manager`) and architect review gates.

### MCP Servers

`setup.sh` merges three MCP server entries into `~/.claude/settings.json`:

| Server | Purpose |
|--------|---------|
| `bitbucket` | PR management and repo browsing via Bitbucket Cloud API |
| `atlassian` | Jira and Confluence via browser session auth (`claude mcp auth atlassian`) |
| `git` | Local git history, blame, diffs — no auth required |

---

## Repo Structure

```
claude-workflow-improvements/
├── CLAUDE.md                   — global Claude Code instructions (symlinked to ~/.claude/CLAUDE.md)
├── README.md
├── agents/                     — agent definition files (symlinked to ~/.claude/agents/)
├── skills/                     — skill directories (each symlinked to ~/.claude/skills/<name>/)
├── rules/                      — always-on rule files (symlinked to ~/.claude/rules/)
│   └── filesystem/             — subdirectory, symlinked as a unit
├── hooks/
│   └── pre-commit              — global pre-commit hook (symlinked to ~/.claude/hooks/pre-commit)
├── templates/                  — project templates (not symlinked; copied on use)
├── docs/                       — public-facing documentation
│   └── superpowers/specs/      — brainstorming and design specs
└── scripts/
    └── setup.sh                — idempotent installer
```

---

## Prerequisites

| Tool | Install |
|------|---------|
| [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) | `npm install -g @anthropic-ai/claude-code` |
| [Node.js + npm](https://nodejs.org) | nodejs.org |
| [Python 3.9+](https://python.org) | python.org |
| [Python 3.11 or 3.14](https://python.org) | Required by `infra-init` skill |
| [uv](https://docs.astral.sh/uv/) | `pip install uv` or see uv docs |
| [pre-commit](https://pre-commit.com) | `pip install pre-commit` |
| Git | [git-scm.com](https://git-scm.com) |

**Windows note:** Symlinks require Developer Mode (`Settings → System → For developers → Developer Mode`) or running the script as Administrator.

---

## Adding or Updating Workflow Components

Edit files in place — symlinks keep `~/.claude/` in sync automatically. To re-create all symlinks after adding new files:

```bash
bash scripts/setup.sh --force
```

---

## After Setup

1. Run `claude mcp list` to verify MCP servers are registered.
2. Authenticate Atlassian: `claude mcp auth atlassian`
3. Add Bitbucket credentials to `~/.claude/settings.json` under `mcpServers.bitbucket.env`:
   - `BITBUCKET_USERNAME`
   - `BITBUCKET_APP_PASSWORD`
4. When starting work in any repo, run the `using-superpowers` skill to initialize the session.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: rewrite CLAUDE.md and README.md for dotfiles repo structure"
```

---

## Task 7: Security Audit

**Files:** All tracked files (read-only review)

Before this repo can be considered public-safe, verify no personal information, credentials, or internal company references are in tracked files.

- [ ] **Step 1: Search for company name**

```bash
git grep -i "woosh air\|wooshair" -- '*.md' '*.json' '*.sh' '*.py' '*.yaml' '*.yml'
```

Expected: no output. If any hits appear, open the file and remove or replace the reference.

- [ ] **Step 2: Search for personal email**

```bash
git grep -i "@wooshair\|jason@" -- '*.md' '*.json' '*.sh' '*.py' '*.yaml' '*.yml'
```

Expected: no output. Exception: `Co-Authored-By: Claude` lines in commit messages are fine (not file content). If any tracked file contains a personal email, redact it.

- [ ] **Step 3: Search for internal Jira workspace URLs**

```bash
git grep -i "wooshair\.atlassian\|\.atlassian\.net" -- '*.md' '*.json' '*.sh'
```

Expected: no output. If found, replace with a generic placeholder like `<your-workspace>.atlassian.net`.

- [ ] **Step 4: Search for API tokens or passwords**

```bash
git grep -i "token\|password\|secret\|api_key\|apikey" -- '*.json' '*.sh' '*.env' '*.yaml'
```

Review any hits. False positives (e.g., comments saying "add your API key here") are fine. Real credential values (anything that looks like a token or password string) must be removed.

- [ ] **Step 5: Verify mcp-settings.json has no credentials**

Read `templates/mcp-settings.json`. Confirm:
- `mcpServers.bitbucket.env.BITBUCKET_USERNAME` is absent or empty string/placeholder
- `mcpServers.bitbucket.env.BITBUCKET_APP_PASSWORD` is absent or empty string/placeholder
- No other credential values are present

If credentials are present, remove them and replace with empty strings or remove the env block entirely.

- [ ] **Step 6: Confirm .gitignore covers sensitive paths**

```bash
grep "_archive\|\.env\|credentials\|secrets" .gitignore
```

Expected: `_archive/` is listed. Add `.env` and `credentials*` if not already there as a safety net.

- [ ] **Step 7: Commit any audit fixes**

If the audit found and fixed issues, stage only the files that were edited (do not use `git add -A`):

```bash
# Stage only the specific files you edited — replace with actual filenames
git add docs/overview.md docs/jira-workflow.md  # example; list files you changed
git commit -m "chore: remove PII and internal references — public-safe audit"
```

If no issues were found, no commit needed.

---

## Task 8: Verify — Run `setup.sh --force` and Check Symlinks

**Files:** None (verification only)

- [ ] **Step 1: Run setup.sh --force**

```bash
bash scripts/setup.sh --force
```

Expected:
- All prerequisites pass (Step 1 green)
- All agents symlinked — should show 7 ✓ lines (including todo-manager)
- All skills symlinked — 19 ✓ lines
- All rules symlinked — 7 ✓ lines + 1 for filesystem/ directory
- CLAUDE.md symlinked — 1 ✓ line
- Pre-commit hook symlinked — 1 ✓ line
- Plugins — 13 install attempts (warn is acceptable if claude plugin CLI isn't available in this context)
- MCP packages install or skip
- MCP settings merge ✓
- Credentials notice printed
- Summary: `Failed: 0`

If any step shows ✗, investigate and fix before continuing.

- [ ] **Step 2: Verify agents symlinks**

```bash
ls -la ~/.claude/agents/
```

Expected: 7 symlinks, all pointing to files under `<repo-root>/agents/` (NOT `output/agents/`). Specifically verify `todo-manager.md` is present.

- [ ] **Step 3: Verify skills symlinks**

```bash
ls -la ~/.claude/skills/ | grep -c "^l"
```

Expected: 19 (count of symlink entries).

```bash
# Spot check one skill points to the new path
readlink ~/.claude/skills/git-manager
# Expected: .../claude-workflow-improvements/skills/git-manager (no "output" in path)
```

- [ ] **Step 4: Verify rules symlinks**

```bash
ls -la ~/.claude/rules/
```

Expected: 7 `.md` symlinks + 1 `filesystem/` directory symlink, all pointing into `<repo-root>/rules/`. Verify `mcp-governance.md`, `plan-docs.md`, `workflow-phases.md` are present.

```bash
readlink ~/.claude/rules/filesystem
# Expected: .../claude-workflow-improvements/rules/filesystem (a directory symlink)
```

- [ ] **Step 5: Verify CLAUDE.md symlink**

```bash
readlink ~/.claude/CLAUDE.md
# Expected: .../claude-workflow-improvements/CLAUDE.md (not output/CLAUDE.md)
```

- [ ] **Step 6: Verify pre-commit hook symlink**

```bash
readlink ~/.claude/hooks/pre-commit
# Expected: .../claude-workflow-improvements/hooks/pre-commit (not output/hooks/pre-commit)
```

- [ ] **Step 7: Final git status — confirm clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. No stray untracked files (except `_archive/` contents, which are gitignored).

- [ ] **Step 8: Remove the plan doc directory and commit**

The `plans/personal-workflow-repo/` directory (this plan) is the last tracked item under `plans/`. Now that execution is verified complete, remove it:

```bash
git rm -r plans/personal-workflow-repo/
rmdir plans/  # remove the now-empty plans/ directory
git commit -m "chore: remove execution plan doc — restructure complete"
```

If Step 7 also had fixes, combine them into this commit:

```bash
git rm -r plans/personal-workflow-repo/
rmdir plans/
git add <any-files-from-step-7>
git commit -m "chore: remove plan doc and apply final audit fixes — restructure complete"
```

---

## Testing Contract

Since this is a structural migration with no application logic, the test surface is:

| Verification | Command | Expected Result |
|---|---|---|
| setup.sh syntax valid | `bash -n scripts/setup.sh` | Exit 0, no output |
| setup.sh runs clean | `bash scripts/setup.sh --force` | `Failed: 0` in summary |
| Agents all symlinked | `ls ~/.claude/agents/ \| wc -l` | 7 |
| Skills all symlinked | `ls ~/.claude/skills/ \| wc -l` | 19 |
| Rules all symlinked | `ls ~/.claude/rules/*.md \| wc -l` | 7 |
| rules/filesystem/ symlinked | `readlink ~/.claude/rules/filesystem` | Points into repo (no "output") |
| No stale output/ references | `grep -r "output/" scripts/setup.sh` | No output |
| No PII in tracked files | `git grep -i "wooshair\|jason@"` | No output |
| Clean working tree | `git status` | `nothing to commit` |

All verifications in Task 8 constitute the acceptance test for this plan.

---

## Testing Plan

No automated test framework applies — this is a structural repo migration with no application logic. All verification is shell-based and manual.

### Manual Verification Steps

These steps constitute the full acceptance test. Run them in order after Task 8 begins.

#### setup.sh syntax and execution (covers Task 5)

- [ ] Run `bash -n scripts/setup.sh` — expect exit 0 with no output. If syntax errors are reported, fix them before proceeding.
- [ ] Run `bash scripts/setup.sh --force` — expect the final summary to print `Failed: 0`. Any `✗` line in the output identifies a broken step; investigate before calling execution complete.

#### Link correctness — path references (covers Tasks 1 and 5 together)

These checks verify that the old `output/` path is fully eliminated from link targets.

- [ ] Run `readlink ~/.claude/CLAUDE.md` — the resolved path must contain `claude-workflow-improvements/CLAUDE.md` with no `output/` segment.
- [ ] Run `readlink ~/.claude/skills/git-manager` — path must not contain `output/`.
- [ ] Run `readlink ~/.claude/rules/filesystem` — must resolve to a directory inside the repo (not `output/rules/filesystem`).
- [ ] Run `grep -r "output/" scripts/setup.sh` — expect no output. Any hit means a stale `SOURCE_DIR` or hardcoded path was missed in Task 5.

#### Link counts (covers Tasks 1 and 2)

- [ ] Run `ls ~/.claude/agents/ | wc -l` — expect 7. A count of 6 means `todo-manager.md` was not committed or not linked.
- [ ] Run `ls ~/.claude/skills/ | grep -c "^"` — expect 19.
- [ ] Run `ls ~/.claude/rules/*.md | wc -l` — expect 7. A count of 3 means the 4 rules added in Task 2 (`mcp-governance.md`, `plan-docs.md`, `workflow-phases.md`, plus the existing flat `filesystem-efficiency.md`) were not linked.
- [ ] Run `ls ~/.claude/rules/filesystem/efficiency.md` — must exist (directory link resolves correctly).

#### PII and credential audit (covers Task 7)

- [ ] Run `git grep -i "woosh air\|wooshair"` across `*.md *.json *.sh *.yaml *.yml` — expect no output.
- [ ] Run `git grep -i "@wooshair\|jason@"` across the same extensions — expect no output.
- [ ] Run `git grep -i "wooshair\.atlassian\|\.atlassian\.net"` — expect no output.
- [ ] Open `templates/mcp-settings.json` and confirm `BITBUCKET_USERNAME` and `BITBUCKET_APP_PASSWORD` fields are absent or empty strings — no real credential values present.

#### docs/ promotion (covers Task 4)

- [ ] Run `ls docs/*.md | wc -l` — expect 10. Missing files indicate a `git mv` was skipped or a file was lost.
- [ ] Run `ls plans/` — expect only `personal-workflow-repo/` (until Task 8 removes it). Any numbered subdirectory here means a `git mv` was not completed.

#### Clean working tree (final gate)

- [ ] Run `git status` after all tasks are committed — expect `nothing to commit, working tree clean`. Untracked files under `_archive/` are expected and acceptable (they are ignored by git).

### Log Monitoring Notes

No production-bound logic is involved. The one failure mode worth watching during execution: if `setup.sh --force` exits with `Failed: N > 0`, the summary line will identify which step failed. Cross-reference the step number against the updated step numbering in Task 5 (old steps 7–9 become 8–10 after the plugin step is inserted) to avoid diagnosing the wrong block.
