import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tokenize, backtickEdgeName, slotEdgeName, isPlaceholder,
  pathEdgeName, colonEdgeName, suffixedEdgeName, resolvedNames,
} from './component-refs.mjs'

// Real node names from docs/reference/gate-map.json (verified present at time
// of writing), longest-first where a rule needs prefix-walking. Grounding
// fixtures in real names — rather than inventing them — is what the plan
// asks for; it also means these tests double as a canary if a cited node is
// ever renamed or removed.
const REAL_NAMES = [
  'plan-management', 'doc-tools', 'doc-backfill', 'filesystem/path-portability',
  'stack-hat-directive', 'agent-model-pinning', 'subagent-prefix-prepend',
  'architect', 'integration-test-constraints', 'feedback', 'handoff',
  'git-manager', 'plan-gate', 'test-driven-development',
  'install-vetting', 'install-vetting-advisory',
  'infra-init', 'ai-tool-security-reviewer',
]
const REAL_NAME_SET = new Set(REAL_NAMES)
const REAL_NAMES_SORTED = [...REAL_NAMES].sort((a, b) => b.length - a.length)

const kinds = (src, kind) => tokenize(src).filter(t => t.kind === kind).map(t => t.value)

test('backtick tokens capture the whole span content', () => {
  assert.deepEqual(kinds('see `git-manager` and `plan-gate`', 'backtick'), ['git-manager', 'plan-gate'])
})

test('backtick spans do not cross newlines', () => {
  assert.deepEqual(kinds('a `open\nclose` b', 'backtick'), [])
})

test('an empty backtick pair is not a token', () => {
  // ```mermaid fence openers must not produce phantom tokens
  assert.deepEqual(kinds('```mermaid', 'backtick'), [])
})

test('slot tokens capture the value after an optional opening quote', () => {
  assert.deepEqual(kinds('Skill { skill: "plan-management", args: "x" }', 'slot'), ['plan-management'])
  assert.deepEqual(kinds('subagent_type: architect', 'slot'), ['architect'])
  assert.deepEqual(kinds("subagent_type: 'test-builder'", 'slot'), ['test-builder'])
})

test('qslot tokens require quoting — prose containing the word is not a dispatch', () => {
  assert.deepEqual(kinds('subagent_type: "spec-reviewer",', 'qslot'), ['spec-reviewer'])
  // All three of these are real corpus lines that a permissive slot rule flags:
  assert.deepEqual(kinds('For agent names in subagent_type: calls, verify an agent', 'qslot'), [])
  assert.deepEqual(kinds('Invoke plan-management skill: path, jira-key, status: completed', 'qslot'), [])
  assert.deepEqual(kinds('1. Load skill: skills/debugging/systematic-debugging', 'qslot'), [])
})

test('qslot does not run past the closing quote into trailing prose', () => {
  // `subagent_type: architect) — Step 1: ...` has no closing delimiter before the
  // newline; the permissive SLOT swallows the rest of the line, qslot ignores it.
  const src = '`architect` agent (subagent_type: architect) — Step 1: 4-lens panel'
  assert.deepEqual(kinds(src, 'qslot'), [])
})

test('isPlaceholder recognises angle-bracket template syntax', () => {
  assert.equal(isPlaceholder('<agent-name>'), true)
  assert.equal(isPlaceholder('<code-reviewer agent>'), true)
  assert.equal(isPlaceholder('spec-reviewer'), false)
})

test('nsref tokens match ns:name anywhere, backticked or bare', () => {
  assert.deepEqual(kinds('You MUST understand superpowers:test-driven-development first', 'nsref'),
    ['superpowers:test-driven-development'])
  assert.deepEqual(kinds('`superpowers:code-reviewer`', 'nsref'), ['superpowers:code-reviewer'])
})

