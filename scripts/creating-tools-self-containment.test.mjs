import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, posix } from 'node:path'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIR = 'skills/creating-tools/'

// THE CONSTRAINT. skills/creating-tools/ must survive being copied or zipped on its
// own and still work from a fresh clone. A skill may NAME an outside path it writes
// to; it may not DEPEND on reading one. plans/ and research/ are gitignored, so a
// citation to either is a dangling pointer in any second checkout; docs/ ships, but a
// skill that needs it to operate is not self-contained.
//
// Every entry is keyed by the exact backticked span and valued by the REASON it is
// not a read dependency. Kept here rather than in skill-surface-policy.json: that file
// is parsed as one document by four test files, so a malformed edit anywhere fails all
// four (see its own $comment). This gate does not need that blast radius.
// Keys are matched as literal prefixes, and come in exactly two shapes:
//
//   1. TEMPLATE keys, which must end in a placeholder segment (`<name>`, `<event>`) and never a
//      bare directory prefix. `skills/` alone would also exempt a concrete read-citation to a
//      sibling skill (`skills/writing-plans/SKILL.md`) — exactly the dependency this gate exists
//      to catch — so a template exemption must be narrow enough that only a template path passes.
//   2. CONCRETE single-file REGISTRATION TARGETS, named in full. These are files the author
//      EDITS to register the component they just built, not files the skill reads for guidance.
//      Naming one in full is safe precisely because it is one exact file, so it cannot widen to
//      cover a directory of read-citations the way a bare prefix would.
//
// Do not add a concrete key for anything the skill READS. That is the dependency the gate exists
// to catch, and an exemption is not the remedy — re-authoring the content inside the directory is.
const OUTSIDE_PATH_EXEMPTIONS = {
  'rules/<name>': 'Output path template — where a rule the author is creating gets written.',
  'agents/<name>': 'Output path template — where an agent the author is creating gets written.',
  'skills/<name>': 'Output path template — where a skill the author is creating gets written.',
  '.claude/hooks/<event>': 'Output path template — where a hook the author is creating gets written.',
  '.claude/commands/<name>': 'Output path template — the legacy command location, named only to explain that a command IS a skill.',
  '.claude/skills/<name>': 'Output path template — the user-level skill location, paired with the line above.',
  '<workspace>': 'Output path template — the scratch directory the evaluation suites write runs, gradings and benchmarks into. Every span under it is a file the tooling CREATES, never one the skill reads. Safe as a leading placeholder even though the template rule above asks for a trailing one: nothing concrete can begin with `<workspace>`, so unlike a bare directory prefix this key cannot widen to cover a real read-citation.',
  '.claude/settings.json': 'Output path — the single concrete file a new hook must be wired into.',
  'docs/reference/skill-surface-policy.json': 'Output path — the single concrete file a new component\'s entryPoints declaration must be written into. Parallel to the .claude/settings.json entry above: a registration target the author edits, not a guidance file the skill reads.',
}

// TARGET-STATE SURFACE. The gate scans SKILL.md + references/** — what this directory
// consists of once Task 8 lands. The three legacy companions below are deleted there; until
// then they are excluded, because a gate that cannot go green guards nothing.
//
// This is a TIME-BOXED list, not an exemption tier. The staleness test below fails once a
// listed file stops existing, so Task 8 must empty this list in the same commit that deletes
// them — and when it is empty, "SKILL.md + references/**" and "the whole directory" are the
// same set, which is the end state this gate is really asserting.
//
// EMPTIED 2026-08-14, in the same commit that deleted the three legacy companions it named.
// The bridge is closed: "SKILL.md + references/**" and "the whole directory" are now the same
// set, which is the end state this gate was always asserting toward. The empty map and this
// comment are kept deliberately — they are the record that the narrowing was time-boxed and
// that it actually expired, which a deleted declaration would not preserve.
const PENDING_DELETION = {}

