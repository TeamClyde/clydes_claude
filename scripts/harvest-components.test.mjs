import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import { harvest, buildGateMap, committedCandidateCounts } from './harvest-components.mjs'
import {
  resolvedNames, tokenize, backtickEdgeName, pathEdgeName, colonEdgeName, suffixedEdgeName,
} from './lib/component-refs.mjs'

// Repo root resolved the portable way (matches existing .claude/hooks/*.mjs).
// Do NOT use `new URL('../', import.meta.url).pathname` — yields /C:/… on Windows.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The known delta between the legacy explicit-only extractor (`legacyEdgeNames`
// below) and the three new resolution rules added in Task 1 — `pathEdgeName`
// (path-form citations), `colonEdgeName` (`<n>:<mode>` dispatch), and
// `suffixedEdgeName` (`<n>.md` / `<n>#anchor` trailing-token citations). The
// rules exist and are unit-tested (scripts/lib/component-refs.test.mjs), but
// as of this task `resolvedNames()` does not call them yet — buildGateMap()
// still runs the legacy path in production. This constant enumerates every
// edge the new rules will add once wired, proven in advance against the live
// corpus.
//
// Rows 1-44 are the plan's original enumeration; rows 45-55 were added after
// Task 1's execution proved the original table incomplete — see the parent
// journal's `[divergence] [decision]` entry (2026-08-10).
//
// RETENTION: this constant SURVIVES past this task. Task 3 Step 3b's
// re-grounded equivalence oracle consumes it as its standing contract, so it
// must remain a module-level constant — do not move it inside a test
// function, and do not delete it when the pre-wiring harness test below is
// removed in Task 6 (that test is a one-time migration proof; this constant
// is not).
// Row numbers below are anchored to the Blueprint table in
// plans/component-reference-integrity/graph-integrity/graph-integrity-plan.md
// § "Expected diff — all 55 new edges" (`| # | from | → to | shape | ... |`).
// Entries appear in strict table order, 2 per line, so each `// rows N-M`
// marker below lines up with that table's `#` column — cross-check a pair
// by row number there, not by hand-walking both lists.
const EXPECTED_NEW_EDGES = new Set([
  // rows 1-10
  'doc-author|plan-management', 'executing-plans|plan-management',
  'writing-plans|plan-management', 'architect|delivery-cadence',
  'architect|stack-hats', 'architecture-decision-records|doc-tools',
  'brainstorming|doc-tools', 'doc-author|doc-tools',
  'doc-tools|doc-backfill', 'doc-tools|docs-refresh',
  // rows 11-20
  'doc-tools|docs-status', 'docs-status|doc-tools',
  'executing-plans|stack-hats', 'finishing-a-development-branch|delivery-cadence',
  'git-manager|delivery-cadence', 'infra-init|filesystem/path-portability',
  'new-repo-setup|stack-hat-directive', 'plan-docs|planning',
  'plan-docs|workflow-phases', 'plan-gate|delivery-cadence',
  // rows 21-30
  'plan-management|doc-tools', 'plan-management|plan-docs',
  'project-setup|delivery-cadence', 'project-setup|install-vetting',
  'stack-hats|stack-hat-directive', 'subagent-driven-development|agent-model-pinning',
  'subagent-driven-development|stack-hats', 'subagent-driven-development|subagent-prefix-prepend',
  'systematic-debugging|filesystem/efficiency', 'vet-capability-fit|install-vetting',
  // rows 31-40
  'vet-install|install-vetting', 'vet-reputation|install-vetting',
  'vet-security|install-vetting', 'writing-agents|architect',
  'writing-agents|researcher', 'writing-plans|architect',
  'writing-plans|delivery-cadence', 'writing-plans|doc-tools',
  'writing-plans|plan-gate', 'writing-rules|cspell',
  // rows 41-44 — end of the plan's original 44-row enumeration
  'writing-rules|mcp-governance', 'writing-rules|new-repo-setup',
  'writing-rules|secrets-handling', 'plan-docs|integration-test-constraints',
  // rows 45-50 — start of the 2026-08-10 correction (see comment above)
  'different-viewpoints-lite|different-viewpoint', 'doc-author|doc-backfill',
  'doc-backfill|infra-init', 'docs-refresh|docs-status',
  'docs-status|docs-refresh', 'e2e-init|infra-init',
  // rows 51-55
  'filesystem/path-portability|infra-init', 'finishing-a-development-branch|docs-status',
  'install-vetting|ai-tool-security-reviewer', 'integration-engineer|infra-init',
  'vet-install|project-setup',
])

test('harvest finds skills, agents, rules, and hooks by type', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const byName = Object.fromEntries(inv.map(c => [`${c.type}:${c.name}`, c]))

  // skill with uppercase SKILL.md
  assert.equal(byName['skill:git-manager']?.type, 'skill')
  // adherence-audit — entry file is SKILL.md (all skills standardized); discovered by name.
  // The scanner's /^skill\.md$/i match stays case-insensitive defensively, even with no lowercase fixture.
  assert.equal(byName['skill:adherence-audit']?.type, 'skill')
  // agent carries its pinned model from frontmatter
  assert.equal(byName['agent:architect']?.model, 'claude-sonnet-4-6')
  // rule (plain markdown, no frontmatter)
  assert.equal(byName['rule:workflow-phases']?.type, 'rule')
  // hooks classified by event directory
  assert.equal(byName['hook:slash-command-enforcement']?.event, 'userPromptSubmit')
  assert.equal(byName['hook:install-vetting-advisory']?.event, 'preToolUse')
})

