import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tieredVerify, VERIFY_PROTOCOL } from './verify.mjs';

const F = [
  { id: 'a', where: 'x.mjs:1', summary: 'real',   _seed: 'supported' },
  { id: 'b', where: 'x.mjs:2', summary: 'false',   _seed: 'unsupported' },
  { id: 'c', where: 'y.mjs:3', summary: 'borderline', _seed: 'uncertain' },
];

// Generic stub: triage echoes _seed; Tier-2 recheck keeps all; consensus voters keep unless summary has 'kill'.
function mkAgent({ recheckDrops = [], refute = () => false } = {}) {
  return async (prompt, opts) => {
    if (opts.label === 'verify:triage') return { verdicts: F.map((f, i) => ({ index: i, support: f._seed })) };
    if (opts.label?.startsWith('verify:recheck')) return { keep: F.map((_, i) => ({ index: i, keep: !recheckDrops.includes(i) })) };
    if (opts.label?.startsWith('verify:consensus')) {
      const voter = Number(opts.label.split(':')[2]);
      return { refuted: refute(opts.findingId, voter) };
    }
  };
}

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
    if (opts.label?.startsWith('verify:consensus')) return { refuted: false };
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
    if (opts.label?.startsWith('verify:consensus')) return { refuted: false };
  };
  const out = await tieredVerify(W, { profile: 'web-research', agent, perTierTimeoutMs: 1000 });
  assert.ok(out.findings.map((f) => f.id).includes('u'),
    'web-research unsupported finding survives when recheck + consensus keep it');
});
