// verify.mjs — dependency-free tiered adversarial verify engine.
// Named exports only — never export default (engine bundle strip regex).

export const VERIFY_PROTOCOL = {
  protocolVersion: '1.0',
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

const VOTE_SCHEMA = {
  type: 'object', required: ['refuted'],
  properties: {
    refuted: { type: 'boolean' },
    reason:  { type: 'string' },
  },
};

// Cluster key: subQuestion for web-research; file portion of where for others.
const defaultClusterKey = (f) => f.subQuestion ?? (f.where ? String(f.where).split(':')[0] : 'default');

// Strip internal _idx before returning to caller.
const stripIdx = (arr) => arr.map(({ _idx, ...rest }) => rest);

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
    .map((f) => `[${f._idx}] ${f.where} — ${f.summary}`)
    .join('\n');
  return (
    'Triage these findings. For EACH (by index) label `supported`/`uncertain`/`unsupported` from its premise + your knowledge; ' +
    'set `disagree:true` if it conflicts with another. Do NOT re-research. Terse.\n\n' +
    list
  );
}

function recheckPrompt(members) {
  const list = members
    .map((f) => `<${f._idx}>: ${f.where} — ${f.summary}`)
    .join('\n');
  return (
    'Re-check this cluster of related findings against their shared source. For EACH `index`, `keep:true` only if the source supports it. Terse.\n\n' +
    list
  );
}

function refutePrompt(finding, voter) {
  const frames = [
    'You are a literalist. Does the cited source/file LITERALLY state this? `refuted:true` if the premise is not directly supported.',
    'You are a context-skeptic. Could this be true in general but WRONG here? Check the specific context.',
    'You are an alternative-reader. Is there a benign/correct reading under which the finding is a false positive?',
  ];
  return (
    `${frames[voter]} Return \`refuted:true\` ONLY if you can show it is wrong; default \`refuted:false\` when uncertain.\n\n` +
    `where: ${finding.where}\nsummary: ${finding.summary}`
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
 * @returns {Promise<{findings, contested, counts, degraded}>}
 */
export async function tieredVerify(findings, { profile, agent, perTierTimeoutMs = 120_000, clusterBy }) {
  try {
    const prof = VERIFY_PROTOCOL.profiles[profile] ?? VERIFY_PROTOCOL.profiles.audit;
    const escalateOn = new Set(prof.escalateOn);

    // Stamp global index; all tier logic uses `work`, NOT the caller's `findings`.
    const work = findings.map((f, i) => ({ ...f, _idx: i }));

    // ── Tier 1: Batched Triage ───────────────────────────────────────────────
    const t1 = await withDeadline(
      agent(triagePrompt(work), { label: 'verify:triage', schema: TRIAGE_SCHEMA, model: 'claude-sonnet-4-6' }),
      perTierTimeoutMs,
    );

    // Build verdict map keyed by _idx.
    const verdictMap = new Map();
    for (const v of t1.verdicts) {
      verdictMap.set(v.index, v); // v.index is the global _idx echoed by agent
    }

    const supported   = [];  // Pass-through without re-check
    const escalation  = [];  // Routed to Tier 2
    // Anything else (unsupported, no verdict) is silently dropped.

    for (const f of work) {
      const v = verdictMap.get(f._idx);
      if (!v) continue; // No verdict → drop

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

    for (const [key, members] of clusters) {
      const r = await withDeadline(
        agent(recheckPrompt(members), { label: `verify:recheck:${key}`, schema: RECHECK_SCHEMA, model: 'claude-sonnet-4-6' }),
        perTierTimeoutMs,
      );

      // Build keep-set keyed by GLOBAL _idx (not cluster position).
      const keepSet = new Map();
      for (const entry of r.keep) {
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

    // ── Tier 3: Minority-Veto 3-Voter Consensus ──────────────────────────────
    const finalSurvivors = [];
    const contested      = [];

    for (const f of contestedTail) {
      const votes = await withDeadline(
        Promise.all(
          [0, 1, 2].map((v) =>
            agent(refutePrompt(f, v), {
              label: `verify:consensus:${v}`,
              findingId: f.id,
              schema: VOTE_SCHEMA,
              model: 'claude-sonnet-4-6',
            }),
          ),
        ),
        perTierTimeoutMs,
      );

      const keepers = votes.filter((x) => !x.refuted).length;
      const anyRefuted = votes.some((x) => x.refuted);

      if (keepers >= VERIFY_PROTOCOL.consensus.surviveAtLeast) {
        // Survives
        finalSurvivors.push(f);
        if (anyRefuted) {
          // At least one refutation — log contested (visibility, not drop)
          contested.push(f);
        }
      } else {
        // < surviveAtLeast keepers → dropped AND logged contested
        contested.push(f);
      }
    }

    // Combine: Tier-1 supported + Tier-3 survivors
    const survivors = [...supported, ...finalSurvivors];

    return {
      findings:  stripIdx(survivors),
      contested: stripIdx(contested),
      counts: {
        supported:  survivors.length,
        dropped:    work.length - survivors.length,
        contested:  contested.length,
      },
      degraded: false,
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
