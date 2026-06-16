#!/usr/bin/env node
/**
 * PreToolUse hook — advisory install-vetting nudge.
 *
 * Event:   PreToolUse on Bash
 * Purpose: Detect install commands and nudge Claude to run the vet-install
 *          funnel (rules/install-vetting.md) before proceeding.
 *
 * Advisory-only contract (NEVER returns "deny"):
 *   - Install command detected → permissionDecision: "ask" + reason
 *   - No install match, wrong tool, or bypass active → silent exit 0
 *
 * Short-circuit order:
 *   1. CLAUDE_DISABLE_WORKFLOW_HOOKS → pass
 *   2. tool_name !== 'Bash' → pass
 *   3. Parse stdin
 *   4. Pattern match → ask or pass
 *
 * Surfaces covered:
 *   Python: pip install, pip3 install, python -m pip install, pipx install,
 *           poetry add, pdm add, uvx <tool>, uv tool install
 *   Node:   npm install, npm i, npm add, yarn add, pnpm add, bun add
 *   Rust:   cargo install
 *   Ruby:   gem install
 *   VSCode: code --install-extension
 *   MCP:    claude mcp add
 *
 * Read-only commands that must NOT match:
 *   pip list, pip show, npm ls, npm list
 *
 * Override: set CLAUDE_DISABLE_WORKFLOW_HOOKS=1 for full emergency bypass.
 * Runtime budget: <20ms p50.
 */

import { readFileSync } from 'node:fs';

// ── Emergency disable ─────────────────────────────────────────────────────────
if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS) {
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
let input;
try {
  input = JSON.parse(rawInput);
} catch {
  // Malformed input — pass through, never block.
  process.exit(0);
}

// ── Tool filter ───────────────────────────────────────────────────────────────
const toolName = input?.tool_name ?? input?.name ?? '';
if (toolName !== 'Bash') {
  process.exit(0);
}

// ── Extract command string ────────────────────────────────────────────────────
const command = (input?.tool_input?.command ?? input?.command ?? '').trim();
if (!command) {
  process.exit(0);
}

// ── Install pattern matcher ───────────────────────────────────────────────────
//
// Design notes:
//   - All patterns are case-insensitive.
//   - Word-boundary semantics: patterns must match at the start of the command
//     or after whitespace/semicolons/pipes (i.e. after a shell word boundary).
//     We normalise by lower-casing the whole command and testing against
//     individual shell words / sub-commands.
//   - Read-only commands (pip list, pip show, npm ls, npm list) must NOT match.
//   - `npm i` must match `npm i lodash` but must NOT match inside `npm install`
//     (the `npm install` pattern is tested first; `npm i` is a separate pattern
//     that only applies when the next char after `i` is whitespace or end-of-line).

const lower = command.toLowerCase();

/**
 * Returns true if `needle` appears at a "shell word start" position in `haystack`.
 * A shell word start is: the beginning of the string, or after one of: space,
 * tab, ;, |, &, (, `\n`.
 */
function matchesAtWordStart(haystack, needle) {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  if (idx === 0) return true;
  const prev = haystack[idx - 1];
  return /[\s;|&(`\n]/.test(prev);
}

/**
 * Returns true if `needle` appears at a word start AND is immediately followed
 * by whitespace or end-of-string (i.e. needle is a complete token, not a prefix
 * of a longer word).
 */
function matchesWholeToken(haystack, needle) {
  if (!matchesAtWordStart(haystack, needle)) return false;
  const after = haystack[needle.length + (haystack.indexOf(needle))];
  // after is undefined (end of string) or whitespace
  return after === undefined || /\s/.test(after);
}

// Ordered checks — most specific first to avoid double-matching.

// 1. python -m pip install
if (matchesAtWordStart(lower, 'python -m pip install') ||
    matchesAtWordStart(lower, 'python3 -m pip install')) {
  emitAsk(command);
}

// 2. pip3 install / pip install  (but NOT pip list / pip show)
if (matchesAtWordStart(lower, 'pip3 install') ||
    matchesAtWordStart(lower, 'pip install')) {
  emitAsk(command);
}

// 3. uv tool install
if (matchesAtWordStart(lower, 'uv tool install')) {
  emitAsk(command);
}

// 4. uvx <something> — "uvx " (with trailing space) means tool invocation
if (matchesAtWordStart(lower, 'uvx ')) {
  emitAsk(command);
}

// 5. pipx install
if (matchesAtWordStart(lower, 'pipx install')) {
  emitAsk(command);
}

// 6. poetry add
if (matchesAtWordStart(lower, 'poetry add')) {
  emitAsk(command);
}

// 7. pdm add
if (matchesAtWordStart(lower, 'pdm add')) {
  emitAsk(command);
}

// 8. npm install / npm add  (before `npm i` to avoid double-match confusion)
if (matchesAtWordStart(lower, 'npm install') ||
    matchesAtWordStart(lower, 'npm add')) {
  emitAsk(command);
}

// 9. npm i <package> — the short alias.
//    Match "npm i" only when followed by whitespace (so "npm install" doesn't
//    also trigger this — it already triggered above, and this path won't be
//    reached because emitAsk() exits).
if (matchesAtWordStart(lower, 'npm i ') ||
    lower === 'npm i') {
  emitAsk(command);
}

// 10. yarn add
if (matchesAtWordStart(lower, 'yarn add')) {
  emitAsk(command);
}

// 11. pnpm add
if (matchesAtWordStart(lower, 'pnpm add')) {
  emitAsk(command);
}

// 12. bun add
if (matchesAtWordStart(lower, 'bun add')) {
  emitAsk(command);
}

// 13. cargo install
if (matchesAtWordStart(lower, 'cargo install')) {
  emitAsk(command);
}

// 14. gem install
if (matchesAtWordStart(lower, 'gem install')) {
  emitAsk(command);
}

// 15. code --install-extension
if (matchesAtWordStart(lower, 'code --install-extension')) {
  emitAsk(command);
}

// 16. claude mcp add
if (matchesAtWordStart(lower, 'claude mcp add')) {
  emitAsk(command);
}

// ── No match → silent pass ────────────────────────────────────────────────────
process.exit(0);

// ── Advisory emitter (never returns — always exits 0) ─────────────────────────
function emitAsk(cmd) {
  const reason =
    `Install command detected: \`${cmd}\`. ` +
    `Before installing, run the \`vet-install\` funnel to check reputation, ` +
    `capability fit, and security: Skill { skill: "vet-install", args: "${cmd}" }. ` +
    `See \`rules/install-vetting.md\` for the full vetting policy. ` +
    `This is advisory — proceed if you have already vetted this package.`;

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  };

  process.stdout.write(JSON.stringify(output) + '\n');
  process.exit(0);
}
