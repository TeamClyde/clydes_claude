#!/usr/bin/env node
// PostToolUse hook — logs every Skill invocation to ~/.claude/skill-usage-<hostname>.jsonl
const os = require('os');
const fs = require('fs');
const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const skill = event.tool_input?.skill;
    if (!skill) process.exit(0);

    const logFile = path.join(os.homedir(), '.claude', `skill-usage-${os.hostname()}.jsonl`);
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      skill,
      args: event.tool_input?.args || '',
      cwd: event.cwd || '',
    });
    fs.appendFileSync(logFile, entry + '\n');
  } catch {
    // Never block a Skill invocation on log failure
  }
  process.exit(0);
});
