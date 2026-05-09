#!/usr/bin/env node
/**
 * Test fixture for agent-model-pinning.mjs (PreToolUse hook).
 *
 * Runs the hook script as a subprocess with sample stdin JSON.
 * Asserts stdout/stderr content and exit code.
 *
 * Runner: node:test (built-in, no external deps)
 * Usage: node .claude/hooks/preToolUse/agent-model-pinning.test.mjs
 *
 * NOTE on model_override_reason test case (case 4):
 * The test passes the reason as both a top-level field AND as a marker in the
 * prompt field: "[model-override-reason: L-sized cross-cutting analysis]".
 * The hook detects both paths; the test asserts on stderr silence (justified).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = resolve(__dirname, 'agent-model-pinning.mjs');

/**
 * Run the hook with given input JSON and optional env overrides.
 * Returns { stdout, stderr, status }.
 */
function runHook(inputObj, envOverrides = {}) {
  const stdin = JSON.stringify(inputObj);
  const result = spawnSync('node', [HOOK_PATH], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, ...envOverrides },
    timeout: 10_000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

// ── Case 1: subagent_type=researcher, no model ────────────────────────────────
// Frontmatter-pinned agent. Pass through unchanged. Log nothing. Exit 0.
test('case 1: researcher with no model passes through silently', () => {
  const { stdout, stderr, status } = runHook({
    subagent_type: 'researcher',
    prompt: 'Look up the file.',
    description: 'researcher lookup',
  });

  assert.equal(status, 0, 'should exit 0');
  assert.equal(stdout.trim(), '', 'stdout should be empty (pass-through)');
  assert.equal(stderr.trim(), '', 'stderr should be empty — haiku-pinned agent logs nothing');
});

// ── Case 2: subagent_type=architect, no model ─────────────────────────────────
// Non-pinned agent, model unset → inject model: sonnet. Stderr log. Exit 0.
test('case 2: architect with no model gets sonnet injected', () => {
  const input = {
    subagent_type: 'architect',
    prompt: 'Review the plan.',
    description: 'architect review',
  };
  const { stdout, stderr, status } = runHook(input);

  assert.equal(status, 0, 'should exit 0');

  const parsed = JSON.parse(stdout);
  assert.ok(parsed.hookSpecificOutput, 'stdout should have hookSpecificOutput');
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'allow');
  assert.equal(parsed.hookSpecificOutput.updatedInput.model, 'sonnet');
  assert.equal(parsed.hookSpecificOutput.updatedInput.subagent_type, 'architect');
  assert.equal(parsed.hookSpecificOutput.updatedInput.prompt, input.prompt);

  assert.ok(
    stderr.includes('[a1-hook] subagent_type=architect model unset → injected sonnet default'),
    `stderr should contain injection log, got: ${stderr}`
  );
});

// ── Case 3: subagent_type=architect, model=opus, no model_override_reason ─────
// Pass through. Stderr warning (no justification). Append to log. Exit 0.
test('case 3: architect with model=opus and no reason gets warning', () => {
  const { stdout, stderr, status } = runHook({
    subagent_type: 'architect',
    model: 'opus',
    prompt: 'Review.',
    description: 'architect review',
  });

  assert.equal(status, 0, 'should exit 0');
  // No model injection needed (model already set) — stdout may be empty or
  // contain pass-through. The hook should not change the model.
  if (stdout.trim()) {
    const parsed = JSON.parse(stdout);
    // If output is emitted, model should NOT be changed to sonnet
    assert.notEqual(parsed?.hookSpecificOutput?.updatedInput?.model, 'sonnet');
  }

  assert.ok(
    stderr.includes('[a1-hook] subagent_type=architect model=opus override without justification'),
    `stderr should contain justification warning, got: ${stderr}`
  );
});

// ── Case 4: subagent_type=architect, model=opus, WITH model_override_reason ───
// Pass through silently. Append (subagent_type, model, reason) to log. Exit 0.
test('case 4: architect with model=opus and valid reason passes silently', () => {
  const reason = 'L-sized cross-cutting analysis';
  const { stdout, stderr, status } = runHook({
    subagent_type: 'architect',
    model: 'opus',
    model_override_reason: reason,
    // Also embed in prompt as marker (fallback path) to test both detection paths
    prompt: `[model-override-reason: ${reason}] Please review the plan end-to-end.`,
    description: 'architect deep review',
  });

  assert.equal(status, 0, 'should exit 0');

  // No warning on stderr (justified override)
  assert.ok(
    !stderr.includes('override without justification'),
    `stderr should NOT contain unjustified warning, got: ${stderr}`
  );
});

// ── Case 5: subagent_type=researcher, model=sonnet (orchestrator override) ────
// Frontmatter pins haiku; orchestrator tried to set sonnet. Warn (no reason).
// Pass through (frontmatter wins). Exit 0.
test('case 5: researcher with model=sonnet (haiku override) warns but passes through', () => {
  const { stdout, stderr, status } = runHook({
    subagent_type: 'researcher',
    model: 'sonnet',
    prompt: 'Look up something.',
    description: 'researcher lookup',
  });

  assert.equal(status, 0, 'should exit 0');

  assert.ok(
    stderr.includes(
      '[a1-hook] subagent_type=researcher model=sonnet override without justification (frontmatter pinned haiku)'
    ),
    `stderr should contain haiku-override warning, got: ${stderr}`
  );
});

// ── Case 6: Malformed JSON input ─────────────────────────────────────────────
// Stderr: malformed input log. Exit 0 (never block).
test('case 6: malformed JSON input logs error and exits 0', () => {
  const result = spawnSync('node', [HOOK_PATH], {
    input: 'this is not json {{{',
    encoding: 'utf8',
    env: process.env,
    timeout: 10_000,
  });

  assert.equal(result.status ?? -1, 0, 'should exit 0 on malformed input');
  assert.ok(
    (result.stderr ?? '').includes('[a1-hook] malformed input, passing through'),
    `stderr should say malformed input, got: ${result.stderr}`
  );
});

// ── Case 7: Missing subagent_type field ──────────────────────────────────────
// Stderr warning. Exit 0.
test('case 7: missing subagent_type field logs warning and exits 0', () => {
  const { stdout, stderr, status } = runHook({
    model: 'sonnet',
    prompt: 'Do something.',
    description: 'no subagent_type',
  });

  assert.equal(status, 0, 'should exit 0');
  assert.ok(
    stderr.includes('[a1-hook]'),
    `stderr should contain a1-hook warning about missing subagent_type, got: ${stderr}`
  );
});
