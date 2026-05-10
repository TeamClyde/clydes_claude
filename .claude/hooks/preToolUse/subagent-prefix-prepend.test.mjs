#!/usr/bin/env node
/**
 * Test fixture for subagent-prefix-prepend.mjs (PreToolUse hook).
 *
 * Runner: node:test (built-in, no external deps)
 * Usage: node .claude/hooks/preToolUse/subagent-prefix-prepend.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, renameSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = resolve(__dirname, 'subagent-prefix-prepend.mjs');
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

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

// case 1: implementer marker, prefix prepended
test('case 1: implementer marker, prefix prepended (full bytes including frontmatter)', () => {
  const prefixPath = resolve(REPO_ROOT, 'skills', 'subagent-driven-development', 'prefixes', 'implementer.md');
  const expectedPrefix = readFileSync(prefixPath, 'utf8');

  const { stdout, status } = runHook({
    subagent_type: 'general-purpose',
    prompt: '[role: implementer]\n\nTask 1: foo\n## Task Description\nbar',
  });

  assert.equal(status, 0, 'should exit 0');
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'allow');

  const resultPrompt = parsed.hookSpecificOutput.updatedInput.prompt;
  const expectedPrefixTrimmed = expectedPrefix.replace(/\n+$/, '');
  assert.ok(
    resultPrompt.startsWith(expectedPrefixTrimmed),
    'prompt should start with prefix file bytes'
  );
  assert.ok(resultPrompt.includes('\n\n---\n\n'), 'prompt should contain separator');
  const suffix = resultPrompt.slice(expectedPrefixTrimmed.length + '\n\n---\n\n'.length);
  assert.ok(suffix.startsWith('Task 1: foo'), 'suffix should start with task content');
});

// case 2: spec-reviewer marker
test('case 2: spec-reviewer marker, prefix prepended', () => {
  const prefixPath = resolve(REPO_ROOT, 'skills', 'subagent-driven-development', 'prefixes', 'spec-reviewer.md');
  const expectedPrefix = readFileSync(prefixPath, 'utf8');

  const { stdout, status } = runHook({
    subagent_type: 'general-purpose',
    prompt: '[role: spec-reviewer]\n\n## What Was Requested\nFoo feature',
  });

  assert.equal(status, 0, 'should exit 0');
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'allow');
  const expectedPrefixTrimmed = expectedPrefix.replace(/\n+$/, '');
  assert.ok(
    parsed.hookSpecificOutput.updatedInput.prompt.startsWith(expectedPrefixTrimmed),
    'prompt should start with spec-reviewer prefix bytes'
  );
});

// case 3: code-quality-reviewer marker
test('case 3: code-quality-reviewer marker, prefix prepended', () => {
  const prefixPath = resolve(REPO_ROOT, 'skills', 'subagent-driven-development', 'prefixes', 'code-quality-reviewer.md');
  const expectedPrefix = readFileSync(prefixPath, 'utf8');

  const { stdout, status } = runHook({
    subagent_type: 'general-purpose',
    prompt: '[role: code-quality-reviewer]\n\nWHAT_WAS_IMPLEMENTED: thing\nBASE_SHA: abc123',
  });

  assert.equal(status, 0, 'should exit 0');
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'allow');
  const expectedPrefixTrimmed = expectedPrefix.replace(/\n+$/, '');
  assert.ok(
    parsed.hookSpecificOutput.updatedInput.prompt.startsWith(expectedPrefixTrimmed),
    'prompt should start with code-quality-reviewer prefix bytes'
  );
});

// case 4: no marker, pass-through
test('case 4: no marker, Agent dispatch, pass-through', () => {
  const { stdout, status } = runHook({
    subagent_type: 'architect',
    prompt: 'Review the plan.',
  });

  assert.equal(status, 0, 'should exit 0');
  assert.equal(stdout.trim(), '', 'stdout should be empty');
});

// case 5: marker present but prefix file missing, deny
test('case 5: marker present but prefix file missing, deny', () => {
  const prefixPath = resolve(REPO_ROOT, 'skills', 'subagent-driven-development', 'prefixes', 'implementer.md');
  const backupPath = prefixPath + '.bak';

  renameSync(prefixPath, backupPath);
  let parsed;
  try {
    const { stdout, status } = runHook({
      subagent_type: 'general-purpose',
      prompt: '[role: implementer]\n\nTask 1: foo',
    });
    assert.equal(status, 0, 'should exit 0');
    parsed = JSON.parse(stdout);
  } finally {
    renameSync(backupPath, prefixPath);
  }

  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(
    parsed.hookSpecificOutput.permissionDecisionReason.includes('implementer.md'),
    'permissionDecisionReason should include missing file path'
  );
});

// case 6: log line written
test('case 6: log line written', () => {
  runHook({
    subagent_type: 'general-purpose',
    prompt: '[role: implementer]\n\nTask 1: foo\n## Task Description\nbar',
  });

  const logPath = resolve(REPO_ROOT, '.claude', 'logs', 'subagent-prefix.jsonl');
  assert.ok(existsSync(logPath), 'log file should exist');

  const logContent = readFileSync(logPath, 'utf8').trim();
  const lines = logContent.split('\n');
  const lastLine = lines[lines.length - 1];
  const logEntry = JSON.parse(lastLine);

  assert.equal(logEntry.role, 'implementer', 'log entry should have role: implementer');
  assert.equal(logEntry.prefix_version, '1', 'log entry should have prefix_version: 1');
  assert.ok(logEntry.suffix_first_60.length > 0, 'suffix_first_60 should be populated');
  assert.ok(logEntry.ts && /^\d{4}-\d{2}-\d{2}T/.test(logEntry.ts), 'ts should be an ISO string');
});

// case 7: CLAUDE_DISABLE_WORKFLOW_HOOKS=1, pass-through
test('case 7: CLAUDE_DISABLE_WORKFLOW_HOOKS=1, pass-through', () => {
  const { stdout, status } = runHook(
    {
      subagent_type: 'general-purpose',
      prompt: '[role: implementer]\n\nTask 1: foo\n## Task Description\nbar',
    },
    { CLAUDE_DISABLE_WORKFLOW_HOOKS: '1' }
  );

  assert.equal(status, 0, 'should exit 0');
  assert.equal(stdout.trim(), '', 'stdout should be empty (disabled)');
});
