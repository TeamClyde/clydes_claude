#!/usr/bin/env node
/**
 * Test suite for detect-stacks.mjs
 * Run: node skills/project-setup/detect-stacks.test.mjs
 * Strategy: create temp fixture dirs with marker files, spawn the detector with the
 * fixture as argv, parse JSON stdout, assert detected stacks. Black-box spawn pattern
 * mirrors install-vetting-advisory.test.mjs.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const DETECTOR = resolve(__filename, '..', 'detect-stacks.mjs');

/** Create a temp dir with the given marker files, run fn(dir), always clean up. */
function withFixture(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'detect-stacks-'));
  for (const f of files) writeFileSync(join(dir, f), '');
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** Like withFixture but supports nested paths (e.g. 'inner/go.mod'). */
function withTree(paths, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'detect-stacks-'));
  for (const p of paths) {
    const full = join(dir, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, '');
  }
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function runDetector(repoRoot) {
  const result = spawnSync('node', [DETECTOR, repoRoot], { encoding: 'utf8', timeout: 5000 });
  let parsed = null;
  try { parsed = JSON.parse((result.stdout || '').trim()); } catch { /* leave null */ }
  return { ...result, parsed };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function stacksOf(parsed) {
  assert(parsed !== null, 'no JSON parsed from detector stdout');
  return parsed.detected.map((d) => d.stack).sort();
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log('detect-stacks.mjs\n');

test('single-stack: pyproject.toml → python', () => withFixture(['pyproject.toml'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(stacksOf(parsed), ['python']), `got ${JSON.stringify(parsed && parsed.detected)}`);
}));

test('requirements.txt → python', () => withFixture(['requirements.txt'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(stacksOf(parsed), ['python']), `got ${JSON.stringify(parsed && parsed.detected)}`);
}));

test('polyglot: pyproject.toml + package.json → node, python', () => withFixture(['pyproject.toml', 'package.json'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(stacksOf(parsed), ['node', 'python']), `got ${JSON.stringify(parsed && parsed.detected)}`);
}));

test('no markers → empty detected', () => withFixture(['README.md', 'notes.txt'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(parsed !== null, 'no JSON parsed from detector stdout');
  assert(eq(parsed.detected, []), `got ${JSON.stringify(parsed.detected)}`);
}));

test('Cargo.toml → rust', () => withFixture(['Cargo.toml'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(stacksOf(parsed), ['rust']), `got ${JSON.stringify(parsed && parsed.detected)}`);
}));

test('go.mod → go', () => withFixture(['go.mod'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(stacksOf(parsed), ['go']), `got ${JSON.stringify(parsed && parsed.detected)}`);
}));

test('pubspec.yaml → flutter', () => withFixture(['pubspec.yaml'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(stacksOf(parsed), ['flutter']), `got ${JSON.stringify(parsed && parsed.detected)}`);
}));

test('matched stack reports its triggering markers', () => withFixture(['pyproject.toml'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(parsed !== null, 'no JSON parsed from detector stdout');
  assert(parsed.detected[0].markers.includes('pyproject.toml'), `got ${JSON.stringify(parsed.detected[0])}`);
}));

test('extension marker: *.slcp → silabs-embedded', () => withFixture(['sm_fw_g2.slcp'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(stacksOf(parsed), ['silabs-embedded']), `got ${JSON.stringify(parsed && parsed.detected)}`);
}));

test('extension marker: *.csproj → csharp', () => withFixture(['App.csproj'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(stacksOf(parsed), ['csharp']), `got ${JSON.stringify(parsed && parsed.detected)}`);
}));

test('root marker reports dir "."', () => withFixture(['pyproject.toml'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(parsed.detected[0].dir === '.', `got ${JSON.stringify(parsed.detected[0])}`);
}));

test('wrapper layout: marker only in subdir → detected with that dir', () => withTree(['inner/go.mod'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(stacksOf(parsed), ['go']), `got ${JSON.stringify(parsed && parsed.detected)}`);
  const goEntry = parsed.detected.find((d) => d.stack === 'go');
  assert(goEntry && goEntry.dir === 'inner', `expected dir 'inner', got ${JSON.stringify(goEntry)}`);
}));

test('noise dirs skipped: marker in node_modules → not detected', () => withTree(['node_modules/pkg/package.json'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(parsed.detected, []), `got ${JSON.stringify(parsed.detected)}`);
}));

test('depth-2 marker detected', () => withTree(['a/b/Cargo.toml'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(stacksOf(parsed), ['rust']), `got ${JSON.stringify(parsed && parsed.detected)}`);
}));

test('depth-3 marker NOT detected (bounded scan)', () => withTree(['a/b/c/go.mod'], (dir) => {
  const { parsed } = runDetector(dir);
  assert(eq(parsed.detected, []), `got ${JSON.stringify(parsed.detected)}`);
}));

console.log(`\n${passed + failed} cases: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