test('component file paths are repo-relative posix — artifacts must be machine-independent', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  // These paths are serialised into docs/reference/*.json and committed. An
  // absolute path bakes the generating machine's checkout directory into the
  // artifact, so `npm run harvest:check` can only ever pass on that one machine
  // in that one directory — it fails in CI and in any second clone. Backslashes
  // would do the same across Windows and POSIX. The audit subagents that read
  // the inventory resolve these against the repo root, so relative is also the
  // only form that is useful to them.
  for (const c of inv) {
    assert.ok(!isAbsolute(c.file), `${c.type}:${c.name} — file must be repo-relative, got absolute "${c.file}"`)
    assert.ok(!c.file.includes('\\'), `${c.type}:${c.name} — file must use posix separators, got "${c.file}"`)
  }
})

test('hook .test.mjs files are excluded from the inventory', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  assert.ok(!inv.some(c => c.name.endsWith('.test')), 'no .test entries')
  assert.ok(!inv.some(c => c.type === 'hook' && c.file.endsWith('.test.mjs')))
})

test('gate-map extracts known explicit edges', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const { edges } = buildGateMap(inv)
  const has = (a, b) => edges.some(e => e.from === a && e.to === b)

  // Both edges are confirmed detectable in the actual files (architect-verified):
  // plan-gate references `subagent_type: architect`; creating-tools references `writing-skills`.
  assert.ok(has('plan-gate', 'architect'), 'plan-gate invokes the architect agent')
  assert.ok(has('creating-tools', 'writing-skills'), 'creating-tools routes to writing-skills')
})

test('reverse-dependency lookup returns dependents of a component', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const { dependentsOf } = buildGateMap(inv)
  // editing the architect agent should surface plan-gate as an upstream dependent
  assert.ok(dependentsOf('architect').includes('plan-gate'))
})

test('gate-map excludes self-edges', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const { edges } = buildGateMap(inv)
  // a component referencing its own name in its body must not produce a self-loop
  assert.ok(!edges.some(e => e.from === e.to), 'no self-edges')
})

test('implicit (prose-only) edges are NOT extracted', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const { edges } = buildGateMap(inv)
  // writing-plans names brainstorming only in prose — 6 mentions, zero backtick
  // spans, zero `skill:`/`subagent_type:` slots. Cleanest citation is SKILL.md
  // line 17: "This should be run in a dedicated worktree (created by
  // brainstorming skill)." (others: 109, 122, 126, 140, 166). A bare English
  // mention of a component's name is not a citation of it, and no resolution
  // rule — explicit or path/colon/suffixed — may promote one to an edge.
  //
  // PAIR HISTORY — this is the point of the test, not trivia. The original pair
  // was writing-plans -> plan-gate, chosen on the premise that plan-gate was
  // named only in prose there. That premise expired: writing-plans/SKILL.md
  // line 382 now carries `skills/plan-gate/SKILL.md` in a backtick span, a real
  // path-form citation, so the pair became a TRUE edge and the assertion was
  // testing a stale fact rather than the principle. Retired and re-grounded
  // rather than deleted — the principle is permanent, the exemplar is not.
  //
  // If this pair also acquires a real citation one day, do the same thing:
  // re-ground it on a still-prose-only pair and record the retirement here. Do
  // NOT relax the assertion to make it pass, and do not delete the test — a
  // green suite with no prose guard is precisely how recall creep gets in.
  assert.ok(!edges.some(e => e.from === 'writing-plans' && e.to === 'brainstorming'),
    'precision-over-recall: a prose-only reference must not become an edge')
})

test('skill:/subagent_type: reference to a hyphen-extended name does not edge to the shorter prefix name', () => {
  const inv = [
    { type: 'rule', name: 'install-vetting', body: '' },
    { type: 'hook', name: 'install-vetting-advisory', body: '' },
    { type: 'skill', name: 'caller', body: 'invoke via subagent_type: install-vetting-advisory here' },
  ]
  const { edges } = buildGateMap(inv)
  // the real reference is to install-vetting-advisory...
  assert.ok(edges.some(e => e.from === 'caller' && e.to === 'install-vetting-advisory'),
    'the full hyphen-extended name should still edge')
  // ...and must NOT spuriously edge to the shorter prefix `install-vetting`
  assert.ok(!edges.some(e => e.from === 'caller' && e.to === 'install-vetting'),
    'trailing (?![\\w-]) must prevent the shorter-prefix false positive')
})

test('committed inventory matches freshly harvested output (drift guard)', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const onDisk = JSON.parse(await readFile(join(REPO_ROOT, 'docs/reference/component-inventory.json'), 'utf8'))
  assert.equal(onDisk.length, inv.length, 'inventory length drifted — run `npm run harvest`')
})

