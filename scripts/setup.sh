#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# setup.sh — Install Claude workflow agents, skills, rules, and MCP packages
# ---------------------------------------------------------------------------
# Usage:
#   ./setup.sh           — Idempotent install; skip items already up to date
#   ./setup.sh --force   — Replace all existing symlinks and re-merge MCP entries
# ---------------------------------------------------------------------------

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)

FORCE=false
if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
fi

# Counters
LINKED=0
SKIPPED=0
FAILED=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info()    { echo "  $*"; }
success() { echo "  ✓ $*"; }
skip()    { echo "  ↷ $*"; }
warn()    { echo "  ⚠ $*" >&2; }
fail()    { echo "  ✗ $*" >&2; }

# make_symlink <target> <link>
# Tries ln -s first; falls back to cmd.exe mklink on Windows if needed.
make_symlink() {
  local target="$1"
  local link="$2"
  local is_dir=false
  [[ -d "$target" ]] && is_dir=true

  # Detect Windows up-front so we can adjust ln -s behavior
  local uname_out
  uname_out=$(uname -s 2>/dev/null || echo "unknown")

  local use_nativestrict=false
  if echo "$uname_out" | grep -qi "mingw\|cygwin\|msys"; then
    # Without nativestrict, MSYS ln -s silently creates file copies instead of
    # real NTFS symlinks and exits 0 — making the mklink fallback unreachable.
    # nativestrict makes ln -s fail when it can't create a real symlink.
    use_nativestrict=true
  fi

  if $use_nativestrict; then
    MSYS=winsymlinks:nativestrict ln -s "$target" "$link" 2>/dev/null && return 0
  elif ln -s "$target" "$link" 2>/dev/null; then
    return 0
  fi

  # ln -s failed — try Windows mklink if we're on MinGW / Git for Windows
  if echo "$uname_out" | grep -qi "mingw\|cygwin\|msys"; then
    local win_target win_link
    # Convert Unix paths to Windows paths for cmd.exe
    win_target=$(cygpath -w "$target" 2>/dev/null || echo "$target")
    win_link=$(cygpath -w "$link" 2>/dev/null || echo "$link")
    if $is_dir; then
      cmd.exe /c "mklink /D \"$win_link\" \"$win_target\"" > /dev/null 2>&1 && return 0
    else
      cmd.exe /c "mklink \"$win_link\" \"$win_target\"" > /dev/null 2>&1 && return 0
    fi
  fi

  return 1
}

# install_symlink <target> <link> <display_name>
# Respects --force. Updates counters.
install_symlink() {
  local target="$1"
  local link="$2"
  local display="$3"

  # Check if link already exists and points to the correct target
  if [[ -L "$link" ]]; then
    local current_target
    current_target=$(readlink "$link" 2>/dev/null || echo "")
    if [[ "$current_target" == "$target" ]] && ! $FORCE; then
      skip "already up to date: $display"
      (( SKIPPED++ )) || true
      return 0
    fi
    # Either wrong target or --force: remove existing link
    rm -f "$link"
  elif [[ -e "$link" ]]; then
    if $FORCE; then
      rm -rf "$link"
    else
      warn "skipping $display — path exists but is not a symlink (use --force to overwrite)"
      (( SKIPPED++ )) || true
      return 0
    fi
  fi

  if make_symlink "$target" "$link"; then
    success "linked: $display"
    (( LINKED++ )) || true
  else
    fail "failed: $link — On Windows, enable Developer Mode (Settings → Developer Mode) or run this script as Administrator"
    (( FAILED++ )) || true
  fi
}

# ---------------------------------------------------------------------------
# Step 1 — Check prerequisites
# ---------------------------------------------------------------------------

echo ""
echo "Step 1 — Checking prerequisites"

PREREQS_OK=true

check_prereq() {
  local cmd="$1"
  local message="$2"
  if ! command -v "$cmd" > /dev/null 2>&1; then
    fail "missing: $cmd — $message"
    PREREQS_OK=false
  fi
}

check_prereq "node"       "Install Node.js from https://nodejs.org"
check_prereq "npm"        "Install Node.js from https://nodejs.org (includes npm)"
check_prereq "pre-commit" "Install with: pip install pre-commit"

# Python 3: try python3 first (macOS/Linux), fall back to python (Windows)
PYTHON_CMD=""
for _py in python3 python; do
  if command -v "$_py" > /dev/null 2>&1 && "$_py" --version 2>&1 | grep -q "Python 3"; then
    PYTHON_CMD="$_py"
    break
  fi
