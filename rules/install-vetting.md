# Install Vetting — Advisory Pre-Install Funnel

When the workflow (or Claude in-session) is about to install a tool, run `vet-install` first. Never block, never auto-install — the funnel informs and recommends; the user decides every time. Scope: workflow/Claude-initiated installs only, never the user's own terminal.

## 3 Gates (cheap → expensive)

1. **`vet-reputation`** — reputation, quality, maintenance signals
2. **`vet-capability-fit`** — does it solve the problem; which part of it
3. **`vet-security`** — malware/CVE scan of the finalist only

`vet-install` orchestrates all three in order.

## Surface → Scanner Map

| Surface | Reputation | Security |
|---|---|---|
| CLI tools / project deps | deps.dev Scorecard + GitHub | GuardDog + OSV-Scanner |
| MCP servers | GitHub signals | Cisco mcp-scanner |
| IDE / VSCode extensions | Marketplace + GitHub | GuardDog (.vsix) |
| Claude plugins / skills | GitHub signals | Custom heuristics + manual-review flag |
| cargo crates | deps.dev | OSV CVE-only (malware = gap — flag it) |

## Risk Rubric

OpenSSF Scorecard aggregate + injection-relevant sub-checks (Code-Review, Branch-Protection, Dangerous-Workflow, Token-Permissions) + maintenance signals + package age. Stars are a weak tiebreaker only (fake-star caveat applies).

| Tier | Meaning |
|---|---|
| GREEN | Recommend to user |
| YELLOW | Surface caveats — user decides |
| RED | Surface concerns clearly — user decides |

Tiers inform; none block.

## Bootstrap Exception

GuardDog, OSV-Scanner, and Cisco mcp-scanner are a pinned trusted set. Their one-time install is the sanctioned un-vetted bootstrap — do not run the funnel on the scanners themselves.

## Graceful Degradation

Missing scanner → report "couldn't scan with \<tool\>", recommend installing it, continue. Never error the funnel.
