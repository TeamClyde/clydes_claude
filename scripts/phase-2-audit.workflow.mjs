// scripts/phase-2-audit.workflow.mjs — Claude Code Workflow-tool script (SANDBOX-ONLY).
//
// This file runs ONLY inside the Workflow tool sandbox, where agent() / parallel() /
// pipeline() / log() / phase() / args are injected globals and setTimeout is available.
// It is NOT a node module and must never be run under plain `node` (the globals are undefined
// there). It is invoked from main-context (not from an agent — an agent calling Workflow nests
// and throws). The primitive below is INLINED from scripts/lib/fail-successfully.mjs because the
// sandbox cannot import local modules; that module + its tests are the verified source of truth.
// Task 4 Step 4 diffs the two to guard against drift.

export const meta = {
  name: 'phase-2-orchestration-audit',
  description: 'Fail-successfully fan-out audit of the orchestration vs. the gate-map',
  phases: [
    { title: 'Find', detail: 'one+ agent per audit dimension, batched ≤ cap' },
    { title: 'Verify', detail: 'quorum-verify each finding (watchdog + 2-vote)' },
    { title: 'Synthesize', detail: 'per-edge classification + triaged fix list' },
  ],
}

// --- inlined fail-successfully primitive (verified by scripts/lib/fail-successfully.test.mjs) ---
function withWatchdog(workFn, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => { if (!settled) { settled = true; resolve({ outcome: 'timeout' }); } }, ms);
    Promise.resolve().then(workFn).then(
      (value) => finish({ outcome: 'done', value }),
      (error) => finish({ outcome: 'error', error }),
    );
  });
}
async function runUnit(spec) {
  const { work, validate = (v) => ({ ok: v != null }), timeoutMs, maxRetries = 1 } = spec;
  const history = [];
  let repair = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    history.push('RUNNING');
    const res = await withWatchdog(() => work(repair), timeoutMs);
    if (res.outcome === 'timeout') { history.push('TIMED_OUT'); continue; }
    if (res.outcome === 'error') { history.push('FAILED'); continue; }
    history.push('VALIDATING');
    const verdict = validate(res.value);
    if (verdict.ok) { history.push('SUCCEEDED'); return { state: 'SUCCEEDED', value: res.value, history }; }
    repair = verdict.reason ?? 'validation failed';
    history.push('RETRYING');
  }
  history.push('ABANDONED');
  return { state: 'ABANDONED', history };
}
async function quorumBarrier(units, threshold) {
  const results = await Promise.all(units.map((u) => runUnit(u)));
  const confirmed = results.filter((r) => r.state === 'SUCCEEDED').map((r) => r.value);
  return { confirmed, abandoned: results.length - confirmed.length, degraded: confirmed.length < threshold };
}
// --- inlined fail-successfully primitive END ---

// Liveness guard: the FSM termination proof depends on a working timer. The Workflow sandbox
// provides setTimeout (dossier §8, hasTimer:true) — fail loudly if a future sandbox does not,
// rather than silently risking a #76-class hang.
if (typeof setTimeout === 'undefined') throw new Error('Workflow sandbox missing timer support — cannot guarantee liveness');

// --- tunables (regulation dossier §10.1 — conservative defaults; revisit at run) ---
const FINDER_TIMEOUT_MS = 240_000;   // per finder agent
const VERIFY_TIMEOUT_MS = 180_000;   // per verify vote
const VERIFY_QUORUM = 2;             // of 3 votes
// Runtime caps concurrency at min(16, cores-2) and QUEUES the excess, but withWatchdog's timer
// starts at dispatch — a queued agent can time out before it runs (dossier §7). Keep each wave
// UNDER the real cap. os.cpus() is unavailable in-sandbox, so main-context computes it and passes
// args.cap; default 8 is conservative for typical machines.
const MAX_CONCURRENT = (args.cap && args.cap > 0) ? args.cap : 8;