// The legacy explicit-only extractor, preserved VERBATIM as the frozen oracle.
// Body unchanged since it was lifted out of buildGateMap — that is the whole
// value: it is the last independent record of what the graph contained before
// the tokenizer, and it cannot drift because nothing in production calls it.
//
// Its job used to be proving the tokenizer swap changed nothing. That job ended
// when the three resolution rules were wired in and the graph deliberately
// moved (176 -> 231 edges). It now anchors the RESHAPED contract asserted
// below: not "nothing changed", but "nothing was lost and only the enumerated
// 55 were gained". (Reshaped, not simply stronger — see the precise breakdown
// on that test, which spells out where the new form is deliberately more
// permissive than plain equality and where it is stricter.)
// Keeping a real second implementation is still worth far more
// than a byte-diff on the committed artifact — `npm run harvest:check` can tell
// you the JSON moved, but only this can tell you WHICH edge and in which
// direction, by name.
//
// Do not "modernize" this function, do not refactor it to share code with
// component-refs.mjs, and do not delete it. An oracle that imports the thing it
// is checking asserts nothing.
function legacyEdgeNames(body, sortedNames, self) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = new Set()
  for (const target of sortedNames) {
    if (target === self) continue
    const re = new RegExp(`\`${esc(target)}\`|(?:skill|subagent_type):\\s*['"\`]?${esc(target)}(?![\\w-])`)
    if (re.test(body)) found.add(target)
  }
  return found
}

// THE PRODUCTION ORACLE. This is the only test that checks the live
// `resolvedNames()` — the function `buildGateMap()` actually runs — against an
// independent implementation. Everything gate-map.json contains passes through
// here first.
//
// It began life as a strict equality check ("the tokenizer reproduces the
// legacy edge set exactly"), which was correct while the tokenizer swap was
// meant to be a pure refactor. Wiring the three resolution rules into
// `resolvedNames()` deliberately moved the graph, so strict equality became
// structurally impossible to satisfy — the 55 new edges are the POINT, not a
// regression.
//
// The re-grounding is a SUPERSET-WITH-KNOWN-DELTA assertion. Stating its
// strength precisely, because "strictly stronger than the equality it replaces"
// is NOT formally true and should not be written here:
//
//   old:  legacy == modern
//   new:  legacy ⊆ modern  AND  modern \ legacy == EXPECTED_NEW_EDGES
//
// On the 55 enumerated edges the new form is deliberately MORE PERMISSIVE —
// plain equality would reject them outright, which is the entire reason it had
// to be replaced. That carve-out is the point, not an oversight, and it is
// bounded by enumeration rather than by kind.
//
// What is true, in three parts:
//   1. It preserves the original's precision guarantee UNDILUTED. `lost` is
//      exactly as strict as the old legacy-only half — not weakened, not
//      relaxed, same set difference.
//   2. It is stronger than the ALTERNATIVE THAT WAS REJECTED — a bare
//      one-directional `modern ⊇ legacy` containment check, which would have
//      passed while the rules resolved arbitrary extra edges, letting recall
//      creep in unnoticed.
//   3. It adds a guarantee the old equality could not express at all: the gain
//      is not merely bounded, it is EXACTLY the enumerated set — checked in
//      both directions, so neither an extra edge nor a vanished one passes.
//
// It gets there by splitting one bidirectional check into three
// independently-named ones:
//
//   lost       legacy \ modern     MUST be empty. This is the original
//                                  guarantee, fully preserved and undiluted:
//                                  no edge the explicit-only extractor found
//                                  may disappear. A recall-improving change
//                                  must never cost precision.
//   unexpected (modern \ legacy) \ EXPECTED_NEW_EDGES
//                                  MUST be empty. NEW: the gain is capped at
//                                  the enumerated set. A rule that starts
//                                  over-resolving lands here by name.
//   missing    EXPECTED_NEW_EDGES \ (modern \ legacy)
//                                  MUST be empty. NEW: every enumerated pair
//                                  must still resolve. A rule that regresses,
//                                  or a corpus edit that removes a real
//                                  citation, lands here by name.
//
// MAINTENANCE CONTRACT — the corollary of point 2 above. When a future change
// legitimately adds an edge, add the pair to EXPECTED_NEW_EDGES in the same
// commit that causes it: deliberately, reviewably, one line per edge. Do not
// loosen the assertion to absorb it. Dropping `unexpected` is precisely the
// rejected one-directional check, reintroduced by attrition.
//
// Pair keys are `from|to` NAMES, not `type:name`, matching EXPECTED_NEW_EDGES's
// shape and the gate-map's own edge identity (edges carry names, not types).
// Two ways a pair key could collide, both foreclosed:
//   - two components sharing a NAME — ruled out by count: the inventory has 79
//     entries and 79 distinct names.
//   - the concatenation boundary itself, where a name containing a literal "|"
//     would make `a|b` + `c` key identically to `a` + `b|c`. Ruled out by the
//     character set, not the count: every name derives from a filesystem path
//     (scanRules/scanSkills/scanAgents/scanHooks in harvest-components.mjs),
//     and "|" is not a legal filename character on Windows — where this repo is
//     developed and where the artifact is generated — so no name can contain
//     the delimiter. The count alone would NOT have ruled this one out.
test('tokenizer is a superset of the legacy edge set, gaining exactly the known 55 (equivalence)', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const sorted = [...new Set(inv.map(c => c.name).filter(Boolean))].sort((a, b) => b.length - a.length)

  // Accumulated corpus-wide, NOT compared per-component: the per-component sets
  // are name sets scoped to one body, while EXPECTED_NEW_EDGES is a flat set of
  // `from|to` strings spanning the whole corpus. Comparing the per-component
  // locals directly would be comparing two different shapes.
  const legacyPairs = new Set()
  const modernPairs = new Set()
  for (const c of inv) {
    const body = c.body || ''
    for (const n of legacyEdgeNames(body, sorted, c.name)) legacyPairs.add(`${c.name}|${n}`)
    for (const n of resolvedNames(body, sorted, c.name)) modernPairs.add(`${c.name}|${n}`)
  }

  const lost = [...legacyPairs].filter(p => !modernPairs.has(p)).sort()
  const gained = new Set([...modernPairs].filter(p => !legacyPairs.has(p)))
  const unexpected = [...gained].filter(p => !EXPECTED_NEW_EDGES.has(p)).sort()
  const missing = [...EXPECTED_NEW_EDGES].filter(p => !gained.has(p)).sort()

  assert.deepEqual(
    { lost, unexpected, missing },
    { lost: [], unexpected: [], missing: [] },
    'edge extraction diverged from the known delta:\n'
      + `  lost (legacy edge no longer resolved — a precision regression): ${lost.join(', ') || '(none)'}\n`
      + `  unexpected (gained, not in EXPECTED_NEW_EDGES): ${unexpected.join(', ') || '(none)'}\n`
      + `  missing (in EXPECTED_NEW_EDGES, no longer gained): ${missing.join(', ') || '(none)'}`,
  )
})

