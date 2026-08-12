import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { harvest } from './harvest-components.mjs'
import { readPolicy } from './lib/skill-surface.mjs'
import { escapeRegExp } from './lib/regex.mjs'

// Repo root resolved the portable way (matches the sibling test files and
// .claude/hooks/*.mjs). Do NOT use `new URL('../', import.meta.url).pathname`
// — it yields /C:/… on Windows.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ===========================================================================
// SKILL-OVERLAP INVARIANT — declare-and-resolve, not detect-and-flag.
// ===========================================================================
//
// Split out of graph-integrity.test.mjs rather than added to it. That file was
// at 337 lines against this repo's ~350 split trigger, and its own SIZE
// CHECKPOINT comment names per-invariant splitting as the intended move. The
// second reason is coupling: this invariant reads skill DESCRIPTIONS and
// nothing else — no edges, no `dependentsOf`, no `entryPoints`, no
// `catalogOnly` — so routing it through that file's `graph()` helper would tie
// it to data it never looks at.
//
// WHY THERE IS NO SIMILARITY *THRESHOLD* DETECTOR HERE. The obvious design is
// "flag any pair above some similarity cutoff." No workable cutoff exists.
// Measured 2026-08-11 over all 861 skill pairs under three metrics (Jaccard,
// overlap coefficient, and IDF-weighted cosine over the same token sets), the
// two ALREADY-DISAMBIGUATED control pairs outrank EVERY pair in the set of
// known-confusable skills that motivated this work — under all three metrics,
// with no overlap in the rank ranges (worst control rank 8/9/7 vs best target
// rank 12/14/13). The cause is structural, not metric-specific: a pair acquires
// an explicit boundary clause precisely BECAUSE someone already noticed it was
// confusable, and that clause names the sibling, which ADDS shared vocabulary.
// Similarity therefore anti-correlates with "still needs disambiguation," and
// any cutoff that reddens the targets reddens the fixed pairs first.
//
// So the band below is a CANDIDATE set, and membership is not a defect. What
// fails is a band member with NO RECORDED VERDICT. Under this model the control
// pairs SHOULD sit in the band — they simply pass, because they are resolved.
//
// WHY THE JUDGMENT IS RECORDED RATHER THAN COMPUTED. Deciding whether two
// similar descriptions are genuinely confusable is a semantic question. CI here
// is stdlib-only Node, offline, with no lockfile, so neither an embedding model
// nor an LLM judge can run in it. The judgment is made once, by a human or an
// agent with the corpus open, and WRITTEN DOWN in
// docs/reference/skill-surface-policy.json; CI is left a cheap deterministic
// check over that record. The check is what stops the record rotting.
//
// ---------------------------------------------------------------------------
// STEP 9 FINDING — merge/rename candidates, RECORDED ONLY, deliberately not
// acted on here. There is no remediation/ directory in this repo yet, so this
// header is the record: a future reader of this invariant has this file open.
//
// The `vet-*`, `writing-*` and `doc-*` families are 8 of the 14 band members
// and their overlap is BENIGN — each family carries a shared name PREFIX, so a
// reader gets a structural cue that these are siblings in one family before
// reading a single description, and the disambiguation only has to say which
// sibling. The git trio (git-manager / using-git-worktrees /
// finishing-a-development-branch) is one domain with NO shared prefix, so it
// has no such cue and the whole burden falls on prose. That is why prefix
// namespacing, not another handoff sentence, is the structural fix here.
//
// Renaming is deferred on purpose, not for lack of conviction: every citation
// of a skill moves with its name, which rewrites a large slice of
// docs/reference/gate-map.json, and that churn inside an invariant PR would
// mask exactly the edge-set changes these invariants exist to make visible.
// It belongs in its own slice.
// ---------------------------------------------------------------------------

// THRESHOLD — a declared POLICY value, not a derived constant. There is no
// formula that produces 0.125; it is a judgment backed by the measurement
// below, and the next reader must be able to tell those apart.
//
// Measured 2026-08-11 against the corpus as committed by this change:
//
//   |     t | band | unresolved |
//   |-------|------|------------|
//   | 0.125 |   14 |          1 |
//   | 0.100 |   23 |          4 |
//   | 0.070 |   40 |         18 |
//
// 0.125 is chosen because the band stays hand-triageable and every member is
// defensible on inspection; below 0.10 it starts absorbing lexical coincidences
// faster than real confusability, and the triage cost rises without the signal
// rising with it. Lowering it is allowed — it just means triaging the new
// members, and the gate will say so by name.
const BAND_THRESHOLD = 0.125

