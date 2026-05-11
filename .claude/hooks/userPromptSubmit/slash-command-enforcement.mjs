#!/usr/bin/env node
/**
 * UserPromptSubmit hook — slash-command directive injection.
 *
 * When user types /<skill-name> in their message, inject additionalContext
 * directing immediate Skill invocation. Soft enforcement only — prose
 * injection; orchestrator can ignore. Mechanical enforcement is blocked on
 * Claude Code hook API capability.
 *
 * Test isolation: set SKILLS_LIST_OVERRIDE to a comma-separated list of skill
 * names to bypass filesystem scanning (used by the test suite).
 *
 * Never blocks (exit 0 on all paths). Total runtime budget: <50ms p50.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
// .claude/hooks/userPromptSubmit/slash-command-enforcement.mjs → repo root is three levels up
const REPO_ROOT = resolve(dirname(__filename), '..', '..', '..');

// ── Emergency disable ─────────────────────────────────────────────────────────
if (process.env.CLAUDE_DISABLE_WORKFLOW_HOOKS) {
  process.exit(0);
}

// ── Read stdin ────────────────────────────────────────────────────────────────
let rawInput = '';
try {
  rawInput = readFileSync('/dev/stdin', 'utf8');
} catch {
  // Windows fallback: read fd 0 synchronously
  try {
    const { readSync } = await import('node:fs');
    const buf = [];
    const chunk = Buffer.alloc(65536);
    let bytesRead;
    while (true) {
      try {
        bytesRead = readSync(0, chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        buf.push(chunk.slice(0, bytesRead).toString('utf8'));
      } catch {
        break;
      }
    }
    rawInput = buf.join('');
  } catch {
    process.exit(0);
  }
}

// ── Parse JSON ────────────────────────────────────────────────────────────────
let input;
try {
  input = JSON.parse(rawInput);
} catch {
  process.exit(0);
}

const prompt = input?.prompt;
if (typeof prompt !== 'string' || prompt.trim() === '') {
  process.exit(0);
}

// ── Build valid skills set ────────────────────────────────────────────────────
function loadSkills() {
  // Test isolation: SKILLS_LIST_OVERRIDE takes precedence
  if (process.env.SKILLS_LIST_OVERRIDE) {
    return new Set(
      process.env.SKILLS_LIST_OVERRIDE
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }

  const skills = new Set();

  // Scan global ~/.claude/skills/
  const globalSkillsDir = join(homedir(), '.claude', 'skills');
  try {
    if (existsSync(globalSkillsDir)) {
      for (const entry of readdirSync(globalSkillsDir, { withFileTypes: true })) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          skills.add(entry.name);
        }
      }
    }
  } catch {
    // Non-fatal — proceed with whatever we have
  }

  // Scan repo-local skills/
  const localSkillsDir = join(REPO_ROOT, 'skills');
  try {
    if (existsSync(localSkillsDir)) {
      for (const entry of readdirSync(localSkillsDir, { withFileTypes: true })) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          skills.add(entry.name);
        }
      }
    }
  } catch {
    // Non-fatal
  }

  return skills;
}

// ── Pattern match ─────────────────────────────────────────────────────────────
// Matches leading slash at word-boundary, followed by skill-name shape
const SLASH_CMD_RE = /(?:^|\s)\/([a-z][a-z0-9-]+)(?=\s|$)/g;

const validSkills = loadSkills();

// Collect matches in order, validating against skills list
const matches = [];
let m;
SLASH_CMD_RE.lastIndex = 0;

while ((m = SLASH_CMD_RE.exec(prompt)) !== null) {
  const name = m[1];
  if (!validSkills.has(name)) continue;

  // Capture args: text after the slash command up to next slash-command or end
  const cmdEnd = m.index + m[0].length;
  // Find the next slash-command position, or end of string
  const nextSlash = prompt.indexOf('/', cmdEnd);
  let argsEnd = prompt.length;
  if (nextSlash !== -1) {
    argsEnd = nextSlash - 1; // exclude the space before next command
  }
  const args = prompt.slice(cmdEnd, argsEnd).trim();

  matches.push({ name, args });
}

// ── Emit if any valid matches found ──────────────────────────────────────────
if (matches.length === 0) {
  process.exit(0);
}

function buildSkillCall(name, args) {
  if (args) {
    return `Invoke Skill { skill: '${name}', args: '${args}' } as your immediate next action.`;
  }
  return `Invoke Skill { skill: '${name}' } as your immediate next action.`;
}

function buildContextLine(name, args) {
  if (args) {
    return `User invoked /${name} in their message with args: ${args}. ${buildSkillCall(name, args)}`;
  }
  return `User invoked /${name} in their message. ${buildSkillCall(name, args)}`;
}

const [first, ...rest] = matches;

let additionalContext = buildContextLine(first.name, first.args);
additionalContext += ' Do not search the registry, do not summarize what the skill does, do not run the task ad-hoc.';

if (rest.length > 0) {
  const names = rest.map((r) => `/${r.name}`).join(', ');
  additionalContext += ` Additional slash commands found in this message: ${names}. Invoke them in the order they appeared after the first.`;
}

const output = {
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext,
  },
};

process.stdout.write(JSON.stringify(output) + '\n');
process.exit(0);
