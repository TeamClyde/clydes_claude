import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tieredVerify, VERIFY_PROTOCOL, TRIAGE_SCHEMA } from './verify.mjs';

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

// ── Regression: Tier-3 fail-open on lost voter frames ──────────────────────────
// `keepers` was computed against the hardcoded `consensus.voters` (3) rather than the number of
// frames that actually returned. Frames dispatch with allSettled, so a rejected frame was skipped
// and never subtracted from the denominator: 2 of 3 frames timing out scored 3-0 and the finding
// passed as a CLEAN unanimous consensus — no contested entry, nothing degraded. The verify became
// least adversarial exactly when it was least healthy, and said nothing.

// One escalated finding, all frames of a chunk configured by `frameFails` to reject.
const oneUncertain = [{ id: 'x1', where: 'x.mjs:1', summary: 'needs consensus' }];

// Agent whose consensus frames can be made to reject per (voter, chunk).
function consensusAgent({ findings, frameRejects = () => false, refute = () => false }) {
  return async (prompt, opts) => {
    if (opts.label === 'verify:triage') {
      return { verdicts: findings.map((_, i) => ({ index: i, support: 'uncertain' })) };
    }
    if (opts.label?.startsWith('verify:recheck')) return { keep: [] };   // absent → keep
    if (opts.label?.startsWith('verify:consensus')) {
      const [, , voter, chunk] = opts.label.split(':').map((s, i) => (i >= 2 ? Number(s) : s));
      if (frameRejects(voter, chunk)) throw new Error('frame down');
      return { votes: findings.map((_, i) => ({ index: i, refuted: refute(i, voter) })) };
    }
  };
}

test('Tier 3: a chunk below voter quorum is kept but marked contested, never a clean consensus', async () => {
  // 2 of 3 frames die; the survivor does not refute. Old behaviour: keepers = 3 - 0 = 3 → clean keep.
  const out = await tieredVerify(oneUncertain, {
    profile: 'audit',
    agent: consensusAgent({ findings: oneUncertain, frameRejects: (v) => v < 2 }),
    perTierTimeoutMs: 1000,
  });
  assert.ok(out.findings.map((f) => f.id).includes('x1'), 'silence is not evidence — the finding is kept');
  assert.ok(out.contested.map((f) => f.id).includes('x1'),
    'but a chunk that never reached quorum must NOT read as a clean unanimous consensus');
  assert.equal(out.partial, true, 'lost frames are surfaced to the caller');
  assert.equal(out.counts.consensusCoverage, 1 / 3);
  assert.equal(out.degraded, false, 'partial frame loss is not a whole-verify degrade');
});

test('Tier 3: the keeper denominator counts frames that returned, not the hardcoded voter count', async () => {
  // 1 frame dies; of the 2 that return, 1 refutes. Correct: keepers = 2 - 1 = 1 < surviveAtLeast → drop.
  // Old behaviour: keepers = 3 - 1 = 2 → survives as if two voters had cleared it.
  const out = await tieredVerify(oneUncertain, {
    profile: 'audit',
    agent: consensusAgent({
      findings: oneUncertain,
      frameRejects: (v) => v === 0,
      refute: (_i, voter) => voter === 1,
    }),
    perTierTimeoutMs: 1000,
  });
  assert.ok(!out.findings.map((f) => f.id).includes('x1'),
    'a refutation from half the surviving frames must not be outvoted by frames that never ran');
  assert.ok(out.contested.map((f) => f.id).includes('x1'));
});

test('Tier 3: frame loss in one chunk does not silently vouch for that chunk', async () => {
  // 60 findings → chunks of 40 and 20. Every frame of chunk 1 dies; chunk 0 is healthy.
  // Old behaviour: `framesSucceeded` was a GLOBAL counter, so chunk 0's successes kept the
  // total-wipeout guard quiet and chunk 1's 20 findings passed as clean 3-0 consensus.
  const many = manyFindings(60);
  const out = await tieredVerify(many, {
    profile: 'audit',
    agent: consensusAgent({ findings: many, frameRejects: (_v, chunk) => chunk === 1 }),
    perTierTimeoutMs: 1000,
  });
  assert.equal(out.findings.length, 60, 'nothing is dropped for a failure that is not evidence');
  assert.deepEqual(
    out.contested.map((f) => f.id).sort(),
    many.slice(40).map((f) => f.id).sort(),
    'exactly the un-voted chunk is flagged — containment, not blanket suspicion',
  );
  assert.equal(out.partial, true);
  assert.equal(out.counts.consensusCoverage, 3 / 6, 'one of two chunks lost all three frames');
});

