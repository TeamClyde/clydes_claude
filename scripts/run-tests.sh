#!/usr/bin/env bash
# Pre-commit entry point. hooks/pre-commit runs this file only when it exists
# and is executable — without it, that hook's test step silently does nothing.
#
# Deliberately mirrors .github/workflows/ci.yml so that a commit which passes
# locally predicts a passing CI run. Keep the two lists in step.
set -euo pipefail

# --show-toplevel yields a native path on every platform, unlike `pwd -P`, which
# emits an MSYS-style /c/... path under git-bash.
cd "$(git rev-parse --show-toplevel)"

npm test
npm run harvest:check
npm run engine:check
npm run verify:check
npm run recall:check
