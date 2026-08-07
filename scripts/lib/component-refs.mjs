// Citation tokenizer. One definition of "what a citation is", shared by two consumers:
//
//   buildGateMap()               -> resolved names become gate-map edges
//   reference-integrity.test.mjs -> unresolved names become blocking failures
//
// Same scan, both answers. Pure: strings and name sets in, tokens out. Corpus
// discovery, policy loading and exemptions belong to the callers, which is what
// lets the two consumers read DIFFERENT corpora without importing each other's
// concerns (the edge consumer reads component bodies; the gate reads every
// committed *.md under skills/, agents/ and rules/).

// A backtick span. `[^`\n]+` keeps spans on one line, which also means a bare
// ```fence opener yields nothing (its backticks are adjacent, and `+` needs >=1
// non-backtick character between them).
const BACKTICK = /`([^`\n]+)`/g

// A structured invocation slot. Mirrors the legacy edge regex deliberately:
// no \b prefix, no whitespace permitted before the colon, and an OPTIONAL
// opening quote with no closing quote required. The captured run stops at a
// quote or a structural delimiter, so `skill: "x", args:` yields `x`.
//
// The character class is intentionally permissive — it must capture a MALFORMED
// value like `<code-reviewer agent>` verbatim, because that is exactly the case
// the gate exists to flag. Narrowing it to [A-Za-z0-9_/-] would make the defect
// invisible by construction.
// NOTE: `[ \t]*` where the legacy regex has `\s*`. This is a DELIBERATE narrowing:
// `\s` includes newlines, so the legacy form would match a slot whose value sits
// on the next line. No such occurrence exists in the corpus, and a line-scoped
// token keeps the gate's line numbers honest. If a multi-line slot ever appears,
// the Task 2 equivalence test fails and names the component — widen it then.
const SLOT = /(?:skill|subagent_type):[ \t]*['"`]?([^\n'"`,}\]]*)/g

// A QUOTED invocation slot: skill: "x" / subagent_type: 'x'. Quoting is what
// separates a structured invocation from prose that merely contains the word.
// Measured over this corpus, that one distinction is the difference between 2
// findings (both genuine) and 5 (three of them prose: `subagent_type: calls,
// verify...`, `skill: path, jira-key,...`, `skill: skills/debugging/...`).
// The gate reads THIS token; the edge consumer reads the permissive SLOT above,
// because that is what the legacy regex matched and equivalence must hold.
const QSLOT = /(?:skill|subagent_type):[ \t]*(['"`])([^\n'"`]*)\1/g

// A namespaced reference, anywhere in the text, backticked or bare. Requiring a
// name AFTER the colon is what makes `superpowers:` (the prefix named as a
// counter-example in writing-plans/SKILL.md) a non-token for free.
const NSREF = /\b([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)\b/g

// Angle-bracket placeholder syntax (`<agent-name>`, `<code-reviewer agent>`).
// A universally understood docs convention for "substitute your value here", so
// it is undecidable rather than dead. Excluding it is not a hiding place; the
// one real defect wearing this shape is fixed by hand in Task 7.
const PLACEHOLDER = /^<.*>$/

export function isPlaceholder(s) {
  return PLACEHOLDER.test(s)
}

function lineAt(src, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (src.charCodeAt(i) === 10) line++
  return line
}

/**
 * Tokenize source text into citation candidates.
 * Returns [{ kind: 'backtick'|'slot'|'qslot'|'nsref', value, line, ns?, name? }].
 * Order is by kind then by position — deterministic, so callers can rely on it.
 */
export function tokenize(src) {
  const out = []
  for (const m of src.matchAll(BACKTICK)) {
    out.push({ kind: 'backtick', value: m[1], line: lineAt(src, m.index) })
  }
  for (const m of src.matchAll(SLOT)) {
    const value = m[1].trim()
    if (value) out.push({ kind: 'slot', value, line: lineAt(src, m.index) })
  }
  for (const m of src.matchAll(QSLOT)) {
    const value = m[2].trim()
    if (value) out.push({ kind: 'qslot', value, line: lineAt(src, m.index) })
  }
  for (const m of src.matchAll(NSREF)) {
    out.push({ kind: 'nsref', value: m[0], ns: m[1], name: m[2], line: lineAt(src, m.index) })
  }
  return out
}

/**
 * Legacy backtick alternative: `\`NAME\`` matched only when the span content was
 * the target exactly. Membership test reproduces that precisely.
 */
export function backtickEdgeName(value, nameSet) {
  return nameSet.has(value) ? value : null
}

/**
 * Legacy slot alternative: `(?:skill|subagent_type):\s*['"\`]?TARGET(?![\w-])`.
 *
 * The trailing `(?![\w-])` means the target had to be a PREFIX of the slot value
 * terminated by a non-name character — which is why `install-vetting.divergence`
 * edged to `install-vetting` while `install-vettingx` did not. Reproducing that
 * as an explicit prefix walk is exact, and it is also why `sortedNames` must be
 * longest-first: `install-vetting-advisory` has to win over `install-vetting`.
 */
export function slotEdgeName(value, sortedNames) {
  for (const n of sortedNames) {
    if (!value.startsWith(n)) continue
    const next = value.charAt(n.length)
    if (next === '' || !/[\w-]/.test(next)) return n
  }
  return null
}

/**
 * All names a body cites, as the edge consumer resolves them.
 * `self` is excluded to preserve the existing no-self-edges guarantee.
 */
export function resolvedNames(body, sortedNames, self) {
  const nameSet = new Set(sortedNames)
  const found = new Set()
  for (const t of tokenize(body)) {
    const hit = t.kind === 'backtick' ? backtickEdgeName(t.value, nameSet)
      : t.kind === 'slot' ? slotEdgeName(t.value, sortedNames)
      : null
    if (hit && hit !== self) found.add(hit)
  }
  return found
}