// TOKENIZATION IS PART OF THE CONTRACT. The band size is not reproducible
// without it, so every step is pinned here rather than described in prose:
//
//   1. lowercase the `description` frontmatter field ONLY — not `when_to_use`,
//      not the body;
//   2. extract /[a-z][a-z-]{2,}/g — 3+ chars, hyphens KEPT so `code-review` and
//      `vet-install` stay single tokens rather than splitting into their parts;
//   3. DEDUPLICATE to a set, so a term repeated in a long description counts
//      once and cannot inflate its own overlap;
//   4. drop the stop list below.
//
// "Ordinary English function words" is NOT a specification, and the difference
// is not academic. Measured 2026-08-11 on this corpus at the same threshold:
// substituting NLTK's standard English stop list for the one below yields 22
// band members instead of 14 — a strict superset, adding eight pairs including
// three vet-install|vet-* pairs and `adherence-audit|review-workflow`. Same
// threshold, same tokenizer, same corpus; only the word list differs. The list
// is therefore a DECLARED CONSTANT, versioned alongside the threshold it was
// measured beside. Do not tidy it. Measured the same day: 16 of its 56 entries
// are under 3 chars and so can never be emitted by the tokenizer above — they
// are inert, and they are kept anyway so this constant stays byte-identical to
// the one the table above was measured with.
const STOP_WORDS = new Set(`
a an the and or of to for in on when use using used this that with is are be by it its
as any all not no if then than at from into over per via you your claude skill agent
rule hook do does done doing before after also more most other others new
`.trim().split(/\s+/))

function descriptionTokens(description) {
  const out = new Set()
  for (const [word] of (description ?? '').toLowerCase().matchAll(/[a-z][a-z-]{2,}/g)) {
    if (!STOP_WORDS.has(word)) out.add(word)
  }
  return out
}

/** |A ∩ B| / |A ∪ B| over two token SETS. */
function jaccard(a, b) {
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  const union = a.size + b.size - shared
  return union === 0 ? 0 : shared / union
}

// THE "RESOLVED" RULE — a band pair is resolved when either description NAMES
// the other skill, or both name a common THIRD skill.
//
// The router form is load-bearing, not a convenience: `writing-agents`,
// `writing-skills` and `writing-rules` each say "Route through `creating-tools`,
// not directly" — a real disambiguation that points at a PARENT rather than at
// a sibling. Without the router rule those three pairs would read as violations
// while carrying the better of the two available clauses.
//
// Matching is WORD-BOUNDARY, `(?<![\w-])name(?![\w-])`, the same matcher
// graph-integrity.test.mjs uses for documentation coverage. Plain substring
// containment is the tempting shortcut and is unsafe here for a reason this
// corpus already contains: `different-viewpoint` is a substring of
// `different-viewpoints-lite`, so a description naming only the latter would
// substring-"name" the former and resolve a pair nobody disambiguated.
// Measured 2026-08-11: the two matchers agree on every one of the 42
// descriptions today, so this is a fence against the next edit, not a fix for
// a live miss. Names are escaped before being built into a regex — several
// carry `-` and a future one could carry `.` or `/`.

function namesMentionedIn(description, otherNames) {
  const text = (description ?? '').toLowerCase()
  return new Set(otherNames.filter(n => new RegExp(`(?<![\\w-])${escapeRegExp(n)}(?![\\w-])`).test(text)))
}

/**
 * Why this pair is resolved, as a human-readable phrase, or null if it is not.
 * The phrase is carried so a passing-to-failing transition can say WHICH clause
 * went missing, not merely that one did.
 */
function resolutionOf(a, b, mentions) {
  if (mentions.get(a).has(b)) return `\`${a}\` names \`${b}\``
  if (mentions.get(b).has(a)) return `\`${b}\` names \`${a}\``
  // Sorted so the reported router does not depend on Set insertion order, which
  // follows description word order and would churn on unrelated prose edits.
  for (const router of [...mentions.get(a)].sort()) {
    if (mentions.get(b).has(router)) return `both name the router \`${router}\``
  }
  return null
}

