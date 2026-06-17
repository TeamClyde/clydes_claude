# Install Vetting — Advisory Pre-Install Funnel

When the workflow (or Claude in-session) is about to install a tool, run `vet-install` first. Never block, never auto-install — the funnel informs and recommends; the user decides every time. Scope: workflow/Claude-initiated installs only, never the user's own terminal.

## 3 Gates (cheap → expensive)

1. **`vet-reputation`** — reputation, quality, maintenance signals
2. **`vet-capability-fit`** — does it solve the problem; which part of it
3. **`vet-security`** — malware/CVE scan + (agentic surfaces) a local semantic OWASP review of the finalist

`vet-install` orchestrates all three in order.

## Surface → Tool Map

| Surface | Reputation | Security |
|---|---|---|
| CLI tools / project deps | deps.dev Scorecard + GitHub | OSV-Scanner (CVE + `MAL-` malware) |
| cargo crates | deps.dev | OSV-Scanner (CVE + `MAL-` malware — covered, not a gap) |
| MCP servers | GitHub signals | Cisco mcp-scanner + semantic reviewer |
| Claude plugins / skills | GitHub signals | custom heuristics + semantic reviewer + manual-review flag |
| AI IDE / VSCode extensions | Marketplace + GitHub | unpack `.vsix` → OSV on bundled deps (+ semantic reviewer if an AI extension) |
| AI CLI tools / agents | deps.dev + GitHub | OSV on the package + semantic reviewer |
| OS package managers (winget/choco/brew) | deps.dev / registry + GitHub | reputation-only (Gate 1) — no malware/CVE scanner |

*Gate 2 (vet-capability-fit) has no tool column — it reads the candidate's own docs/README.*

## Two-layer security (Gate 3)

`vet-security` runs two layers:

1. **Deterministic (always)** — surface-selected scanners (OSV for packages/CVE+`MAL-`, Cisco mcp-scanner for MCP, custom heuristics for plugins/skills) + a required pre-scan (hidden-Unicode / encoded-blob / hardcoded-URL / install-time-exec / config-namespace / embedded-NL-prompt). Un-injectable.
2. **Semantic (agentic surfaces only)** — an isolated, least-privilege `agents/ai-tool-security-reviewer` subagent reviews the candidate's static artifacts against OWASP **ASI01–10 / AST01–10** for the natural-language manipulation signatures miss (AST08). It returns an enum-locked verdict; `vet-security` merges it worst-tier.

The semantic verdict is **advisory and never authoritative** — it has a non-zero false-negative floor, never overrides a deterministic RED, and never blocks. Agentic surfaces: MCP servers, Claude plugins/skills, AI IDE extensions, AI CLI tools/agents. Ordinary packages / OS-package-manager installs get the deterministic layer (or reputation) only.

## Risk Rubric

OpenSSF Scorecard aggregate + injection-relevant sub-checks (Code-Review, Branch-Protection, Dangerous-Workflow, Token-Permissions) + maintenance signals + package age. Stars are a weak tiebreaker only (fake-star caveat applies).

| Tier | Meaning |
|---|---|
| GREEN | Recommend — user decides |
| YELLOW | Surface caveats — user decides |
| RED | Surface concerns clearly — user decides |

Tiers inform; none block.

## Bootstrap Exception

OSV-Scanner and Cisco mcp-scanner are a pinned trusted set. Their one-time install is the sanctioned un-vetted bootstrap — do not run the funnel on the scanners themselves.

## Graceful Degradation

Missing scanner → report "couldn't scan with `<tool>`", recommend installing it, continue. Never error the funnel.
