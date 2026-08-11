import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { harvest, buildGateMap } from './harvest-components.mjs'
import { readPolicy } from './lib/skill-surface.mjs'

// Repo root resolved the portable way (matches the sibling test files and
// .claude/hooks/*.mjs). Do NOT use `new URL('../', import.meta.url).pathname`
// — it yields /C:/… on Windows.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ===========================================================================
// GRAPH INVARIANTS — properties of the graph's SHAPE, not of any single edge.
// ===========================================================================
//
// The two gates that already exist are both edge-local:
//   reference-integrity.test.mjs           PRECISION — does this citation
//                                          resolve to something?
//   harvest-components.shape-coverage.…    RECALL — is a component cited in a
//                                          shape the extractor cannot read?
//
// Neither can see a property that only exists across the whole graph. Slice 2a
// made the graph precise enough to ask those questions; this file asks them.
// The first is INBOUND DEGREE, below.
//
// SIZE CHECKPOINT — read before adding the next invariant. harvest-components
// .test.mjs reached 353 lines before two reviewers flagged it and it had to be
// split. This file is expected to gain further invariants; when it passes
// ~350 lines, split PER-INVARIANT (graph-integrity.orphans.test.mjs,
// .coverage.test.mjs, …) rather than carrying the same complaint under a new
// filename. `graph()` below is the seam that makes that split cheap: it is the
// only state any invariant here shares, and it re-derives from disk, so a
// split file needs to copy nine lines and nothing else.

/**
 * The live graph plus the declared entry-point policy, computed ONCE.
 *
 * `harvest()` walks the entire corpus off disk and `buildGateMap()` re-resolves
 * every body; both invariants below read the same result, so recomputing per
 * test would repeat that work for no additional signal.
 *
 * Memoized behind a function rather than a top-level `await` deliberately: a
 * failure inside a top-level await is reported as a module that would not load,
 * which names the file and not the invariant. Here it surfaces as a failing
 * test with a stack.
 */
let cached
function graph() {
  return (cached ??= (async () => {
    const inv = await harvest({ repoRoot: REPO_ROOT })
    // `dependentsOf(name)` — the components with an edge INTO `name`. buildGateMap
    // has returned it since slice 1, and harvest-components.test.mjs:136 has
    // exercised it as a unit ever since; what it has never done is DRIVE A POLICY
    // CHECK. This file is the first invariant built on it, and it is the whole
    // basis of the inbound-degree question below.
    const { nodes, dependentsOf } = buildGateMap(inv)
    const policy = await readPolicy()
    return {
      nodes,
      dependentsOf,
      entryPoints: declaredEntryPoints(policy.entryPoints),
      catalogOnly: declaredCatalogOnly(policy.catalogOnly),
    }
  })())
}

// Keys starting with `$` are documentation, not data. `entryPoints` carries a
// `$comment` at the BLOCK level and another inside EVERY group, so both nesting
// levels must be filtered — miss the inner one and `$comment` is read as a
// declared component name, which would silently exempt nothing and pass. Same
// predicate as reference-integrity.test.mjs and skill-surface.test.mjs.
const isMeta = k => k.startsWith('$')

/**
 * Declared entry-point name -> the group that declares it (`harnessInvoked` /
 * `userInvoked`). The group is carried purely so a failure message can point a
 * reader at the right block of the policy file.
 *
 * The REASON strings are not read here. Their presence and non-emptiness is the
 * schema check's job (skill-surface.test.mjs) — the same split the `references`
 * block already uses. Do not re-validate them here; one owner per rule.
 */
function declaredEntryPoints(block) {
  const out = new Map()
  for (const [group, entries] of Object.entries(block ?? {})) {
    if (isMeta(group)) continue
    for (const name of Object.keys(entries ?? {})) {
      if (isMeta(name)) continue
      out.set(name, group)
    }
  }
  return out
}

