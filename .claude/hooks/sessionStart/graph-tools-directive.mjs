#!/usr/bin/env node
/**
 * SessionStart hook — graph-tools loading directive.
 *
 * When .claude-init/CODEBASE.md exists in CWD (or CODEBASE_MARKER_OVERRIDE
 * path, for tests), inject additionalContext directing graph-tools loading
 * as turn-1 action.
 *
 * Never blocks session start — all paths exit 0.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Emergency disable ─────────────────────────────────────────────────────────
if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS) {
  process.exit(0);
}

// ── Marker path (test override supported) ─────────────────────────────────────
const markerPath = process.env.CODEBASE_MARKER_OVERRIDE
  ?? join(process.cwd(), '.claude-init', 'CODEBASE.md');

// ── Check existence ───────────────────────────────────────────────────────────
if (!existsSync(markerPath)) {
  // No graph in this repo — silent pass.
  process.exit(0);
}

// ── Emit additionalContext directive ──────────────────────────────────────────
const output = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext:
      'This repo has a codebase graph. Graph tools are deferred — load via:\n\n' +
      '  ToolSearch(select:search_graph,query_graph,trace_path,get_architecture,search_code,get_code_snippet)\n\n' +
      'before any code-search work. If you reach for Grep or Glob on source files, stop and load graph tools first. ' +
      'The .claude/hooks/preToolUse/graph-tools-enforcement.mjs hook will block source-symbol Grep when graph tools are available.',
  },
};

process.stdout.write(JSON.stringify(output) + '\n');
process.exit(0);
