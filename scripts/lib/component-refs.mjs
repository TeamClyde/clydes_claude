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

// Real containers a path-form citation can be rooted at. Used by the guard
// inside pathEdgeName below — see that function's comment for why this is
// a "was the candidate found under a real container" test, not a ".claude"
// prefix rejection.
const CONTAINERS = new Set(['rules', 'skills', 'agents'])

/**
 * Path form: `rules/<n>.md`, `skills/<n>/` (or `skills/<n>/SKILL.md`),
 * `agents/<n>.md`, a bare `<base>.mjs` hook script, or a bare `/<n>`
 * slash-command reference — substring-matched rather than whole-span like
 * backtickEdgeName. resolvedNames() hands rules only NAMES, no node type,
 * so this cannot ask "is <n> a rule?" and build `rules/<n>.md` per node —
 * it has to go the other way: strip the citation down to a candidate name,
 * then test membership.
 *
 * Guarded to true path shapes only: a "/" somewhere in the value, or a bare
 * `.mjs` (hooks are the only node type cited without a directory prefix in
 * this corpus, so a bare `.mjs` is unambiguous). A bare `<name>.md` with no
 * directory is deliberately NOT accepted here — `rules/integration-test-
 * constraints.md` is a path citation, but the bare `integration-test-
 * constraints.md` seen in the corpus is not; a directory-less ".md" is
 * common enough (README.md, journal.md, ...) that treating every bare
 * "*.md" span as a path would risk resolving unrelated doc filenames. That
 * shape belongs to suffixedEdgeName below, which requires a known head.
 *
 * Takes a Set, not sortedNames: unlike suffixedEdgeName there is no
 * head-prefix ambiguity to resolve against the name list — the ambiguity
 * here is entirely on the TOKEN side (how many leading path segments are
 * category prefix vs. part of the name), which is why the walk below tries
 * the longest candidate (fewest segments dropped) first:
 * `rules/filesystem/path-portability.md` must resolve to
 * `filesystem/path-portability`, not fail because `path-portability` alone
 * isn't a node.
 *
 * CONTAINER GUARD — read this before "fixing" it. Measured against the full
 * corpus, the segment-suffix walk alone over-resolves: `.claude/integration-
 * test-constraints.md` (a repo-level CONFIG file) matches the substring
 * "integration-test-constraints", which is also a real RULE living at
 * `rules/integration-test-constraints.md`. Same basename, two different
 * files — a false positive.
 *
 * The trap is reaching for a ".claude" prefix rejection to fix it. That
 * breaks a REQUIRED row: `.claude/hooks/preToolUse/subagent-prefix-
 * prepend.mjs` also starts with ".claude" and must still resolve. The
 * actual discriminator is not what the span starts with, it's whether the
 * matched candidate sits directly under a real container:
 *   - `.mjs` spans skip this check entirely. Hooks are the only `.mjs` node
 *     type, and they're legitimately cited from several roots
 *     (`.claude/hooks/<event>/`, `sessionStart/`, or bare) — there is no
 *     analogous "hook config file that isn't a hook" collision to guard
 *     against, so gating `.mjs` the same way would only cost real rows.
 *   - `.md` and extensionless spans resolve only when the segment
 *     immediately before the match is `rules`, `skills`, or `agents`
 *     (the walk found the name right under a real component directory), OR
 *     the match starts the span at i===0 (the bare `/<n>` slash-command
 *     form, e.g. `/doc-backfill` — there's no preceding segment to check,
 *     and the leading "/" is itself the citation marker).
 * Verified against the full corpus with this guard: 55 new pairs (up from
 * the 44-row expected-diff baseline), all 44 original rows retained, 0
 * `.claude/*.md` basename-collision leaks.
 */
export function pathEdgeName(value, nameSet) {
  if (!value.includes('/') && !/\.mjs$/.test(value)) return null
  const isMjs = /\.mjs$/.test(value)
  const stripped = value.replace(/\.(md|mjs)$/, '')
  const segments = stripped.split('/').filter(Boolean)
  // The "SKILL" filename segment is never itself a node name (see the
  // scanSkills() note in harvest-components.mjs) — drop it before walking,
  // but only when it isn't the ONLY segment, which would leave nothing to
  // match against.
  if (segments.length > 1 && segments[segments.length - 1].toLowerCase() === 'skill') {
    segments.pop()
  }
  for (let i = 0; i < segments.length; i++) {
    const candidate = segments.slice(i).join('/')
    if (!nameSet.has(candidate)) continue
    if (isMjs || i === 0 || CONTAINERS.has(segments[i - 1])) return candidate
    // Matched a real node's basename, but not under a real container and
    // not at the start of the span — the .claude/*.md collision case.
    // Reject outright rather than falling back to a shorter substring: a
    // weaker sub-match is not a stronger signal than the one just rejected.
    return null
  }
  return null
}

/**
 * Colon form: `<n>:<mode>` — a namespaced dispatch cited without a
 * surrounding namespace, e.g. `plan-management:divergence`. Split on the
 * FIRST colon (mirrors NSREF's `\b(ns):(name)\b` shape) and test the head
 * for membership. A Set is enough — the split point is unambiguous (first
 * colon), so there's no prefix-length ambiguity to resolve the way
 * slotEdgeName/suffixedEdgeName need sortedNames for.
 *
 * Requires a non-empty tail after the colon: `superpowers:` (a real corpus
 * line — see NSREF's comment above) must stay a non-token, for the same
 * reason NSREF itself requires a name after the colon.
 */
export function colonEdgeName(value, nameSet) {
  const i = value.indexOf(':')
  if (i <= 0 || i === value.length - 1) return null
  const head = value.slice(0, i)
  return nameSet.has(head) ? head : null
}

/**
 * Suffixed form: NAME immediately followed by a structural separator and a
 * trailing token, e.g. `integration-test-constraints.md` (the bare-filename
 * case pathEdgeName deliberately declines — see its comment above).
 * Head-prefix ambiguity is real here (`install-vetting-advisory.md` vs.
 * `install-vetting.md`), so this takes sortedNames longest-first and
 * prefix-walks it, exactly like slotEdgeName.
 *
 * Separator set is narrower than the architecture blueprint's original
 * nominal `[\s.#§]` class: whitespace is EXCLUDED, and the blueprint's rule
 * table has since been corrected to `[.#§]` to match. This isn't a
 * theoretical call — it was measured against the full corpus: permitting
 * `\s` resolves 12 additional spans, and every single one is prose or
 * console-output text (`"architect skipped"`, `"git-manager clean-gone"`,
 * `"plan-management repoint"`, `"docs-architect dropped section(s) …"`),
 * zero of them true citations. None of the 44 baseline target rows need
 * whitespace either (row 44, the only suffixed row, uses `.`). Do not
 * "restore" `\s` here — the corpus measurement is why it's gone, not an
 * oversight. `.`, `#`, `§` are structural marks that don't open an English
 * sentence right after a name, so they stay.
 */
export function suffixedEdgeName(value, sortedNames) {
  for (const n of sortedNames) {
    if (!value.startsWith(n)) continue
    const sep = value.charAt(n.length)
    if (sep && /[.#§]/.test(sep)) return n
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