/**
 * Declared catalog-only name -> reason. Flat, unlike entryPoints: there is
 * exactly one exemption class here ("no docs/explanation/ doc describes
 * this"), not several invocation sources to group by, so entries sit
 * directly under the block rather than inside named groups. `$comment` is
 * still filtered at this one level via `isMeta`, same as every other block.
 *
 * The reason strings are not read here, mirroring declaredEntryPoints: this
 * file checks coverage, not reason quality. Unlike entryPoints, no schema
 * check for reason non-emptiness exists yet for this block -- the policy
 * file's own $comment notes the gap rather than claiming a check that isn't
 * there.
 */
function declaredCatalogOnly(block) {
  const out = new Map()
  for (const [name, reason] of Object.entries(block ?? {})) {
    if (isMeta(name)) continue
    out.set(name, reason)
  }
  return out
}

// ---------------------------------------------------------------------------
// INBOUND DEGREE — every node has at least one citer, or is a declared entry
// point. Asserted in BOTH directions.
//
// A node nothing cites is either a DEFECT (something should dispatch or cite it
// and doesn't — a component the workflow believes it has wired up) or an ENTRY
// POINT BY DESIGN (a hook the harness fires, a skill the user types). The graph
// cannot tell those apart, so the policy declares the second set by name with a
// reason.
//
// The forward direction alone is not enough. A declaration list that is only
// ever appended to becomes a hiding place: wire up a citation to a declared
// entry point and the exemption silently outlives the fact it described, with
// nothing to notice. The reverse direction — every declared name must STILL
// have zero inbound edges — is what keeps the block a declaration. It is the
// same requirement slice 1 put on the `references` reason strings, applied to
// the other half of the same file.
//
// LIMITATION — this is LOCAL IN-DEGREE, not transitive reachability, and the
// two are not the same property. A cluster of components citing only each other
// with no path in from any entry point has in-degree >= 1 throughout and passes
// silently. The risk is not theoretical: reciprocal citation is common in this
// corpus (`install-vetting` <-> `vet-security` is one of many), so an island
// needs only such a pair to lose its last inbound edge from outside. Measured
// 2026-08-11: none exists — a BFS from (declared entry points ∪ zero-in-degree
// nodes) reaches all 79 of 79 nodes.
//
// A true traversal is the stronger invariant and is DELIBERATELY deferred, not
// overlooked. `entryPoints` is keyed to in-degree semantics — its entries ARE
// the zero-in-degree set — and the staleness assertion below is inherently an
// in-degree property, so upgrading only the forward direction would leave the
// two halves asserting different things about one policy block. Redefining a
// declared entry point from "nothing cites it" to "root of a reachable region"
// is a plan change, not a review fix. A future traversal wants `dependenciesOf`
// or the raw `edges` list; buildGateMap returns both and this file uses neither.
// ---------------------------------------------------------------------------

test('every node with no inbound edge is a declared entry point', async () => {
  const { nodes, dependentsOf, entryPoints } = await graph()

  const undeclared = nodes
    .filter(n => dependentsOf(n.name).length === 0)
    .filter(n => !entryPoints.has(n.name))
    // `type name (file)` — a failure that names its own cause and can be opened.
    .map(n => `${n.type} ${n.name} (${n.file})`)

  assert.deepEqual(
    undeclared, [],
    `${undeclared.length} node(s) with no inbound edge and no entryPoints declaration:\n`
      + `${undeclared.map(s => `    ${s}`).join('\n')}\n`
      + '  Each is either a DEFECT — something should reach it, so wire up a citation in a\n'
      + '  shape the extractor reads — or an ENTRY POINT BY DESIGN, in which case declare it\n'
      + '  under entryPoints in docs/reference/skill-surface-policy.json with a reason.',
  )
})

