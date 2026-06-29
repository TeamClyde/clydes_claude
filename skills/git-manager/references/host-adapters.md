# Host-Adapter Contract

The single abstraction the `finish` workflow uses to open a PR **without naming a host**. `finish` calls the four operations below against whichever adapter `detect_host` selects; it never branches on a host name itself. Adding a host means writing one adapter block here — never editing the `finish` procedure.

---

## Contract — Four Operations

Every adapter answers exactly these four operations. Each has named inputs and a **normalized** return value — the shape downstream steps consume regardless of which host produced it.

### `detect_host(remote_url, project.json git.backend)`

Resolve which host this repo targets.

**Inputs:** the `git remote get-url origin` value; the `project.json` `git.backend` override (may be unset).

**Resolution order:**
1. `project.json` `git.backend` override wins when set (`github` | `bitbucket` | `gitlab` | `manual`). Use it for enterprise hosts (`github.mycompany.com`, Bitbucket Data Center, self-hosted GitLab) where the URL does not match a public host.
2. Otherwise match the remote URL:
   - `github.com` → `github`
   - `bitbucket.org` → `bitbucket`
   - `gitlab.com` → `gitlab`
   - anything else → `manual`

**Returns (normalized):** host id + parsed coordinates —

```
{ host, owner_or_workspace, repo, api_base }
```

`host` is one of the ids above. `owner_or_workspace` is the GitHub owner / Bitbucket workspace / GitLab namespace. `repo` is the repository name with any trailing `.git` stripped. `api_base` is the host's REST root (e.g. `https://api.bitbucket.org/2.0`); empty for hosts driven entirely through a CLI.

### `auth_preflight(host)`

Confirm a usable credential is present **before** attempting the PR.

**Inputs:** the host id from `detect_host`.

**Returns (normalized):** `ok` | `missing-cred`. On `missing-cred`, include a one-line remediation message naming what to install or configure.

### `create_pr(title, body, src_branch, dst_branch)`

Open the pull request.

**Inputs:** rendered PR title, rendered PR body, source branch, destination branch.

**Returns (normalized):** **a PR URL** (string). The `manual` adapter returns the sentinel string `manual submission required` instead of a URL.

### `read_pr(branch)`

Best-effort read of an existing PR for a branch. Used by the merge-strategy divergence detection (Task 14); it must never be load-bearing for opening a PR.

**Inputs:** the source branch.

**Returns (normalized):**

```
{ state, url, merge_method? }
```

`state` is the PR state as the host reports it; `url` is the PR URL. The whole return may be `unavailable` when the host cannot answer.

**`merge_method` is the REPO's configured/allowed merge method** (`squash` / `merge-commit` / `rebase`), read from **repository settings** — NOT a PR's review status. On GitHub it comes from `gh api repos/{owner}/{repo}` (`allow_squash_merge`, `allow_merge_commit`, `allow_rebase_merge`), **not** `gh pr view`. When the host cannot surface it, return `merge_method: unavailable`.

**Two distinct levels of `unavailable`** (a consumer such as Task 14 must handle both):

- **Whole-return `unavailable`** — the operation could not find a PR or the API failed entirely (no `state`/`url`/`merge_method` to report). The return value *is* the bare token `unavailable`, not a struct.
- **Field-level `merge_method: unavailable`** — a PR was found (so `state`/`url` are present) but the repo's allowed merge method could not be resolved (e.g. GitHub allows two+ methods so no single canonical one; or the host doesn't expose merge settings, as with the bitbucket adapter). The struct is returned; only the `merge_method` field is `unavailable`.

Either form means the same thing to Task 14's divergence check: **no actionable merge method → stay silent, never warn.**

---

## Design Rule — Operation-Level, Not Shared Parsing

The contract is **operation-level**, NOT a shared output-parsing layer. `gh` and `glab` diverge on exit codes and JSON shapes, and REST hosts diverge again. So **each adapter parses its own CLI/REST output and returns the normalized value** — the normalization happens inside the adapter, at the boundary. Never assume a uniform JSON schema across hosts, and never factor a common parser out of the adapters; that coupling is exactly what this contract avoids.

---

## Adapters

Each block is self-contained and fills all four operations.

### `github` — transport: `gh` CLI

**`detect_host`:** remote matches `github.com` (or `git.backend: github` override). Parse `owner` and `repo` from the `github.com/<owner>/<repo>.git` or `git@github.com:<owner>/<repo>.git` form, stripping any trailing `.git`. `api_base` is empty — this adapter drives the REST API through `gh api` rather than a raw base URL.

**`auth_preflight`:** verify the CLI is present — `command -v gh` (POSIX) / `Get-Command gh` (PowerShell). If absent, return `missing-cred` and **fall back to `manual`** with the install hint `https://cli.github.com/`. If present, run `gh auth status`; a non-zero exit is `missing-cred` (the user must `gh auth login`).

**`create_pr`:** open the PR, then parse the PR URL from stdout:

```
gh pr create --base <dst> --head <src> --title <title> --body <body>
```

Squash-merge is set repo-side via branch protection (not per-PR), so no merge flag is passed here.

**`read_pr`:** two reads, combined into the normalized return.

