// verify.mjs — dependency-free tiered adversarial verify engine.
// Named exports only — never export default (engine bundle strip regex).

export const VERIFY_PROTOCOL = {
  // 1.1: Tier-1 and Tier-3 dispatch batched/chunked; decision rules unchanged
  // 1.2: Tier-3 consensus is measured against the frames that RETURNED, with a quorum floor;
  //      Tier-2 cluster failure is contained to its own cluster. Both surface as `partial`.
  protocolVersion: '1.2',

  tiers: ['triage', 'clusteredRecheck', 'consensus'],
  consensus: { voters: 3, surviveAtLeast: 2, rule: 'minority-veto', diversity: ['role', 'ordering', 'modelFamily'] },
  labels: ['supported', 'uncertain', 'unsupported'],
  profiles: {
    'code-review':  { escalateOn: ['uncertain', 'disagree'], bias: 'guard-false-positive' },
    'web-research': { escalateOn: ['uncertain', 'unsupported', 'thin-source'], bias: 'guard-unsupported' },
    'plan-review':  { escalateOn: ['uncertain', 'disagree'], bias: 'balanced' },
    'audit':        { escalateOn: ['uncertain', 'disagree'], bias: 'balanced' },
  },
};

// JSON schemas passed as agent `schema` option.
const TRIAGE_SCHEMA = {
  type: 'object', required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object', required: ['index', 'support'],
        properties: {
          index:   { type: 'integer' },
          support: { enum: ['supported', 'uncertain', 'unsupported'] },
          disagree: { type: 'boolean' },
        },
      },
    },
  },
};

const RECHECK_SCHEMA = {
  type: 'object', required: ['keep'],
  properties: {
    keep: {
      type: 'array',
      items: {
        type: 'object', required: ['index', 'keep'],
        properties: {
          index: { type: 'integer' },
          keep:  { type: 'boolean' },
        },
      },
    },
  },
};

// Tier 3 is dispatched as ONE call per voter frame over a whole chunk — never one call per finding.
// Per-finding voting is O(3N) agents and has already cost this repo a session limit at scale.
const BATCH_VOTE_SCHEMA = {
  type: 'object', required: ['votes'],
  properties: {
    votes: {
      type: 'array',
      items: {
        type: 'object', required: ['index', 'refuted'],
        properties: {
          index:   { type: 'integer' },
          refuted: { type: 'boolean' },
          reason:  { type: 'string' },
        },
      },
    },
  },
};

// Max findings presented to any single tier agent. A live run handed one triage agent 254 rows and got
// verdicts for 23 of them back; chunking keeps each call inside a size the model reliably covers.
const TRIAGE_CHUNK = 40;

