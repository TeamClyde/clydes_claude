# Personal Workflow Repo — Design Spec

**Date:** 2026-04-18  
**Status:** Approved

## Summary

Transform this repo from a workflow design project into a living personal dotfiles repo for Claude Code. Running `setup.sh` on a fresh machine restores all skills, agents, rules, hooks, and plugins. The repo structure mirrors `~/.claude/` directly so adding or changing any workflow component is as simple as editing the file in place.

---

## Goals

- Full restore of Claude Code workflow from a single `setup.sh` run
- Repo structure mirrors `~/.claude/` — no indirection layer
- Public-safe: no credentials, no personal identifiers, no internal company code
- Documentation in `docs/` is readable by others who want to understand the system

---

## Non-Goals

- Credential management (BITBUCKET_USERNAME, BITBUCKET_APP_PASSWORD are set manually)
- Plugin version pinning (always installs latest from marketplace)
- Automating MCP server auth flows

---

## Directory Structure

```
claude-workflow-improvements/
├── CLAUDE.md                        ← symlinked to ~/.claude/CLAUDE.md
├── README.md                        ← what this is + how to restore
├── agents/                          ← *.md symlinked to ~/.claude/agents/
│   ├── architect.md
│   ├── integration-engineer.md
│   ├── jira-workflow-manager.md
│   ├── researcher.md
│   ├── test-builder.md
│   ├── test-strategy.md
│   └── todo-manager.md              ← currently untracked, copy in
├── skills/                          ← each dir symlinked to ~/.claude/skills/<name>/
│   ├── brainstorming/
│   ├── dispatching-parallel-agents/
│   ├── e2e-init/
│   ├── executing-plans/
│   ├── finishing-a-development-branch/
│   ├── git-manager/
│   ├── infra-init/
│   ├── plan-gate/
│   ├── plan-management/
│   ├── receiving-code-review/
│   ├── requesting-code-review/
│   ├── subagent-driven-development/
│   ├── systematic-debugging/
│   ├── test-driven-development/
│   ├── using-git-worktrees/
│   ├── using-superpowers/
│   ├── verification-before-completion/
│   ├── writing-plans/
│   └── writing-skills/
├── rules/                           ← *.md symlinked to ~/.claude/rules/
│   ├── filesystem-efficiency.md
│   ├── mcp-governance.md            ← currently untracked, copy in
│   ├── new-repo-setup.md
│   ├── plan-docs.md                 ← currently untracked, copy in
│   ├── planning.md
│   ├── workflow-phases.md           ← currently untracked, copy in
│   └── filesystem/                  ← subdirectory, symlinked as a unit
│       └── efficiency.md            ← currently untracked, copy in
├── hooks/
│   └── pre-commit                   ← symlinked to ~/.claude/hooks/pre-commit
├── templates/                       ← project templates, not symlinked (copied on use)
│   ├── .pre-commit-config.yaml
│   ├── CODEBASE.md
│   ├── branch-protection.json
│   ├── codebase-graph.schema.json
│   ├── codebase-mcp/
│   ├── mcp-settings.json
│   ├── pr-description.md
│   └── testing-plan.md
├── docs/                            ← public-facing documentation
│   ├── overview.md                  ← from plans/MAIN-PLAN.md
│   ├── agent-architecture.md        ← from plans/05-agent-architecture/PLAN.md
│   ├── codebase-graph.md            ← from plans/01-infrastructure-as-code/PLAN.md
│   ├── git-workflow.md              ← from plans/04-git-workflow/PLAN.md
│   ├── jira-workflow.md             ← from plans/02-jira-integration/PLAN.md
│   ├── plan-management.md           ← from plans/06-plan-management/PLAN.md
│   ├── rules.md                     ← from plans/07-rules/PLAN.md
│   ├── setup.md                     ← from plans/09-setup/PLAN.md
│   ├── skills.md                    ← from plans/08-skills/PLAN.md
│   ├── testing-system.md            ← from plans/03-testing-system/PLAN.md
│   └── superpowers/specs/           ← brainstorming specs (this file lives here)
├── scripts/
│   └── setup.sh                     ← updated (see below)
└── .gitignore                       ← updated to include _archive/
```

