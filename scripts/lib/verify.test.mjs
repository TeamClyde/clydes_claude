import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tieredVerify, VERIFY_PROTOCOL } from './verify.mjs';

const F = [
  { id: 'a', where: 'x.mjs:1', summary: 'real',   _seed: 'supported' },
  { id: 'b', where: 'x.mjs:2', summary: 'false',   _seed: 'unsupported' },
  { id: 'c', where: 'y.mjs:3', summary: 'borderline', _seed: 'uncertain' },
];

// Generic stub: triage echoes _seed; Tier-2 recheck keeps all; consensus voters keep unless refute() says so.
// Tier 3 is BATCHED — one call per voter frame returns a vote per index (label: verify:consensus:<voter>:<chunk>).
// `_idx` equals fixture position, so positional `i` is the index the engine will look up.
function mkAgent({ recheckDrops = [], refute = () => false } = {}) {
  return async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: F.map((f, i) => ({ index: i, support: f._seed })) };
    if (opts.label?.startsWith('verify:recheck')) return { keep: F.map((_, i) => ({ index: i, keep: !recheckDrops.includes(i) })) };
    if (opts.label?.startsWith('verify:consensus')) {
      const voter = Number(opts.label.split(':')[2]);
      return { votes: F.map((f, i) => ({ index: i, refuted: refute(f.id, voter) })) };
    }
  };
}

// Build N uniform findings that all cluster together (same `where` file) for volume tests.
const manyFindings = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `f${i}`, where: `x.mjs:${i}`, summary: `claim ${i}` }));

// Indices the engine rendered into a tier prompt (renderFinding emits `[idx] where — summary`).
const promptIndices = (prompt) => [...prompt.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));

test('protocol object matches the pinned shape', () => {
  assert.equal(VERIFY_PROTOCOL.consensus.voters, 3);
  assert.equal(VERIFY_PROTOCOL.consensus.surviveAtLeast, 2);
  assert.equal(VERIFY_PROTOCOL.consensus.rule, 'minority-veto');
});

test('Tier 1: supported survives, unsupported dropped; uncertain escalates', async () => {
  const out = await tieredVerify(F, { profile: 'audit', agent: mkAgent(), perTierTimeoutMs: 1000 });
  const ids = out.findings.map((f) => f.id);
  assert.ok(ids.includes('a'));
  assert.ok(!ids.includes('b'));
  assert.ok(ids.includes('c'), 'uncertain survives when no tier drops it');
});

test('Tier 2: a clustered re-check can drop an escalated finding before consensus', async () => {
  // c (index 2) escalates as uncertain; recheck drops index 2 → not in output, not contested
  const out = await tieredVerify(F, { profile: 'audit', agent: mkAgent({ recheckDrops: [2] }), perTierTimeoutMs: 1000 });
  assert.ok(!out.findings.map((f) => f.id).includes('c'));
});

test('Tier 2 keys on GLOBAL _idx, not cluster position', async () => {
  const G = [
    { id: 'p', where: 'z.mjs:1', _seed: 'uncertain' },   // _idx 0, cluster 'z.mjs'
    { id: 'q', where: 'other.mjs:1', _seed: 'supported' }, // _idx 1, not escalated
    { id: 'r', where: 'z.mjs:9', _seed: 'uncertain' },   // _idx 2, cluster 'z.mjs'
  ];
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: G.map((f, i) => ({ index: i, support: f._seed })) };
    if (opts.label?.startsWith('verify:recheck')) return { keep: [{ index: 0, keep: true }, { index: 2, keep: false }] };
    if (opts.label?.startsWith('verify:consensus')) return { votes: G.map((_, i) => ({ index: i, refuted: false })) };
  };
  const out = await tieredVerify(G, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  const ids = out.findings.map((f) => f.id);
  assert.ok(ids.includes('p'), 'p (_idx 0) kept');
  assert.ok(!ids.includes('r'), 'r (_idx 2) dropped — lookup keyed on global _idx, not cluster position 1');
});

test('Tier 3 minority-veto: <2 keepers → dropped + logged contested', async () => {
  // c stays uncertain through recheck (keep), then 2 of 3 voters refute → 1 keeper → drop + contested
  const refute = (id, voter) => id === 'c' && voter < 2;
  const out = await tieredVerify(F, { profile: 'audit', agent: mkAgent({ refute }), perTierTimeoutMs: 1000 });
  assert.ok(!out.findings.map((f) => f.id).includes('c'));
  assert.deepEqual(out.contested.map((f) => f.id), ['c']);
});

test('Tier 3: a finding that survives but had a refutation is kept AND logged contested', async () => {
  const refute = (id, voter) => id === 'c' && voter === 0; // 1 refute, 2 keep → survives, but contested
  const out = await tieredVerify(F, { profile: 'audit', agent: mkAgent({ refute }), perTierTimeoutMs: 1000 });
  assert.ok(out.findings.map((f) => f.id).includes('c'), 'survives (2/3 keep)');
  assert.ok(out.contested.map((f) => f.id).includes('c'), 'but logged contested (had a refutation)');
});

