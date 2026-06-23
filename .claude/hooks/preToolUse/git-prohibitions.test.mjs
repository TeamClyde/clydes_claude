#!/usr/bin/env node
/**
 * Test suite for git-prohibitions.mjs
 *
 * Run: node .claude/hooks/preToolUse/git-prohibitions.test.mjs
 *
 * Strategy: spawn the hook with controlled stdin payloads and env vars.
 * Mirrors install-vetting-advisory.test.mjs spawnSync harness.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HOOK = resolve(__filename, '..', 'git-prohibitions.mjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Run the hook with a given Bash command string (or a full custom payload).
 * Returns { stdout, stderr, exitCode, parsed }.
 */
function runHook(command, { disableHooks = false, toolName = 'Bash', rawPayload = null, extraEnv = {} } = {}) {
  const env = { ...process.env, ...extraEnv };

  if (disableHooks) {
    env.CLAUDE_DISABLE_WORKFLOW_HOOKS = '1';
  } else {
    delete env.CLAUDE_DISABLE_WORKFLOW_HOOKS;
  }

  const payload = rawPayload ?? {
    tool_name: toolName,
    tool_input: { command },
  };

  const result = spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
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

function assertDeny(result, description) {
  assert(result.exitCode === 0, `${description}: expected exit 0, got ${result.exitCode}`);
  assert(result.parsed !== null, `${description}: expected JSON output, got no output`);
  const decision = result.parsed?.hookSpecificOutput?.permissionDecision;
  assert(decision === 'deny', `${description}: expected permissionDecision=deny, got ${decision}`);
  const reason = result.parsed?.hookSpecificOutput?.permissionDecisionReason;
  assert(
    typeof reason === 'string' && reason.length > 0,
    `${description}: expected non-empty permissionDecisionReason`
  );
  // Reason must reference git-manager or the prohibition
  assert(
    reason.includes('git-manager') || reason.includes('git add') || reason.includes('--no-verify') || reason.includes('CLAUDE.md'),
    `${description}: reason must reference git-manager or the prohibition, got: ${reason}`
  );
}

function assertSilent(result, description) {
  assert(result.exitCode === 0, `${description}: expected exit 0, got ${result.exitCode}`);
  assert(
    result.stdout.trim() === '',
    `${description}: expected silent pass (no stdout), got: ${result.stdout.trim()}`
  );
}

// ── Cases ─────────────────────────────────────────────────────────────────────

console.log('\ngit-prohibitions hook — 19 test cases\n');

// Case 1: git add -A → deny
test('Case 1: git add -A → deny', () => {
  const result = runHook('git add -A');
  assertDeny(result, 'Case 1');
});

// Case 2: git add --all → deny
test('Case 2: git add --all → deny', () => {
  const result = runHook('git add --all');
  assertDeny(result, 'Case 2');
});

// Case 3: git add . → deny
test('Case 3: git add . → deny', () => {
  const result = runHook('git add .');
  assertDeny(result, 'Case 3');
});

// Case 4: git commit --no-verify -m "x" → deny
test('Case 4: git commit --no-verify -m "x" → deny', () => {
  const result = runHook('git commit --no-verify -m "x"');
  assertDeny(result, 'Case 4');
});

// Case 5: git push --no-verify → deny
test('Case 5: git push --no-verify → deny', () => {
  const result = runHook('git push --no-verify');
  assertDeny(result, 'Case 5');
});

// Case 6: git commit -m "x" --no-verify → deny
test('Case 6: git commit -m "x" --no-verify → deny', () => {
  const result = runHook('git commit -m "x" --no-verify');
  assertDeny(result, 'Case 6');
});

// Case 7: git add specific-file.txt → silent
test('Case 7: git add specific-file.txt → silent', () => {
  const result = runHook('git add specific-file.txt');
  assertSilent(result, 'Case 7');
});

// Case 8: git add ./src/app.js → silent
test('Case 8: git add ./src/app.js → silent', () => {
  const result = runHook('git add ./src/app.js');
  assertSilent(result, 'Case 8');
});

// Case 9: git add src/ → silent
test('Case 9: git add src/ → silent', () => {
  const result = runHook('git add src/');
  assertSilent(result, 'Case 9');
});

// Case 10: flag inside quoted commit message → silent (false-positive guard)
test('Case 10: --no-verify inside quoted commit message → silent', () => {
  const result = runHook('git commit -m "fix --no-verify handling in docs"');
  assertSilent(result, 'Case 10');
});

// Case 11: git add . inside grep quoted string → silent (not a git verb + quoted)
test('Case 11: grep -r "git add ." docs/ → silent', () => {
  const result = runHook('grep -r "git add ." docs/');
  assertSilent(result, 'Case 11');
});

// Case 12: git status → silent
test('Case 12: git status → silent', () => {
  const result = runHook('git status');
  assertSilent(result, 'Case 12');
});

// Case 13: [git-allowed] bypass marker → silent
test('Case 13: [git-allowed] git add -A → silent', () => {
  const result = runHook('[git-allowed] git add -A');
  assertSilent(result, 'Case 13');
});

// Case 14: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → silent
test('Case 14: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → silent', () => {
  const result = runHook('git add -A', { disableHooks: true });
  assertSilent(result, 'Case 14');
});

// Case 15: non-Bash tool (Read) with 'git add -A' in input → silent
test('Case 15: non-Bash tool (Read) → silent', () => {
  const result = runHook('git add -A', { toolName: 'Read' });
  assertSilent(result, 'Case 15');
});

// Case 16: malformed JSON stdin → silent pass
test('Case 16: malformed JSON stdin → silent pass', () => {
  const result = (() => {
    const r = spawnSync('node', [HOOK], {
      input: '{not valid json',
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 5000,
    });
    return {
      stdout: r.stdout || '',
      stderr: r.stderr || '',
      exitCode: r.status ?? -1,
    };
  })();
  assertSilent(result, 'Case 16');
});

// Case 17: advisory-safety — none of the ALLOW cases ever yields 'deny'
test('Case 17: advisory-safety — no ALLOW case yields deny', () => {
  const allowCases = [
    'git add specific-file.txt',
    'git add ./src/app.js',
    'git add src/',
    'git commit -m "fix --no-verify handling in docs"',
    'grep -r "git add ." docs/',
    'git status',
  ];

  for (const cmd of allowCases) {
    const result = runHook(cmd);
    const decision = result.parsed?.hookSpecificOutput?.permissionDecision;
    assert(
      decision !== 'deny',
      `DENY found for allowed command "${cmd}" — expected silent (got: ${decision})`
    );
    assert(result.exitCode === 0, `exit non-zero for command "${cmd}"`);
  }
});

// Case 18: git add -A . (stage-all flag + trailing path arg) → deny
test('Case 18: git add -A . → deny', () => {
  const result = runHook('git add -A .');
  assertDeny(result, 'Case 18');
});

// Case 19: git add --all src/ (stage-all flag + path arg) → deny
test('Case 19: git add --all src/ → deny', () => {
  const result = runHook('git add --all src/');
  assertDeny(result, 'Case 19');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} cases: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
