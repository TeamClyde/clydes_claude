// measure-workflow-run.mjs — offline token measurement over a Workflow run's transcripts.
//
// Replaces the throwaway Python in the librarian-token-efficiency retrospective §6. Two
// responsibilities kept deliberately separate:
//   - a PURE core (classifyAgent / aggregate / findOrphans / normalise / watchdogMargin), unit-tested
//     against constructed fixtures;
//   - a thin CLI shell that reads the filesystem and prints tables.
//
// This is the home for every duration-based check, because the Workflow sandbox throws on
// Date.now() / new Date() / Math.random() — run-health.mjs is inlined into that sandbox and cannot
// do timing. Here we are offline and unconstrained.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Checked in order, FIRST MATCH WINS — the order is the specification, not an implementation
// detail. `You are a research analyst running a NARROW follow-up` must precede the plain analyst
// prefix, and both must precede the generic `You are a ` consensus catch-all.
//
// Prefixes, not keywords. The retrospective's classifier keyed on the WORD "traceability" and swept
// 16 section-writer retries into the audit bucket, because a rejected section-writer is re-prompted
// with "these claims are not traceable...". That one substring made the phase table wrong in the
// direction that mattered most — it invented an audit problem that did not exist.
const PREFIXES = [
  ['You are auditing a research section', 'audit'],
  ['You are a research analyst running a NARROW follow-up', 'research:reframe'],
  ['You are a research analyst', 'research'],
  ['Re-check', 'verify:recheck'],
  ['Triage', 'verify:triage'],
  ['You are a ', 'verify:consensus'],
  ['Write', 'section-writer'],
];

/** @param {string} prompt @returns {string} phase label */
export function classifyAgent(prompt) {
  const p = typeof prompt === 'string' ? prompt : '';
  for (const [prefix, phase] of PREFIXES) if (p.startsWith(prefix)) return phase;
  return 'other';
}

const ZERO = () => ({ n: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, turns: 0, tools: 0 });

/**
 * Sum per-agent usage into per-phase buckets.
 * @param {Array<{phase:string, usage:object, turns:number, tools:number}>} agents
 */
export function aggregate(agents) {
  const out = {};
  for (const a of agents) {
    const b = (out[a.phase] ??= ZERO());
    b.n += 1;
    b.input += a.usage?.input ?? 0;
    b.output += a.usage?.output ?? 0;
    b.cacheWrite += a.usage?.cacheWrite ?? 0;
    b.cacheRead += a.usage?.cacheRead ?? 0;
    b.turns += a.turns ?? 0;
    b.tools += a.tools ?? 0;
  }
  return out;
}

/**
 * Agents the run STARTED and never got a result line for — paid for in full, then discarded.
 * This is the cost class no in-sandbox signal can see, because the workflow script never learns
 * that an abandoned unit kept running.
 * @param {Array<{type:string, agentId:string}>} journal
 */
export function findOrphans(journal) {
  const started = [];
  const done = new Set();
  for (const e of journal ?? []) {
    if (e?.type === 'started' && e.agentId) started.push(e.agentId);
    if (e?.type === 'result' && e.agentId) done.add(e.agentId);
  }
  return started.filter((id) => !done.has(id));
}

/**
 * Per-sub-question figures — the denominator the plan's pass bars are stated against. A run that
 * answers more sub-questions should not read as more expensive.
 */
export function normalise(totals, subQuestions) {
  const n = subQuestions > 0 ? subQuestions : 1;
  return {
    billedPerSubQuestion: (totals?.billed ?? 0) / n,
    cacheReadPerSubQuestion: (totals?.cacheRead ?? 0) / n,
  };
}

/**
 * Fraction of a phase's watchdog budget an agent actually consumed. The #141 margin check.
 * `margin` is null when no timeout was configured for the phase — n/a, never a fabricated number.
 */
export function watchdogMargin(spanMs, timeoutMs) {
  if (!(timeoutMs > 0)) return { margin: null, flagged: false };
  const margin = spanMs / timeoutMs;
  return { margin, flagged: margin >= 0.7 };
}

// ── CLI shell ───────────────────────────────────────────────────────────────

/**
 * Sum one agent's usage from its parsed transcript lines. Pure — the filesystem stays in the
 * caller, so this, the measurement's single most consequential rule, is unit-testable.
 *
 * ONE USAGE PER `message.id`, LAST LINE WINS. This is the whole correctness story:
 *
 *   - The transcript emits ONE LINE PER CONTENT BLOCK. A single assistant message with a thinking
 *     block and four tool_use blocks arrives as five lines, each carrying a full copy of that
 *     message's `usage`. One API call, five copies. Summing per line therefore counts the same
 *     call's tokens once per block — on the measured run that inflates cache reads 2.7x, cache
 *     writes 2.2x, and fresh input 2.6x. The tell is that it produces impossible values: a call
 *     whose context is 37,017 tokens is credited with 148,068 cache reads.
 *   - `output_tokens` is the ONE field that varies across those copies — it is a streaming
 *     snapshot, growing as the response is produced, so the LAST line holds the final count. Every
 *     other field is stable. First-wins would undercount output; last-wins is correct for all four.
 *
 * `turns` is unique message ids, not line count, for the same reason. Tool-use blocks are NOT
 * deduped: each appears exactly once, on its own line.
 */
