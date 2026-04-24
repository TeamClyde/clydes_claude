#!/usr/bin/env node
// Reads ~/.claude/skill-usage-<hostname>.jsonl and prints (or emails) a usage report.
// Usage: node skill-audit.js [days] [--send]
//   days   — lookback window in days (default: 7)
//   --send — email the report via Gmail using ~/.claude/skill-report-config.json
const os = require('os');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const SEND = args.includes('--send');
const DAYS = parseInt(args.find(a => /^\d+$/.test(a)) || '7', 10);

const machine = os.hostname();
const logFile = path.join(os.homedir(), '.claude', `skill-usage-${machine}.jsonl`);
const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;

// Tally invocations within the window
const counts = {};
let totalCalls = 0;

if (fs.existsSync(logFile)) {
  for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const { ts, skill } = JSON.parse(line);
      if (new Date(ts).getTime() >= cutoff) {
        counts[skill] = (counts[skill] || 0) + 1;
        totalCalls++;
      }
    } catch { /* skip malformed lines */ }
  }
}

// Enumerate all installed skills across hand-built skills, plugins, and builtins
function getInstalledSkills() {
  const skills = new Set();

  // 1. Hand-built skills from ~/.claude/skills/
  const skillsDir = path.join(os.homedir(), '.claude', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const n of fs.readdirSync(skillsDir)) {
      const name = n.replace(/@$/, '').replace(/[/\\]$/, '');
      if (name && !name.startsWith('.')) skills.add(name);
    }
  }

  // 2. Plugin skills and commands from installed_plugins.json
  const pluginsJson = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
  if (fs.existsSync(pluginsJson)) {
    const { plugins = {} } = JSON.parse(fs.readFileSync(pluginsJson, 'utf8'));
    for (const [pluginKey, installs] of Object.entries(plugins)) {
      const pluginName = pluginKey.split('@')[0];
      const install = (installs || [])[0];
      if (!install) continue;

      // skills/ subdirectories (e.g. atlassian:spec-to-backlog)
      const skillsSubdir = path.join(install.installPath, 'skills');
      if (fs.existsSync(skillsSubdir)) {
        for (const s of fs.readdirSync(skillsSubdir)) {
          if (!s.startsWith('.')) skills.add(`${pluginName}:${s}`);
        }
      }

      // commands/ (slash commands surfaced as skills, e.g. commit-commands:commit)
      const cmdsDir = path.join(install.installPath, 'commands');
      if (fs.existsSync(cmdsDir)) {
        for (const f of fs.readdirSync(cmdsDir)) {
          if (f.endsWith('.md')) skills.add(`${pluginName}:${f.replace('.md', '')}`);
        }
      }
    }
  }

  // 3. Built-in Claude Code skills (not discoverable from filesystem)
  for (const s of ['init', 'review', 'security-review']) skills.add(s);

  return [...skills].sort();
}

const installed = getInstalledSkills();

const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
const unused = installed.filter(s => !counts[s]);
const maxCount = sorted.length ? sorted[0][1] : 1;
const now = new Date().toISOString().slice(0, 10);

const mdLines = [
  `# Weekly Skill Usage Report`,
  `**Machine:** ${machine} | **Period:** last ${DAYS} days (as of ${now}) | **Total invocations:** ${totalCalls}`,
  '',
  '## Usage',
  '',
];

if (sorted.length === 0) {
  mdLines.push('_No skill invocations recorded in this period._');
} else {
  mdLines.push('| Skill | Count | Bar |');
  mdLines.push('|---|---|---|');
  for (const [skill, count] of sorted) {
    const bar = '█'.repeat(Math.max(1, Math.round((count / maxCount) * 12)));
    mdLines.push(`| ${skill} | ${count} | ${bar} |`);
  }
}

mdLines.push('', '## Installed skills with zero uses this week', '');
if (unused.length === 0) {
  mdLines.push('_All installed skills were used at least once._');
} else {
  for (const s of unused.sort()) mdLines.push(`- ${s}`);
}

const report = mdLines.join('\n');

if (!SEND) {
  console.log(report);
  process.exit(0);
}

// --- Email via nodemailer ---
const configPath = path.join(os.homedir(), '.claude', 'skill-report-config.json');
if (!fs.existsSync(configPath)) {
  console.error(`Missing config: ${configPath}`);
  console.error('Create it with: { "email": "you@gmail.com", "gmail_app_password": "xxxx..." }');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: config.email, pass: config.gmail_app_password },
});

// Simple markdown → HTML (tables, bold, inline code)
const toHtml = md => md
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/^# (.+)$/gm, '<h2>$1</h2>')
  .replace(/^## (.+)$/gm, '<h3>$1</h3>')
  .replace(/^- (.+)$/gm, '<li>$1</li>')
  .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
  .replace(/^\|(.+)\|$/gm, row => {
    const cells = row.split('|').slice(1, -1);
    return '<tr>' + cells.map(c => `<td style="padding:2px 8px;border:1px solid #ccc">${c.trim()}</td>`).join('') + '</tr>';
  })
  .replace(/(<tr>.*<\/tr>\n?)+/g, s => `<table style="border-collapse:collapse">${s}</table>`)
  .replace(/\n/g, '<br>');

transporter.sendMail({
  from: config.email,
  to: config.email,
  subject: `Weekly Skill Report — ${machine} (${now})`,
  text: report,
  html: `<div style="font-family:sans-serif;max-width:700px">${toHtml(report)}</div>`,
}).then(() => {
  console.log(`Report sent to ${config.email}`);
}).catch(err => {
  console.error('Send failed:', err.message);
  process.exit(1);
});
