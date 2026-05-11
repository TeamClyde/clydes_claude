#!/usr/bin/env node
/**
 * PostToolUse hook — graph-tools project-name self-heal.
 *
 * Event:   PostToolUse on mcp__codebase-memory-mcp__* tools
 * Purpose: Catch "project not found" errors from the codebase graph MCP;
 *          correct the project name in CLAUDE.md; emit additionalContext
 *          directing Claude to retry with the correct name.
 *
 * Investigation findings (2026-05-09, c4-investigation.md):
 *   - Error format when projects ARE indexed: JSON with "available_projects"
 *     array of NAME STRINGS (not objects with repo_path).
 *   - Error format when NO projects indexed: no "available_projects" field.
 *   - Single-entry available_projects → heal directly.
 *   - Multiple entries → instruct Claude to call list_projects() to disambiguate.
 *
 * Short-circuit order:
 *   1. CLAUDE_DISABLE_WORKFLOW_HOOKS → pass through
 *   2. Re-entry guard (CLAUDE_HOOK_GRAPH_TOOLS_HEAL_ACTIVE) → pass through
 *   3. Parse stdin
 *   4. Match: tool starts with mcp__codebase-memory-mcp__ AND output has "project not found"
 *   5. Parse available_projects from error; heal or guide
 *
 * Override: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 for emergency rollback.
 * Re-entry guard: CLAUDE_HOOK_GRAPH_TOOLS_HEAL_ACTIVE=1 prevents recursion.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ── Emergency disable ─────────────────────────────────────────────────────────
if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS) {
  process.exit(0);
}

// ── Re-entry guard ────────────────────────────────────────────────────────────
// Prevents the hook from firing during its own retry chain.
if (process.env.CLAUDE_HOOK_GRAPH_TOOLS_HEAL_ACTIVE) {
  process.exit(0);
}

// ── Read stdin ────────────────────────────────────────────────────────────────
let rawInput = '';
try {
  rawInput = readFileSync('/dev/stdin', 'utf8');
} catch {
  // Windows: /dev/stdin may not exist — read fd 0 synchronously
  try {
    const { readSync } = await import('node:fs');
    const buf = [];
    const chunk = Buffer.alloc(65536);
    let bytesRead;
    while (true) {
      try {
        bytesRead = readSync(0, chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        buf.push(chunk.slice(0, bytesRead).toString('utf8'));
      } catch {
        break;
      }
    }
    rawInput = buf.join('');
  } catch {
    process.exit(0);
  }
}

// ── Parse input ───────────────────────────────────────────────────────────────
let input;
try {
  input = JSON.parse(rawInput);
} catch {
  process.exit(0);
}

const toolName = input?.tool_name ?? '';
const toolOutput = input?.tool_output ?? '';

// ── Match condition ───────────────────────────────────────────────────────────
// Tool must be a codebase-memory-mcp tool and output must contain a project error.
if (!toolName.startsWith('mcp__codebase-memory-mcp__')) {
  process.exit(0);
}

const outputStr = typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput);

if (!outputStr.includes('project not found')) {
  process.exit(0);
}

// ── Set re-entry guard ────────────────────────────────────────────────────────
// Note: setting env vars in Node does not affect the parent process; this guard
// only matters within this process's own scope (e.g. if the heal path somehow
// triggers re-entry). The env var check above handles cross-process recursion
// when Claude Code re-fires the hook on a retry.
process.env.CLAUDE_HOOK_GRAPH_TOOLS_HEAL_ACTIVE = '1';

// ── Parse error response ──────────────────────────────────────────────────────
let errorObj = null;
try {
  errorObj = JSON.parse(outputStr);
} catch {
  // Non-JSON output — fall through to fallback guidance
}

const availableProjects = Array.isArray(errorObj?.available_projects)
  ? errorObj.available_projects.filter((p) => typeof p === 'string')
  : [];

// ── Resolve CLAUDE.md path ────────────────────────────────────────────────────
// CLAUDE_MD_OVERRIDE is set by tests for isolation. In production, use the
// project CLAUDE.md in the CWD passed via hook input (or fallback to process.cwd()).
const cwd = input?.cwd ?? process.cwd();
const claudeMdPath = process.env.CLAUDE_MD_OVERRIDE
  ?? resolve(cwd, 'CLAUDE.md');

// ── Heal helpers ──────────────────────────────────────────────────────────────

/**
 * Update the project name line in the "Codebase Knowledge Graph" section of CLAUDE.md.
 * Targets the line:
 *   - **Project name (codebase-memory-mcp):** `<old-name>` — pass as ...
 * Replaces the backtick-quoted name with the new name.
 * Returns true if a replacement was made, false if the pattern wasn't found.
 */