export function sumAgentUsage(lines) {
  const usageById = new Map();
  let tools = 0;
  for (const e of lines) {
    if (e?.type !== 'assistant') continue;
    const id = e.message?.id;
    const u = e.message?.usage;
    if (id && u) usageById.set(id, u);   // last-wins — see the output_tokens note above
    for (const blk of e.message?.content ?? []) if (blk?.type === 'tool_use') tools += 1;
  }
  const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  for (const u of usageById.values()) {
    usage.input += u.input_tokens ?? 0;
    usage.output += u.output_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    usage.cacheRead += u.cache_read_input_tokens ?? 0;
  }
  return { usage, turns: usageById.size, tools };
}

/** Parse one agent-*.jsonl into { phase, usage, turns, tools, spanMs }. */
function parseAgentFile(path) {
  const lines = [];
  let prompt = '';
  const stamps = [];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (!raw) continue;
    let e;
    try { e = JSON.parse(raw); } catch { continue; }
    lines.push(e);
    if (e.timestamp) stamps.push(Date.parse(e.timestamp));
    if (!prompt && e.type === 'user') {
      const c = e.message?.content;
      prompt = typeof c === 'string' ? c : (Array.isArray(c) ? (c.find((x) => x?.type === 'text')?.text ?? '') : '');
    }
  }
  const spanMs = stamps.length > 1 ? Math.max(...stamps) - Math.min(...stamps) : 0;
  return { phase: classifyAgent(prompt), ...sumAgentUsage(lines), spanMs };
}

/** Resolve a phase's configured timeout: exact label first, then the segment before `:`. */
function timeoutFor(phase, timeouts) {
  return timeouts[phase] ?? timeouts[phase.split(':')[0]];
}

function parseArgv(argv) {
  const timeouts = {};
  let dir = null;
  let subQuestions = 1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sub-questions') { subQuestions = Number(argv[++i]); continue; }
    if (argv[i] === '--timeout') {
      const [k, v] = String(argv[++i]).split('=');
      timeouts[k] = Number(v);
      continue;
    }
    if (!dir) dir = argv[i];
  }
  return { dir, subQuestions, timeouts };
}

const n = (x) => x.toLocaleString('en-US');

function main(argv) {
  const { dir, subQuestions, timeouts } = parseArgv(argv);
  if (!dir) {
    console.error('usage: measure-workflow-run.mjs <transcript-dir> [--sub-questions N] [--timeout phase=ms ...]');
    process.exit(2);
  }
  const files = readdirSync(dir).filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'));
  const agents = files.map((f) => ({ file: f, ...parseAgentFile(join(dir, f)) }));
  const byPhase = aggregate(agents);

  let journal = [];
  try {
    journal = readFileSync(join(dir, 'journal.jsonl'), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { /* no journal — orphan detection simply does not run */ }
  const orphans = findOrphans(journal);

  console.log(`\nagents: ${agents.length}   sub-questions: ${subQuestions}\n`);
  console.log('phase              n     turns  tools        fresh   cache write    cache read       output');
  console.log('-'.repeat(94));
  const totals = ZERO();
  for (const [phase, b] of Object.entries(byPhase).sort()) {
    console.log(
      phase.padEnd(18) + String(b.n).padStart(3) + String(b.turns).padStart(9) + String(b.tools).padStart(7)
      + n(b.input).padStart(13) + n(b.cacheWrite).padStart(14) + n(b.cacheRead).padStart(14) + n(b.output).padStart(13),
    );
    for (const k of ['n', 'input', 'output', 'cacheWrite', 'cacheRead', 'turns', 'tools']) totals[k] += b[k];
  }
  console.log('-'.repeat(94));
  console.log(
    'TOTAL'.padEnd(18) + String(totals.n).padStart(3) + String(totals.turns).padStart(9) + String(totals.tools).padStart(7)
    + n(totals.input).padStart(13) + n(totals.cacheWrite).padStart(14) + n(totals.cacheRead).padStart(14) + n(totals.output).padStart(13),
  );

  // Billed excludes cache READS, which are priced separately and dwarf everything else — reporting
  // one number would hide exactly the ratio this plan exists to cut.
  const billed = totals.input + totals.cacheWrite + totals.output;
  const norm = normalise({ billed, cacheRead: totals.cacheRead }, subQuestions);
  console.log(`\nbilled (fresh + cache write + output): ${n(billed)}`);
  console.log(`cache read:                            ${n(totals.cacheRead)}`);
  console.log(`per sub-question — billed: ${n(Math.round(norm.billedPerSubQuestion))}   cache read: ${n(Math.round(norm.cacheReadPerSubQuestion))}`);

  console.log(`\norphans (started, no result — paid for and discarded): ${orphans.length}`);
  for (const id of orphans) console.log(`  ${id}`);

  const flagged = agents
    .map((a) => ({ ...a, ...watchdogMargin(a.spanMs, timeoutFor(a.phase, timeouts)) }))
    .filter((a) => a.flagged);
  console.log(`\nwatchdog margin >= 70%: ${flagged.length}`);
  for (const a of flagged) {
    console.log(`  ${a.file}  ${a.phase}  ${Math.round(a.spanMs / 1000)}s  ${(a.margin * 100).toFixed(1)}%`);
  }
  const unconfigured = [...new Set(agents.map((a) => a.phase))].filter((p) => !timeoutFor(p, timeouts));
  if (unconfigured.length) console.log(`  margin: n/a for ${unconfigured.join(', ')} (no --timeout given)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
