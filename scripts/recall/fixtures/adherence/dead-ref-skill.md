---
name: citation-formatter
description: Formats research citations and bibliography entries for doc-author output.
triggers:
  - "format citation"
  - "format bibliography"
  - "run citation-formatter"
---

# Citation Formatter Skill

Formats inline citations and bibliography entries according to the repo's doc conventions.

## Usage

Invoke this skill when `doc-author` produces raw reference links that need formatting:

```
Skill { skill: "citation-formatter", args: "source: <url> style: apa" }
```

## Dependencies

This skill delegates bibliography de-duplication to the `bib-dedup` skill:

```
Skill { skill: "bib-dedup", args: "entries: [...]" }
```

After de-duplication, it passes the cleaned list to `reference-linker` for final anchor
insertion:

```
Skill { skill: "reference-linker", args: "doc: <path> entries: [...]" }
```

## Integration with doc-author

`doc-author` automatically triggers `citation-formatter` at the end of a research
synthesis pass. The handoff is via the `CITATIONS_READY` event emitted by
`dispatching-parallel-agents`.

## Notes

- `bib-dedup` is defined in `skills/bib-dedup/SKILL.md`.
- `reference-linker` is defined in `skills/reference-linker/SKILL.md`.
- Both skills must be installed before `citation-formatter` is usable.
