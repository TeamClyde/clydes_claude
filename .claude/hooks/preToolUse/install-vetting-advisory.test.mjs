#!/usr/bin/env node
/**
 * Test suite for install-vetting-advisory.mjs
 *
 * Run: node .claude/hooks/preToolUse/install-vetting-advisory.test.mjs
 *
 * Strategy: spawn the hook with controlled stdin payloads and env vars.
 * Mirrors graph-tools-enforcement.test.mjs and stack-hat-directive.test.mjs.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HOOK = resolve(__filename, '..', 'install-vetting-advisory.mjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Run the hook with a given Bash command string (or a full custom payload).
 * Returns { stdout, stderr, exitCode, parsed }.
 */
function runHook(command, { disableHooks = false, toolName = 'Bash', rawPayload = null } = {}) {
  const env = { ...process.env };

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

function assertAsk(result, description) {
  assert(result.exitCode === 0, `${description}: expected exit 0, got ${result.exitCode}`);
  assert(result.parsed !== null, `${description}: expected JSON output, got no output`);
  const decision = result.parsed?.hookSpecificOutput?.permissionDecision;
  assert(decision === 'ask', `${description}: expected permissionDecision=ask, got ${decision}`);
  const reason = result.parsed?.hookSpecificOutput?.permissionDecisionReason;
  assert(typeof reason === 'string' && reason.length > 0, `${description}: expected non-empty permissionDecisionReason`);
  // Reason must reference the vet-install funnel and the rules doc
  assert(
    reason.includes('vet-install') || reason.includes('install-vetting'),
    `${description}: reason must reference vet-install funnel or install-vetting, got: ${reason}`
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

console.log('\nInstall-vetting advisory hook — 12 test cases\n');

// Case 1: pip install (Python surface) → ask
test('Case 1: pip install requests → ask', () => {
  const result = runHook('pip install requests');
  assertAsk(result, 'Case 1');
});

// Case 2: npm install (Node surface) → ask
test('Case 2: npm install lodash → ask', () => {
  const result = runHook('npm install lodash');
  assertAsk(result, 'Case 2');
});

// Case 3: npm i (short form) → ask — must match independently, not double-count npm install
test('Case 3: npm i express (short form) → ask', () => {
  const result = runHook('npm i express');
  assertAsk(result, 'Case 3');
});

// Case 4: yarn add → ask
test('Case 4: yarn add typescript → ask', () => {
  const result = runHook('yarn add typescript');
  assertAsk(result, 'Case 4');
});

// Case 5: cargo install → ask
test('Case 5: cargo install ripgrep → ask', () => {
  const result = runHook('cargo install ripgrep');
  assertAsk(result, 'Case 5');
});

// Case 6: VS Code extension install → ask
test('Case 6: code --install-extension ms-python.python → ask', () => {
  const result = runHook('code --install-extension ms-python.python');
  assertAsk(result, 'Case 6');
});

// Case 7: claude mcp add (MCP surface) → ask
test('Case 7: claude mcp add my-server → ask', () => {
  const result = runHook('claude mcp add my-server');
  assertAsk(result, 'Case 7');
});

// Case 8: pip list (read-only) → silent passthrough
test('Case 8: pip list (read-only) → silent passthrough', () => {
  const result = runHook('pip list');
  assertSilent(result, 'Case 8');
});

// Case 9: npm ls (read-only) → silent passthrough
test('Case 9: npm ls (read-only) → silent passthrough', () => {
  const result = runHook('npm ls');
  assertSilent(result, 'Case 9');
});

// Case 10: non-Bash tool → silent passthrough
test('Case 10: non-Bash tool (Read) → silent passthrough', () => {
  const result = runHook('pip install requests', { toolName: 'Read' });
  assertSilent(result, 'Case 10');
});

// Case 11: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → silent passthrough
test('Case 11: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → silent passthrough', () => {
  const result = runHook('pip install requests', { disableHooks: true });
  assertSilent(result, 'Case 11');
});

// Case 12: Advisory-only guarantee — no input ever yields "deny"
test('Case 12: advisory-only guarantee — no input produces deny', () => {
  const commands = [
    'pip install requests',
    'npm install lodash',
    'cargo install ripgrep',
    'yarn add react',
    'pnpm add vite',
    'bun add zod',
    'gem install rails',
    'code --install-extension esbenp.prettier-vscode',
    'claude mcp add my-tool',
    'uvx ruff',
    'pipx install black',
    'poetry add httpx',
    'pdm add click',
    'uv tool install ruff',
    'pip list',       // read-only
    'npm ls',         // read-only
    'pip show requests', // read-only
    '',               // empty
    'echo hello',     // unrelated
  ];

  for (const cmd of commands) {
    const result = runHook(cmd);
    const decision = result.parsed?.hookSpecificOutput?.permissionDecision;
    assert(
      decision !== 'deny',
      `DENY found for command "${cmd}" — advisory hook must never deny (got: ${decision})`
    );
    assert(result.exitCode === 0, `exit non-zero for command "${cmd}"`);
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} cases: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