### What moves to `_archive/` (gitignored, kept locally)

All internal design artifacts from the original project:
- `plans/BENCHMARK-HANDOFF.md`
- `plans/BENCHMARK-RESULTS.md`
- `plans/REVIEW-PLAN.md`
- `plans/REVIEW-RESULTS.md`
- `plans/SETUP-TEST-RESULTS.md`
- `plans/TRACK3-HANDOFF.md`
- `plans/review/`
- `plans/test-fixtures/`
- `plans/06-plan-management/CATEGORIZATION-2026-03-18.md`

### What is deleted entirely

- `ref_docs/` — contains internal company code (Woosh Air), not appropriate for a public repo
- `output/` — replaced by the flat root structure

---

## `setup.sh` Changes

### Path changes

All references to `$SOURCE_DIR` (previously `$REPO_ROOT/output`) updated to `$REPO_ROOT`.

### Rules subdirectory handling

Current `setup.sh` only symlinks `rules/*.md` (top-level files). Updated to also symlink `rules/filesystem/` as a directory unit:

```bash
# Symlink rules/filesystem/ subdirectory
install_symlink "$REPO_ROOT/rules/filesystem" "$HOME/.claude/rules/filesystem" "rules/filesystem/"
```

### Plugin installation (new step)

Added after the existing symlink steps:

```bash
echo ""
echo "Step N — Installing Claude Code plugins"

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

### MCP credentials notice (updated step 8)

Instead of merging MCP settings with credentials, step 8 prints a reminder:

```
Step 8 — MCP configuration
  ✓ MCP npm packages installed (bitbucket-mcp, @modelcontextprotocol/server-git)
  ℹ  Add credentials manually to ~/.claude/settings.json:
       mcpServers.bitbucket.env.BITBUCKET_USERNAME
       mcpServers.bitbucket.env.BITBUCKET_APP_PASSWORD
```

The `mcp-settings.json` template (which contains server config but no credentials) still gets merged as today.

---

## Security Requirements

Before any commit of the restructured repo:

1. **Delete `ref_docs/`** from the working directory — this directory was never committed to git history, so no scrubbing is needed. Just delete and add to `.gitignore` as a safety net.
2. **Audit all tracked files** for: email addresses, company names (Woosh Air), Jira workspace URLs, personal API keys or tokens.
3. **Confirm `.gitignore`** includes `_archive/` and any local secrets files.
4. **`mcp-settings.json` template** must not contain any credential values — only server command/args structure with empty or placeholder env blocks.

---

## Migration Steps (high-level, for the implementation plan)

1. Move `output/agents/` → `agents/`, `output/skills/` → `skills/`, etc.
2. Copy 5 untracked files from `~/.claude/` into their new locations
3. Move internal artifacts to `_archive/`, add `_archive/` to `.gitignore`
4. Delete `ref_docs/` (and scrub from git history)
5. Rename + rewrite `plans/` content into `docs/`
6. Update `setup.sh` (paths, subdirectory handling, plugin install, MCP notice)
7. Update `README.md` and `CLAUDE.md` to reflect the new repo purpose
8. Re-run `setup.sh --force` to re-create all symlinks pointing at the new paths
9. Verify all symlinks in `~/.claude/` resolve correctly

---

## Success Criteria

- `setup.sh` run on a fresh machine installs all 19 skills, 7 agents, 7 rules files, 1 hook, and 13 plugins
- All symlinks in `~/.claude/` resolve to files in this repo
- No personal information, credentials, or internal company code in any tracked file
- `docs/` reads as understandable documentation for a new reader