// --- the six audit dimensions (design Unit C) ---
const DIMENSIONS = [
  { key: 'dead-refs',     sliceBy: 'edges',      batches: 3, instruction: 'For each edge/component in your batch, confirm every referenced component name resolves to a real entry in the inventory. Report any reference that points at a non-existent or renamed component.' },
  { key: 'invocation',    sliceBy: 'edges',      batches: 3, instruction: 'For each edge in your batch, read the source component and confirm it invokes the target via the correct mechanism (Skill vs Agent subagent_type vs direct), correct name, correct casing, and required args. Report mismatches.' },
  { key: 'conventions',   sliceBy: 'clusters',   batches: 1, instruction: 'Within your cluster, find pairs of components giving contradictory guidance, and state whether the user>rules>skills priority hierarchy resolves the conflict. ALSO classify each gate edge in your cluster (enforcement + maturity — see schema).' },
  { key: 'tool-interact', sliceBy: 'components',  batches: 2, instruction: 'Find components that should declare allowed-tools / tool-interaction guidance but do not, where the omission could cause a wrong-tool or missing-tool misfire.' },
  { key: 'triggers',      sliceBy: 'components',  batches: 3, instruction: 'Apply the symptom-trigger test: flag skill descriptions that summarize a workflow instead of stating "Use when …" (these cause agents to follow the description instead of reading the skill), and flag overlapping trigger surfaces between skills that could collide/misfire.' },
  { key: 'casing',        sliceBy: 'none',        batches: 1, instruction: 'Confirm the SKILL.md vs skill.md filename-casing inconsistency across skill directories; list every directory and which casing it uses.' },
];