test('a bare namespace prefix with no name after it is NOT an nsref', () => {
  // skills/writing-plans/SKILL.md:236 says "Do NOT use the `superpowers:` prefix".
  // Requiring ns:name excludes this for free — the correct behaviour, asserted.
  assert.deepEqual(kinds('Do NOT use the `superpowers:` prefix', 'nsref'), [])
})

test('nsref exposes namespace and name parts', () => {
  const [t] = tokenize('superpowers:test-driven-development').filter(t => t.kind === 'nsref')
  assert.equal(t.ns, 'superpowers')
  assert.equal(t.name, 'test-driven-development')
})

test('every token carries a line number for reporting', () => {
  const [t] = tokenize('line one\nline two `git-manager`').filter(t => t.kind === 'backtick')
  assert.equal(t.line, 2)
})

test('backtickEdgeName resolves only an exact whole-span name', () => {
  const names = new Set(['test-driven', 'test-driven-development'])
  assert.equal(backtickEdgeName('test-driven-development', names), 'test-driven-development')
  assert.equal(backtickEdgeName('test-driven-development-x', names), null)
})

test('slotEdgeName reproduces the legacy (?![\\w-]) boundary', () => {
  // longest-first, mirroring buildGateMap's `sorted` array
  const names = ['install-vetting-advisory', 'install-vetting']
  assert.equal(slotEdgeName('install-vetting-advisory', names), 'install-vetting-advisory')
  assert.equal(slotEdgeName('install-vetting', names), 'install-vetting')
  // `.` is not [\w-], so the legacy regex accepted this boundary — reproduce it
  assert.equal(slotEdgeName('install-vetting.divergence', names), 'install-vetting')
  // `x` IS [\w-], so the legacy regex rejected it
  assert.equal(slotEdgeName('install-vettingx', names), null)
})

test('an undeclared namespace is not a citation — ordinary prose survives', () => {
  // Every one of these is a real corpus occurrence that an "ns is not a known
  // skill or plugin -> dead" rule reports as a dead reference.
  for (const prose of ['see file:line above', 'import from node:test', 'type:feat',
                       'status:created', 'language:dart', 'justify-content:center']) {
    const [t] = tokenize(prose).filter(t => t.kind === 'nsref')
    assert.ok(t, `${prose} still tokenizes as an nsref`)
    // ...it is the GATE that must ignore it, because `ns` is not declared.
    // Asserted end-to-end against the corpus in reference-integrity.test.mjs.
  }
})

// --- pathEdgeName ------------------------------------------------------

test('pathEdgeName resolves rules/<n>.md', () => {
  // Row 6 of the plan's expected-diff table.
  assert.equal(pathEdgeName('rules/doc-tools.md', REAL_NAME_SET), 'doc-tools')
})

test('pathEdgeName resolves skills/<n>/SKILL.md — the SKILL segment is not a node name', () => {
  // Row 9. Dropping the trailing "SKILL" segment before the suffix walk is
  // what makes this resolve instead of silently missing.
  assert.equal(pathEdgeName('skills/doc-backfill/SKILL.md', REAL_NAME_SET), 'doc-backfill')
})

test('pathEdgeName resolves skills/<n>/ (bare directory form, no SKILL.md)', () => {
  assert.equal(pathEdgeName('skills/doc-backfill/', REAL_NAME_SET), 'doc-backfill')
})

test('pathEdgeName resolves a nested rule name that itself contains a slash', () => {
  // Row 16 — the case a naive basename() implementation drops silently: the
  // real node name is "filesystem/path-portability", two segments, not one.
  assert.equal(pathEdgeName('rules/filesystem/path-portability.md', REAL_NAME_SET), 'filesystem/path-portability')
})

test('pathEdgeName resolves an event-prefixed hook path', () => {
  // Row 17 — sessionStart/ is a hook event directory, not part of the name.
  assert.equal(pathEdgeName('sessionStart/stack-hat-directive.mjs', REAL_NAME_SET), 'stack-hat-directive')
})

