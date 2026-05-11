#!/usr/bin/env node
/**
 * PreToolUse hook — graph-tools enforcement for Grep and Glob.
 *
 * Event:   PreToolUse on Grep or Glob
 * Purpose: Block code-symbol Grep/Glob searches when a codebase graph is
 *          available; emit helpful guidance directing the orchestrator to
 *          use graph tools instead.
 *
 * Short-circuit order:
 *   1. CLAUDE_DISABLE_WORKFLOW_HOOKS → pass
 *   2. .claude-init/CODEBASE.md absent → pass
 *   3. Parse stdin input JSON
 *   4. [grep-allowed] prefix on pattern → pass
 *   5. Pattern classifier → block or pass
 *
 * Override: prefix pattern with [grep-allowed] to bypass, or set
 *           CLAUDE_DISABLE_WORKFLOW_HOOKS=1 for full emergency rollback.
 *
 * Log file: .claude/logs/grep-blocks.jsonl
 * Runtime budget: <30ms p50.
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// .claude/hooks/preToolUse/<file> → repo root is three levels up
const REPO_ROOT = resolve(dirname(__filename), '..', '..', '..');
const LOG_FILE = join(REPO_ROOT, '.claude', 'logs', 'grep-blocks.jsonl');

// ── Emergency disable ─────────────────────────────────────────────────────────
if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS) {
  process.exit(0);
}

// ── Marker path (test override supported) ─────────────────────────────────────
const markerPath = process.env.CODEBASE_MARKER_OVERRIDE
  ?? join(process.cwd(), '.claude-init', 'CODEBASE.md');

if (!existsSync(markerPath)) {
  // No graph in this repo — pass through.
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
  // Malformed input — pass through, don't block.
  process.exit(0);
}

// Extract fields. Claude Code may pass pattern as `pattern` or via the tool's
// own field name. For Grep: pattern. For Glob: pattern. Scope: path or glob.
const toolName = input?.tool_name ?? input?.name ?? '';
const pattern = input?.pattern ?? input?.query ?? '';
const scope = input?.path ?? input?.glob ?? input?.include ?? '';

// ── [grep-allowed] override check ────────────────────────────────────────────
if (typeof pattern === 'string' && pattern.startsWith('[grep-allowed]')) {
  process.exit(0);
}

// ── Glob file-pattern pass-through ───────────────────────────────────────────
// Glob with a glob pattern like **/*.ext is a file-tree search, not a symbol
// search. Only Grep patterns are subject to the symbol classifier.
if (toolName === 'Glob') {
  // Glob is always a file-pattern search — allow.
  process.exit(0);
}

// ── File-scope extraction ─────────────────────────────────────────────────────
// Determine whether the scope targets a non-source file (log, config, etc.).
const NON_SOURCE_EXTS = new Set([
  '.log', '.json', '.yaml', '.yml', '.md', '.txt', '.csv', '.env',
]);

const SOURCE_EXTS = new Set([
  '.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.dart',
  '.java', '.kt', '.swift', '.cpp', '.c', '.h', '.hpp', '.rb', '.php',
]);

function scopeIsNonSource(s) {
  if (!s) return false;
  // Check the extension of the scope path/glob
  const ext = extname(s).toLowerCase();
  if (NON_SOURCE_EXTS.has(ext)) return true;
  // Bare filenames like ".env" (no extension matched above)
  if (s === '.env' || s.endsWith('/.env') || s.endsWith('\\.env')) return true;
  return false;
}

function scopeIsSource(s) {
  if (!s) return false;
  const ext = extname(s).toLowerCase();
  return SOURCE_EXTS.has(ext);
}

// ── Pattern classifier ────────────────────────────────────────────────────────
// Non-source scope → always allow.
if (scopeIsNonSource(scope)) {
  process.exit(0);
}

const patternStr = typeof pattern === 'string' ? pattern : '';

// Common word allowlist — single short words that are clearly text searches.
const COMMON_TEXT_WORDS = new Set(['TODO', 'FIXME', 'XXX', 'HACK', 'NOTE', 'WARN', 'TEMP']);
if (COMMON_TEXT_WORDS.has(patternStr.trim())) {
  process.exit(0);
}

// ALL_CAPS_WORD pattern — looks like a constant/log marker, not a code symbol.
// Matches: ERROR_DB_TIMEOUT, API_KEY, WARN_SOMETHING, etc.
// Rule: entirely uppercase + underscores + digits, at least 3 chars.
if (/^[A-Z][A-Z0-9_]+$/.test(patternStr.trim())) {
  process.exit(0);
}

// ── Code-symbol detection ─────────────────────────────────────────────────────
// Returns true if the pattern looks like a code-symbol search.
function isCodeSymbol(pat, scope) {
  // Normalise: strip common regex anchor characters before classifying.
  // Patterns like '^class Foo' are structurally a definition-prefix search.
  const normalised = pat.replace(/^\^/, '').replace(/\$$/, '').trim();

  // 1. Definition prefix: class/function/def/interface/type/struct/enum
  if (/^(class|function|def|interface|type|struct|enum)\s+\w+/.test(normalised)) return true;

  // 2. Function-call shape: word followed by ( — even partial like getUserById(
  if (/\w+\s*\(/.test(normalised)) return true;

  // 3. Qualified name: foo.bar.baz (at least two dots with lowercase identifiers)
  if (/\.[a-z][A-Za-z0-9_]+\.[a-z]/.test(normalised)) return true;

  // 4. Bare identifier: lower/underscore start, alphanumeric/underscore body
  //    Block if: (a) scope is source code OR (b) no scope provided
  const looksLikeIdentifier = /^_?[a-z][A-Za-z0-9_]*$/.test(normalised);
  if (looksLikeIdentifier) {
    const noScope = !scope || scope.trim() === '';
    const sourceScope = scopeIsSource(scope);
    if (noScope || sourceScope) return true;
  }

  return false;
}

const codeSymbol = isCodeSymbol(patternStr, scope);

// ── Allow path ────────────────────────────────────────────────────────────────
if (!codeSymbol) {
  process.exit(0);
}

// ── Block path ────────────────────────────────────────────────────────────────

// Extract a bare symbol name for the suggested query (strip regex anchors etc.)
function extractSymbol(pat) {
  // Strip leading anchors and common regex syntax
  let sym = pat
    .replace(/^\^/, '')                        // leading ^
    .replace(/\$$/, '')                        // trailing $
    .replace(/^(class|function|def|interface|type|struct|enum)\s+/, '') // def prefix
    .replace(/\s*\(.*$/, '')                   // trailing ( and args
    .replace(/[\\.*+?[\]{}()|]/g, '')          // remaining regex chars
    .trim();
  return sym || pat;
}

const symbol = extractSymbol(patternStr);

const reason =
  `Blocked: query looks like a code-symbol search. Use graph tools instead. ` +
  `For this query: query_graph({"cypher":"MATCH (f:Function) WHERE f.name = '${symbol}' RETURN f.file, f.line"}). ` +
  `Or load graph tools first if not loaded: ToolSearch(select:search_graph,query_graph,trace_path,get_architecture,search_code,get_code_snippet).`;

const blockOutput = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
};

process.stdout.write(JSON.stringify(blockOutput) + '\n');

// ── Log the block decision ────────────────────────────────────────────────────
try {
  const logDir = dirname(LOG_FILE);
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    tool: toolName,
    pattern: patternStr,
    scope: scope || null,
    classifier_match: 'code-symbol',
    decision: 'block',
  };
  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
} catch {
  // Log failure is non-fatal.
}

process.exit(0);
