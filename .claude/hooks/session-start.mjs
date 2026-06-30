#!/usr/bin/env node
/**
 * SessionStart hook — surfaces the active plan's handoff at session start.
 *
 * Invoked as: node .claude/hooks/session-start.mjs
 * Cross-platform: pure Node + git CLI via execFileSync (no bash/pwsh subprocesses).
 * Never blocks session start — all errors exit 0.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, posix } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Resolve repo root as the directory containing .claude/active-plan
const __filename = fileURLToPath(import.meta.url);
// .claude/hooks/session-start.mjs → repo root is two levels up
const REPO_ROOT = resolve(dirname(__filename), '..', '..');

const ACTIVE_PLAN_FILE = join(REPO_ROOT, '.claude', 'active-plan');

try {
  // ── Step 1: Read .claude/active-plan ──────────────────────────────────────
  if (!existsSync(ACTIVE_PLAN_FILE)) {
    // No active plan — silent exit, do not block session start.
    process.exit(0);
  }

  const activePlanRel = readFileSync(ACTIVE_PLAN_FILE, 'utf8').trim();
  if (!activePlanRel) {
    process.exit(0);
  }

  // activePlanRel is relative from repo root, e.g. plans/foo/foo-plan.md
  const activePlanAbs = resolve(REPO_ROOT, activePlanRel);

  // ── Step 2: Walk up to top-level handoff ──────────────────────────────────
  const PLANS_DIR = resolve(REPO_ROOT, 'plans');

  /**
   * Find any *-handoff.md in a directory (returns absolute path or null).
   */
  function findHandoffInDir(dir) {
    try {
      const entries = readdirSync(dir);
      const handoff = entries.find((e) => e.endsWith('-handoff.md'));
      return handoff ? join(dir, handoff) : null;
    } catch {
      return null;
    }
  }

  let searchDir = dirname(activePlanAbs);
  let handoffAbs = null;

  while (true) {
    const found = findHandoffInDir(searchDir);
    if (found) {
      handoffAbs = found;
      break;
    }

    // Termination: stop at plans/ or repo root
    const normalised = resolve(searchDir);
    if (normalised === PLANS_DIR || normalised === REPO_ROOT) {
      break;
    }

    const parent = resolve(searchDir, '..');
    if (parent === normalised) {
      // Filesystem root — stop
      break;
    }
    searchDir = parent;
  }

  if (!handoffAbs) {
    process.stderr.write(
      'active-plan points at a path with no handoff; plan tree may not be fully scaffolded\n'
    );
    process.exit(0);
  }

  // ── Step 3: Read handoff content ──────────────────────────────────────────
  const handoffContent = readFileSync(handoffAbs, 'utf8');
  const activePlanDisplay = activePlanRel.replace(/\\/g, '/');

  // ── Step 4: Stale-check ───────────────────────────────────────────────────
  // Determine top-level plan directory (the directory containing the handoff).
  const topPlanDir = dirname(handoffAbs);
  // Relative path from repo root, always forward-slashes for git CLI.
  const topPlanDirRel = relative(REPO_ROOT, topPlanDir).replace(/\\/g, '/');
  // Git path filter: trailing slash to match the directory.
  const gitPathFilter = topPlanDirRel.endsWith('/')
    ? topPlanDirRel
    : topPlanDirRel + '/';

  let staleWarning = '';
  try {
    // Get handoff file mtime (ms since epoch).
    const handoffMtime = statSync(handoffAbs).mtimeMs;

    // Count commits on plans/<top>/ whose author-date is newer than handoff mtime.
    // %at = author timestamp (Unix seconds).
    const logOutput = execFileSync(
      'git',
      [
        '-C', REPO_ROOT,
        'log',
        '--format=%at',
        '--',
        gitPathFilter,
      ],
      { encoding: 'utf8', timeout: 10_000 }
    ).trim();

    if (logOutput) {
      const commitTimestamps = logOutput
        .split('\n')
        .map((line) => parseInt(line.trim(), 10) * 1000) // convert to ms
        .filter((ts) => !isNaN(ts));

      const newerCommits = commitTimestamps.filter((ts) => ts > handoffMtime);
      if (newerCommits.length > 0) {
        staleWarning =
          `⚠ Handoff stale by ${newerCommits.length} commit${newerCommits.length === 1 ? '' : 's'} — refresh before proceeding or override.\n\n`;
      }
    }
  } catch (err) {
    // Stale-check failure is non-fatal — log and continue.
    process.stderr.write(`session-start: stale-check failed: ${err.message}\n`);
  }

  // ── Step 5: Branch-mismatch warning ─────────────────────────────────────
  let branchWarning = '';
  try {
    const currentBranch = execFileSync(
      'git',
      ['-C', REPO_ROOT, 'branch', '--show-current'],
      { encoding: 'utf8', timeout: 10_000 }
    ).trim();

    if (currentBranch) {
      let expectedBranch = '';
      try {
        expectedBranch = execFileSync(
          'git',
          ['-C', REPO_ROOT, 'config', '--worktree', '--get', 'claude.expectedBranch'],
          { encoding: 'utf8', timeout: 10_000 }
        ).trim();
      } catch {
        // Key unset or non-zero exit — no binding, skip silently.
      }

      if (expectedBranch && currentBranch !== expectedBranch) {
        branchWarning = `⚠ Active plan expects branch '${expectedBranch}' but you are on '${currentBranch}'.`;
      }
    }
  } catch {
    // Branch detection failure is non-fatal — skip silently.
  }

  // ── Step 6: Build and emit output ────────────────────────────────────────
  const conflictPrompt =
    'If your work today targets a different plan, edit .claude/active-plan to point at the correct plan.md, or use the git-manager switch workflow.';

  const outputParts = [
    `${staleWarning}📋 Active plan: ${activePlanDisplay}\n`,
    handoffContent,
    `\n---\n${conflictPrompt}`,
  ];

  if (branchWarning) {
    outputParts.push(branchWarning);
  }

  process.stdout.write(outputParts.join('\n') + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(`session-start hook error: ${err.message}\n`);
  process.exit(0);
}
