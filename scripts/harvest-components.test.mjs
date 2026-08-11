import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import { harvest, buildGateMap, committedCandidateCounts } from './harvest-components.mjs'
import { resolvedNames } from './lib/component-refs.mjs'

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
// RETENTION: this constant is the standing contract of the re-grounded
// equivalence oracle below, which asserts that the tokenizer gains EXACTLY
// these 55 edges over the legacy extractor and loses none. It must remain a
// module-level constant — do not move it inside a test function.
// The pre-wiring migration harness that once shared this constant HAS BEEN
// DELETED (Task 6): it computed the same delta by calling the three rule
// functions directly, which was only meaningful while `resolvedNames` was
// still unwired. The oracle below now asserts that property against the
// production path, so keeping both would have meant maintaining two
// computations of one set. The constant stayed; only the harness went.
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