test('pathEdgeName resolves a bare hook basename with no directory at all', () => {
  // Row 26 — the one bare-filename case path claims: a bare `.mjs` is
  // unambiguous in this corpus (hooks are the only node type cited without a
  // directory prefix), unlike a bare `.md` — see the next test.
  assert.equal(pathEdgeName('agent-model-pinning.mjs', REAL_NAME_SET), 'agent-model-pinning')
})

test('pathEdgeName declines a bare *.md filename with no directory — that is suffixedEdgeName\'s shape', () => {
  // Row 44's span, "integration-test-constraints.md", has no "/" and is not
  // a ".mjs" — pathEdgeName must return null so the suffixed rule (which
  // requires a known head, guarding the risk this test name implies) is the
  // one that resolves it, not a coincidentally-permissive path rule.
  assert.equal(pathEdgeName('integration-test-constraints.md', REAL_NAME_SET), null)
})

test('pathEdgeName resolves a deeply nested hook path (multiple category segments to strip)', () => {
  // Row 28 — two leading segments (".claude", "hooks") plus the event
  // directory ("preToolUse") all have to be dropped before the basename hits.
  assert.equal(
    pathEdgeName('.claude/hooks/preToolUse/subagent-prefix-prepend.mjs', REAL_NAME_SET),
    'subagent-prefix-prepend',
  )
})

test('pathEdgeName resolves agents/<n>.md', () => {
  // Row 34.
  assert.equal(pathEdgeName('agents/architect.md', REAL_NAME_SET), 'architect')
})

test('pathEdgeName returns null for a path shape whose basename is not a known node', () => {
  assert.equal(pathEdgeName('rules/does-not-exist.md', REAL_NAME_SET), null)
})

test('pathEdgeName does not widen the bare-name shape — "feedback" as a plain word is untouched', () => {
  // No "/" and no ".mjs" suffix: pathEdgeName must decline outright and
  // leave this shape to the existing exact backtickEdgeName rule, unchanged.
  assert.equal(pathEdgeName('feedback', REAL_NAME_SET), null)
})

test('pathEdgeName resolves the bare /<n> slash-command form', () => {
  assert.equal(pathEdgeName('/doc-backfill', REAL_NAME_SET), 'doc-backfill')
  assert.equal(pathEdgeName('/infra-init', REAL_NAME_SET), 'infra-init')
})

test('pathEdgeName resolves an extensionless directory span rooted at a real container', () => {
  assert.equal(pathEdgeName('skills/infra-init', REAL_NAME_SET), 'infra-init')
  assert.equal(pathEdgeName('agents/ai-tool-security-reviewer', REAL_NAME_SET), 'ai-tool-security-reviewer')
})

test('pathEdgeName rejects a .claude/*.md basename collision with an unrelated rule', () => {
  // ".claude/integration-test-constraints.md" is a repo-level CONFIG file.
  // The rule node "integration-test-constraints" lives at
  // "rules/integration-test-constraints.md" — a different file that happens
  // to share a basename. The container guard must catch this: ".claude" is
  // not a real container (rules/skills/agents), and the match isn't at the
  // start of the span, so it must not resolve.
  assert.equal(
    pathEdgeName('.claude/integration-test-constraints.md', REAL_NAME_SET), null,
    '.claude/integration-test-constraints.md is a config file, not the integration-test-constraints RULE — same basename, different file',
  )
})

test('the container-guard discriminator: .mjs bypasses the check, bare .md under .claude/ does not', () => {
  // These two spans BOTH start with ".claude" — proof the guard is not a
  // ".claude" prefix test. The hook .mjs path is a required row and must
  // stay green; the .md basename collision must stay rejected. Asserted
  // adjacently so the discriminator (extension, not prefix) is legible.
  assert.equal(
    pathEdgeName('.claude/hooks/preToolUse/subagent-prefix-prepend.mjs', REAL_NAME_SET),
    'subagent-prefix-prepend',
  )
  assert.equal(pathEdgeName('.claude/integration-test-constraints.md', REAL_NAME_SET), null)
})

