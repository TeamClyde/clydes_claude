<!-- PR title format: type(scope): brief description [PROJ-N]                          -->
<!-- The title maps directly to the squash commit that will land on main.               -->
<!-- Use conventional commit types: feat, fix, refactor, chore, docs, test, perf       -->
<!-- Scope is optional but recommended when the change is clearly bounded to one area.  -->
<!-- Example: feat(notifications): add push routing for anomaly alerts [CLAUDE-42]     -->
feat(scope): brief description [PROJ-N]

## Summary

<!-- 2–3 sentences: what changed and why.                                               -->
<!-- Explain the business reason, not just the implementation.                          -->
<!-- Bad:  "Adds a new handler to the notification router."                             -->
<!-- Good: "Adds push notification routing for anomaly detection events. Previously     -->
<!--        these were only emailed to operators; this enables real-time mobile alerts  -->
<!--        for on-call response."                                                      -->

## Changes

<!-- Bullet list of meaningful changes. Group related changes. Skip trivial or obvious  -->
<!-- ones (e.g. "updated import statements"). Do not copy the commit log — synthesize   -->
<!-- what the diff actually accomplishes for someone reading it cold.                   -->
-

## Testing

<!-- How to verify this works. Be specific: what command to run, what to observe.       -->
<!-- Note which tests were added or updated and what they cover.                        -->
<!-- If no automated tests apply, explain what manual verification was done and why     -->
<!-- automated coverage was not added.                                                  -->
-

## Linked Tickets

<!-- One bullet per Jira ticket referenced by this PR.                                  -->
<!-- Format: - PROJ-N: Ticket summary (copy the ticket title verbatim)                 -->
- PROJ-N: Ticket summary
