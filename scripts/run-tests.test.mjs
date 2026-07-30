import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { discover, ROOTS } from './run-tests.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const RUNNER = path.join(HERE, 'run-tests.mjs');
// ESM specifiers must be file:// URLs — a bare Windows path is not a valid one.
const RUNNER_URL = pathToFileURL(RUNNER).href;

test('discovers test files under every configured root', () => {
  const files = discover();
  assert.ok(files.length >= 17, `expected >= 17 test files, got ${files.length}`);
  for (const root of ROOTS) {
    assert.ok(
      files.some((f) => f.startsWith(root + '/')),
      `no test files discovered under root "${root}"`,
    );
  }
});

test('returns posix-style, repo-relative paths', () => {
  // Keeps every assertion below platform-independent, and keeps backslash
  // escaping out of this test file entirely.
  for (const f of discover()) {
    assert.ok(!f.includes('\\'), `path is not posix-style: ${f}`);
    assert.ok(!f.startsWith('/') && !/^[A-Za-z]:/.test(f), `path is not relative: ${f}`);
  }
});

test('recurses into nested directories', () => {
  const files = discover();
  assert.ok(files.includes('scripts/lib/verify.test.mjs'), 'missed scripts/lib/');
  assert.ok(files.includes('scripts/recall/check.test.mjs'), 'missed scripts/recall/');
});

test('recurses into the .claude dot-directory', () => {
  assert.ok(
    discover().includes('.claude/hooks/preToolUse/git-prohibitions.test.mjs'),
    'missed .claude/hooks/preToolUse/',
  );
});

test('every discovered path is a .test.mjs file', () => {
  for (const f of discover()) {
    assert.ok(f.endsWith('.test.mjs'), `unexpected non-test file: ${f}`);
  }
});

test('discovery is independent of the current working directory', () => {
  // Regression guard: roots resolve against the module's own location, not
  // process.cwd(), so `npm test` and a direct invocation from elsewhere agree.
  const fromRepoRoot = discover();
  const original = process.cwd();
  try {
    process.chdir(tmpdir());
    assert.deepEqual(discover(), fromRepoRoot);
  } finally {
    process.chdir(original);
  }
});

test('importing the runner does not execute a test run', () => {
  // A real behavioral guard, not `typeof discover === "function"` — that would
  // pass even with the module-main guard deleted entirely. Verified: removing
  // the guard makes THIS test fail while the negative control below still passes.
  const r = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(RUNNER_URL)})`],
    { encoding: 'utf8' },
  );
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assert.equal(r.status, 0, `importing the runner failed: ${out}`);
  assert.ok(!out.includes('run-tests:'), `runner executed on import:\n${out}`);
});

test('invoking the runner directly DOES execute a run', () => {
  // Negative control. Without it, the test above would also pass if the runner
  // were broken in a way that never ran anything at all.
  const r = spawnSync(process.execPath, [RUNNER, 'scripts/run-tests.test.mjs'], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assert.ok(out.includes('run-tests:'), `runner did not run:\n${out}`);
});

test('explicit file arguments override discovery', () => {
  // Preserves find-polluter.sh's single-file isolation.
  const r = spawnSync(process.execPath, [RUNNER, 'scripts/run-tests.test.mjs'], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  assert.match(out, /run-tests: 1 file\(s\) from arguments/);
});