// --- schemas (force structured agent output) ---
const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['dimension', 'severity', 'where', 'summary'],
        properties: {
          dimension: { type: 'string' },
          severity:  { enum: ['error', 'warning', 'suggestion'] },
          where:     { type: 'string', description: 'file:line citation' },
          summary:   { type: 'string' },
          edge:      { type: 'string', description: 'from→to if edge-scoped, else empty' },
        },
      },
    },
    edgeClassifications: {
      type: 'array',
      items: {
        type: 'object',
        required: ['from', 'to', 'enforcement', 'maturity', 'hardenable'],
        properties: {
          from: { type: 'string' }, to: { type: 'string' },
          enforcement: { enum: ['hard', 'soft', 'none-yet'] },
          mechanism: { type: 'string' },
          maturity: { enum: ['settling', 'matured'] },
          hardenable: { enum: ['yes', 'no', 'already'] },
          confidence: { enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['isReal', 'reason'],
  properties: { isReal: { type: 'boolean' }, reason: { type: 'string' } },
};

// args = { edges: [...140], components: [...76], hookFinding: '<Task-1 recorded answer + URL>', cap }
const { edges, components, hookFinding } = args;

// the six gate-map subsystem clusters (drives the conventions dimension + per-edge classification)
const CLUSTERS = {
  docs:     ['doc-author','doc-backfill','doc-tools','docs-refresh','docs-status','architecture-decision-records','docs-architect','changelog-automation','mermaid-expert','openapi-spec-generation','reference-builder','tutorial-engineer'],
  planning: ['brainstorming','writing-plans','plan-gate','plan-management','planning','executing-plans','subagent-driven-development','architect','test-strategy','test-builder','test-runner'],
  vetting:  ['install-vetting','vet-install','vet-reputation','vet-capability-fit','vet-security','ai-tool-security-reviewer'],
  gitjira:  ['git-manager','jira-workflow-manager','workflow-phases','mcp-governance','secrets-handling','finishing-a-development-branch'],
  setup:    ['new-repo-setup','project-setup','infra-init','e2e-init','using-superpowers','creating-tools','writing-skills','writing-agents','writing-rules','stack-hats'],
  debug:    ['systematic-debugging','integration-test-constraints','dispatching-parallel-agents'],
};
const sliceInto = (arr, n) => Array.from({ length: n }, (_, i) => arr.filter((_, j) => j % n === i));

function finderJobs() {
  const jobs = [];
  for (const d of DIMENSIONS) {
    if (d.sliceBy === 'clusters') {
      for (const [name, members] of Object.entries(CLUSTERS))
        jobs.push({ dim: d, label: `find:${d.key}:${name}`, worklist: { cluster: name, members } });
    } else if (d.sliceBy === 'edges') {
      sliceInto(edges, d.batches).forEach((b, i) => jobs.push({ dim: d, label: `find:${d.key}:${i}`, worklist: { edges: b } }));
    } else if (d.sliceBy === 'components') {
      sliceInto(components, d.batches).forEach((b, i) => jobs.push({ dim: d, label: `find:${d.key}:${i}`, worklist: { components: b } }));
    } else {
      jobs.push({ dim: d, label: `find:${d.key}`, worklist: {} });
    }
  }
  return jobs; // ~14–18 jobs — run in waves ≤ MAX_CONCURRENT
}

// --- Stage 1: fan-out finders (batched ≤ cap; each wrapped in runUnit watchdog) ---
phase('Find');
const jobs = finderJobs();
const finderResults = [];
for (let i = 0; i < jobs.length; i += MAX_CONCURRENT) {
  const wave = jobs.slice(i, i + MAX_CONCURRENT);
  const waveOut = await quorumBarrier(
    wave.map((job) => ({
      timeoutMs: FINDER_TIMEOUT_MS,
      maxRetries: 1,
      validate: (v) => (v && Array.isArray(v.findings)) ? { ok: true } : { ok: false, reason: 'must return { findings: [...] }' },
      work: (repair) => agent(
        `Audit dimension "${job.dim.key}". ${job.dim.instruction}\n` +
        `Worklist: ${JSON.stringify(job.worklist)}\n` +
        `Inventory index (names only): ${components.map((c) => c.name).join(', ')}\n` +
        (repair ? `\nPREVIOUS ATTEMPT REJECTED: ${repair}. Fix and resubmit.` : '') +
        `\nRead the real component files for citations. Return the schema.`,
        { label: job.label, phase: 'Find', schema: FINDINGS_SCHEMA },
      ),
    })),
    Math.ceil(wave.length / 2), // health threshold; degraded is logged, never fatal
  );
  if (waveOut.degraded) log(`Find wave ${i / MAX_CONCURRENT}: DEGRADED (${waveOut.abandoned} abandoned) — proceeding on quorum`);
  finderResults.push(...waveOut.confirmed);
}

const allFindings = finderResults.flatMap((r) => r.findings ?? []);
const finderClass = finderResults.flatMap((r) => r.edgeClassifications ?? []);
// Default-fill: only the `conventions` dimension classifies edges, and each cluster finder sees
// only its own members — so edges touching unclustered components (hooks, utility skills, some
// agents) get no row. Stub every unclassified gate-map edge as none-yet/settling/low so the
// per-edge table covers all 140 and the coverage gap is EXPLICIT, never a silent truncation.
const classifiedSet = new Set(finderClass.map((c) => `${c.from}->${c.to}`));
const allClassifications = [
  ...finderClass,
  ...edges.filter((e) => !classifiedSet.has(`${e.from}->${e.to}`)).map((e) => ({
    from: e.from, to: e.to, enforcement: 'none-yet',
    mechanism: 'unclassified (outside conventions-cluster scope)',
    maturity: 'settling', hardenable: 'unknown', confidence: 'low',
  })),
];

// --- Stage 2: adversarial verify — quorum of skeptics per finding; abandon stragglers ---
phase('Verify');
const verified = [];
const VERIFY_BATCH = Math.max(1, Math.floor(MAX_CONCURRENT / 3));
for (let i = 0; i < allFindings.length; i += VERIFY_BATCH) {
  const batch = allFindings.slice(i, i + VERIFY_BATCH);
  const judged = await Promise.all(batch.map(async (f, j) => {
    const votes = await quorumBarrier(
      Array.from({ length: 3 }, (_, k) => ({
        timeoutMs: VERIFY_TIMEOUT_MS,
        maxRetries: 0,
        validate: (v) => (v && typeof v.isReal === 'boolean') ? { ok: true } : { ok: false, reason: 'need { isReal, reason }' },
        work: () => agent(
          `Adversarially verify this audit finding — try to REFUTE it. Default to isReal=false if uncertain.\n${JSON.stringify(f)}`,
          { label: `verify:${f.dimension}:${i + j}:${k}`, phase: 'Verify', schema: VERDICT_SCHEMA },
        ),
      })),
      VERIFY_QUORUM,
    );
    const real = votes.confirmed.filter((v) => v.isReal).length;
    return { ...f, confirmed: real >= VERIFY_QUORUM, votes: votes.confirmed.length, degraded: votes.degraded };
  }));
  verified.push(...judged);
}
const confirmedFindings = verified.filter((f) => f.confirmed);

// --- Stage 3: synthesize the report payload ---
phase('Synthesize');
const report = await agent(
  `Synthesize the orchestration audit. Hook-verification result (authoritative): ${hookFinding}\n` +
  `Confirmed findings: ${JSON.stringify(confirmedFindings)}\n` +
  `Per-edge classifications: ${JSON.stringify(allClassifications)}\n` +
  `Produce: (1) findings grouped by dimension with file:line citations; (2) the full per-edge ` +
  `classification table (enforcement/mechanism/maturity/hardenable — use the hook result to set ` +
  `hardenable); (3) a triaged fix list where each item is tagged fold|supersede|keep against the ` +
  `"Orchestrator Routing v2" and "Workflow Feedback Fixes" backlog items. Return markdown.`,
  { label: 'synthesize', phase: 'Synthesize' },
);

return { report, confirmedCount: confirmedFindings.length, classified: allClassifications.length, raw: { confirmedFindings, allClassifications } };