1. State + URL:

   ```
   gh pr view <branch> --json state,url
   ```

   If `gh pr view <branch>` matches multiple PRs (a branch reopened, or closed+new), it returns the most recent — acceptable for a best-effort read.

2. Repo's allowed merge methods — from repository settings, **not** `gh pr view` (which only carries PR review state):

   ```
   gh api repos/{owner}/{repo} --jq '{squash:.allow_squash_merge, merge:.allow_merge_commit, rebase:.allow_rebase_merge}'
   ```

   **Collapse rule.** GitHub returns three independent booleans, and the common default allows several. Return `merge_method` only when **exactly one** is allowed (the unambiguous case): `squash` → `squash`, `merge` → `merge-commit`, `rebase` → `rebase`. If two or more are allowed, there is no single canonical method, so return `merge_method: unavailable` — the Task 14 divergence warn then stays silent rather than warning spuriously.

If either read fails (no PR, no API access), return `unavailable` for the parts that could not be read.

### `bitbucket` — transport: REST via `git credential fill` + `curl`

**`detect_host`:** remote matches `bitbucket.org` (or `git.backend: bitbucket` override). Derive `{workspace}` and `{repo}` from the `git remote get-url origin` value — parse the HTTPS form `https://bitbucket.org/<workspace>/<repo>.git` or the SSH form `git@bitbucket.org:<workspace>/<repo>.git`, stripping any trailing `.git`. `api_base` is `https://api.bitbucket.org/2.0`.

**`auth_preflight`:** verify `curl` and a base64 encoder (`openssl` or `base64`) are available. The API token itself is checked inside the `create_pr` REST script via `git credential fill` (step 1 below) — an empty credential there is the real `missing-cred` signal. If `curl` is absent, return `missing-cred` and fall back to `manual`.

**`create_pr`:** create the PR with a single self-contained REST script (one script, so the secret never persists between steps). No MCP. The script:

1. **Retrieve the credential non-interactively** — pipe the host only (no path) into `git credential fill`:
   ```bash
   cred=$(printf 'protocol=https\nhost=bitbucket.org\n\n' | git credential fill)
   user=$(printf '%s\n' "$cred" | sed -n 's/^username=//p')
   pass=$(printf '%s\n' "$cred" | sed -n 's/^password=//p')
   ```
   `user` is the Atlassian account email; `pass` is the API token.
2. **If `user` or `pass` is empty** (no credential helper configured), STOP and tell the user to set up their Bitbucket credential — point them at the `secrets-handling` rule (create an API token, then store it by running an authenticated git operation so the OS credential manager captures it). Do not fall into an interactive prompt.
3. **Validate** that `user` contains `@` — an API token must pair with the Atlassian email, not a legacy Bitbucket username. If not, surface a clear error.
4. **Derive `{workspace}` and `{repo}`** from the `git remote get-url origin` value obtained during backend detection — parse the HTTPS form `https://bitbucket.org/<workspace>/<repo>.git` or the SSH form `git@bitbucket.org:<workspace>/<repo>.git`, stripping any trailing `.git`.
5. **Build the auth header in a shell variable** — never pass the token via `curl -u` or any argv position:
   ```bash
   b64=$(printf '%s:%s' "$user" "$pass" | openssl base64 -A)   # fallback if no openssl: base64 -w0  (or: base64 | tr -d '\n')
   auth="Authorization: Basic $b64"
   ```
   Native-PowerShell variant (if documenting one): `$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${user}:${pass}"))`.
6. **POST the pull request**, passing the header via `-H "$auth"`:
   ```bash
   curl -sS -X POST -H "$auth" -H 'Content-Type: application/json' \
     "https://api.bitbucket.org/2.0/repositories/$workspace/$repo/pullrequests" \
     -d "{\"title\":\"$title\",\"source\":{\"branch\":{\"name\":\"$source_branch\"}},\"destination\":{\"branch\":{\"name\":\"$target_branch\"}},\"description\":\"$description\"}"
   ```
   Print only the resulting PR URL / status — never echo `$pass`, `$b64`, or `$auth`.
7. **On HTTP 401**, advise the user their API token may be invalid or lack pull-request scope.
8. **Unset the secrets** so they do not linger in the shell environment: `unset cred user pass b64 auth`.
   - **Authentication note:** Bitbucket app passwords are being retired — use an API token paired with your Atlassian account email.

Return the PR URL parsed from the `curl` response.

**`read_pr`:** best-effort `GET /2.0/repositories/{workspace}/{repo}/pullrequests?q=source.branch.name="<branch>"` using the same credential-retrieval and `unset` discipline as `create_pr`, returning `{state, url}` from the response. Bitbucket does not expose the repo's allowed merge methods through this contract's reach, so return `merge_method: unavailable`. If the credential is missing or the request fails, return `unavailable`.

### `manual` — no transport

**`detect_host`:** the fallback when no host matches and no override is set; `api_base` empty.

**`auth_preflight`:** always `ok` — there is no credential to check.

**`create_pr`:** emit the rendered title and body for the user to submit via the host's web UI or their own CLI. Returns the sentinel string `manual submission required`.

**`read_pr`:** always `unavailable` — there is no API to query.

---

## Extension Recipe

To add a host (GitLab beyond the bundled adapter, Gitea, Azure DevOps, self-hosted): write one adapter block filling the four operations. No edit to the `finish` procedure is needed.