test('every declared entry point still has zero inbound edges', async () => {
  const { nodes, dependentsOf, entryPoints } = await graph()
  const known = new Set(nodes.map(n => n.name))

  const stale = []
  for (const [name, group] of entryPoints) {
    // A declaration naming a component that no longer exists is the same class
    // of dead entry, and it is INVISIBLE to the inbound-degree check below —
    // a nonexistent name trivially has zero inbound edges and would pass.
    if (!known.has(name)) {
      stale.push(`${name} (${group}) is declared as an entry point but is not a node in the graph`)
      continue
    }
    // Name the edge, not just the node: which component now reaches it is the
    // fact a maintainer needs to decide whether to delete the exemption or fix
    // the citation. `.sort()` so the message does not depend on buildGateMap's
    // internal edge ordering.
    const inbound = dependentsOf(name).sort()
    if (inbound.length > 0) {
      stale.push(`${name} (${group}) is declared as an entry point but is now cited by ${inbound.join(', ')}`)
    }
  }

  assert.deepEqual(
    stale, [],
    `${stale.length} stale entryPoints declaration(s):\n`
      + `${stale.map(s => `    ${s}`).join('\n')}\n`
      + '  A declared entry point that has gained an inbound edge is no longer an entry point —\n'
      + '  delete the declaration. An entryPoints block that is only ever appended to stops\n'
      + '  being a declaration and becomes a hiding place.',
  )
})

// ---------------------------------------------------------------------------
// DOCUMENTATION COVERAGE — every node is named in >= 1 docs/explanation/ doc,
// or is a declared catalog-only exemption with a reason. Implements ADR-0003
// (docs/explanation/adr/0003-generated-inventory-completeness-oracle.md),
// which has been Accepted since the mechanism was a point-in-time audit
// (docs/_coverage-audit.md, written at 76 components). This makes the same
// check re-runnable and blocking instead of a one-off snapshot.
//
// MATCHER — word-boundary, `(?<![\w-])name(?![\w-])`. Re-measured 2026-08-11
// against the 26 committed docs/explanation/**/*.md files: substring -> 1
// uncovered, word-boundary -> 1 uncovered, backticked-span -> 12 uncovered.
// All three agree on the same single gap (`cspell`), so the choice below is
// not about which node it flags -- it is about which matcher stays correct
// as the corpus grows. Substring is the loosest of the three: it also counts
// a name appearing as a fragment of a longer word as coverage, which holds
// for this corpus today but has no fence against a future coincidental
// substring match. Word-boundary sits at the strictness ceiling this corpus
// will bear: a backticked-span matcher is stricter still, and here that is a
// defect, not a virtue -- it misreports 11 genuinely-documented nodes (e.g.
// `filesystem/efficiency`) as uncovered, because this corpus cites rule names
// BY PATH (`` `rules/filesystem/efficiency.md` ``), never as a bare backticked
// span equal to the node name. That is the same basename-vs-path mismatch
// slice 2a fixed in the extractor, resurfacing in a different matcher.
// Node names are escaped before being built into a regex -- an unescaped `/`
// or `.` in a name like `filesystem/efficiency` would silently change the
// match semantics, which is also why the naive backticked matcher above was
// built without escaping and still failed on them for an unrelated reason.
// ---------------------------------------------------------------------------

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Committed state, not the working tree -- same discipline as
// reference-integrity.test.mjs: CI runners are stock ubuntu/windows images
// with no working-tree extras, so a filesystem walk would resolve
// differently there than here.
function committedExplanationDocs() {
  return execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter(p => p.startsWith('docs/explanation/'))
    .sort()
}

async function explanationDocBodies() {
  const files = committedExplanationDocs()
  return Promise.all(files.map(f => readFile(join(REPO_ROOT, f), 'utf8')))
}

// Tested per-file rather than against one concatenated string, so the end of
// one doc can never coincidentally complete a match that starts in another.
function isDocumented(name, bodies) {
  const re = new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`)
  return bodies.some(body => re.test(body))
}

test('every node is documented in docs/explanation/ or declared catalog-only', async () => {
  const { nodes, catalogOnly } = await graph()
  const bodies = await explanationDocBodies()

  const uncovered = nodes
    .filter(n => !catalogOnly.has(n.name))
    .filter(n => !isDocumented(n.name, bodies))
    .map(n => `${n.type} ${n.name} (${n.file})`)

  assert.deepEqual(
    uncovered, [],
    `${uncovered.length} node(s) named in no docs/explanation/ doc and not declared catalog-only:\n`
      + `${uncovered.map(s => `    ${s}`).join('\n')}\n`
      + '  Each is a coverage miss under ADR-0003 -- document it in the most-fitting explainer, or\n'
      + '  record it catalog-only under docs/reference/skill-surface-policy.json with a reason.',
  )
})
