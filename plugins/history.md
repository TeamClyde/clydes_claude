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