/**
 * The candidate band plus the recorded verdicts, computed ONCE.
 *
 * Memoized behind a function rather than a top-level `await` deliberately, for
 * the same reason graph-integrity.test.mjs gives: a failure inside a top-level
 * await is reported as a module that would not load, which names the file and
 * not the invariant. Here it surfaces as a failing test with a stack.
 */
let cached
function band() {
  return (cached ??= (async () => {
    const inv = await harvest({ repoRoot: REPO_ROOT })
    // Skills only. Agents and rules carry descriptions too, but only skills
    // compete for the skill-listing budget this whole policy file governs, and
    // only skills are what a reader picks between at invocation time.
    const skills = inv.filter(c => c.type === 'skill').sort((x, y) => (x.name < y.name ? -1 : 1))
    const names = skills.map(s => s.name)

    // PROVENANCE — step 1 of the tokenization contract is "the `description`
    // FRONTMATTER field only", and `s.description` here is the harvested value,
    // which is `fields.description || firstParagraph(body)`
    // (harvest-components.mjs:21). A skill shipping without a frontmatter
    // description gets body prose substituted, and that value is NON-EMPTY — so
    // no assertion made against the harvested value can detect the swap, and
    // the band would silently score body prose against descriptions.
    //
    // Enforced by 'every skill's description is declared, not a body fallback'
    // in skill-surface.test.mjs, which reads the frontmatter field directly.
    // That file is the declared owner of shape facts about the local skill
    // corpus — the same one-owner split used for this policy file's schema.
    // Both run under `npm test`, so the suite cannot be green while the
    // contract is violated. Measured 2026-08-11: all 42 skills carry a
    // non-empty frontmatter description, so the fallback is dormant.
    const tokens = new Map(skills.map(s => [s.name, descriptionTokens(s.description)]))
    const mentions = new Map(skills.map(s => [s.name, namesMentionedIn(s.description, names.filter(n => n !== s.name))]))

    const bandPairs = []
    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        // Sorted so the key form here matches the key form recorded in the
        // policy file — a pair keyed both ways would be two entries for one
        // fact. `names` is already sorted, so i<j makes this a no-op today; it
        // is kept because if that ever stops holding, the failure is a band key
        // that matches no recorded verdict, which surfaces as a simultaneous
        // "untriaged" and "stale" report for the same pair — technically true
        // and very hard to read.
        const [a, b] = [names[i], names[j]].sort()
        const score = jaccard(tokens.get(a), tokens.get(b))
        if (score < BAND_THRESHOLD) continue
        bandPairs.push({ key: `${a}|${b}`, a, b, score, resolution: resolutionOf(a, b, mentions) })
      }
    }
    bandPairs.sort((x, y) => y.score - x.score)

    // `$`-prefixed keys are documentation, not data — same predicate as every
    // other consumer of this policy file. The ENUM and the reason strings are
    // not validated here: that is the schema check's job in
    // skill-surface.test.mjs, which owns shape validation for every block of
    // this file. One owner per rule.
    const verdicts = new Map(
      Object.entries((await readPolicy()).overlapVerdicts ?? {}).filter(([k]) => !k.startsWith('$')),
    )
    return { bandPairs, verdicts }
  })())
}

// ---------------------------------------------------------------------------
// THE GATE — three assertions, one per way the record can stop describing the
// corpus. A new skill whose description lands it in the band fails CI until
// someone triages it, which is the entire point: this catches the NEXT
// confusable pair, not the ones already known.
// ---------------------------------------------------------------------------

test('every candidate-band pair carries a recorded verdict', async () => {
  const { bandPairs, verdicts } = await band()

  const untriaged = bandPairs
    .filter(p => !verdicts.has(p.key))
    .map(p => `${p.key} (jaccard ${p.score.toFixed(4)})`)

  assert.deepEqual(
    untriaged, [],
    `${untriaged.length} skill pair(s) in the candidate band with no recorded verdict — untriaged:\n`
      + `${untriaged.map(s => `    ${s}`).join('\n')}\n`
      + `  Band membership is NOT a defect: it means two descriptions are lexically similar enough\n`
      + `  (jaccard >= ${BAND_THRESHOLD}) that a reader could plausibly confuse them. Decide which it is and record\n`
      + '  the decision under overlapVerdicts in docs/reference/skill-surface-policy.json:\n'
      + '    "boundary" — one description names the other skill, or both name a common router. The\n'
      + '                 gate RE-VERIFIES this against the text, so add the clause first.\n'
      + '    "distinct" — the overlap is lexical coincidence. The reason must name the shared terms.',
  )
})