test('degrades gracefully when a tier throws', async () => {
  const boom = async () => { throw new Error('tier down'); };
  const out = await tieredVerify(F, { profile: 'audit', agent: boom, perTierTimeoutMs: 1000 });
  assert.equal(out.degraded, true);
  assert.deepEqual(out.findings, F, 'degraded → pass through unverified');
});

// Profile-override path (review-found gap): web-research escalates `unsupported`
// instead of dropping it (escalateOn includes 'unsupported'). The other tests use
// the `audit` profile, which drops unsupported — this guards the override branch.
test('web-research profile: unsupported finding escalates to Tier 2 (not dropped)', async () => {
  const W = [{ id: 'u', where: 'src.mjs:1', summary: 'weak', _seed: 'unsupported' }];
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: [{ index: 0, support: 'unsupported' }] };
    if (opts.label?.startsWith('verify:recheck')) return { keep: [{ index: 0, keep: true }] };
    if (opts.label?.startsWith('verify:consensus')) return { votes: [{ index: 0, refuted: false }] };
  };
  const out = await tieredVerify(W, { profile: 'web-research', agent, perTierTimeoutMs: 1000 });
  assert.ok(out.findings.map((f) => f.id).includes('u'),
    'web-research unsupported finding survives when recheck + consensus keep it');
});

// Regression — Bug 3: findings whose shape lacks `where`/`summary` (e.g. web-research
// { subQuestion, claim, source }) must still triage on their own fields. The original bug
// rendered every row as "undefined — undefined", so triage dropped 100% of findings.
test('tolerant rendering: a finding lacking where/summary triages on its own fields (no "undefined" defeat)', async () => {
  const WR = [{ subQuestion: 'q1', claim: 'pgvector is fine at small scale', source: 'https://example.com/pg' }];
  let triageSeen = '';
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') { triageSeen = prompt; return { verdicts: [{ index: 0, support: 'supported' }] }; }
    if (opts.label?.startsWith('verify:recheck')) return { keep: [{ index: 0, keep: true }] };
    if (opts.label?.startsWith('verify:consensus')) return { votes: [{ index: 0, refuted: false }] };
  };
  const out = await tieredVerify(WR, { profile: 'web-research', agent, perTierTimeoutMs: 1000 });
  assert.ok(!triageSeen.includes('undefined'), 'must not render "undefined" into the triage prompt');
  assert.ok(triageSeen.includes('pgvector'), 'renders the finding content (claim) for triage');
  assert.equal(out.findings.length, 1, 'web-research finding survives without a where/summary adapter');
});

// Regression — Bug 3 (the dangerous half): if triage judges NOTHING on a non-empty input (no
// verdicts back), the verify never ran — surface it as degraded (verifyEmptied), never as a silent
// empty set with degraded:false.
test('fail loud: triage judging nothing on a non-empty input degrades (verifyEmptied), not silent-empty success', async () => {
  // Triage returns no verdicts → no finding is judged → broken contract, not a real empty result.
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: [] };
    return { keep: [], refuted: true };
  };
  const out = await tieredVerify(F, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.degraded, true, 'triage judged nothing → surfaced as degraded, not success');
  assert.equal(out.verifyEmptied, true);
  assert.deepEqual(out.findings, F, 'falls back to the unverified findings, not an empty set');
});

// Regression — the guard must NOT over-fire. A legitimate "everything is unsupported" triage DID
// judge every finding; under audit/code-review those drop at Tier 1, so survivors=0 — but that is a
// CORRECT empty result, not a verify failure. Guarding on "did triage judge anything" (not "did
// anything survive") is what keeps this case quiet.
test('all-unsupported with verdicts present is a clean empty result, not verifyEmptied', async () => {
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: F.map((_, i) => ({ index: i, support: 'unsupported' })) };
    return { keep: [], votes: [] };
  };
  const out = await tieredVerify(F, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.degraded, false, 'triage judged every finding → not a failure');
  assert.ok(!out.verifyEmptied, 'must not flag verifyEmptied when findings were genuinely judged');
  assert.equal(out.findings.length, 0, 'all-unsupported → correct empty result');
});

// ── Regression: PARTIAL triage coverage ────────────────────────────────────────
// A live run handed one triage agent 254 findings; it returned verdicts for indices 0-22 and the
// engine silently dropped the other 231 (`if (!v) continue`). The anyJudged guard only catches the
// all-or-nothing case, so partial truncation passed as success. An unjudged finding carries no
// evidence against it — it must escalate, never drop.
test('partial triage coverage: unjudged findings escalate instead of being dropped', async () => {
  const N = 100;
  const many = manyFindings(N);
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') {
      // Simulate a truncating triage agent: judge only global indices <= 22, whatever chunk they land in.
      return { verdicts: promptIndices(prompt).filter((i) => i <= 22).map((i) => ({ index: i, support: 'supported' })) };
    }
    if (opts.label?.startsWith('verify:recheck')) return { keep: [] };    // absent → keep
    if (opts.label?.startsWith('verify:consensus')) return { votes: [] }; // absent → keeper
  };
  const out = await tieredVerify(many, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.findings.length, N, 'no finding may be dropped merely for lacking a verdict');
  assert.equal(out.counts.triageCoverage, 23 / N, 'coverage shortfall is reported, not hidden');
});

