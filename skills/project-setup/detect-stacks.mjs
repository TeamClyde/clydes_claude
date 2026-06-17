#!/usr/bin/env node
/**
 * Stack detector for project-setup Phase 4 (Tooling Setup).
 * Scans a repo root + subdirectories (depth ≤ 2, noise dirs skipped) for well-known
 * file markers and extension markers, mapping them to stack names. Marker-based and
 * deterministic; catalog-coverage is checked separately by the skill.
 *
 * Usage:  node detect-stacks.mjs [repoRoot]      (repoRoot defaults to cwd)
 * Output (stdout, JSON):
 *   { "repoRoot": "<abs>", "detected": [{ "stack": "python", "markers": ["pyproject.toml"], "dir": "." }] }
 *   `dir` is the marker location relative to repoRoot ("." = root). Wrapper/monorepo
 *   layouts surface a non-"." dir so the skill can ask which root to onboard.
 *
 * To support a new stack: add a MARKER_MAP entry (files and/or exts) AND author its
 * stacks/<name>.md catalog entry. Extension-marker stacks below are intentionally
 * uncatalogued — they route into project-setup's net-new guided flow.
 */
import { readdirSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';

const MARKER_MAP = [
  { stack: 'python',          files: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'] },
  { stack: 'node',            files: ['package.json'] },
  { stack: 'rust',            files: ['Cargo.toml'] },
  { stack: 'go',              files: ['go.mod'] },
  { stack: 'flutter',         files: ['pubspec.yaml'] },
  { stack: 'silabs-embedded', exts:  ['.slcp'] },
  { stack: 'csharp',          exts:  ['.csproj', '.sln'] },
];

const NOISE_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'build', 'dist', 'target', '.venv', 'out',
]);
const MAX_DEPTH = 2; // root = depth 0; scan subdirs up to depth 2 inclusive

const repoRoot = resolve(process.argv[2] || '.');

/** Root + non-noise, non-hidden subdirs to depth ≤ MAX_DEPTH. */
function scanDirs(root) {
  const dirs = [root];
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (NOISE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const sub = join(dir, e.name);
      dirs.push(sub);
      if (depth + 1 < MAX_DEPTH) walk(sub, depth + 1);
    }
  };
  walk(root, 0);
  return dirs;
}

/** Markers present in a single directory, per stack. */
function detectInDir(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  const nameSet = new Set(names);
  const out = [];
  for (const { stack, files = [], exts = [] } of MARKER_MAP) {
    const hits = files.filter((f) => nameSet.has(f));
    for (const n of names) {
      if (exts.includes(extname(n))) hits.push(n);
    }
    if (hits.length > 0) out.push({ stack, markers: hits });
  }
  return out;
}

const detected = [];
for (const dir of scanDirs(repoRoot)) {
  const dirLabel = relative(repoRoot, dir) || '.';
  for (const { stack, markers } of detectInDir(dir)) {
    detected.push({ stack, markers, dir: dirLabel });
  }
}

process.stdout.write(JSON.stringify({ repoRoot, detected }, null, 2) + '\n');
