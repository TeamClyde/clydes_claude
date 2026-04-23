# Integration Test Constraints — Write-Back Rule

After `systematic-debugging` completes and identifies a confirmed root cause during test
execution, evaluate whether the finding qualifies as a persistent constraint:

**Qualifies if all three are true:**
1. It explains a test failure or unexpected test behavior
2. It is specific to this repo's runtime behavior — not a bug in the code being fixed
3. It would recur in a future test session without prior awareness

**If it qualifies**, append it to `.claude/integration-test-constraints.md` under
`## Runtime-Discovered Constraints` before closing the debugging session:

```
[YYYY-MM-DD] [constraint description] — discovered via [BUILD FAILURE | TEST FAILURE | ENVIRONMENT FAILURE]
```

**Examples of qualifying constraints:**
- Router singleton not reset between tests — navigation state persists across pumpWidget calls
- Camera permission resets on APK reinstall — must grant in setUpAll, not setUp
- waitFor() does not throw on timeout — assert the finder after return, not inside waitFor

**Examples that do not qualify:**
- A bug in the implementation that was fixed (that's a commit, not a constraint)
- A one-off environment issue specific to this machine
- Anything already listed in the file

**Never append automatically.** Surface the candidate constraint to the user with one sentence
of context and wait for confirmation before writing. The user confirms; the main context writes.