function chunkArr(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Cluster key: subQuestion for web-research; file portion of where for others.
const defaultClusterKey = (f) => f.subQuestion ?? (f.where ? String(f.where).split(':')[0] : 'default');

// Strip internal _idx before returning to caller.
const stripIdx = (arr) => arr.map(({ _idx, ...rest }) => rest);

// Render a finding as a one-line `where — summary` for the tier prompts. The engine's finding
// contract is { where, summary } and callers should provide them, but fall back across common
// finding-field names so a caller with a different shape (e.g. web-research { source, claim })
// still triages on real content. Critically, NEVER emit the literal "undefined — undefined": an
// unjudgeable row makes triage drop the finding, and a whole set of them empties the result while
// still reporting success — the silent-failure mode the empty-set guard in tieredVerify backstops.
function renderFinding(f) {
  const where   = f.where   ?? f.source ?? f.file   ?? '';
  const summary = f.summary ?? f.claim  ?? f.detail ?? f.description ?? '';
  if (where || summary) return `${where} — ${summary}`;
  const { _idx, ...rest } = f;            // last resort: the finding's own content, never "undefined"
  return JSON.stringify(rest);
}

// Per-tier deadline using internal setTimeout/Promise.race (no external import).
function withDeadline(p, ms) {
  let t;
  // Belt-and-suspenders: if the timeout wins the race, `p` keeps running and may settle
  // late. Attach a no-op catch so a post-timeout rejection of `p` is never an unhandled
  // rejection (the Workflow sandbox escalates those). The race still observes `p` normally.
  Promise.resolve(p).catch(() => {});
  return Promise.race([
    p,
    new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error('tier-timeout')), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

// Prompt builders — batched, using global _idx as `index`.
function triagePrompt(findings) {
  const list = findings
    .map((f) => `[${f._idx}] ${renderFinding(f)}`)
    .join('\n');
  return (
    'Triage these findings. For EACH (by index) label `supported`/`uncertain`/`unsupported` from its premise + your knowledge; ' +
    'set `disagree:true` if it conflicts with another. Do NOT re-research. Terse.\n\n' +
    list
  );
}

function recheckPrompt(members) {
  const list = members
    .map((f) => `<${f._idx}>: ${renderFinding(f)}`)
    .join('\n');
  return (
    'Re-check this cluster of related findings against their shared source. For EACH `index`, `keep:true` only if the source supports it. Terse.\n\n' +
    list
  );
}

// Batched sibling of the old per-finding refutePrompt: same three adversarial frames, many findings
// per call. One agent per frame judges the whole chunk by index.
function batchRefutePrompt(findings, voter) {
  const frames = [
    'You are a literalist. Does the cited source/file LITERALLY state this? `refuted:true` if the premise is not directly supported.',
    'You are a context-skeptic. Could this be true in general but WRONG here? Check the specific context.',
    'You are an alternative-reader. Is there a benign/correct reading under which the finding is a false positive?',
  ];
  const list = findings.map((f) => `[${f._idx}] ${renderFinding(f)}`).join('\n');
  return (
    `${frames[voter]}\n` +
    'Judge EVERY finding below independently, by its index. Return one entry per index. ' +
    'Set `refuted:true` ONLY if you can show it is wrong; default `refuted:false` when uncertain. Terse.\n\n' +
    list
  );
}

/**
 * Run tiered adversarial verify over `findings`.
 *
 * @param {Array}    findings         - Raw findings from a fan-out.
 * @param {object}   opts
 * @param {string}   opts.profile     - Profile key: 'audit'|'code-review'|'web-research'|'plan-review'.
 * @param {Function} opts.agent       - Workflow agent(prompt, opts) => Promise<result>.
 * @param {number}   [opts.perTierTimeoutMs=120_000]
 * @param {Function} [opts.clusterBy] - Custom cluster key fn (f) => string.
 * @returns {Promise<{findings, contested, counts, degraded, partial?, verifyEmptied?}>}
 *   `degraded` — the verify did not run; treat `findings` as unverified.
 *   `partial`  — the verify ran and its output is usable, but some tier agents were lost, so it
 *                was less adversarial than the protocol promises. Never conflate the two.
 */
export async function tieredVerify(findings, { profile, agent, perTierTimeoutMs = 120_000, clusterBy }) {
  try {
    const prof = VERIFY_PROTOCOL.profiles[profile] ?? VERIFY_PROTOCOL.profiles.audit;
    const escalateOn = new Set(prof.escalateOn);

    // Stamp global index; all tier logic uses `work`, NOT the caller's `findings`.
    const work = findings.map((f, i) => ({ ...f, _idx: i }));

    // ── Tier 1: Chunked Triage ───────────────────────────────────────────────
    // One agent per chunk, in parallel. allSettled (not all): chunking multiplies the failure surface,
    // and a failed chunk is survivable — its findings simply arrive unjudged, which now escalates
    // rather than drops (see the escalation loop below).
    const t1results = await Promise.allSettled(
      chunkArr(work, TRIAGE_CHUNK).map((c) =>
        withDeadline(
          agent(triagePrompt(c), { label: 'verify:triage', schema: TRIAGE_SCHEMA, model: 'claude-sonnet-4-6' }),
          perTierTimeoutMs,
        ),
      ),
    );

    // Build verdict map keyed by _idx, merged across every chunk.
    const verdictMap = new Map();
    for (const r of t1results) {
      if (r.status !== 'fulfilled') continue;
      for (const v of r.value?.verdicts ?? []) {
        verdictMap.set(v.index, v); // v.index is the global _idx echoed by agent
      }
    }

    // What fraction of the input triage actually judged. < 1 means some findings passed through
    // unjudged (a truncating or failed chunk) — the caller must be able to see that.
    const triageCoverage = work.length ? work.filter((f) => verdictMap.has(f._idx)).length / work.length : 1;

    // Fail loud, never silent. If triage judged NONE of a non-empty input (no verdicts, or verdicts
    // whose indices match no finding), the verify never actually ran — a broken contract (e.g.
    // findings that render to nothing, or a triage agent that returned nothing usable). Silently
    // continuing would drop every finding and return an empty set with degraded:false: a confident,
    // empty result with no error signal (the worst failure mode). Degrade instead and fall back to
    // the unverified findings, flagged, so the caller surfaces it. This keys on "did triage evaluate
    // anything", NOT on "did anything survive" — a legitimate all-`unsupported` triage DID judge
    // every finding (they just drop), so it is a correct empty result and must NOT trip this.
    const anyJudged = work.some((f) => verdictMap.has(f._idx));
    if (!anyJudged && work.length > 0) {
      return {
        findings:      findings,
        contested:     [],
        counts:        { supported: 0, dropped: work.length, contested: 0, triageCoverage: 0 },
        degraded:      true,
        verifyEmptied: true,
      };
    }

    const supported   = [];  // Pass-through without re-check
    const escalation  = [];  // Routed to Tier 2
    // `unsupported` (when the profile does not escalate it) is the only silent drop.

    for (const f of work) {
      const v = verdictMap.get(f._idx);
      // No verdict → ESCALATE, never drop. An unjudged finding carries no evidence against it;
      // dropping it is the partial-coverage form of the bug the anyJudged guard above catches
      // wholesale. Route it down the same path as `uncertain` and let Tiers 2/3 decide.
      if (!v) { escalation.push(f); continue; }

      const label   = v.support;       // 'supported' | 'uncertain' | 'unsupported'
      const disagree = v.disagree === true;

      // A finding escalates if its label is in escalateOn, OR if it has disagree:true
      // and 'disagree' is in escalateOn. These are two SEPARATE predicates.
      const labelEscalates   = escalateOn.has(label);
      const disagreeEscalates = disagree && escalateOn.has('disagree');

      if (labelEscalates || disagreeEscalates) {
        escalation.push(f);
      } else if (label === 'supported') {
        supported.push(f);
      }
      // unsupported (and not in escalateOn) → dropped.
    }

    // ── Tier 2: Clustered Adversarial Re-Check ───────────────────────────────
    const keyFn = clusterBy ?? defaultClusterKey;

    // Group escalation set by cluster key.
    const clusters = new Map();
    for (const f of escalation) {
      const key = keyFn(f);
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(f);
    }

    const contestedTail = []; // Survivors from Tier 2 → routed to Tier 3

    // Clusters run concurrently — they are independent, and one agent call per cluster is already
    // well inside the runtime concurrency ceiling. (Was a sequential await per cluster: pure wall-clock loss.)
    //
    // allSettled, NOT all. Under Promise.all a single cluster's rejection propagated to the outer
    // catch and degraded the WHOLE verify: completed Tier-1 work discarded, Tier 3 never run, every
    // finding returned unverified. Measured recheck durations spread 114s-409s, so one slow cluster
    // is the expected case, not the exceptional one. The protocol's fallback rule is per-tier-INPUT
    // ("never to an empty set") — applied per cluster, that means a failed cluster keeps all its own
    // members and they go on to face Tier 3. Containment, not a bypass.
    const clusterEntries = [...clusters];
    const clusterResults = await Promise.allSettled(
      clusterEntries.map(async ([key, members]) => {
        const r = await withDeadline(
          agent(recheckPrompt(members), { label: `verify:recheck:${key}`, schema: RECHECK_SCHEMA, model: 'claude-sonnet-4-6' }),
          perTierTimeoutMs,
        );
        return [members, r];
      }),
    );

    let clustersSucceeded = 0;
    for (const [i, settled] of clusterResults.entries()) {
      const members = clusterEntries[i][1];

      if (settled.status !== 'fulfilled') {
        contestedTail.push(...members);   // fall back to this cluster's own input set
        continue;
      }
      clustersSucceeded++;

      // Build keep-set keyed by GLOBAL _idx (not cluster position).
      const [, r] = settled.value;
      const keepSet = new Map();
      for (const entry of r?.keep ?? []) {
        keepSet.set(entry.index, entry.keep); // entry.index is the global _idx
      }

      for (const f of members) {
        const shouldKeep = keepSet.get(f._idx);
        if (shouldKeep !== false) {
          // Kept (true or absent → keep by default)
          contestedTail.push(f);
        }
        // false → dropped; silently excluded
      }
    }

    // Fraction of clusters that actually returned a re-check.
    const recheckCoverage = clusterEntries.length ? clustersSucceeded / clusterEntries.length : 1;

    // ── Tier 3: Minority-Veto 3-Voter Consensus (BATCHED) ────────────────────
    // One agent per voter frame per chunk — NOT one agent per finding. Frames run concurrently within
    // a chunk, chunks run in sequence, so at most `voters` (3) agents are in flight here. Cost is
    // O(3 × chunks) instead of O(3 × findings). The decision rule below is unchanged.
    const finalSurvivors = [];
    const contested      = [];
    const contestedChunks = chunkArr(contestedTail, TRIAGE_CHUNK);
    const VOTERS  = VERIFY_PROTOCOL.consensus.voters;
    const SURVIVE = VERIFY_PROTOCOL.consensus.surviveAtLeast;
    let framesSucceeded = 0;
    let framesExpected  = 0;

    for (const [chunkIdx, members] of contestedChunks.entries()) {
      const frames = await Promise.allSettled(
        [0, 1, 2].map((v) =>
          withDeadline(
            agent(batchRefutePrompt(members, v), {
              label: `verify:consensus:${v}:${chunkIdx}`,
              schema: BATCH_VOTE_SCHEMA,
              model: 'claude-sonnet-4-6',
            }),
            perTierTimeoutMs,
          ),
        ),
      );

      // Count refutations per GLOBAL _idx. A frame that omits an index has NOT refuted it — silence
      // defaults to keeper, mirroring Tier 2's absent-entry rule. Without this a truncating frame
      // would silently refute its own tail.
      //
      // `chunkFrames` is per-CHUNK on purpose. It was previously only accumulated into the global
      // `framesSucceeded`, which meant one healthy chunk kept the total-wipeout guard quiet while a
      // sibling chunk that lost every frame passed through as clean consensus.
      const refutedBy = new Map();
      let chunkFrames = 0;
      for (const fr of frames) {
        if (fr.status !== 'fulfilled') continue;
        chunkFrames++;
        for (const v of fr.value?.votes ?? []) {
          if (v.refuted === true) refutedBy.set(v.index, (refutedBy.get(v.index) ?? 0) + 1);
        }
      }
      framesSucceeded += chunkFrames;
      framesExpected  += VOTERS;

      // Quorum gate. Below `surviveAtLeast` returning frames there is no consensus to compute at
      // all: "≥2 of 3 failed to refute" is unanswerable when fewer than 2 voted. Keep the members
      // (a frame that never ran is not evidence against a finding — the same rule as an omitted
      // index) but mark every one contested, so the caller can see the consensus did not happen.
      // Previously this scored `voters - refutals` = 3 - 0 = 3 and read as a CLEAN unanimous keep.
      if (chunkFrames < SURVIVE) {
        finalSurvivors.push(...members);
        contested.push(...members);
        continue;
      }

      for (const f of members) {
        const refutals = refutedBy.get(f._idx) ?? 0;
        // Denominator is the frames that RETURNED, never the hardcoded voter count. Frames dispatch
        // with allSettled, so a rejected frame is simply absent — counting it as a silent keeper let
        // a refutation be outvoted by voters that never ran.
        const keepers  = chunkFrames - refutals;

        if (keepers >= SURVIVE) {
          // Survives
          finalSurvivors.push(f);
          if (refutals > 0) {
            // At least one refutation — log contested (visibility, not drop)
            contested.push(f);
          }
        } else {
          // < surviveAtLeast keepers → dropped AND logged contested
          contested.push(f);
        }
      }
    }

    // Every voter frame failing while findings were waiting on them means Tier 3 never ran. Silence
    // defaults to keeper, so continuing would pass the whole contested set through labelled as
    // verified. Degrade instead.
    if (contestedChunks.length > 0 && framesSucceeded === 0) throw new Error('tier3-no-frames');

    // Combine: Tier-1 supported + Tier-3 survivors
    const survivors = [...supported, ...finalSurvivors];

    // Fraction of Tier-3 voter frames that returned.
    const consensusCoverage = framesExpected ? framesSucceeded / framesExpected : 1;

    // `partial` is DISTINCT from `degraded` and the difference is load-bearing. `degraded` means the
    // verify did not run and its findings must be treated as unverified — callers respond by
    // discarding the verify output wholesale. `partial` means the verify DID run and its output is
    // usable, but some tier agents were lost, so it was less adversarial than the protocol promises.
    // Folding this into `degraded` would make one timed-out voter frame throw away an entire
    // otherwise-good verify pass — a worse outcome than the fail-open it replaces.
    const partial = recheckCoverage < 1 || consensusCoverage < 1;

    return {
      findings:  stripIdx(survivors),
      contested: stripIdx(contested),
      counts: {
        supported:  survivors.length,
        dropped:    work.length - survivors.length,
        contested:  contested.length,
        triageCoverage,
        recheckCoverage,
        consensusCoverage,
      },
      degraded: false,
      partial,
    };
  } catch {
    // Degraded path: return the caller's ORIGINAL findings (never the _idx-stamped copies).
    return {
      findings:  findings,
      contested: [],
      counts:    { degraded: true },
      degraded:  true,
    };
  }
}