// ONE-TIME MIGRATION PROOF — deleted in Task 6, once Task 3 has wired the new
// rules into resolvedNames() and the equivalence test above (which calls
// resolvedNames() directly) is re-grounded against EXPECTED_NEW_EDGES instead.
// EXPECTED_NEW_EDGES itself is NOT deleted alongside this test — see its
// comment above.
//
// This harness deliberately does NOT call resolvedNames(). It calls
// pathEdgeName / colonEdgeName / suffixedEdgeName directly against each
// component's backtick tokens, and unions the hits with legacyEdgeNames().
// That is the entire point: resolvedNames() does not wire the three new
// rules yet (Task 3's job), so a version of this test that routed through
// resolvedNames() would assert nothing about the new rules today — it would
// silently start testing something real only once Task 3 lands, which is
// backwards from the goal. Testing the rule functions directly makes the
// assertion true NOW, while the legacy path is still what buildGateMap()
// actually runs in production, which is what proves the 55-edge delta is
// known in advance rather than discovered as a surprise diff after Task 3's
// wiring lands.
//
// Do NOT "fix" this by swapping in resolvedNames() — that is the most likely
// well-intentioned edit a future maintainer would make, and it would destroy
// exactly what this test exists to prove.
test('expected-diff audit: path/colon/suffixed rules produce exactly the known 55-edge delta over the legacy set (pre-wiring)', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const sorted = [...new Set(inv.map(c => c.name).filter(Boolean))].sort((a, b) => b.length - a.length)
  // Built once outside the component loop — not per token — per the task's
  // performance note; pathEdgeName/colonEdgeName take a Set, suffixedEdgeName
  // takes the longest-first array (needed for its prefix-ambiguity walk).
  const nameSet = new Set(sorted)

  // Corpus-wide `from|to` pairs, not per-component sets: EXPECTED_NEW_EDGES is
  // a flat set of strings, so the accumulator has to match its shape.
  const newPairs = new Set()
  for (const c of inv) {
    const body = c.body || ''
    const legacy = legacyEdgeNames(body, sorted, c.name)
    const backticks = tokenize(body).filter(t => t.kind === 'backtick')
    for (const t of backticks) {
      // Precedence order path -> colon -> suffixed, first non-null — the same
      // order the plan's Blueprint table used to assign each pair a single
      // shape, and the same order Task 3 will use inside resolvedNames().
      // (backtickEdgeName is not called: an exact `` `target` `` span is
      // already covered by legacyEdgeNames' own backtick alternative, so
      // calling it here would only ever re-derive names already in `legacy`.)
      // `||` (not `??`) is safe here only because none of the three rules
      // can ever return `''` — each return is either `null` or a value that
      // passed a Set-membership test against real node names, and no node
      // is named the empty string. If that ever stopped holding, `hit === ''`
      // would fall through the `||` chain the same as `null` and be
      // indistinguishable from "no match" below.
      const hit = pathEdgeName(t.value, nameSet)
        || colonEdgeName(t.value, nameSet)
        || suffixedEdgeName(t.value, sorted)
      if (!hit || hit === c.name) continue
      if (!legacy.has(hit)) newPairs.add(`${c.name}|${hit}`)
    }
  }

  // Report both directions by name, so a divergence explains itself instead
  // of surfacing as an opaque byte-diff: `unexpected` means the live rules
  // found something the Blueprint table didn't predict (rules regressed, or
  // the corpus changed under us); `missing` means a predicted pair no longer
  // resolves (same two causes, other direction). Per the task: if either is
  // non-empty, that is a finding to report, not something to paper over by
  // editing EXPECTED_NEW_EDGES to match.
  const unexpected = [...newPairs].filter(p => !EXPECTED_NEW_EDGES.has(p)).sort()
  const missing = [...EXPECTED_NEW_EDGES].filter(p => !newPairs.has(p)).sort()
  assert.deepEqual(
    { unexpected, missing },
    { unexpected: [], missing: [] },
    `expected-diff audit failed:\n  unexpected (found, not predicted): ${unexpected.join(', ') || '(none)'}\n  missing (predicted, not found): ${missing.join(', ') || '(none)'}`,
  )
})