function updateClaudeMdProjectName(claudeMdPath, newName) {
  if (!existsSync(claudeMdPath)) return false;

  const content = readFileSync(claudeMdPath, 'utf8');
  // Match the project name line in the Codebase Knowledge Graph section.
  // The line format (from infra-init SKILL.md template):
  //   - **Project name (codebase-memory-mcp):** `<name>` — pass as ...
  // We replace the first backtick-quoted value on this line.
  const PROJECT_LINE_RE = /(- \*\*Project name \(codebase-memory-mcp\):\*\*\s*`)[^`]+(`)/;

  if (!PROJECT_LINE_RE.test(content)) return false;

  const updated = content.replace(PROJECT_LINE_RE, `$1${newName}$2`);
  writeFileSync(claudeMdPath, updated, 'utf8');
  return true;
}

// ── Emit additionalContext ────────────────────────────────────────────────────
function emit(additionalContext) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(output) + '\n');
}

// ── Heal decision ─────────────────────────────────────────────────────────────

if (availableProjects.length === 1) {
  // Single project — heal directly without needing list_projects()
  const correctName = availableProjects[0];
  const healed = updateClaudeMdProjectName(claudeMdPath, correctName);

  if (healed) {
    emit(
      `Project name was incorrect in CLAUDE.md. ` +
      `I've updated it to \`${correctName}\` (the only indexed project). ` +
      `Retry the original tool call with project: "${correctName}".`
    );
  } else {
    // CLAUDE.md not found or project line not in expected format — guide instead
    emit(
      `Project not found error: the project name in CLAUDE.md may be stale. ` +
      `The only indexed project is "${correctName}". ` +
      `Update the project name in CLAUDE.md's "Codebase Knowledge Graph" section ` +
      `to \`${correctName}\`, then retry the tool call with project: "${correctName}".`
    );
  }
} else if (availableProjects.length > 1) {
  // Multiple projects — can't disambiguate by name alone; instruct list_projects() call
  const projectList = availableProjects.map((p) => `"${p}"`).join(', ');
  emit(
    `Project not found error: the project name in CLAUDE.md is stale or incorrect. ` +
    `Available indexed projects: [${projectList}]. ` +
    `Call list_projects() to find the entry whose repo_path matches the current working directory (${cwd}), ` +
    `then update CLAUDE.md's "Codebase Knowledge Graph" section with the correct project name ` +
    `and retry the original tool call.`
  );
} else {
  // No available_projects in error (e.g. no projects indexed at all)
  emit(
    `Project not found and no indexed projects available. ` +
    `The codebase graph may not be indexed for this repo. ` +
    `Run \`/infra-init\` to index the repo, then retry. ` +
    `If indexing was done previously, call list_projects() to verify the project name ` +
    `and update CLAUDE.md's "Codebase Knowledge Graph" section accordingly.`
  );
}

// ── Clear re-entry guard ──────────────────────────────────────────────────────
delete process.env.CLAUDE_HOOK_GRAPH_TOOLS_HEAL_ACTIVE;

process.exit(0);
