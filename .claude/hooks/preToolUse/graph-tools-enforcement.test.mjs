#!/usr/bin/env node
/**
 * Test suite for graph-tools-enforcement.mjs
 *
 * Run: node .claude/hooks/preToolUse/graph-tools-enforcement.test.mjs
 *
 * Test isolation strategy: the hook reads CODEBASE_MARKER_OVERRIDE env var as
 * the path to the CODEBASE.md marker file (instead of the default
 * <cwd>/.claude-init/CODEBASE.md). Tests set this to a tmp path they
 * control, creating/deleting the file as needed. This avoids touching the
 * actual repo's .claude-init/ directory.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const HOOK = resolve(__filename, '..', 'graph-tools-enforcement.mjs');

// ── Temp dir for marker file ──────────────────────────────────────────────────
const TMP = mkdtempSync(join(tmpdir(), 'graph-tools-test-'));
const MARKER_PATH = join(TMP, 'CODEBASE.md');

// ── Helpers ───────────────────────────────────────────────────────────────────
function createMarker() {
  writeFileSync(MARKER_PATH, 'placeholder');
}

function removeMarker() {
  if (existsSync(MARKER_PATH)) unlinkSync(MARKER_PATH);
}

/**
 * Run the hook with given input JSON and environment.
 * Returns { stdout, stderr, exitCode, parsed }.
 */
function runHook(input, { markerExists = true, disableHooks = false } = {}) {
  if (markerExists) {
    createMarker();
  } else {
    removeMarker();
  }

  const env = {
    ...process.env,
    CODEBASE_MARKER_OVERRIDE: MARKER_PATH,
  };

  if (disableHooks) {
    env.CLAUDE_DISABLE_WORKFLOW_HOOKS = '1';
  } else {
    delete env.CLAUDE_DISABLE_WORKFLOW_HOOKS;
  }

  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env,
    timeout: 5000,
  });

  let parsed = null;
  if (result.stdout && result.stdout.trim()) {
    try {
      parsed = JSON.parse(result.stdout.trim());
    } catch {
      // leave null
    }
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? -1,
    parsed,
  };
}

// ── Test runner ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertBlock(result, description) {
  assert(result.exitCode === 0, `${description}: expected exit 0, got ${result.exitCode}`);
  assert(result.parsed !== null, `${description}: expected JSON output (block), got no output`);
  const decision = result.parsed?.hookSpecificOutput?.permissionDecision;
  assert(decision === 'deny', `${description}: expected permissionDecision=deny, got ${decision}`);
  const reason = result.parsed?.hookSpecificOutput?.permissionDecisionReason;
  assert(typeof reason === 'string' && reason.length > 0, `${description}: expected non-empty permissionDecisionReason`);
  // Guidance must mention graph tools
  assert(
    reason.includes('query_graph') || reason.includes('ToolSearch') || reason.includes('graph tool'),
    `${description}: reason must mention graph tools, got: ${reason}`
  );
}

function assertAllow(result, description) {
  assert(result.exitCode === 0, `${description}: expected exit 0, got ${result.exitCode}`);
  assert(
    result.stdout.trim() === '',
    `${description}: expected silent pass (no stdout), got: ${result.stdout.trim()}`
  );
}

// ── Cases ─────────────────────────────────────────────────────────────────────
console.log('\nGraph-tools enforcement hook — 10 test cases\n');

// Case 1: code-symbol regex (class definition), scoped to lib/
test('Case 1: Grep class-def regex in lib/ → BLOCK', () => {
  const result = runHook(
    { tool_name: 'Grep', pattern: '^class QrScannerScreen', path: 'lib/' },
    { markerExists: true }
  );
  assertBlock(result, 'Case 1');
});

// Case 2: log file scope → ALLOW
test('Case 2: Grep ERROR_DB_TIMEOUT in app.log → ALLOW', () => {
  const result = runHook(
    { tool_name: 'Grep', pattern: 'ERROR_DB_TIMEOUT', path: 'app.log' },
    { markerExists: true }
  );
  assertAllow(result, 'Case 2');
});

// Case 3: .env file scope → ALLOW
test('Case 3: Grep API_KEY in .env → ALLOW', () => {
  const result = runHook(
    { tool_name: 'Grep', pattern: 'API_KEY', path: '.env' },
    { markerExists: true }
  );
  assertAllow(result, 'Case 3');
});

// Case 4: bare identifier, no scope → BLOCK
test('Case 4: Grep _backToHomePage no scope → BLOCK', () => {
  const result = runHook(
    { tool_name: 'Grep', pattern: '_backToHomePage' },
    { markerExists: true }
  );
  assertBlock(result, 'Case 4');
});

// Case 5: Glob file pattern → ALLOW
test('Case 5: Glob **/*.dart no scope → ALLOW', () => {
  const result = runHook(
    { tool_name: 'Glob', pattern: '**/*.dart' },
    { markerExists: true }
  );
  assertAllow(result, 'Case 5');
});

// Case 6: common text word → ALLOW
test('Case 6: Grep TODO anywhere → ALLOW', () => {
  const result = runHook(
    { tool_name: 'Grep', pattern: 'TODO' },
    { markerExists: true }
  );
  assertAllow(result, 'Case 6');
});

// Case 7: CODEBASE.md does not exist → ALWAYS ALLOW
test('Case 7: Grep anything when CODEBASE.md absent → ALLOW', () => {
  const result = runHook(
    { tool_name: 'Grep', pattern: '^class SomeClass', path: 'src/' },
    { markerExists: false }
  );
  assertAllow(result, 'Case 7');
});

// Case 8: function-call pattern in src/ → BLOCK
test('Case 8: Grep getUserById( in src/ → BLOCK', () => {
  const result = runHook(
    { tool_name: 'Grep', pattern: 'getUserById(', path: 'src/' },
    { markerExists: true }
  );
  assertBlock(result, 'Case 8');
});

// Case 9: explicit [grep-allowed] override marker → ALLOW
test('Case 9: [grep-allowed] prefix → ALLOW', () => {
  const result = runHook(
    { tool_name: 'Grep', pattern: '[grep-allowed] some pattern', path: 'src/' },
    { markerExists: true }
  );
  assertAllow(result, 'Case 9');
});

// Case 10: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → ALWAYS ALLOW
test('Case 10: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → ALLOW', () => {
  const result = runHook(
    { tool_name: 'Grep', pattern: '^class SomeClass', path: 'src/' },
    { markerExists: true, disableHooks: true }
  );
  assertAllow(result, 'Case 10');
});

// ── Cleanup ───────────────────────────────────────────────────────────────────
removeMarker();
try { rmSync(TMP, { recursive: true, force: true }); } catch { /* non-fatal */ }

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} cases: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