// ── Regression: Tier-2 Promise.all made one slow cluster fatal ─────────────────
// Clusters ran under Promise.all, so a single cluster's rejection propagated to the outer catch and
// degraded the ENTIRE verify — completed Tier-1 work discarded, Tier 3 never run, every finding
// returned UNVERIFIED. The protocol's own fallback rule is per-tier-input, not global.

test('Tier 2: one failing cluster is contained — the rest of the verify still runs', async () => {
  const C = [
    { id: 'c1', where: 'a.mjs:1', summary: 'in the failing cluster' },
    { id: 'c2', where: 'b.mjs:1', summary: 'kept by its cluster' },
    { id: 'c3', where: 'b.mjs:2', summary: 'dropped by its cluster' },
  ];
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: C.map((_, i) => ({ index: i, support: 'uncertain' })) };
    if (opts.label === 'verify:recheck:a.mjs') throw new Error('cluster down');
    if (opts.label === 'verify:recheck:b.mjs') return { keep: [{ index: 1, keep: true }, { index: 2, keep: false }] };
    if (opts.label?.startsWith('verify:consensus')) return { votes: [] }; // absent → keeper
  };
  const out = await tieredVerify(C, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.degraded, false, 'a single failed cluster must not degrade the whole verify');
  const ids = out.findings.map((f) => f.id);
  assert.ok(ids.includes('c1'), "the failed cluster falls back to ITS OWN input (keep-all), not to nothing");
  assert.ok(ids.includes('c2'), 'the healthy cluster still keeps what it kept');
  assert.ok(!ids.includes('c3'), 'the healthy cluster still drops what it dropped');
  assert.equal(out.partial, true, 'the lost cluster is surfaced, not swallowed');
  assert.equal(out.counts.recheckCoverage, 1 / 2);
});

test('a fully healthy verify reports full coverage and is not partial', async () => {
  const out = await tieredVerify(F, { profile: 'audit', agent: mkAgent(), perTierTimeoutMs: 1000 });
  assert.equal(out.partial, false);
  assert.equal(out.counts.recheckCoverage, 1);
  assert.equal(out.counts.consensusCoverage, 1);
});

// ── Regression: #118 thin-source escalation ─────────────────────────────────────
// Fixtures for thin-source: one authoritative, one thin, both triaged `supported` so that ONLY the
// thinSource flag can be responsible for escalation.
const T = [
  { id: 'auth', source: 'https://arxiv.org/abs/1', claim: 'well-sourced' },
  { id: 'thin', source: 'https://vendor.example/blog', claim: 'single low-authority source' },
];

function mkThinAgent({ recheckKeeps = true, refute = () => false } = {}) {
  return async (prompt, opts) => {
    if (opts.label === 'verify:triage') {
      return { verdicts: [
        { index: 0, support: 'supported', thinSource: false },
        { index: 1, support: 'supported', thinSource: true },
      ] };
    }
    if (opts.label?.startsWith('verify:recheck')) return { keep: T.map((_, i) => ({ index: i, keep: recheckKeeps })) };
    if (opts.label?.startsWith('verify:consensus')) {
      const voter = Number(opts.label.split(':')[2]);
      return { votes: T.map((f, i) => ({ index: i, refuted: refute(f.id, voter) })) };
    }
  };
}

test('TRIAGE_SCHEMA accepts thinSource as a boolean property', () => {
  assert.equal(TRIAGE_SCHEMA.properties.verdicts.items.properties.thinSource.type, 'boolean');
});

test('the triage prompt asks for thinSource — a schema field nobody is asked to fill stays empty', async () => {
  let seen = '';
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') { seen = prompt; return { verdicts: [{ index: 0, support: 'supported' }] }; }
    return {};
  };
  await tieredVerify([T[0]], { profile: 'web-research', agent, perTierTimeoutMs: 1000 });
  assert.match(seen, /thinSource/);
});

test('#118: a supported-but-thin finding ESCALATES under web-research', async () => {
  // Both are `supported`. Under the old code both pass Tier 1 untouched. The thin one must now
  // reach the adversarial tiers — that is the defect the issue reports.
  let recheckSaw = [];
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') {
      return { verdicts: [{ index: 0, support: 'supported', thinSource: false }, { index: 1, support: 'supported', thinSource: true }] };
    }
    if (opts.label?.startsWith('verify:recheck')) { recheckSaw = promptIndices(prompt.replace(/^<(\d+)>:/gm, '[$1]')); return { keep: [{ index: 1, keep: true }] }; }
    if (opts.label?.startsWith('verify:consensus')) return { votes: [{ index: 1, refuted: false }] };
  };
  const out = await tieredVerify(T, { profile: 'web-research', agent, perTierTimeoutMs: 1000 });
  assert.deepEqual(recheckSaw, [1], 'only the thin finding escalated');
  assert.equal(out.findings.length, 2, 'both survive — escalation is scrutiny, not a drop');
});

