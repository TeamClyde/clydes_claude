#!/usr/bin/env node
/**
 * PreToolUse hook — Agent dispatch model pinning + audit.
 *
 * Event:   PreToolUse on Agent tool
 * Purpose: Audit Agent dispatches; inject Sonnet default when model unset for
 *          non-Haiku-pinned subagents; log override events.
 *
 * DESIGN DECISION — model_override_reason detection:
 *   Primary path:  Check for top-level `model_override_reason` field on the
 *                  input JSON.
 *   Fallback path: Scan prompt and description for the marker line:
 *                  [model-override-reason: <justification>]
 *                  Regex: /\[model-override-reason:\s*([^\]]+)\]/
 *   Rationale: The harness may drop unknown fields from updatedInput. The
 *              marker-scan path is harness-independent and works regardless.
 *   Both paths are implemented for robustness. The top-level field, if present,
 *   is stripped from any emitted updatedInput (Agent tool schema doesn't include
 *   it and the harness drops unknown fields).
 *
 * Never blocks (exit 0 on all paths). Total runtime budget: <50ms p50.
 *
 * Log file: .claude/logs/agent-dispatches.jsonl
 */

import { readFileSync, readdirSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// .claude/hooks/preToolUse/agent-model-pinning.mjs → repo root is three levels up
const REPO_ROOT = resolve(dirname(__filename), '..', '..', '..');
const AGENTS_DIR = join(REPO_ROOT, 'agents');
const LOG_FILE = join(REPO_ROOT, '.claude', 'logs', 'agent-dispatches.jsonl');
const HAIKU_MODEL_STRING = 'model: claude-haiku-4-5-20251001';
// Marker regex for override reason embedded in prompt/description fields
const OVERRIDE_REASON_MARKER = /\[model-override-reason:\s*([^\]]+)\]/;

// ── Emergency disable ─────────────────────────────────────────────────────────
if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS) {
  process.exit(0);
}

// ── Read stdin ────────────────────────────────────────────────────────────────
let rawInput = '';
try {
  rawInput = readFileSync('/dev/stdin', 'utf8');
} catch {
  // On Windows, /dev/stdin may not exist — fall back to reading fd 0
  try {
    const buf = [];
    const fd = 0; // stdin
    const chunk = Buffer.alloc(65536);
    let bytesRead;
    // Synchronous read loop on fd 0
    const { readSync } = await import('node:fs');
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        bytesRead = readSync(fd, chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        buf.push(chunk.slice(0, bytesRead).toString('utf8'));
      } catch {
        break;
      }
    }
    rawInput = buf.join('');
  } catch {
    // Can't read stdin — pass through
    process.stderr.write('[a1-hook] malformed input, passing through\n');
    process.exit(0);
  }
}

// ── Parse JSON ────────────────────────────────────────────────────────────────
let input;
try {
  input = JSON.parse(rawInput);
} catch {
  process.stderr.write('[a1-hook] malformed input, passing through\n');
  process.exit(0);
}

// ── Validate subagent_type ────────────────────────────────────────────────────
const subagentType = input?.subagent_type;
if (!subagentType) {
  process.stderr.write('[a1-hook] missing subagent_type field, passing through\n');
  process.exit(0);
}

// ── Build Haiku allowlist by scanning agents/*.md ─────────────────────────────
const haikuPinned = new Set();
try {
  const agentFiles = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
  for (const file of agentFiles) {
    const content = readFileSync(join(AGENTS_DIR, file), 'utf8');
    if (content.includes(HAIKU_MODEL_STRING)) {
      // Extract agent name from filename (strip .md)
      haikuPinned.add(file.replace(/\.md$/, ''));
    }
  }
} catch {
  // If agents dir can't be read, proceed with empty allowlist (no blocking)
}

const isHaikuPinned = haikuPinned.has(subagentType);
const modelSet = input?.model;

// ── Detect override reason (both paths) ──────────────────────────────────────
let overrideReason = null;

// Primary path: top-level field
if (input?.model_override_reason) {
  overrideReason = String(input.model_override_reason).trim();
}

// Fallback path: scan prompt and description for marker
if (!overrideReason) {
  for (const field of ['prompt', 'description']) {
    const val = input?.[field];
    if (val) {
      const match = OVERRIDE_REASON_MARKER.exec(val);
      if (match) {
        overrideReason = match[1].trim();
        break;
      }
    }
  }
}

// ── Ensure log directory exists ───────────────────────────────────────────────
function ensureLogDir() {
  const logDir = dirname(LOG_FILE);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

// ── Append to log file ────────────────────────────────────────────────────────
function appendLog(entry) {
  try {
    ensureLogDir();
    appendFileSync(LOG_FILE, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n');
  } catch {
    // Log failure is non-fatal
  }
}

// ── Build updatedInput (strips model_override_reason from emitted object) ─────
function buildUpdatedInput(overrides = {}) {
  const { model_override_reason: _dropped, ...rest } = input;
  return { ...rest, ...overrides };
}

// ── Emit JSON envelope (for model injection) ──────────────────────────────────
function emitUpdatedInput(updatedInput) {
  const envelope = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput,
    },
  };
  process.stdout.write(JSON.stringify(envelope) + '\n');
}

// ── Main logic ────────────────────────────────────────────────────────────────

if (isHaikuPinned && !modelSet) {
  // Case 1: Haiku-pinned agent, no model override — pass through silently.
  // Frontmatter wins; no injection needed.
  process.exit(0);
}

if (isHaikuPinned && modelSet) {
  // Case 5: Haiku-pinned agent but orchestrator set a model → warn.
  // Frontmatter wins regardless (Claude Code guarantee), so pass through.
  if (!overrideReason) {
    process.stderr.write(
      `[a1-hook] subagent_type=${subagentType} model=${modelSet} override without justification (frontmatter pinned haiku)\n`
    );
    appendLog({ subagent_type: subagentType, model: modelSet, reason: null, justified: false });
  } else {
    appendLog({ subagent_type: subagentType, model: modelSet, reason: overrideReason, justified: true });
  }
  process.exit(0);
}

// Non-Haiku-pinned agent below this point.

if (!modelSet) {
  // Case 2: Non-pinned agent, model unset → inject sonnet default.
  process.stderr.write(
    `[a1-hook] subagent_type=${subagentType} model unset → injected sonnet default\n`
  );
  emitUpdatedInput(buildUpdatedInput({ model: 'sonnet' }));
  process.exit(0);
}

// Non-pinned agent with model explicitly set (override).
if (!overrideReason) {
  // Case 3: Override without justification → warn.
  process.stderr.write(
    `[a1-hook] subagent_type=${subagentType} model=${modelSet} override without justification\n`
  );
  appendLog({ subagent_type: subagentType, model: modelSet, reason: null, justified: false });
} else {
  // Case 4: Override with justification → log silently.
  appendLog({ subagent_type: subagentType, model: modelSet, reason: overrideReason, justified: true });
}

process.exit(0);