done
if [[ -z "$PYTHON_CMD" ]]; then
  fail "missing: python3 — Install Python 3.9+ from https://python.org"
  PREREQS_OK=false
fi

# /infra-init specifically requires python3.11 or python3.14 — resolve separately
# from the generic PYTHON_CMD above (which covers the MCP settings merge and can
# use any Python 3).
INFRA_INIT_PY=""
for _py in python3.11 python3.14; do
  if command -v "$_py" > /dev/null 2>&1; then
    INFRA_INIT_PY="$_py"
    break
  fi
done
if [[ -z "$INFRA_INIT_PY" ]]; then
  fail "missing: python3.11 or python3.14 — required by /infra-init. Install one of them and re-run setup.sh."
  PREREQS_OK=false
fi

check_prereq "uv"     "Install uv from https://docs.astral.sh/uv/getting-started/installation/ (required for git MCP server)"
check_prereq "claude" "Install Claude Code CLI with: npm install -g @anthropic-ai/claude-code"
check_prereq "git"    "Install Git from https://git-scm.com"

if ! $PREREQS_OK; then
  echo ""
  echo "  One or more prerequisites are missing. Install them and re-run setup.sh."
  exit 1
fi

success "All prerequisites found"

# ---------------------------------------------------------------------------
# Step 2 — Create ~/.claude/ directory structure
# ---------------------------------------------------------------------------

echo ""
echo "Step 2 — Creating ~/.claude/ directory structure"

mkdir -p "$HOME/.claude/agents"
mkdir -p "$HOME/.claude/skills"
mkdir -p "$HOME/.claude/rules"
mkdir -p "$HOME/.claude/hooks"

success "~/.claude/ directories ready"

# ---------------------------------------------------------------------------
# Step 3 — Symlink agents
# ---------------------------------------------------------------------------

echo ""
echo "Step 3 — Symlinking agents"

for agent_file in "$REPO_ROOT/agents/"*.md; do
  [[ -e "$agent_file" ]] || continue
  name=$(basename "$agent_file")
  install_symlink "$agent_file" "$HOME/.claude/agents/$name" "agents/$name"
done

# ---------------------------------------------------------------------------
# Step 4 — Symlink skills
# ---------------------------------------------------------------------------

echo ""
echo "Step 4 — Symlinking skills"

