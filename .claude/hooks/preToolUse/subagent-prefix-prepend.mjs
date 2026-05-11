#!/usr/bin/env node
/**
 * PreToolUse hook — Subagent role-prefix auto-prepend.
 *
 * Event:   PreToolUse on Agent tool (scoped via settings.json matcher)
 * Purpose: Detect role marker on first non-empty line of prompt, read matching
 *          prefix file, prepend bytes to the prompt, strip the marker line.
 *          Yields byte-identical prefix across same-role dispatches → automatic
 *          prompt-cache hits.
 *
 * Marker syntax: `[role: implementer]` / `[role: spec-reviewer]` / `[role: code-quality-reviewer]`
 * No marker → pass through (covers architect, researcher, test-* dispatches and any
 * Agent dispatch authored without the marker).
 *
 * DESIGN DECISION — missing prefix file emits permissionDecision: "deny":
 *   The existing agent-model-pinning.mjs hook never blocks (always exits 0). This
 *   hook deliberately deviates: a missing prefix file is a deployment error that
 *   would silently produce a cache miss AND a malformed dispatch. Failing loud
 *   forces the operator to notice immediately. The CLAUDE_DISABLE_WORKFLOW_HOOKS
 *   env var is the recovery path.
 *
 *   Schema precedent: graph-tools-enforcement.mjs:206-212 emits the same
 *   { hookSpecificOutput: { hookEventName, permissionDecision: "deny",
 *   permissionDecisionReason } } shape for its block-symbol-search path.
 *   The schema is verified against the harness by that hook's working behavior.
 *
 * HOOK ORDERING — coexistence with agent-model-pinning.mjs:
 *   Both hooks register on the "Agent" matcher in .claude/settings.json. Each
 *   receives the original input independently and may emit its own updatedInput.
 *   The harness's reconciliation when two hooks emit updatedInput in the same
 *   matcher block is not formally documented in this codebase. In practice this
 *   is benign because:
 *     1. agent-model-pinning.mjs only emits updatedInput when model is unset
 *        (its Case 2). The per-dispatch model requirement in
 *        subagent-driven-development means model is usually set explicitly,
 *        making Case 2 rare.
 *     2. This hook only overrides the `prompt` field; agent-model-pinning's
 *        model-injection path overrides the `model` field. The two writes touch
 *        different fields, so even a naive merge or last-write-wins reconciler
 *        produces a sensible result IF the harness's merge is field-level.
 *   If the harness uses object-level last-write-wins (entire updatedInput
 *   replaces the prior), this hook (running second per registration order)
 *   would silently lose any model injection from agent-model-pinning.mjs.
 *   Mitigation: keep model: parameter explicit in all dispatch sites
 *   (already required by the per-dispatch rule).
 *
 * Log file: .claude/logs/subagent-prefix.jsonl
 */

import { readFileSync, readSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..', '..');
const PREFIX_DIR = join(REPO_ROOT, 'skills', 'subagent-driven-development', 'prefixes');
const LOG_FILE = join(REPO_ROOT, '.claude', 'logs', 'subagent-prefix.jsonl');
const SEPARATOR = '\n\n---\n\n';
const MARKER_RE = /^\[role:\s*(implementer|spec-reviewer|code-quality-reviewer)\]\s*$/;

// Emergency disable
if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS) {
  process.exit(0);
}

// Read stdin (cross-platform; mirror agent-model-pinning.mjs pattern)
let rawInput = '';
try {
  rawInput = readFileSync('/dev/stdin', 'utf8');
} catch {
  try {
    const buf = [];
    const chunk = Buffer.alloc(65536);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const n = readSync(0, chunk, 0, chunk.length, null);
        if (n === 0) break;
        buf.push(chunk.slice(0, n).toString('utf8'));
      } catch { break; }
    }
    rawInput = buf.join('');
  } catch {
    process.stderr.write('[prefix-hook] malformed input, passing through\n');
    process.exit(0);
  }
}

let input;
try { input = JSON.parse(rawInput); }
catch {
  process.stderr.write('[prefix-hook] malformed input, passing through\n');
  process.exit(0);
}

// Read prompt from top-level (matches agent-model-pinning.mjs schema)
const prompt = typeof input?.prompt === 'string' ? input.prompt : '';
if (!prompt) process.exit(0);

// Find first non-empty line; only inspect THAT line for a marker
const lines = prompt.split('\n');
let markerIdx = -1;
let role = null;
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (trimmed.length === 0) continue;
  const m = trimmed.match(MARKER_RE);
  if (m) { markerIdx = i; role = m[1]; }
  break; // only the first non-empty line is inspected
}

if (role === null) process.exit(0);

// Read prefix file
const prefixPath = join(PREFIX_DIR, `${role}.md`);
let prefixBytes;
try {
  prefixBytes = readFileSync(prefixPath, 'utf8');
} catch (err) {
  process.stderr.write(`[prefix-hook] cannot read prefix file ${prefixPath}: ${err.code || err.message}\n`);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Subagent prefix file unreadable: ${prefixPath} (${err.code || 'unknown error'}). Cannot assemble prompt.`
    }
  }) + '\n');
  process.exit(0);
}

// Parse version from frontmatter (simple multiline search — works regardless of field order)
const versionMatch = prefixBytes.match(/^version:\s*(\S+)/m);
const version = versionMatch ? versionMatch[1] : 'unknown';

// Strip marker line; keep surrounding content. Preserve leading whitespace before the marker if any.
const suffix = lines.slice(0, markerIdx).concat(lines.slice(markerIdx + 1)).join('\n').replace(/^\n+/, '');

// Assemble: full prefix bytes (including frontmatter) + separator + suffix
const assembled = `${prefixBytes.replace(/\n+$/, '')}${SEPARATOR}${suffix}`;

// Audit log (failure non-fatal)
try {
  if (!existsSync(dirname(LOG_FILE))) mkdirSync(dirname(LOG_FILE), { recursive: true });
  appendFileSync(LOG_FILE, JSON.stringify({
    ts: new Date().toISOString(),
    role,
    prefix_version: version,
    suffix_first_60: suffix.slice(0, 60).replace(/\n/g, ' ')
  }) + '\n');
} catch { /* non-fatal */ }

// Emit modified input. Build updatedInput by spreading top-level fields and overriding prompt.
const { ...rest } = input;
const updatedInput = { ...rest, prompt: assembled };
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    updatedInput
  }
}) + '\n');
process.exit(0);