test('#118: thinSource does NOT escalate under a profile that does not declare it', async () => {
  let escalated = false;
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') {
      return { verdicts: [{ index: 0, support: 'supported', thinSource: true }] };
    }
    if (opts.label?.startsWith('verify:recheck')) { escalated = true; return { keep: [] }; }
    return { votes: [] };
  };
  await tieredVerify([T[0]], { profile: 'code-review', agent, perTierTimeoutMs: 1000 });
  assert.equal(escalated, false, 'code-review does not declare thin-source in escalateOn');
});

test('#118: the thinSource flag is carried through to the surviving finding, not consumed', async () => {
  const out = await tieredVerify(T, { profile: 'web-research', agent: mkThinAgent(), perTierTimeoutMs: 1000 });
  const thin = out.findings.find((f) => f.id === 'thin');
  assert.equal(thin.thinSource, true, 'the reader must see the flag in the evidence table');
  assert.equal(out.findings.find((f) => f.id === 'auth').thinSource, false);
});

test('#118: a finding with no thinSource verdict is not treated as thin', async () => {
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: [{ index: 0, support: 'supported' }] };
    return {};
  };
  const out = await tieredVerify([T[0]], { profile: 'web-research', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.findings[0].thinSource, false, 'absent means not-flagged, never unknown-as-thin');
});

// ── The `support` stamp. Without it every downstream consumer of a REAL run sees no label:
// renderDossierEntry's Support column reads `unlabelled` for every row, and slice 4's
// thinSubQuestions / mergeReframed (which gate on `support === 'supported'`) are inert. Unit
// tests that hand-construct fixtures with an explicit `.support` would still pass — which is
// exactly why these tests drive it through the real tieredVerify instead.
test('the Tier-1 label is STAMPED onto the surviving finding, not just read into a local', async () => {
  const out = await tieredVerify(T, { profile: 'web-research', agent: mkThinAgent(), perTierTimeoutMs: 1000 });
  assert.equal(out.findings.find((f) => f.id === 'auth').support, 'supported');
  assert.equal(out.findings.find((f) => f.id === 'thin').support, 'supported');
});

test('an escalated finding carries its label through Tiers 2 and 3', async () => {
  const out = await tieredVerify(F, { profile: 'audit', agent: mkAgent(), perTierTimeoutMs: 1000 });
  assert.equal(out.findings.find((f) => f.id === 'c').support, 'uncertain',
    'c escalated as uncertain and must still say so in the evidence table');
});

test('an UNJUDGED finding is stamped `unjudged`, never left blank', async () => {
  // Triage returns a verdict for index 0 only; index 1 passes through unjudged and escalates.
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: [{ index: 0, support: 'supported' }] };
    if (opts.label?.startsWith('verify:recheck')) return { keep: [{ index: 1, keep: true }] };
    if (opts.label?.startsWith('verify:consensus')) return { votes: [{ index: 1, refuted: false }] };
  };
  const out = await tieredVerify(T, { profile: 'web-research', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.findings.find((f) => f.id === 'thin').support, 'unjudged');
});

test('a degraded verify returns the caller findings UNSTAMPED — no label is honest, a fake one is not', async () => {
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') throw new Error('boom');
    return {};
  };
  const out = await tieredVerify(T, { profile: 'web-research', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.degraded, true);
  assert.equal(out.findings[0].support, undefined, 'verify did not run, so there IS no label');
});

test('#118: a re-verified finding reports THIS pass\'s thinSource, not a stale one', async () => {
  // A finding arriving with thinSource:true from an earlier verify pass, judged not-thin now.
  // The guarded form of this stamp preserved the stale `true`; the unconditional form does not.
  const stale = [{ id: 'stale', source: 'https://arxiv.org/abs/2', claim: 'now well-sourced', thinSource: true }];
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: [{ index: 0, support: 'supported', thinSource: false }] };
    return {};
  };
  const out = await tieredVerify(stale, { profile: 'web-research', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.findings[0].thinSource, false, 'this pass judged it not-thin — the stale flag must not survive');
});

// ── Regression: #119 a lost tier unwound every tier that had already succeeded ──────────────────
// One outer try/catch wrapped the whole of tieredVerify, so any tier failure discarded the completed
// work of the tiers before it and returned the raw unverified input. Fallback is now scoped to the
// failing tier and falls back to THAT TIER'S INPUT SET, stamped with `degradedAtTier`.