test('every committed skill directory yields a component', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const found = new Set(inv.filter(c => c.type === 'skill').map(c => c.file.split('/')[1]))

  // Committed state, not readdir: skills/git-manager-workspace/ is gitignored and
  // does not exist in a CI checkout, so a working-tree scan would go red here and
  // green in CI -- the inverse of what an enforced invariant is for.
  const committed = new Set(
    execFileSync('git', ['ls-files', '-z', 'skills/'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\0').filter(Boolean)
      .map(p => p.split('/')[1])
      .filter(Boolean),
  )

  const dropped = [...committed].filter(d => !found.has(d)).sort()
  assert.deepEqual(dropped, [], `committed skill director(ies) produced no component: ${dropped.join(', ')} — a missing SKILL.md drops a skill from the inventory silently, and every citation to it then reads as a dead reference`)
})

test('per-root candidate counts match harvested node counts', async () => {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const counts = await committedCandidateCounts(REPO_ROOT)
  for (const type of ['skill', 'agent', 'rule', 'hook']) {
    const nodes = inv.filter(c => c.type === type).length
    assert.equal(nodes, counts[type],
      `${type}: ${nodes} node(s) from ${counts[type]} committed candidate(s) — a mismatch means the scanner dropped a file`)
  }
})

// ===========================================================================
// SHAPE-COVERAGE INVARIANT — the RECALL counterpart to slice 1's gate.
// ===========================================================================
//
// scripts/reference-integrity.test.mjs asks "does this citation resolve to
// something?" — a PRECISION question, and one with a blind spot in exactly the
// opposite direction. A component cited in a shape the tokenizer cannot READ
// emits no token at all, so it is not dangling, fails nothing, and the edge
// simply never exists. Slice 1's gate is structurally incapable of noticing
// that. This invariant asks the mirror question: *is a component cited in a
// shape we cannot see?*
//
// WHY THIS IS NOT "RE-APPLY THE FOUR RULES AND CHECK". An invariant built by
// re-running backtick/path/colon/suffixed over the corpus detects only a
// RESOLVER REGRESSION — a genuinely new shape #5 is BY DEFINITION something
// none of the four rules match, so it would be invisible to such a check,
// which defeats the entire purpose. (Regression detection is already covered,
// by the equivalence oracle above.) The rule below therefore deliberately does
// NOT resolve; it CONTAINS.
//
// THE DETECTION RULE, in three steps:
//   1. Take every `backtick` span that resolves under NONE of the four rules.
//   2. Split it on `/`, `.`, `:`, `#` and whitespace, and ask whether any
//      segment — or any contiguous slash-joined run of segments — IS a known
//      node name.
//   3. A span that demonstrably NAMES a real component but resolves to nothing
//      is a candidate unrecognized shape: report component, file:line, span,
//      and the node it appears to name.
//
// Containment is deliberately WEAKER than resolution, and that weakness is the
// feature: it is allowed to be wrong about intent (a span can name a component
// without citing it), which is precisely what lets it see a shape nobody has
// thought of yet. The declared exemptions below are where "wrong about intent"
// is paid for — by name, individually, with a reason.

/**
 * Names a span appears to mention, tested by CONTAINMENT rather than by any
 * resolution rule.
 *
 * Splits on `[.:#\s]` first, then walks contiguous `/`-joined runs inside each
 * chunk. The two-level split exists because two real node names contain a
 * slash — `filesystem/efficiency` and `filesystem/path-portability`
 * (scanRules() prefixes nested rule names with their directory). A flat
 * per-segment split on `/` could never match either of them, so those two
 * nodes would be permanently invisible to this invariant. Measured against the
 * current corpus the runs make no difference to the finding set (13 pairs
 * either way); they are here so that fact stays true if a nested rule ever IS
 * cited in an unreadable shape.
 */
function citedNamesIn(span, nameSet) {
  const out = new Set()
  for (const chunk of span.split(/[.:#\s]+/)) {
    const parts = chunk.split('/').filter(Boolean)
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j <= parts.length; j++) {
        const candidate = parts.slice(i, j).join('/')
        if (nameSet.has(candidate)) out.add(candidate)
      }
    }
  }
  return out
}

/**
 * How many lines `parseFrontmatter` strips off the front of a file.
 *
 * `tokenize()` line numbers are BODY-relative, and every component's `body`
 * came from `parseFrontmatter`, which removes the frontmatter block. So a file
 * line is `bodyLine + frontmatterOffset(raw)`. Without this every citation site
 * this invariant prints is wrong — silently, and by a different amount per
 * file, which is the worst kind of wrong for a message whose whole job is to
 * send a reader to a specific line.
 *
 * Derived by MIRRORING parseFrontmatter's own strip regex rather than by
 * independently scanning for the closing `---`. That is intentional: the offset
 * has to describe the exact text that was removed, and any second
 * implementation of "where does frontmatter end" could disagree with the first
 * on a malformed or unusual header. Reusing the regex cannot.
 *
 * parseFrontmatter returns `{ fields, body }` only — it does not expose the
 * count — and its signature is NOT widened for this, because the need is
 * test-only and it has production callers (scanSkills / scanAgents / scanRules).
 *
 * The offset is NOT a constant. Skills and agents carry frontmatter; several
 * rules (`rules/doc-tools.md`, `rules/plan-docs.md`, ...) open directly with a
 * `#` heading and have none at all, so their offset is 0 and an unconditional
 * `+N` would push every one of their reported lines off the end of the header
 * that isn't there. Both cases are asserted below.
 */
function frontmatterOffset(raw) {
  const norm = raw.replace(/\r\n/g, '\n')
  const body = norm.replace(/^---\n[\s\S]*?\n---\n?/, '')
  return norm.split('\n').length - body.split('\n').length
}

// DECLARED EXEMPTIONS — spans that name a component without citing it.
//
// Calibrated against the full corpus, not chosen a priori. The naive form of
// the rule ("flag every non-resolving span containing a node name") yields 35
// pairs, which by the plan's own bar — "if calibration yields a large exemption
// list, the rule is wrong" — condemns the naive rule rather than the corpus.
//
// The fix is a sharper question, and it is load-bearing:
//
//   Only report when the citing component does NOT ALREADY have an edge to
//   that node from some other token in its body.
//
// The invariant's purpose is GRAPH COMPLETENESS, which is a property of the
// component, not of any individual span. If A cites B in both a readable and an
// unreadable shape, the edge exists and the graph is already correct — the
// unreadable span costs nothing and a finding about it is a finding about
// nothing. Applying the filter drops 35 pairs to 13 and removes exactly that
// class (e.g. `` `subagent_type: architect` `` in plan-gate, whose edge the
// `slot` token has already produced).
//
// ACCEPTED LIMITATION, stated so nobody "discovers" it later and files it as a
// bug: a genuinely new shape that ONLY EVER co-occurs alongside a readable
// citation of the same target is invisible to this invariant. That is the
// deliberate trade for the stated purpose. A new shape used for a target cited
// no other way — the case that actually costs an edge — is still caught.
//
// GRANULARITY is the `from|to` PAIR, not the span. The reason strings below are
// claims about a component's relationship to a node ("doc-author's mentions of
// docs-refresh are slash-command invocations, not dependencies"), which is a
// pair-shaped claim; pinning each entry to verbatim span text would also churn
// the list on every prose edit. The cost is that a second, genuinely new shape
// between an already-exempt pair would be absorbed silently. Accepted: the pair
// is already known not to yield an edge, so no edge can be lost by it.
//
// Both directions are asserted below — an unexempted finding fails, and so does
// a STALE exemption whose finding no longer occurs. An exemption list that is
// never checked for staleness is how an exemption list becomes a hiding place.
const SHAPE_COVERAGE_EXEMPTIONS = [
  // ── Class 1: example-argument text ────────────────────────────────────────
  // The span is an EXAMPLE INVOCATION of the citing skill, and the named
  // component is the SUBJECT of the example sentence, not a dependency.
  // `feedback` does not depend on `brainstorming` because its usage example
  // describes someone reporting that brainstorming got skipped. Genuine false
  // positives — the containment rule seeing a name and not a citation.
  { from: 'different-viewpoint', to: 'writing-plans',
    reason: 'example-argument text: the span is a sample `/different-viewpoint <problem statement>` invocation whose problem statement happens to be about writing-plans' },
  { from: 'feedback', to: 'brainstorming',
    reason: 'example-argument text: sample `/feedback <observation>` invocation; brainstorming is the subject of the reported observation, not a dependency of feedback' },
  { from: 'feedback', to: 'plan-gate',
    reason: 'example-argument text: sample `/feedback <observation>` invocation; plan-gate is the subject of the reported observation' },
  { from: 'feedback', to: 'architect',
    reason: 'example-argument text: same sample `/feedback` line as the plan-gate entry above — the observation names both' },
  { from: 'feedback', to: 'git-manager',
    reason: 'example-argument text: sample `/feedback <observation>` invocation; git-manager is the subject of the reported observation' },

  // ── Class 2: console-output string ────────────────────────────────────────
  // The span is a message the skill PRINTS at runtime. Text a component emits
  // is not a citation the component makes.
  { from: 'doc-author', to: 'infra-init',
    reason: 'console-output string: the span is an error message doc-author prints ("... Run /infra-init first."), not a reference doc-author makes' },

  // ── Class 3: `.claude/` basename collision ────────────────────────────────
  // `.claude/integration-test-constraints.md` is a REPO-LEVEL CONFIG FILE. The
  // rule node of that name lives at `rules/integration-test-constraints.md`.
  // Two different files that happen to share a basename — which is precisely
  // the case Task 1's CONTAINER GUARD in pathEdgeName() was built to exclude
  // (see its comment in scripts/lib/component-refs.mjs: a `.md` span resolves
  // only when the preceding segment is a real container). The guard is working
  // as designed here; containment simply cannot see the distinction, because
  // the basename genuinely is a node name.
  { from: 'e2e-init', to: 'integration-test-constraints',
    reason: '.claude/ basename collision: `.claude/integration-test-constraints.md` is the repo-level config file, not the rule at rules/integration-test-constraints.md — excluded on purpose by pathEdgeName\'s container guard' },
  { from: 'test-builder', to: 'integration-test-constraints',
    reason: '.claude/ basename collision: same repo-level config file as the e2e-init entry — see pathEdgeName\'s container guard' },
  { from: 'test-strategy', to: 'integration-test-constraints',
    reason: '.claude/ basename collision: same repo-level config file as the e2e-init entry — see pathEdgeName\'s container guard' },

  // ── Class 4: known-real, deliberately out of corpus ───────────────────────
  // These two spans name a file OWNED BY a component rather than the component
  // itself. They arguably ARE real dependencies — and are exempted anyway, on a
  // decision already taken rather than a hand-wave: the plan's Open Question 3
  // resolved NOT to widen the edge corpus to skill aux files, because doing so
  // re-opens slice 1's two-corpora decision and would move far more than the
  // enumerated edge set. Recorded there as a `remediation/` finding. If that
  // decision is ever reversed, these are the entries to delete first.
  { from: 'requesting-code-review', to: 'subagent-driven-development',
    reason: 'aux-file citation (known real, out of corpus by Open Question 3): names subagent-driven-development/code-quality-reviewer-prompt.md, a file the component owns, not the component' },
  { from: 'writing-agents', to: 'creating-tools',
    reason: 'aux-file citation (known real, out of corpus by Open Question 3): names creating-tools/frontmatter-reference.md, a file the component owns, not the component' },

  // ── Class 5: shapes the plan deliberately declined to resolve ─────────────
  // Not false positives and not out-of-corpus — real citations in shapes the
  // extractor was deliberately not widened to read. Candidates for a future
  // rule, recorded here so that choice stays visible instead of dissolving into
  // "the graph just doesn't have that edge".
  { from: 'writing-skills', to: 'systematic-debugging',
    reason: 'bare-name-in-prose shape, deliberately not widened (Blueprint: "Not widened: the bare-name shape") — and the span is itself a quoted authoring EXAMPLE of correct cross-skill reference syntax, not writing-skills depending on systematic-debugging' },
  { from: 'doc-author', to: 'docs-refresh',
    reason: 'slash-command + argument (`/docs-refresh feature|architecture`): a real citation whose trailing argument defeats pathEdgeName\'s bare-`/<n>` form — a candidate for a future rule, not a false positive' },
]

/**
 * Every candidate unrecognized shape in the corpus, BEFORE exemptions.
 * Exemptions are applied by the caller so that the offset test below can
 * verify line numbers on the full candidate set, exempt ones included.
 */
async function collectUnrecognizedShapes() {
  const inv = await harvest({ repoRoot: REPO_ROOT })
  const sorted = [...new Set(inv.map(c => c.name).filter(Boolean))].sort((a, b) => b.length - a.length)
  const nameSet = new Set(sorted)

  const findings = []
  for (const c of inv) {
    const body = c.body || ''
    // 10 of 79 nodes are hooks, which scanHooks() gives `body: ''` — they
    // contribute no spans. That is the scanner's design, not a gap here.
    if (!body) continue

    // The component's ACTUAL outbound edge set, straight from the production
    // resolver — this is what makes the "already edged" filter above a
    // statement about the real graph rather than a re-derivation of it.
    const edged = resolvedNames(body, sorted, c.name)
    const raw = (await readFile(join(REPO_ROOT, c.file), 'utf8')).replace(/\r\n/g, '\n')
    const offset = frontmatterOffset(raw)

    for (const t of tokenize(body)) {
      if (t.kind !== 'backtick') continue
      // Same four rules in the same precedence order resolvedNames() applies to
      // a `backtick` token. Kept in step with it deliberately: if a fifth rule
      // is ever added there it must be added here too, or this invariant starts
      // reporting spans production can already read. (It would under-report,
      // never over-report, because a span the resolver reads produces an edge
      // and the `edged` filter then drops the finding — but a quiet
      // under-reporting invariant is still a broken one.)
      const resolves = backtickEdgeName(t.value, nameSet)
        || pathEdgeName(t.value, nameSet)
        || colonEdgeName(t.value, nameSet)
        || suffixedEdgeName(t.value, sorted)
      if (resolves) continue

      for (const named of citedNamesIn(t.value, nameSet)) {
        if (named === c.name) continue      // self-mention is not a citation
        if (edged.has(named)) continue      // the edge already exists — see ACCEPTED LIMITATION
        findings.push({ from: c.name, to: named, file: c.file, line: t.line + offset, span: t.value })
      }
    }
  }
  const key = f => `${f.from}|${f.to}|${f.file}|${String(f.line).padStart(6, '0')}`
  return findings.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

test('no component is cited in a shape the extractor cannot read (shape coverage)', async () => {
  const findings = await collectUnrecognizedShapes()
  const exempt = new Set(SHAPE_COVERAGE_EXEMPTIONS.map(e => `${e.from}|${e.to}`))
  const found = new Set(findings.map(f => `${f.from}|${f.to}`))

  // Direction 1 — a candidate nobody has accounted for. Either the corpus
  // gained a citation shape the four rules cannot read (add a rule), or it
  // gained a span that names a component without citing it (add an exemption,
  // with a reason that would convince a reviewer).
  const unexplained = findings.filter(f => !exempt.has(`${f.from}|${f.to}`))
  // Direction 2 — an exemption whose finding no longer occurs. Delete it. An
  // exemption list that is only ever appended to stops being a declaration and
  // becomes a hiding place.
  const stale = [...exempt].filter(k => !found.has(k)).sort()

  assert.deepEqual(
    {
      unexplained: unexplained.map(f => `${f.from} -> ${f.to} @ ${f.file}:${f.line}`),
      stale,
    },
    { unexplained: [], stale: [] },
    'shape coverage diverged:\n'
      + `  unexplained (component named in an unreadable span, no edge, no exemption):\n${
        unexplained.map(f => `    ${f.from} -> ${f.to}\n      ${f.file}:${f.line}  \`${f.span}\``).join('\n') || '    (none)'}\n`
      + `  stale (declared exemption that no longer matches anything — delete it): ${stale.join(', ') || '(none)'}`,
  )
})

test('frontmatter offset is derived per-file, and is 0 for a file with no frontmatter', async () => {
  // Known-length fixture: 4 header lines (`---`, two fields, `---`), so body
  // line 1 (`# Title`) is file line 5.
  const withFm = '---\nname: x\ndescription: y\n---\n# Title\nbody\n'
  assert.equal(frontmatterOffset(withFm), 4)
  assert.equal(withFm.split('\n')[1 - 1 + 4], '# Title', 'bodyLine 1 + offset must land on the first body line')

  // Zero-frontmatter: an unconditional `+N` would be wrong here, which is the
  // whole reason this is derived per file instead of assumed.
  assert.equal(frontmatterOffset('# Doc Tools\n\nSome text\n'), 0)

  // CRLF: this repo is developed on Windows and parseFrontmatter normalizes
  // line endings before matching, so the offset must too — otherwise the strip
  // regex misses entirely and every skill silently reports offset 0.
  assert.equal(frontmatterOffset('---\r\nname: x\r\n---\r\n# Title\r\n'), 3)

  // Anchored to the real corpus, both cases. rules/doc-tools.md and
  // rules/plan-docs.md open with `# ` and carry no frontmatter at all; every
  // skill does carry it.
  const rawRule = await readFile(join(REPO_ROOT, 'rules/doc-tools.md'), 'utf8')
  const rawPlanDocs = await readFile(join(REPO_ROOT, 'rules/plan-docs.md'), 'utf8')
  const rawSkill = await readFile(join(REPO_ROOT, 'skills/feedback/SKILL.md'), 'utf8')
  assert.equal(frontmatterOffset(rawRule), 0, 'rules/doc-tools.md has no frontmatter')
  assert.equal(frontmatterOffset(rawPlanDocs), 0, 'rules/plan-docs.md has no frontmatter')
  assert.ok(frontmatterOffset(rawSkill) > 0, 'a skill does carry frontmatter')
})

test('every reported citation site lands on the line that actually holds the span', async () => {
  // The end-to-end proof of the offset, and the reason it is worth deriving at
  // all: an invariant that prints `file:line` is only useful if a reader can
  // open that line and see the span. Checked over the WHOLE candidate set,
  // exempt entries included — exempting a finding does not excuse a wrong
  // line number, and the exempt rows are the ones that exercise both the
  // zero-offset (rules/) and non-zero (skills/, agents/) paths.
  const findings = await collectUnrecognizedShapes()
  assert.ok(findings.length > 0, 'no candidates to check — the offset assertion below would be vacuous')

  const wrong = []
  for (const f of findings) {
    const raw = (await readFile(join(REPO_ROOT, f.file), 'utf8')).replace(/\r\n/g, '\n')
    const text = raw.split('\n')[f.line - 1] ?? ''
    if (!text.includes(f.span)) wrong.push(`${f.file}:${f.line} does not contain \`${f.span}\` (found: ${JSON.stringify(text.slice(0, 80))})`)
  }
  assert.deepEqual(wrong, [], `reported line(s) off by the frontmatter offset:\n  ${wrong.join('\n  ')}`)
})
