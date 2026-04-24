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
# Plugin lifecycle helpers
# ---------------------------------------------------------------------------

# get_plugin_state <plugin-spec>
# Reads plugins/registry.md and returns the lifecycle state for the given plugin.
# Returns: Active | Integrated | Deprecated | Removed | unregistered
get_plugin_state() {
  local plugin_name="${1%%@*}"  # strip @registry suffix (e.g. plugin-dev@claude-plugins-official → plugin-dev)
  local registry="$REPO_ROOT/plugins/registry.md"
  [[ -f "$registry" ]] || { echo "unregistered"; return; }
  local in_section=false
  while IFS= read -r line; do
    if [[ "$line" == "## $plugin_name" ]]; then
      in_section=true
    elif $in_section && [[ "$line" =~ ^## ]]; then
      break
    elif $in_section && [[ "$line" =~ \*\*State:\*\*[[:space:]]*([A-Za-z]+) ]]; then
      echo "${BASH_REMATCH[1]}"
      return
    fi
  done < "$registry"
  echo "unregistered"
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
# Step 2.5 — Remove orphaned symlinks
# ---------------------------------------------------------------------------
# When a component is deleted from the repo (e.g. a retired agent), its
# ~/.claude/ symlink stays in place and will be loaded by Claude Code on
# every session. This step removes broken symlinks from all three dirs.

echo ""
echo "Step 2.5 — Removing orphaned symlinks"

remove_orphaned() {
  local dir="$1"
  local label="$2"
  [[ -d "$dir" ]] || return 0
  local found=false
  for link in "$dir"/*; do
    [[ -L "$link" ]] || continue   # skip non-symlinks
    [[ -e "$link" ]] && continue   # skip valid (non-broken) symlinks
    rm -f "$link"
    success "removed orphaned symlink: $label/$(basename "$link")"
    found=true
  done
  $found || skip "no orphaned symlinks in $label"
}

remove_orphaned "$HOME/.claude/agents" "agents"
remove_orphaned "$HOME/.claude/skills" "skills"
remove_orphaned "$HOME/.claude/rules"  "rules"

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
)

# Snapshot installed plugins once so each iteration can check without a subprocess
PLUGIN_LIST_OUTPUT=""
PLUGIN_LIST_OUTPUT=$(claude plugin list 2>/dev/null) || true

for plugin in "${PLUGINS[@]}"; do
  plugin_base="${plugin%%@*}"
  state=$(get_plugin_state "$plugin_base")

  case "$state" in
    Removed)
      skip "skipping removed plugin: $plugin_base (Removed in registry)"
      (( SKIPPED++ )) || true
      continue
      ;;
    Deprecated)
      warn "installing deprecated plugin (pending cleanup per registry): $plugin_base"
      ;;
  esac

  state_label=""
  [[ "$state" != "unregistered" ]] && state_label=" [$state]"

  # Skip if already installed and not forcing a reinstall
  if ! $FORCE && [[ -n "$PLUGIN_LIST_OUTPUT" ]] && echo "$PLUGIN_LIST_OUTPUT" | grep -q "^$plugin_base"; then
    skip "already installed: $plugin_base$state_label"
    (( SKIPPED++ )) || true
    continue
  fi

  if claude plugin install "$plugin" 2>/dev/null; then
    success "installed plugin: $plugin_base$state_label"
    (( LINKED++ )) || true
  else
    warn "plugin install may have failed: $plugin — run manually with: claude plugin install $plugin"
  fi
done

# Enforce Removed state: uninstall any plugins the registry marks as Removed.
# This prevents integrated-then-removed plugins from continuing to fire their skills.
if [[ -f "$REPO_ROOT/plugins/registry.md" ]]; then
  echo ""
  echo "  Enforcing Removed plugin states ..."
  while IFS= read -r line; do
    if [[ "$line" =~ ^##[[:space:]]+([a-z][a-z0-9_-]*)$ ]]; then
      reg_name="${BASH_REMATCH[1]}"
      reg_state=$(get_plugin_state "$reg_name")
      if [[ "$reg_state" == "Removed" ]]; then
        if claude plugin uninstall "$reg_name" 2>/dev/null; then
          success "uninstalled (Removed in registry): $reg_name"
        else
          skip "already absent: $reg_name"
        fi
      fi
    fi
  done < "$REPO_ROOT/plugins/registry.md"
fi

# Registry consistency check: warn about Active/Integrated registry entries missing from PLUGINS
if [[ -f "$REPO_ROOT/plugins/registry.md" ]]; then
  echo ""
  echo "  Checking registry consistency ..."
  while IFS= read -r line; do
    if [[ "$line" =~ ^##[[:space:]]+([a-z][a-z0-9_-]*)$ ]]; then
      reg_name="${BASH_REMATCH[1]}"
      reg_state=$(get_plugin_state "$reg_name")
      if [[ "$reg_state" == "Active" || "$reg_state" == "Integrated" ]]; then
        found=false
        for p in "${PLUGINS[@]}"; do
          [[ "${p%%@*}" == "$reg_name" ]] && found=true && break
        done
        if ! $found; then
          warn "registry gap: $reg_name ($reg_state) is not in the PLUGINS install list — add it to setup.sh"
        else
          info "registry ok: $reg_name ($reg_state)"
        fi
      fi
    fi
  done < "$REPO_ROOT/plugins/registry.md"
fi

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

# codebase-memory-mcp — single static binary, installed to ~/.local/bin
CBM_BIN="$HOME/.local/bin/codebase-memory-mcp"
if [[ -x "$CBM_BIN" ]] && ! $FORCE; then
  skip "already installed: codebase-memory-mcp ($("$CBM_BIN" --version 2>/dev/null || echo 'unknown version'))"
else
  info "Installing codebase-memory-mcp ..."
  if curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash -s -- --skip-config > /dev/null 2>&1; then
    success "installed: codebase-memory-mcp"
  else
    warn "codebase-memory-mcp install failed — install manually: curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash"
  fi
fi

# /infra-init Python dependencies — tree-sitter parsers (env var scanner).
# Install unpinned. pip show guard avoids re-resolving on every setup.sh run.
echo ""
info "Installing /infra-init Python dependencies using $INFRA_INIT_PY"
for pkg in tree-sitter-python tree-sitter-typescript pyyaml jsonschema; do
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
# Step 9 — Register MCP servers via claude mcp add
# ---------------------------------------------------------------------------
# ~/.claude.json is the authoritative MCP config (not ~/.claude/settings.json).
# Use `claude mcp add -s user` so servers are available across all projects.

echo ""
echo "Step 9 — Registering MCP servers"

# register_mcp_stdio <name> <command> [args...]
# Idempotent: skips if the server name already appears in `claude mcp list`.
register_mcp_stdio() {
  local name="$1"; shift
  if claude mcp list 2>/dev/null | grep -q "^${name}:"; then
    if ! $FORCE; then
      skip "already registered: $name"
      (( SKIPPED++ )) || true
      return 0
    fi
    claude mcp remove "$name" 2>/dev/null || true
  fi
  if claude mcp add -s user "$name" "$@" 2>/dev/null; then
    success "registered MCP: $name"
    (( LINKED++ )) || true
  else
    warn "failed to register MCP: $name — run manually: claude mcp add -s user $name $*"
    (( FAILED++ )) || true
  fi
}

# git — local repo history/blame/diff (uvx downloads on first use)
register_mcp_stdio "git" uvx -- mcp-server-git --repository .

# codebase-memory-mcp — symbol graph for /infra-init
if [[ -x "$CBM_BIN" ]]; then
  register_mcp_stdio "codebase-memory-mcp" "$CBM_BIN"
else
  warn "skipping codebase-memory-mcp registration — binary not found at $CBM_BIN"
fi

echo ""
echo "  ℹ  Bitbucket MCP requires credentials — register manually if not already done:"
echo "       claude mcp add -s user bitbucket npx -- -y @aashari/mcp-server-atlassian-bitbucket \\"
echo "         -e BITBUCKET_USERNAME=you@example.com -e BITBUCKET_APP_PASSWORD=yourtoken"

# ---------------------------------------------------------------------------
# Step 10 — Skill usage tracking
# ---------------------------------------------------------------------------
# ~/.claude/settings.json is used for hooks and permissions (not MCP servers).
SETTINGS_FILE="$HOME/.claude/settings.json"
if command -v cygpath > /dev/null 2>&1; then
  SETTINGS_FILE="$(cygpath -m "$SETTINGS_FILE")"
fi
# Installs a PostToolUse hook that logs every Skill invocation to
# ~/.claude/skill-usage-<hostname>.jsonl, and schedules a weekly email report.

echo ""
echo "Step 10 — Setting up skill usage tracking"

mkdir -p "$HOME/.claude/scripts"
install_symlink "$REPO_ROOT/scripts/skill-log.js"   "$HOME/.claude/scripts/skill-log.js"   "scripts/skill-log.js"
install_symlink "$REPO_ROOT/scripts/skill-audit.js" "$HOME/.claude/scripts/skill-audit.js" "scripts/skill-audit.js"

# Install nodemailer (used by skill-audit.js --send)
info "Installing nodemailer ..."
if (cd "$REPO_ROOT/scripts" && npm install --silent 2>/dev/null); then
  success "nodemailer installed"
else
  warn "npm install failed in scripts/ — run manually: cd $REPO_ROOT/scripts && npm install"
fi

# Warn if email config is missing (credentials are machine-specific, not in the repo)
CONFIG_FILE="$HOME/.claude/skill-report-config.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
  warn "Missing email config: $CONFIG_FILE"
  echo '     Create it with: {"email":"you@gmail.com","gmail_app_password":"xxxx xxxx xxxx xxxx"}'
  echo "     Generate an app password at: https://myaccount.google.com/apppasswords"
fi

# Build the hook command using a Windows-native path so cmd.exe can resolve it.
if command -v cygpath > /dev/null 2>&1; then
  _SKILL_LOG_WIN=$(cygpath -w "$HOME/.claude/scripts/skill-log.js")
  _HOOK_CMD="node \"${_SKILL_LOG_WIN}\""
else
  _HOOK_CMD="node \"$HOME/.claude/scripts/skill-log.js\""
fi

# Merge the PostToolUse hook into ~/.claude/settings.json.
# Skips if a Skill matcher is already present (respects --force to replace).
PYTHONUTF8=1 \
  _SETTINGS_FILE="$(command -v cygpath > /dev/null 2>&1 && cygpath -m "$SETTINGS_FILE" || echo "$SETTINGS_FILE")" \
  _HOOK_CMD="$_HOOK_CMD" \
  _FORCE="$FORCE" \
  "$PYTHON_CMD" - <<'PYEOF'
import json, os, sys

settings_path = os.environ["_SETTINGS_FILE"]
hook_cmd      = os.environ["_HOOK_CMD"]
force         = os.environ["_FORCE"] == "true"

try:
    with open(settings_path) as f:
        settings = json.load(f)
except Exception as e:
    print(f"  ✗ Could not read settings.json: {e}", file=sys.stderr)
    sys.exit(1)

hooks = settings.setdefault("hooks", {})
post  = hooks.setdefault("PostToolUse", [])

# Check whether a Skill matcher entry already exists
existing = next((h for h in post if h.get("matcher") == "Skill"), None)
if existing and not force:
    print("  ↷ PostToolUse Skill hook already present")
else:
    if existing:
        post.remove(existing)
    post.append({
        "matcher": "Skill",
        "hooks": [{"type": "command", "command": hook_cmd}]
    })
    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")
    print(f"  ✓ PostToolUse Skill hook added to settings.json")
PYEOF

# ---------------------------------------------------------------------------
# Weekly email report — Windows Task Scheduler (MSYS/MinGW) or crontab (Unix)
# ---------------------------------------------------------------------------

MACHINE=$(hostname)
REPORT_TASK_NAME="Claude Weekly Skill Report"

_setup_windows_schedule() {
  local audit_win
  audit_win=$(cygpath -w "$HOME/.claude/scripts/skill-audit.js")

  local ps_path="$HOME/.claude/scripts/skill-report.ps1"
  cat > "$ps_path" <<PSEOF
node '$audit_win' --send
PSEOF

  local ps_path_win
  ps_path_win=$(cygpath -w "$ps_path")

  if schtasks.exe /create \
      /tn "$REPORT_TASK_NAME" \
      /tr "powershell.exe -NonInteractive -File \"$ps_path_win\"" \
      /sc WEEKLY /d MON /st 09:00 \
      /f > /dev/null 2>&1; then
    success "Windows Task Scheduler: '$REPORT_TASK_NAME' runs every Monday at 09:00"
  else
    warn "Could not create Task Scheduler entry — create it manually:"
    echo "     schtasks /create /tn \"$REPORT_TASK_NAME\" /tr \"powershell.exe -NonInteractive -File \\\"$ps_path_win\\\"\" /sc WEEKLY /d MON /st 09:00 /f"
  fi
}

_setup_unix_schedule() {
  local audit_path="$HOME/.claude/scripts/skill-audit.js"
  local sh_path="$HOME/.claude/scripts/skill-report.sh"
  cat > "$sh_path" <<SHEOF
#!/usr/bin/env bash
node "$audit_path" --send
SHEOF
  chmod +x "$sh_path"

  local cron_line="0 9 * * 1 $sh_path"
  if crontab -l 2>/dev/null | grep -qF "skill-report"; then
    skip "crontab entry already present for skill-report"
  else
    (crontab -l 2>/dev/null; echo "$cron_line") | crontab -
    success "crontab: skill report scheduled every Monday at 09:00"
  fi
}

uname_out=$(uname -s 2>/dev/null || echo "unknown")
if echo "$uname_out" | grep -qi "mingw\|cygwin\|msys"; then
  _setup_windows_schedule
else
  _setup_unix_schedule
fi

echo ""
info "Skill usage log: ~/.claude/skill-usage-${MACHINE}.jsonl"
info "Email report: every Monday at 09:00 (covers the prior 7 days)"
info "On-demand: node ~/.claude/scripts/skill-audit.js [days]"

# ---------------------------------------------------------------------------
# Step 11 — Summary
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
