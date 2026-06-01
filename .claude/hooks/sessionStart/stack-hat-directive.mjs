#!/usr/bin/env node
/**
 * SessionStart hook — stack-hat injection.
 *
 * When project.json in CWD declares a non-empty `stacks` array, read each
 * matching ~/.claude/stacks/<stack>.md catalog file, extract its `## Hat`
 * section, compose them, and inject as additionalContext. Applies a size
 * budget: full content when small; a pointer-to-file directive when large.
 *
 * Never blocks session start — all paths exit 0. Follows the cwd-gated pattern
 * of graph-tools-directive.mjs (no stdin read needed).
 *
 * Env overrides:
 *   PROJECT_JSON_OVERRIDE          — path to project.json (tests)
 *   STACKS_DIR_OVERRIDE            — path to the stacks catalog dir (tests)
 *   CLAUDE_DISABLE_WORKFLOW_HOOKS  — full bypass
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Token budget proxy: ~800 tokens ≈ 3200 chars (chars/4 heuristic).
const HAT_BUDGET_CHARS = 3200;

// ── Emergency disable ─────────────────────────────────────────
if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS) {
  process.exit(0);
}

// ── Resolve & read project.json ────────────────────────────────
const projectJsonPath =
  process.env.PROJECT_JSON_OVERRIDE ?? join(process.cwd(), 'project.json');

if (!existsSync(projectJsonPath)) {
  process.exit(0);
}

let stacks;
try {
  const parsed = JSON.parse(readFileSync(projectJsonPath, 'utf8'));
  stacks = parsed?.stacks;
} catch {
  process.exit(0); // unparseable project.json — never block
}

if (!Array.isArray(stacks) || stacks.length === 0) {
  process.exit(0);
}

// ── Resolve catalog dir ────────────────────────────────────
const stacksDir =
  process.env.STACKS_DIR_OVERRIDE ?? join(homedir(), '.claude', 'stacks');

// Extract the body under a `## <name>` heading, up to the next `## ` heading.
function extractSection(md, name) {
  const lines = md.split(/\r?\n/);
  const startIdx = lines.findIndex(
    (l) => l.trim() === `## ${name}` || l.trim().startsWith(`## ${name} `)
  );
  if (startIdx === -1) return null;
  const body = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n').trim();
}

// ── Collect hats ─────────────────────────────────────────
const hats = [];     // { name, body }
const missing = [];  // stack names with no/invalid entry

for (const stack of stacks) {
  if (typeof stack !== 'string' || !stack.trim()) continue;
  if (!/^[A-Za-z0-9_-]+$/.test(stack.trim())) { missing.push(stack); continue; }
  const file = join(stacksDir, `${stack}.md`);
  if (!existsSync(file)) {
    missing.push(stack);
    continue;
  }
  let body = null;
  try {
    body = extractSection(readFileSync(file, 'utf8'), 'Hat');
  } catch {
    body = null;
  }
  if (!body) {
    missing.push(stack);
    continue;
  }
  hats.push({ name: stack, body });
}

if (hats.length === 0 && missing.length === 0) {
  process.exit(0);
}

// ── Compose payload (size-budgeted) ──────────────────────────
const fullText = hats.map((h) => `### ${h.name} hat\n${h.body}`).join('\n\n');

let payload = '';
if (hats.length > 0) {
  if (fullText.length <= HAT_BUDGET_CHARS) {
    payload =
      'Stack hats active for this repo (layered on your SE-fundamentals):\n\n' +
      fullText;
  } else {
    const names = hats.map((h) => h.name).join(', ');
    const pointers = hats
      .map((h) => `  - ${h.name}: read ~/.claude/stacks/${h.name}.md §Hat`)
      .join('\n');
    payload =
      `Stack hats active (${names}) — composed guidance exceeds the inline ` +
      `budget, so read each on demand when working on that stack:\n${pointers}`;
  }
}

if (missing.length > 0) {
  const note =
    `No catalog entry yet for: ${missing.join(', ')} ` +
    `(declared in project.json "stacks" but no ~/.claude/stacks/<name>.md with a ## Hat section).`;
  payload = payload ? `${payload}\n\n${note}` : note;
}

// ── Emit ─────────────────────────────────────────────
const output = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: payload,
  },
};

process.stdout.write(JSON.stringify(output) + '\n');
process.exit(0);