test('#119: a Tier-1 total failure degrades AT TIER 1 and falls back to the caller input', async () => {
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') throw new Error('boom');
    return {};
  };
  const out = await tieredVerify(F, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.degraded, true);
  assert.equal(out.degradedAtTier, 'triage');
  assert.equal(out.findings.length, F.length, 'falls back to THIS tier\'s input, never an empty set');
});

test('#119: a Tier-3 total failure keeps Tier-1 and Tier-2 work instead of discarding it', async () => {
  // c escalates as uncertain, survives recheck, then every voter frame fails. Before this change
  // the tier3-no-frames throw unwound to the outer catch and returned the RAW input — throwing away
  // the completed triage that had already dropped `b` as unsupported.
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: F.map((f, i) => ({ index: i, support: f._seed })) };
    if (opts.label?.startsWith('verify:recheck')) return { keep: [{ index: 2, keep: true }] };
    if (opts.label?.startsWith('verify:consensus')) throw new Error('frame down');
  };
  const out = await tieredVerify(F, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.degradedAtTier, 'consensus');
  const ids = out.findings.map((f) => f.id);
  assert.ok(ids.includes('a'), 'Tier-1 supported survives');
  assert.ok(ids.includes('c'), 'the contested tail falls back to its own input set');
  assert.ok(!ids.includes('b'), 'the Tier-1 unsupported DROP is respected — completed work is kept');
});

test('#119: a Tier-2 total failure keeps Tier-1 labels and passes the escalation set forward', async () => {
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: F.map((f, i) => ({ index: i, support: f._seed })) };
    if (opts.label?.startsWith('verify:recheck')) throw new Error('all clusters down');
    if (opts.label?.startsWith('verify:consensus')) return { votes: F.map((_, i) => ({ index: i, refuted: false })) };
  };
  const out = await tieredVerify(F, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  const ids = out.findings.map((f) => f.id);
  assert.ok(ids.includes('a') && ids.includes('c'));
  assert.ok(!ids.includes('b'), 'the Tier-1 drop still stands');
  // Tier 2 losing every cluster is per-cluster containment, already fixed in PR #166 — it reports
  // partial, not degraded, because Tier 3 still ran over the fallen-back set.
  assert.equal(out.partial, true);
  assert.equal(out.recheckCoverage ?? out.counts.recheckCoverage, 0);
});

test('#119: degradedAtTier is null on a clean run — it is a cause, not a status', async () => {
  const out = await tieredVerify(F, { profile: 'audit', agent: mkAgent(), perTierTimeoutMs: 1000 });
  assert.equal(out.degraded, false);
  assert.equal(out.degradedAtTier, null);
});

test('#119: the anyJudged empty-triage guard reports its tier too', async () => {
  const agent = async (prompt, opts) => (opts.label === 'verify:triage' ? { verdicts: [] } : {});
  const out = await tieredVerify(F, { profile: 'audit', agent, perTierTimeoutMs: 1000 });
  assert.equal(out.degraded, true);
  assert.equal(out.degradedAtTier, 'triage');
  assert.equal(out.verifyEmptied, true);
});

test('#119: a throw in Tier-2 CLUSTERING degrades gracefully — the tier try must cover processing, not just dispatch', async () => {
  // `clusterBy` is caller-supplied and runs OUTSIDE any allSettled. A restructure that wraps only
  // the tier's dispatch would let this escape tieredVerify entirely, and NEITHER consumer wraps the
  // call — an escape crashes the whole workflow run. Containment here is scoped to Tier 2: it falls
  // back to the tier's own input (the escalation set) and Tier 3 still runs over it, so the run is
  // `partial`, not `degraded`, and the completed Tier-1 drop of `b` is kept.
  const agent = async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: F.map((f, i) => ({ index: i, support: f._seed })) };
    return {};
  };
  const clusterBy = () => { throw new Error('cluster key exploded'); };
  const out = await tieredVerify(F, { profile: 'audit', agent, clusterBy, perTierTimeoutMs: 1000 });
  assert.ok(Array.isArray(out.findings), 'tieredVerify must resolve, never let a clusterBy throw escape');
  assert.ok(out.findings.length > 0, 'falls back to a real set, never empty');
  const ids = out.findings.map((f) => f.id);
  assert.ok(ids.includes('a') && ids.includes('c'), 'Tier-1 supported + the escalation set Tier 2 fell back to');
  assert.ok(!ids.includes('b'), 'a Tier-2 collapse does not resurrect what Tier 1 already dropped');
  assert.equal(out.degraded, false, 'Tier 3 still ran over the fallen-back set — partial, not degraded');
  assert.equal(out.partial, true);
  assert.equal(out.counts.recheckCoverage, 0, 'no cluster returned a re-check');
});
