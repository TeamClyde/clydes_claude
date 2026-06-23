#!/usr/bin/env node
/**
 * PreToolUse hook — git command prohibitions.
 *
 * Event:   PreToolUse on Bash
 * Purpose: Deny universally-wrong git flags as a compliance safety-net
 *          against the assistant's own drift (honest-mistake interception).
 *
 * Threat model: This is NOT a security boundary — command-string interception
 * is trivially evadable and that is explicitly out of scope. The sole goal is
 * catching accidental misuse of prohibited flags.
 *
 * Prohibited patterns:
 *   - Stage-all:  git add -A / git add --all / git add .
 *   - Hook-skip:  --no-verify (as a standalone flag in any git command)
 *
 * Short-circuit order:
 *   1. CLAUDE_DISABLE_WORKFLOW_HOOKS → pass
 *   2. Parse stdin; malformed → pass
 *   3. tool_name !== 'Bash' → pass
 *   4. [git-allowed] bypass marker → pass
 *   5. Strip quoted spans (false-positive guard for flags in commit messages)
 *   6. Not a git command → pass
 *   7. Stage-all detector → deny
 *   8. No-verify detector → deny
 *   9. No match → silent pass
 *
 * Override: prefix command with [git-allowed] to bypass, or set
 *           CLAUDE_DISABLE_WORKFLOW_HOOKS=1 for full emergency rollback.
 * Runtime budget: <10ms p50.
 */

import { readFileSync } from 'node:fs';

// ── Emergency disable ─────────────────────────────────────────────────────────
if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS === '1') {
  process.exit(0);
}

// ── Read stdin (Windows-safe) ─────────────────────────────────────────────────
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
let parsed;
try {
  parsed = JSON.parse(rawInput);
} catch {
  // Malformed input — pass through, never block.
  process.exit(0);
}

// ── Tool filter ───────────────────────────────────────────────────────────────
const toolName = parsed?.tool_name ?? parsed?.name ?? '';
if (toolName !== 'Bash') {
  process.exit(0);
}

// ── Extract command string ────────────────────────────────────────────────────
const command = parsed?.tool_input?.command ?? '';
if (!command) {
  process.exit(0);
}

// ── Bypass marker (mirrors graph-tools-enforcement's [grep-allowed]) ──────────
if (command.includes('[git-allowed]')) {
  process.exit(0);
}

// ── Strip quoted spans (false-positive guard) ─────────────────────────────────
// Flags inside commit messages (e.g. -m "fix --no-verify handling") must never
// match. Replace single- and double-quoted spans with empty quotes so the flag
// tokens inside cannot be detected.
const stripped = command.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');

// ── Gate: only police actual git commands ─────────────────────────────────────
// Match 'git' at word start (start of string, or after whitespace/shell operators).
const isGit = /(?:^|[\s;|&(`])git(?:\s|$)/.test(stripped);
if (!isGit) {
  process.exit(0);
}

// ── Detector 1 — stage-all ────────────────────────────────────────────────────
// `git add` followed by -A / --all / . (whitespace-or-EOL bounded after the arg).
const STAGE_ALL = /(?:^|[\s;|&(`])git\s+add\s+(?:-A|--all|\.)(?:\s|$)/;

// ── Detector 2 — hook-skip ────────────────────────────────────────────────────
// `--no-verify` as a standalone flag token in a git command.
const NO_VERIFY = /(?:^|\s)--no-verify(?:\s|$)/;

if (STAGE_ALL.test(stripped)) {
  emitDeny(
    command,
    'stage-all',
    'Stage specific files, not `git add -A`/`git add --all`/`git add .` — ' +
    'see CLAUDE.md Hard Prohibitions. Route commits through the git-manager skill. ' +
    'To bypass for a deliberate one-off, prefix the command with [git-allowed].'
  );
}

if (NO_VERIFY.test(stripped)) {
  emitDeny(
    command,
    'no-verify',
    'Do not skip git hooks with --no-verify unless the user explicitly asked. ' +
    'Route commits through the git-manager skill (which never uses --no-verify). ' +
    'If the user explicitly requested it, re-issue with the [git-allowed] bypass marker, ' +
    'or set CLAUDE_DISABLE_WORKFLOW_HOOKS=1.'
  );
}

// ── No match → silent pass ────────────────────────────────────────────────────
process.exit(0);

// ── Deny emitter ──────────────────────────────────────────────────────────────
// Matches the deny shape in graph-tools-enforcement.mjs.
// Never returns — always exits 0 (block signal is the permissionDecision field).
function emitDeny(_cmd, _kind, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }) + '\n');
  process.exit(0);
}
