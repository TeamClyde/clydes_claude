#!/usr/bin/env node
/**
 * Test suite for graph-tools-self-heal.mjs
 *
 * Run: node .claude/hooks/postToolUse/graph-tools-self-heal.test.mjs
 *
 * Investigation finding: codebase-memory-mcp's "project not found" error
 * includes `available_projects` as an array of NAME STRINGS (not objects).
 * When there is exactly 1 entry, the hook updates CLAUDE.md directly.
 * When there are 2+ entries, the hook instructs Claude to call list_projects().
 *
 * Test isolation:
 * - Tests use a temporary directory with a mock CLAUDE.md.
 * - CLAUDE_MD_OVERRIDE env var tells the hook which CLAUDE.md to read/write.
 * - Tests set CLAUDE_HOOK_GRAPH_TOOLS_HEAL_ACTIVE to test re-entry guard.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const HOOK = resolve(__filename, '..', 'graph-tools-self-heal.mjs');

// ── Temp dir for isolated CLAUDE.md ──────────────────────────────────────────
const TMP = mkdtempSync(join(tmpdir(), 'graph-self-heal-test-'));

// ── Sample CLAUDE.md with wrong project name ──────────────────────────────────
const WRONG_NAME = 'wrong-project-name-xyz';
const CORRECT_NAME = 'correct-project-name';

function buildClaudeMd(projectName) {
  return `# My Repo — Project Context

## Codebase Knowledge Graph

Generated: 2026-01-01

- **Project name (codebase-memory-mcp):** \`${projectName}\` — pass as the \`project\` parameter to \`search_code\`, \`search_graph\`, \`query_graph\`, \`trace_path\`, \`get_architecture\`.
- Summary: \`.claude-init/CODEBASE.md\`
`;
}

function writeMockClaude(projectName) {
  const path = join(TMP, 'CLAUDE.md');
  writeFileSync(path, buildClaudeMd(projectName));
  return path;
}

function readMockClaude() {
  return readFileSync(join(TMP, 'CLAUDE.md'), 'utf8');
}

// ── Hook runner ───────────────────────────────────────────────────────────────
function buildToolOutput(errorObj) {
  return JSON.stringify(errorObj);
}

function runHook(toolName, toolOutputObj, {
  disableHooks = false,
  reentryGuard = false,
  projectName = WRONG_NAME,
} = {}) {
  const claudeMdPath = writeMockClaude(projectName);

  const input = {
    tool_name: toolName,
    tool_output: buildToolOutput(toolOutputObj),
    hook_event_name: 'PostToolUse',
    cwd: TMP,
  };

  const env = {
    ...process.env,
    CLAUDE_MD_OVERRIDE: claudeMdPath,
  };

  if (disableHooks) {
    env.CLAUDE_DISABLE_WORKFLOW_HOOKS = '1';
  } else {
    delete env.CLAUDE_DISABLE_WORKFLOW_HOOKS;
  }

  if (reentryGuard) {
    env.CLAUDE_HOOK_GRAPH_TOOLS_HEAL_ACTIVE = '1';
  } else {
    delete env.CLAUDE_HOOK_GRAPH_TOOLS_HEAL_ACTIVE;
  }

  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env,
    timeout: 10000,
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
    claudeMdContent: readMockClaude(),
  };
}

// ── Assertions ────────────────────────────────────────────────────────────────
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

function assertSilentPass(result, description) {
  assert(result.exitCode === 0, `${description}: expected exit 0, got ${result.exitCode}`);
  assert(
    result.stdout.trim() === '',
    `${description}: expected silent pass (no stdout), got: ${result.stdout.trim()}`
  );
}

function assertAdditionalContext(result, description) {
  assert(result.exitCode === 0, `${description}: expected exit 0, got ${result.exitCode}`);
  assert(result.parsed !== null, `${description}: expected JSON output, got no output. stderr: ${result.stderr}`);
  const ctx = result.parsed?.hookSpecificOutput?.additionalContext;
  assert(typeof ctx === 'string' && ctx.length > 0, `${description}: expected non-empty additionalContext`);
  return ctx;
}

// ── Test cases ────────────────────────────────────────────────────────────────
console.log('\nGraph-tools self-heal hook — 5 test cases\n');

// Case 1: Primary heal path — single project in available_projects
// Expected: CLAUDE.md updated with correct name; retry instruction emitted
test('Case 1: project not found + 1 available project → heal CLAUDE.md + emit retry', () => {
  const result = runHook(
    'mcp__codebase-memory-mcp__search_code',
    {
      error: 'project not found',
      hint: 'Use list_projects to see all indexed projects, then pass the project name.',
      available_projects: [CORRECT_NAME],
      count: 1,
    },
    { projectName: WRONG_NAME }
  );

  const ctx = assertAdditionalContext(result, 'Case 1');

  // CLAUDE.md must have been updated
  const content = result.claudeMdContent;
  assert(
    content.includes(`\`${CORRECT_NAME}\``),
    `Case 1: CLAUDE.md must contain correct name \`${CORRECT_NAME}\`, got:\n${content}`
  );
  assert(
    !content.includes(`\`${WRONG_NAME}\``),
    `Case 1: CLAUDE.md must not contain wrong name \`${WRONG_NAME}\``
  );

  // additionalContext must mention the correct name and retry
  assert(
    ctx.includes(CORRECT_NAME),
    `Case 1: additionalContext must mention correct name, got: ${ctx}`
  );
  assert(
    ctx.toLowerCase().includes('retry') || ctx.toLowerCase().includes('updated'),
    `Case 1: additionalContext must mention retry/update, got: ${ctx}`
  );
});

// Case 2: Multiple projects or no matching project in available_projects
// Expected: emit additionalContext directing Claude to call list_projects(); no CLAUDE.md change
test('Case 2: project not found + 2+ available projects → instruct list_projects() call', () => {
  const result = runHook(
    'mcp__codebase-memory-mcp__query_graph',
    {
      error: 'project not found',
      hint: 'Use list_projects to see all indexed projects, then pass the project name.',
      available_projects: ['project-alpha', 'project-beta', CORRECT_NAME],
      count: 3,
    },
    { projectName: WRONG_NAME }
  );

  const ctx = assertAdditionalContext(result, 'Case 2');

  // CLAUDE.md must NOT have been modified (ambiguous which is correct)
  const content = result.claudeMdContent;
  assert(
    content.includes(`\`${WRONG_NAME}\``),
    `Case 2: CLAUDE.md must be unchanged (still has wrong name), got:\n${content}`
  );

  // Must instruct calling list_projects
  assert(
    ctx.includes('list_projects'),
    `Case 2: additionalContext must mention list_projects, got: ${ctx}`
  );
});

// Case 3: Tool succeeds (no error) → silent pass
test('Case 3: successful tool output → silent pass', () => {
  const result = runHook(
    'mcp__codebase-memory-mcp__search_code',
    { results: [{ file: 'src/foo.ts', line: 42 }] },
    { projectName: WRONG_NAME }
  );

  assertSilentPass(result, 'Case 3');
});

// Case 4: Re-entry guard active → silent pass (no recursion)
test('Case 4: re-entry guard (CLAUDE_HOOK_GRAPH_TOOLS_HEAL_ACTIVE=1) → silent pass', () => {
  const result = runHook(
    'mcp__codebase-memory-mcp__search_code',
    {
      error: 'project not found',
      available_projects: [CORRECT_NAME],
      count: 1,
    },
    { projectName: WRONG_NAME, reentryGuard: true }
  );

  assertSilentPass(result, 'Case 4');
});

// Case 5: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → always silent pass
test('Case 5: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → always silent pass', () => {
  const result = runHook(
    'mcp__codebase-memory-mcp__search_code',
    {
      error: 'project not found',
      available_projects: [CORRECT_NAME],
      count: 1,
    },
    { projectName: WRONG_NAME, disableHooks: true }
  );

  assertSilentPass(result, 'Case 5');

  // CLAUDE.md must be untouched
  const content = result.claudeMdContent;
  assert(
    content.includes(`\`${WRONG_NAME}\``),
    `Case 5: CLAUDE.md must be unchanged when hooks disabled`
  );
});

// ── Cleanup ───────────────────────────────────────────────────────────────────
try { rmSync(TMP, { recursive: true, force: true }); } catch { /* non-fatal */ }

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} cases: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