test('triage is chunked so every finding is actually presented for judgement', async () => {
  const N = 100;
  const many = manyFindings(N);
  const seen = new Set();
  let triageCalls = 0;
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') {
      triageCalls++;
      const idxs = promptIndices(prompt);
      for (const i of idxs) seen.add(i);
      return { verdicts: idxs.map((i) => ({ index: i, support: 'supported' })) };
    }
    if (opts.label?.startsWith('verify:recheck')) return { keep: [] };
    if (opts.label?.startsWith('verify:consensus')) return { votes: [] };
  };
  const out = await tieredVerify(many, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  assert.ok(triageCalls > 1, 'a 100-finding input must be split across more than one triage call');
  assert.equal(seen.size, N, 'every index 0..N-1 is presented to some triage chunk');
  assert.equal(out.counts.triageCoverage, 1);
});

// ── Regression: Tier-3 cost bound ──────────────────────────────────────────────
// Tier 3 used to run 3 voter agents PER FINDING in a sequential loop. Once the upstream watchdog and
// triage-coverage bugs were fixed, ~250 findings would reach it — ~500 sequential agents, reproducing
// a prior incident that burned a session limit. Dispatch is now batched: 3 frames per chunk.
test('Tier 3 dispatch is batched — agent count scales with chunks, not with findings', async () => {
  const N = 60;
  const many = manyFindings(N);
  let consensusCalls = 0;
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') {
      return { verdicts: promptIndices(prompt).map((i) => ({ index: i, support: 'uncertain' })) };
    }
    if (opts.label?.startsWith('verify:recheck')) return { keep: [] };
    if (opts.label?.startsWith('verify:consensus')) { consensusCalls++; return { votes: [] }; }
  };
  const out = await tieredVerify(many, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.findings.length, N, 'all 60 escalate and survive');
  assert.ok(consensusCalls <= 3 * Math.ceil(N / 40), `batched Tier 3 must not exceed 3 per chunk (got ${consensusCalls})`);
  assert.ok(consensusCalls < N, `must not be per-finding voting (got ${consensusCalls} for ${N} findings)`);
});

test('minority-veto survives the batch dispatch shape', async () => {
  const M = [
    { id: 'm1', where: 'x.mjs:1', summary: 'refuted by two frames' },
    { id: 'm2', where: 'x.mjs:2', summary: 'refuted by one frame' },
  ];
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: M.map((_, i) => ({ index: i, support: 'uncertain' })) };
    if (opts.label?.startsWith('verify:recheck')) return { keep: [] };
    if (opts.label?.startsWith('verify:consensus')) {
      const voter = Number(opts.label.split(':')[2]);
      return { votes: [
        { index: 0, refuted: voter < 2 },   // m1: 2 of 3 refute → 1 keeper → drop
        { index: 1, refuted: voter === 0 }, // m2: 1 of 3 refutes → 2 keepers → survive
      ] };
    }
  };
  const out = await tieredVerify(M, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  const ids = out.findings.map((f) => f.id);
  assert.ok(!ids.includes('m1'), 'm1 drops on minority-veto (1 keeper < surviveAtLeast 2)');
  assert.ok(ids.includes('m2'), 'm2 survives (2 keepers)');
  assert.deepEqual(out.contested.map((f) => f.id).sort(), ['m1', 'm2'], 'both logged contested');
});

// A voter frame that omits an index has NOT refuted it — same rule as Tier 2's absent-entry keep.
// Without this, a frame that truncates silently refutes its tail: the Tier-1 bug, one tier down.
test('a consensus frame omitting an index counts as a keeper, not a refutation', async () => {
  const S = [{ id: 's1', where: 'x.mjs:1', summary: 'judged by two of three frames' }];
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: [{ index: 0, support: 'uncertain' }] };
    if (opts.label?.startsWith('verify:recheck')) return { keep: [] };
    if (opts.label?.startsWith('verify:consensus')) {
      const voter = Number(opts.label.split(':')[2]);
      return { votes: voter === 0 ? [] : [{ index: 0, refuted: false }] }; // frame 0 stays silent
    }
  };
  const out = await tieredVerify(S, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  assert.ok(out.findings.map((f) => f.id).includes('s1'), 'survives');
  assert.ok(!out.contested.map((f) => f.id).includes('s1'),
    'silence is not a refutation — must not be logged contested');
});

test('triageCoverage is 1 when every finding is judged', async () => {
  const out = await tieredVerify(F, { profile: 'audit', agent: mkAgent(), perTierTimeoutMs: 1000 });
  assert.equal(out.counts.triageCoverage, 1);
});
