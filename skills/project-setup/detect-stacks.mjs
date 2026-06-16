#!/usr/bin/env node
/**
 * Stack detector for project-setup Phase 3.5 (Stack Setup).
 * Scans a repo root for well-known file markers and maps them to stack names.
 * Marker-based and deterministic; catalog-coverage is checked separately by the skill.
 *
 * Usage:  node detect-stacks.mjs [repoRoot]      (repoRoot defaults to cwd)
 * Output (stdout, JSON): { "repoRoot": "<abs>", "detected": [{ "stack": "python", "markers": ["pyproject.toml"] }] }
 *
 * Each stack name MUST match a catalog filename stacks/<name>.md and the value repos
 * put in project.json "stacks". To support a new stack: add a MARKER_MAP entry AND
 * author its stacks/<name>.md catalog entry (a deliberate upstream act — the skill's
 * Phase 3.5 escapes on an uncatalogued detection rather than guessing).
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MARKER_MAP = [
  { stack: 'python',  markers: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'] },
  { stack: 'node',    markers: ['package.json'] },
  { stack: 'rust',    markers: ['Cargo.toml'] },
  { stack: 'go',      markers: ['go.mod'] },
  { stack: 'flutter', markers: ['pubspec.yaml'] },
];

const repoRoot = resolve(process.argv[2] || '.');
const detected = [];
for (const { stack, markers } of MARKER_MAP) {
  const present = markers.filter((m) => existsSync(join(repoRoot, m)));
  if (present.length > 0) detected.push({ stack, markers: present });
}

process.stdout.write(JSON.stringify({ repoRoot, detected }, null, 2) + '\n');
