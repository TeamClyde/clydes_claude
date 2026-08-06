# Plugin History

Chronological log of significant lifecycle events for tracked plugins. Update this file when:
- Installing a new plugin for the first time
- Upgrading a pinned version (record old SHA → new SHA)
- Transitioning lifecycle state (e.g. Active → Integrated)
- Deprecating or removing a plugin

This is the audit trail. `registry.md` is the current-state snapshot.

---

| Date | Plugin | Event | From | To | Notes |
|------|--------|-------|------|----|-------|
| 2026-04-20 | skill-creator | installed | — | Active | Initial install via setup.sh |
| 2026-04-20 | plugin-dev | installed | — | Integrated | Initial install; immediately orchestrated via creating-tools |
| 2026-04-20 | superpowers | installed | — | Active | Initial install via setup.sh |
| 2026-04-20 | skill-creator | state transition | Active | Integrated | Routed through writing-skills eval phase; direct invocation suppressed |
| 2026-04-20 | superpowers | state transition | Active | Integrated | Local skills fully supersede all plugin skills |
| 2026-04-20 | superpowers | removed | Integrated | Removed | Full supersession confirmed; setup.sh now enforces uninstall |
| 2026-08-06 | marketing-skills | scope correction | user | project | Was user-scoped despite registry claiming project since 06-18: 47 skills, ~12,006 always-on tokens in every session in every repo — 74% of all plugin cost here |
| 2026-08-06 | skill-creator | removed | Integrated | Removed | Coherence, not budget (~112 tokens). Registry said Integrated, `plugin-lifecycle.md` said Active; three tools audited skill quality and none owned the boundary |
| 2026-08-06 | context7 | stray record purged | local+user | user | Duplicate local-scope record in template-image-generator. Registry claimed purged 06-18; it was not — the case-sensitive `projectPath` compare defeated it |
| 2026-08-06 | security-guidance | stray record purged | local+user | user | Same duplicate + same false 06-18 purge claim as context7 |
| 2026-08-06 | plugin-dev | removed | Integrated | Removed | ~2,349 tokens plus an always-on suppression rule. All 8 skills read before grading: 7 dead/obsolete/inapplicable, and `hook-development` — the only live one — stale and wrong about the settings.json wiring format. Replaced by `skills/creating-tools/hooks-reference.md` |
| 2026-08-06 | — | policy | — | — | `docs/reference/skill-surface-policy.json` + `scripts/skill-surface.test.mjs` added: the installed set is now a declared surface enforced by `npm test`, so a removal that silently regresses fails a test instead of going unnoticed |
