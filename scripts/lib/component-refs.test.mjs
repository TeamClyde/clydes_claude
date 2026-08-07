import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenize, backtickEdgeName, slotEdgeName, isPlaceholder } from './component-refs.mjs'

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
