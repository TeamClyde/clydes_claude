#!/usr/bin/env node
/**
 * Test suite for stack-hat-directive.mjs
 * Run: node .claude/hooks/sessionStart/stack-hat-directive.test.mjs
 *
 * Isolation: a temp dir holds a mock project.json (PROJECT_JSON_OVERRIDE) and a
 * temp stacks/ catalog (STACKS_DIR_OVERRIDE) with fixture entries.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const HOOK = resolve(__filename, '..', 'stack-hat-directive.mjs');

const TMP = mkdtempSync(join(tmpdir(), 'stack-hat-test-'));
const STACKS = join(TMP, 'stacks');
mkdirSync(STACKS, { recursive: true });

function writeProjectJson(obj) {
  const p = join(TMP, 'project.json');
  writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}

function writeStack(name, content) {
  writeFileSync(join(STACKS, `${name}.md`), content);
}

// Build a catalog file with a distinct Tooling and Hat body.
function hatFile(toolingBody, hatBody) {
  return `# stack\n\n## Tooling\n${toolingBody}\n\n## Hat\n${hatBody}\n`;
}

function runHook(projectObj, { disableHooks = false, noProjectJson = false } = {}) {
  const env = { ...process.env, STACKS_DIR_OVERRIDE: STACKS };
  if (noProjectJson) {
    env.PROJECT_JSON_OVERRIDE = join(TMP, 'does-not-exist.json');
  } else {
    env.PROJECT_JSON_OVERRIDE = writeProjectJson(projectObj);
  }
  if (disableHooks) env.CLAUDE_DISABLE_WORKFLOW_HOOKS = '1';
  else delete env.CLAUDE_DISABLE_WORKFLOW_HOOKS;

  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: TMP }),
    encoding: 'utf8',
    env,
    timeout: 10000,
  });

  let parsed = null;
  if (result.stdout && result.stdout.trim()) {
    try { parsed = JSON.parse(result.stdout.trim()); } catch { /* leave null */ }
  }
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? -1,
    parsed,
  };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }
function ctxOf(r, d) {
  assert(r.exitCode === 0, `${d}: expected exit 0, got ${r.exitCode}`);
  assert(r.parsed !== null, `${d}: expected JSON output, got none. stderr: ${r.stderr}`);
  const ctx = r.parsed?.hookSpecificOutput?.additionalContext;
  assert(typeof ctx === 'string' && ctx.length > 0, `${d}: expected non-empty additionalContext`);
  return ctx;
}
function assertSilent(r, d) {
  assert(r.exitCode === 0, `${d}: expected exit 0, got ${r.exitCode}`);
  assert(r.stdout.trim() === '', `${d}: expected silent pass, got: ${r.stdout.trim()}`);
}

console.log('\nStack-hat directive hook — 10 test cases\n');

test('Case 1: no project.json → silent pass', () => {
  assertSilent(runHook({}, { noProjectJson: true }), 'Case 1');
});

test('Case 2: project.json without stacks → silent pass', () => {
  assertSilent(runHook({ project: { name: 'x' } }), 'Case 2');
});

test('Case 3: empty stacks array → silent pass', () => {
  assertSilent(runHook({ stacks: [] }), 'Case 3');
});

test('Case 4: single hat → Hat body present, Tooling body absent', () => {
  writeStack('python', hatFile('TOOLING_SENTINEL ruff pyright', 'HAT_SENTINEL type-annotate public functions'));
  const ctx = ctxOf(runHook({ stacks: ['python'] }), 'Case 4');
  assert(ctx.includes('HAT_SENTINEL'), 'Case 4: must include Hat body');
  assert(!ctx.includes('TOOLING_SENTINEL'), 'Case 4: must NOT include Tooling body');
});

test('Case 5: composition → both Hat bodies present', () => {
  writeStack('python', hatFile('t', 'PY_HAT pathlib over os.path'));
  writeStack('react', hatFile('t', 'REACT_HAT prefer function components'));
  const ctx = ctxOf(runHook({ stacks: ['python', 'react'] }), 'Case 5');
  assert(ctx.includes('PY_HAT'), 'Case 5: python hat present');
  assert(ctx.includes('REACT_HAT'), 'Case 5: react hat present');
});

test('Case 6: oversized composed hats → pointer mode (no full body)', () => {
  const big = 'X'.repeat(4000); // exceeds HAT_BUDGET_CHARS
  writeStack('huge', hatFile('t', `BODY_SENTINEL ${big}`));
  const ctx = ctxOf(runHook({ stacks: ['huge'] }), 'Case 6');
  assert(!ctx.includes('BODY_SENTINEL'), 'Case 6: full body must be omitted in pointer mode');
  assert(ctx.includes('stacks/huge.md'), 'Case 6: must reference the file path to read');
  assert(ctx.toLowerCase().includes('read'), 'Case 6: must instruct on-demand read');
});

test('Case 7: missing catalog file → "no entry" note, other hats still present', () => {
  writeStack('python', hatFile('t', 'PY_HAT2 f-strings'));
  const ctx = ctxOf(runHook({ stacks: ['python', 'ghost'] }), 'Case 7');
  assert(ctx.includes('PY_HAT2'), 'Case 7: present hat included');
  assert(ctx.includes('ghost'), 'Case 7: missing stack named');
  assert(ctx.toLowerCase().includes('no catalog entry'), 'Case 7: missing note present');
});

test('Case 8: malformed entry (no ## Hat) → treated as missing, no throw', () => {
  writeStack('broken', '# broken\n\n## Tooling\nonly tooling here\n');
  const ctx = ctxOf(runHook({ stacks: ['broken'] }), 'Case 8');
  assert(ctx.includes('broken'), 'Case 8: broken stack reported as missing');
  assert(ctx.toLowerCase().includes('no catalog entry'), 'Case 8: missing note present');
});

test('Case 9: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → silent pass', () => {
  writeStack('python', hatFile('t', 'PY_HAT3'));
  assertSilent(runHook({ stacks: ['python'] }, { disableHooks: true }), 'Case 9');
});

test('Case 10: invalid stack name (path traversal) → treated as missing, no traversal pointer', () => {
  writeStack('python', hatFile('t', 'PY_HAT4 context managers'));
  const ctx = ctxOf(runHook({ stacks: ['python', '../evil'] }), 'Case 10');
  assert(ctx.includes('PY_HAT4'), 'Case 10: valid hat still present');
  assert(ctx.toLowerCase().includes('no catalog entry'), 'Case 10: invalid name reported as missing');
  assert(!/read[^\n]*\.\.\//.test(ctx), 'Case 10: must not emit a path-traversing read pointer');
});

try { rmSync(TMP, { recursive: true, force: true }); } catch { /* non-fatal */ }

console.log(`\n${passed + failed} cases: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
