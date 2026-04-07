## Repo Testing Plan

### Project Type
[Backend / UI/Client / Hardware / Mixed]

### Test Frameworks
- [framework name, version, config file location]
- How to run: [command]

### Coverage Scope
[What level of coverage is expected — e.g. "all business logic, not framework wiring"]

### Service Boundaries
- Services: [list each service/module that can be tested independently]
- Detection:
    src/auth/ → auth-handler
    src/notifications/ → notification-handler
    src/utils/ → ALL (shared — triggers full suite)
- Full suite trigger: [directories or file patterns that affect multiple services, e.g. src/utils/, src/models/]

### Pre-Commit Hook
- Script: scripts/run-tests.sh
- Scope: [change-aware / always full suite / other]

### Log Map
| System | Log Location | What's Logged | Log Level |
|--------|-------------|---------------|-----------|
| [service] | [location] | [what] | [ERROR/INFO/etc] |
