#!/usr/bin/env node
/**
 * Test suite for slash-command-enforcement.mjs
 *
 * Run: node .claude/hooks/userPromptSubmit/slash-command-enforcement.test.mjs
 *
 * Test isolation strategy: the hook reads SKILLS_LIST_OVERRIDE env var as a
 * comma-separated list of valid skill names instead of scanning the filesystem.
 * Tests provide a controlled inventory; "typo-skill" is intentionally absent.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HOOK = resolve(__filename, '..', 'slash-command-enforcement.mjs');

// Controlled skill inventory for tests — typo-skill intentionally excluded
const TEST_SKILLS = 'feedback,loop,schedule,review-workflow,git-manager,plan-management';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Run the hook with a given prompt string and options.
 * Returns { stdout, stderr, exitCode, parsed }.
 */
function runHook(prompt, { disableHooks = false, skillsOverride = TEST_SKILLS } = {}) {
  const env = {
    ...process.env,
    SKILLS_LIST_OVERRIDE: skillsOverride,
  };

  if (disableHooks) {
    env.CLAUDE_DISABLE_WORKFLOW_HOOKS = '1';
  } else {
    delete env.CLAUDE_DISABLE_WORKFLOW_HOOKS;
  }

  const input = JSON.stringify({
    session_id: 'test-session',
    transcript_path: '/tmp/test-transcript.jsonl',
    cwd: '/tmp/test',
    hook_event_name: 'UserPromptSubmit',
    prompt,
  });

  const result = spawnSync('node', [HOOK], {
    input,
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

function assertSilent(result, description) {
  assert(result.exitCode === 0, `${description}: expected exit 0, got ${result.exitCode}`);
  assert(
    result.stdout.trim() === '',
    `${description}: expected silent pass (no stdout), got: ${result.stdout.trim()}`
  );
}

function assertContext(result, description) {
  assert(result.exitCode === 0, `${description}: expected exit 0, got ${result.exitCode}`);
  assert(result.parsed !== null, `${description}: expected JSON output, got: ${result.stdout.trim()}`);
  const eventName = result.parsed?.hookSpecificOutput?.hookEventName;
  assert(
    eventName === 'UserPromptSubmit',
    `${description}: expected hookEventName=UserPromptSubmit, got: ${eventName}`
  );
  const ctx = result.parsed?.hookSpecificOutput?.additionalContext;
  assert(
    typeof ctx === 'string' && ctx.length > 0,
    `${description}: expected non-empty additionalContext`
  );
  return ctx;
}

// ── Cases ─────────────────────────────────────────────────────────────────────
console.log('\nSlash-command enforcement hook — 8 test cases\n');

// Case 1: Valid skill in message → emit additionalContext for it
test('Case 1: "lets do a /review-workflow" → emit additionalContext', () => {
  const result = runHook('lets do a /review-workflow');
  const ctx = assertContext(result, 'Case 1');
  assert(ctx.includes('/review-workflow'), `Case 1: additionalContext must mention /review-workflow, got: ${ctx}`);
  assert(ctx.includes("Invoke Skill { skill: 'review-workflow'"), `Case 1: must include Skill invocation instruction`);
  assert(ctx.includes('immediate next action'), `Case 1: must say "immediate next action"`);
});

// Case 2: Skill with trailing args → emit additionalContext preserving args
test('Case 2: "/feedback this didn\'t work" → emit additionalContext with args', () => {
  const result = runHook("/feedback this didn't work");
  const ctx = assertContext(result, 'Case 2');
  assert(ctx.includes('/feedback'), `Case 2: must mention /feedback`);
  assert(ctx.includes('feedback'), `Case 2: must include skill name in Skill call`);
});

// Case 3: Multiple valid skills → list both in additionalContext
test('Case 3: "we should /loop /schedule them" (multiple) → list both', () => {
  const result = runHook('we should /loop /schedule them');
  const ctx = assertContext(result, 'Case 3');
  assert(ctx.includes('/loop'), `Case 3: must mention /loop`);
  assert(ctx.includes('/schedule'), `Case 3: must mention /schedule`);
  assert(ctx.includes('Additional slash commands'), `Case 3: must note additional commands`);
});

// Case 4: Skill name mentioned without leading slash → no emit
test('Case 4: "the feedback skill is what i need here" (no slash) → silent', () => {
  const result = runHook('the feedback skill is what i need here');
  assertSilent(result, 'Case 4');
});

// Case 5: Slash in URL/path that doesn't match a skill name → no emit
test('Case 5: "the /api endpoint is /api/v1/users" → silent (not a skill)', () => {
  const result = runHook('the /api endpoint is /api/v1/users');
  assertSilent(result, 'Case 5');
});

// Case 6: Unknown skill name with slash → no emit
test('Case 6: "/typo-skill" (not in skills list) → silent', () => {
  const result = runHook('/typo-skill');
  assertSilent(result, 'Case 6');
});

// Case 7: Skill with multiple args → emit additionalContext preserving args
test('Case 7: "/feedback arg1 arg2" → emit with args preserved', () => {
  const result = runHook('/feedback arg1 arg2');
  const ctx = assertContext(result, 'Case 7');
  assert(ctx.includes('arg1'), `Case 7: args must appear in additionalContext, got: ${ctx}`);
});

// Case 8: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → no emit
test('Case 8: CLAUDE_DISABLE_WORKFLOW_HOOKS=1 → silent', () => {
  const result = runHook('/feedback test', { disableHooks: true });
  assertSilent(result, 'Case 8');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} cases: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
