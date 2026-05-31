# Secrets Handling — Credentials in Workflow

Never ask the user to paste a secret, token, or password into the chat. A pasted secret enters the transcript and context window — treat it as compromised and rotate it immediately.

## Store-Once Recipe

When a workflow requires a credential, walk the user through this instead:

1. **Create the token** in the provider's UI (GitHub, Bitbucket, AWS console, etc.).
2. **Store it where the assistant cannot see it** — one of:
   - **OS credential manager** — trigger an authenticated operation (e.g. a `git push` or `git fetch` over HTTPS) and enter the credential into the credential manager's own prompt. The secret never passes through the chat.
   - **Permission-restricted `~/.netrc`** — write `machine <host> login <user> password <token>` with `chmod 600 ~/.netrc`. The user edits the file directly; the assistant must not read it back.
   - **Shell environment variable** — add `export TOKEN=...` to the user's shell profile (`.zshrc`, `.bashrc`, etc.). The user adds this line themselves.

## Retrieve at Runtime — Never Echo

When a tool needs a stored credential, read it into a variable inside one self-contained command and use it there — never print it:

```bash
# Good — the credential is captured into a variable and consumed in place;
# nothing is written to stdout. Unset it when done.
cred=$(printf 'protocol=https\nhost=bitbucket.org\n\n' | git credential fill)
# parse username/password from "$cred", build the request, then:
unset cred

# Bad — pipes the secret to the terminal, so it re-enters the transcript:
#   git credential fill <<< $'protocol=https\nhost=bitbucket.org' | grep password
```

Tools must never `echo`, `grep`, or otherwise print a secret to stdout. If a secret appears in command output, it re-enters the assistant's context and must again be treated as compromised.

## Decision Table

| Situation | Correct action |
|-----------|----------------|
| Workflow needs a token | Walk user through store-once recipe above |
| User offers to paste a secret | Decline; redirect to store-once recipe |
| User accidentally pastes a secret | Warn: treat as compromised, rotate immediately |
| Tool needs to verify a credential works | Run an authenticated operation; check exit code, not output |