test('pathEdgeName rejects a <n>.md span whose parent segment is not a real container', () => {
  // "docs" is not rules/skills/agents — a coincidental basename match under
  // an unrelated directory must not resolve, same shape as the .claude/*.md
  // basename-collision test above but with a synthetic non-".claude" parent
  // to isolate the guard from any ".claude"-specific behavior.
  assert.equal(pathEdgeName('docs/architect.md', REAL_NAME_SET), null)
})

// --- colonEdgeName -------------------------------------------------------

test('colonEdgeName resolves <n>:<mode> when the head is a known node', () => {
  // Row 2.
  assert.equal(colonEdgeName('plan-management:divergence', REAL_NAME_SET), 'plan-management')
})

test('colonEdgeName returns null when the head is not a known node', () => {
  assert.equal(colonEdgeName('totally-unknown-thing:mode', REAL_NAME_SET), null)
})

test('colonEdgeName returns null for a bare namespace prefix with nothing after the colon', () => {
  // Mirrors NSREF's "superpowers:" exclusion — a name-less colon is not a citation.
  assert.equal(colonEdgeName('plan-management:', REAL_NAME_SET), null)
})

test('colonEdgeName does not widen the bare-name shape — "feedback" as a plain word is untouched', () => {
  assert.equal(colonEdgeName('feedback', REAL_NAME_SET), null)
})

// --- suffixedEdgeName ----------------------------------------------------

test('suffixedEdgeName resolves <n> followed by a dot-separated trailing token', () => {
  // Row 44 — the only one of the 44 target rows this rule is needed for.
  assert.equal(suffixedEdgeName('integration-test-constraints.md', REAL_NAMES_SORTED), 'integration-test-constraints')
})

test('suffixedEdgeName returns null when the head is not a known node', () => {
  assert.equal(suffixedEdgeName('not-a-real-node.md', REAL_NAMES_SORTED), null)
})

test('suffixedEdgeName does not widen the bare-name shape — "feedback" as a plain word is untouched', () => {
  // No separator character follows — value ends exactly at the name.
  assert.equal(suffixedEdgeName('feedback', REAL_NAMES_SORTED), null)
})

test('suffixedEdgeName does not manufacture an edge from whitespace-separated prose', () => {
  // The exact danger case called out in the task: a permissive whitespace
  // separator would turn ordinary prose into an edge to the `handoff` node.
  assert.equal(suffixedEdgeName('handoff to the next session', REAL_NAMES_SORTED), null)
})

test('suffixedEdgeName does not manufacture an edge from whitespace-separated prose (synthetic node)', () => {
  // "run" is not an actual node in this repo's gate-map — added to a local
  // fixture set here specifically so this test proves the SEPARATOR guard
  // rejects the match, not merely that "run" happens to be absent from the
  // real name set.
  const names = [...REAL_NAMES_SORTED, 'run']
  assert.equal(suffixedEdgeName('run the harvest', names), null)
})

test('suffixedEdgeName respects longest-first precedence for prefix-ambiguous names', () => {
  // Mirrors slotEdgeName's install-vetting / install-vetting-advisory case.
  assert.equal(suffixedEdgeName('install-vetting-advisory.md', REAL_NAMES_SORTED), 'install-vetting-advisory')
  assert.equal(suffixedEdgeName('install-vetting.md', REAL_NAMES_SORTED), 'install-vetting')
})

// --- resolvedNames regression — unchanged by this task -------------------

test('resolvedNames still excludes self-references (regression: resolvedNames itself is not modified by this task)', () => {
  const names = ['git-manager', 'plan-gate']
  const body = 'See `git-manager` for details, then run `plan-gate`.'
  assert.deepEqual(resolvedNames(body, names, 'git-manager'), new Set(['plan-gate']))
})