// THE GIT INDEX — staged state, not the working tree and not HEAD. The distinction matters
// in both directions and is load-bearing twice in this epic: a file deleted with `git rm` is
// gone from the scan immediately (which is how Task 8 avoids issue #213), and a file merely
// written to disk is INVISIBLE until it is staged (which is why Tasks 3-7 stage the new
// reference file before running the suite — otherwise the gate would not see the very file
// it was placed early to guard). CI checks out the repo with no gitignored scratch files, so
// indexing off git rather than the filesystem also keeps this check agreeing with CI.
function stagedSkillFiles() {
  return execFileSync('git', ['ls-files', '-z', SKILL_DIR], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\0').filter(Boolean).sort()
}

// Backticked spans that look like a file path: at least one "/" or a known extension.
//
// The character class ADMITS `<` and `>` deliberately. Without them a placeholder span like
// `rules/<name>.md` does not match at all, so it passes the gate by being INVISIBLE rather
// than by being exempt — which would make six of the seven OUTSIDE_PATH_EXEMPTIONS entries
// inert decoration whose stated reasons describe behavior that never happens. Seeing the span
// and then exempting it is what makes the exemption list a real, diffable declaration.
const PATH_SPAN = /`([A-Za-z0-9_.<][A-Za-z0-9_.<>/-]*\.(?:md|json|mjs|js|dot|sh|ya?ml))`/g

test('every path skills/creating-tools/ reads resolves inside its own directory', async () => {
  const violations = []
  for (const file of stagedSkillFiles()) {
    if (!file.endsWith('.md')) continue
    if (file in PENDING_DELETION) continue
    const src = await readFile(join(REPO_ROOT, file), 'utf8')
    src.split('\n').forEach((text, i) => {
      for (const m of text.matchAll(PATH_SPAN)) {
        const p = m[1]
        // Explicitly relative — resolve against the CITING FILE's directory, which is the
        // only reading that survives the directory being copied somewhere else. A `../`
        // that climbs out of SKILL_DIR is a real escape and is reported as one.
        if (p.startsWith('./') || p.startsWith('../')) {
          const resolved = posix.normalize(posix.join(posix.dirname(file), p))
          if (resolved.startsWith(SKILL_DIR)) continue
          violations.push(`${file}:${i + 1}  \`${p}\` — relative path escapes the directory (resolves to ${resolved})`)
          continue
        }
        // Sibling directories of SKILL.md. THE CONVENTION: a path naming something inside this
        // skill is written relative to the SKILL ROOT, from anywhere in the directory — so
        // `scripts/run_loop.py` means the same thing whether SKILL.md or a references/ file
        // wrote it. Only these three prefixes exist, so the allowance cannot widen; a fourth
        // directory means adding it here deliberately. (Resolving these against the citing
        // file's own directory instead was rejected: `rules/<name>.md` would then resolve to
        // an imaginary skills/creating-tools/rules/ and pass as "inside", turning a genuine
        // outside-path escape into a silent allow — the exact failure this gate exists to stop.)
        if (!p.includes('/')
          || p.startsWith('references/')
          || p.startsWith('scripts/')
          || p.startsWith('assets/')) continue
        // A self-reference written from the REPO ROOT is the trap this gate used to whitelist:
        // `skills/creating-tools/SKILL.md` resolves only while the directory keeps that exact
        // path, so it breaks the moment the directory is copied or zipped on its own — the one
        // thing this gate exists to guarantee. Prefix-matching SKILL_DIR made it structurally
        // invisible: the span looked "inside" because its text started with the directory name.
        // The relative form (`../SKILL.md`) survives the copy, so absolute self-reference is a
        // violation with a fix, not an exemption.
        if (p.startsWith(SKILL_DIR)) {
          violations.push(`${file}:${i + 1}  \`${p}\` — repo-root path to its own directory; use a path relative to this file instead`)
          continue
        }
        const exempt = Object.keys(OUTSIDE_PATH_EXEMPTIONS).some(k => p.startsWith(k))
        if (exempt) continue
        violations.push(`${file}:${i + 1}  \`${p}\``)
      }
    })
  }
  assert.deepEqual(
    violations, [],
    `${violations.length} outside-directory path reference(s) in ${SKILL_DIR}:\n`
      + `${violations.map(v => `    ${v}`).join('\n')}\n`
      + '  The skill must survive being copied out of this repo. Either drop the reference,\n'
      + '  re-author the content inside the skill directory, or — if it is an OUTPUT path the\n'
      + '  skill writes to rather than reads — declare it in OUTSIDE_PATH_EXEMPTIONS with a reason.',
  )
})

test('every declared exemption carries a non-empty reason', async () => {
  for (const [k, reason] of Object.entries({ ...OUTSIDE_PATH_EXEMPTIONS, ...PENDING_DELETION })) {
    assert.equal(typeof reason, 'string', `${k} reason must be a string`)
    assert.ok(reason.trim().length > 0,
      `${k} requires a reason — an exemption without one is a hiding place`)
  }
})

// The forcing function. PENDING_DELETION is a bridge across Tasks 2-7, not a permanent tier:
// the moment Task 8 deletes one of these files, its entry is stale and this fails. That is
// what stops the narrowed scan scope from quietly becoming permanent.
test('no PENDING_DELETION entry names a file that is already gone', async () => {
  const committed = new Set(stagedSkillFiles())
  const stale = Object.keys(PENDING_DELETION).filter(f => !committed.has(f)).sort()
  assert.deepEqual(
    stale, [],
    `${stale.length} PENDING_DELETION entr(ies) name a file that no longer exists:\n`
      + `${stale.map(s => `    ${s}`).join('\n')}\n`
      + '  The file is gone, so the exclusion is dead weight and the scan is now narrower than\n'
      + '  it needs to be. Delete the entry in the same commit that deleted the file. When this\n'
      + '  list is empty, the scanned set IS the whole directory and the bridge is complete.',
  )
})