for skill_dir in "$REPO_ROOT/skills"/*/; do
  [[ -d "$skill_dir" ]] || continue
  name=$(basename "$skill_dir")
  # Remove trailing slash from target path
  target="${skill_dir%/}"
  install_symlink "$target" "$HOME/.claude/skills/$name" "skills/$name"
done

# ---------------------------------------------------------------------------
# Step 5 — Symlink rules + CLAUDE.md
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Step 5.5 — Symlink cspell.json to ~/.claude/cspell.json
# ---------------------------------------------------------------------------
# One maintained wordlist covers both the repo and all ~/.claude/ files
# (memory, skills, rules). Without this symlink, ~/.claude/ files fall back
# to the built-in dictionary and generate false-positive spellcheck warnings.

echo ""
echo "Step 5.5 — Symlinking cspell.json"

install_symlink "$REPO_ROOT/cspell.json" "$HOME/.claude/cspell.json" "cspell.json"

# ---------------------------------------------------------------------------
# Step 6 — Symlink pre-commit hook
# ---------------------------------------------------------------------------

echo ""
echo "Step 6 — Symlinking pre-commit hook"

HOOK_TARGET="$REPO_ROOT/hooks/pre-commit"
HOOK_LINK="$HOME/.claude/hooks/pre-commit"

install_symlink "$HOOK_TARGET" "$HOOK_LINK" "hooks/pre-commit"
chmod +x "$HOOK_TARGET"

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

# ---------------------------------------------------------------------------
# Step 8 — Install MCP packages
# ---------------------------------------------------------------------------

echo ""
echo "Step 8 — Installing MCP packages"

install_npm_pkg() {
  local pkg="$1"
  info "Installing $pkg ..."
  if npm install -g "$pkg" 2>&1 | tail -1; then
    success "installed: $pkg"
  else
    warn "npm install failed for $pkg — install manually with: npm install -g $pkg"
  fi
}

install_npm_pkg "@aashari/mcp-server-atlassian-bitbucket"
# git MCP server uses uvx (mcp-server-git) — no pre-install needed; uvx downloads on first use

# /infra-init Python dependencies — graphify (structural extraction) + tree-sitter
# parsers (env var scanner). Install unpinned (upstream churn accepted; translator
# is drift-defensive). pip show guard avoids re-resolving on every setup.sh run.
echo ""
info "Installing /infra-init Python dependencies using $INFRA_INIT_PY"
for pkg in graphifyy tree-sitter-python tree-sitter-typescript pyyaml jsonschema; do
  if "$INFRA_INIT_PY" -m pip show "$pkg" > /dev/null 2>&1; then
    skip "already installed: $pkg"
  else
    info "installing $pkg ..."
    if "$INFRA_INIT_PY" -m pip install --user "$pkg" > /dev/null 2>&1; then
      success "installed: $pkg"
    else
      warn "pip install failed for $pkg — install manually: $INFRA_INIT_PY -m pip install --user $pkg"
    fi
  fi
done

# ---------------------------------------------------------------------------
# Step 9 — Merge MCP settings into ~/.claude/settings.json
# ---------------------------------------------------------------------------

echo ""
echo "Step 9 — Merging MCP settings into ~/.claude/settings.json"

SETTINGS_FILE="$HOME/.claude/settings.json"
MCP_TEMPLATE="$REPO_ROOT/templates/mcp-settings.json"

# Convert to native OS paths for Python — on Windows/MinGW, $HOME expands to
# a MSYS path (/c/Users/...) that Windows Python cannot open.
if command -v cygpath > /dev/null 2>&1; then
  # -m produces C:/Users/... (forward-slash Windows paths) — safe in Python strings
  SETTINGS_FILE_PY=$(cygpath -m "$SETTINGS_FILE")
  MCP_TEMPLATE_PY=$(cygpath -m "$MCP_TEMPLATE")
else
  SETTINGS_FILE_PY="$SETTINGS_FILE"
  MCP_TEMPLATE_PY="$MCP_TEMPLATE"
fi

if [[ ! -f "$MCP_TEMPLATE" ]]; then
  warn "MCP template not found at $MCP_TEMPLATE — skipping settings merge"
else
  PYTHONUTF8=1 _MCP_TEMPLATE="$MCP_TEMPLATE_PY" _SETTINGS_FILE="$SETTINGS_FILE_PY" _FORCE="$FORCE" "$PYTHON_CMD" - <<PYEOF
import json
import os
import sys

template_path = os.environ["_MCP_TEMPLATE"]
settings_path = os.environ["_SETTINGS_FILE"]
force = os.environ["_FORCE"] == "true"

try:
    with open(template_path, "r") as f:
        template = json.load(f)
except Exception as e:
    print(f"  ✗ Could not read MCP template: {e}", file=sys.stderr)
    sys.exit(1)

if os.path.exists(settings_path):
    try:
        with open(settings_path, "r") as f:
            settings = json.load(f)
    except Exception as e:
        print(f"  ✗ Could not read settings.json: {e}", file=sys.stderr)
        sys.exit(1)
else:
    settings = {}

if "mcpServers" not in settings:
    settings["mcpServers"] = {}

template_servers = template.get("mcpServers", {})
for key, value in template_servers.items():
    if key.startswith("_comment"):
        continue
    if key in settings["mcpServers"] and not force:
        print(f"  ↷ already present: mcpServers.{key}")
    else:
        settings["mcpServers"][key] = value
        print(f"  ✓ merged: mcpServers.{key}")

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")

print(f"  ✓ settings.json written: {settings_path}")
PYEOF
  echo ""
  echo "  ℹ  Add Bitbucket credentials manually to ~/.claude/settings.json:"
  echo "       mcpServers.bitbucket.env.BITBUCKET_USERNAME"
  echo "       mcpServers.bitbucket.env.BITBUCKET_APP_PASSWORD"
fi

# ---------------------------------------------------------------------------
# Step 10 — Summary
# ---------------------------------------------------------------------------

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Linked  : $LINKED"
echo "  Skipped : $SKIPPED"
echo "  Failed  : $FAILED"
echo ""

if (( FAILED > 0 )); then
  echo "  Some symlinks failed — see errors above."
  echo "  On Windows: enable Developer Mode (Settings → Developer Mode)"
  echo "  or re-run this script as Administrator."
  echo ""
  exit 1
fi

echo "  Run 'claude mcp list' to verify MCP servers are registered."
echo ""