test('every boundary verdict is textually true', async () => {
  const { bandPairs, verdicts } = await band()

  // A `boundary` verdict is the only one the gate can check, and checking it is
  // what stops the verdict list becoming the new hiding place: the description
  // text IS the proof, so no separate evidence field is needed or trusted.
  // `distinct` is accepted as declared — there is nothing textual to re-verify
  // about "these two are unrelated."
  const unsupported = []
  for (const p of bandPairs) {
    // A verdict for a pair no longer in the band is staleness, not falsity —
    // the test below owns that, and reporting it twice would split one cause
    // across two failures.
    if (verdicts.get(p.key)?.verdict !== 'boundary') continue
    if (!p.resolution) {
      unsupported.push(`${p.key} — neither description names the other, and they name no router in common`)
    }
  }

  assert.deepEqual(
    unsupported, [],
    `${unsupported.length} pair(s) recorded \`boundary\` whose claimed clause is absent from the descriptions:\n`
      + `${unsupported.map(s => `    ${s}`).join('\n')}\n`
      + '  The verdict claims a disambiguating clause exists; it does not. Either restore the clause\n'
      + '  in the skill description (naming the sibling, or the shared router both route through), or\n'
      + '  change the verdict in docs/reference/skill-surface-policy.json to reflect what is true now.',
  )
})

test('no recorded verdict names a pair outside the band', async () => {
  const { bandPairs, verdicts } = await band()
  const inBand = new Set(bandPairs.map(p => p.key))

  const stale = [...verdicts.keys()].filter(k => !inBand.has(k)).sort()

  assert.deepEqual(
    stale, [],
    `${stale.length} stale overlapVerdicts entr(y/ies) — recorded for a pair that is no longer in the band:\n`
      + `${stale.map(s => `    ${s}`).join('\n')}\n`
      + `  The pair's descriptions have diverged below jaccard ${BAND_THRESHOLD}, so it is no longer a confusability\n`
      + '  candidate and the verdict is a claim about nothing. Delete the entry from\n'
      + '  docs/reference/skill-surface-policy.json. A verdict list that is only ever appended to stops\n'
      + '  being a record and becomes a hiding place — the same rule entryPoints and catalogOnly follow.',
  )
})

// CALIBRATION ANCHOR, not a fourth failure mode. The two control pairs were
// disambiguated long before this invariant existed, so if the band ever
// EXCLUDES one of them the tokenization has drifted from the contract above and
// the whole band is suspect — a failure the three assertions cannot distinguish
// from an ordinary corpus edit. Pinning them here makes that specific cause
// legible. Under the declare-and-resolve model their presence in the band is
// correct and expected; the anti-correlation finding in the header is exactly
// the observation that already-fixed pairs rank HIGH.
test('the two already-disambiguated control pairs sit in the band and resolve', async () => {
  const { bandPairs } = await band()
  const byKey = new Map(bandPairs.map(p => [p.key, p]))

  const wrong = []
  for (const key of ['executing-plans|subagent-driven-development', 'receiving-code-review|requesting-code-review']) {
    const p = byKey.get(key)
    if (!p) { wrong.push(`${key} is NOT in the band`); continue }
    if (!p.resolution) wrong.push(`${key} is in the band but does not resolve`)
  }

  assert.deepEqual(
    wrong, [],
    `control pair(s) behaving unexpectedly:\n    ${wrong.join('\n    ')}\n`
      + '  Both pairs already name each other in their descriptions, so both must be in the band AND\n'
      + '  resolve. A control falling OUT of the band means the tokenization or threshold changed and\n'
      + '  every other band membership is suspect; a control failing to RESOLVE means the sibling\n'
      + '  clause was edited out. Fix the cause — do not delete the control.',
  )
})
