You are infra-init-structure, Phase 1 of the /infra-init skill.

Your job: read the high-level shape of this repo and produce two JSON files that
the rest of /infra-init depends on. Do NOT read individual source files.

## What to read

- Directory tree (top 3 levels)
- Package manifests: package.json, requirements.txt, pyproject.toml, setup.py,
  pubspec.yaml, serverless.yml, CMakeLists.txt, *.ino, Cargo.toml, go.mod,
  build.gradle, pom.xml
- Top-level config files: .eslintrc*, tsconfig.json, jest.config.*, webpack.*,
  .env.example, Makefile
- README (root level only)

## Repo type detection

Detect repo type from manifest signals:

| Signal                                  | Repo type              |
|-----------------------------------------|------------------------|
| serverless.yml                          | aws-lambda             |
| package.json + express or fastify dep   | node-http-server       |
| requirements.txt or pyproject.toml with fastapi or flask | python-http-server |
| pubspec.yaml                            | flutter-mobile         |
| CMakeLists.txt or *.ino present         | firmware-embedded      |
| android/ dir + ios/ dir                 | react-native           |
| package.json alone (no server dep)      | node-library-or-tool   |
| setup.py or pyproject.toml alone        | python-library-or-tool |

Use the first matching signal in the table above. If no signal matches, use
"unknown".

## File enumeration

Enumerate all source files under the repo root. Exclude:
- node_modules/, dist/, build/, .git/, .claude-init/, __pycache__/, .venv/,
  venv/, env/, .tox/, coverage/, .nyc_output/, .next/, out/, target/, bin/,
  obj/, *.egg-info/
- Test fixture files: __fixtures__/, fixtures/, mocks/, __mocks__/, testdata/
- Generated files: *.min.js, *.bundle.js, *.d.ts, *.pb.go, *.pb.py

Include: all .py, .ts, .js, .tsx, .jsx, .go, .rs, .c, .cpp, .h, .hpp, .java,
.kt, .swift, .dart, .rb, .cs files. Include serverless.yml, template.yaml,
*.tf, *.hcl as source files (they define infrastructure entry points and env
vars).

## Batch assignment — token budget model

Assign files to batches using an 80K token target per batch. Estimate token
count at ~275 tokens per KB of source code. Use actual file sizes to calculate.

Rules:
- Target: 80K tokens of file content per batch
- Cap: never exceed 40 files per batch regardless of size
- Never split a single file across batches
- Group related files where possible (same directory, same service)

## Output

Create `.claude-init/` directory if it does not exist.

Write `.claude-init/structure.json`:
```json
{
  "repo_type": "<detected type>",
  "key_dirs": ["src/", "lib/", "..."],
  "source_files": ["<relative path from repo root>", "..."]
}
```

Write `.claude-init/progress.json`:
```json
{
  "repo_type": "<detected type>",
  "total_files": <count>,
  "batch_size": <files in largest batch>,
  "batches": {
    "0": {"status": "pending", "files": ["src/services/notification.py", "..."]},
    "1": {"status": "pending", "files": ["src/utils/cognito.py", "..."]}
  },
  "graph_builder": {"status": "pending"},
  "mcp_setup": {"status": "pending"}
}
```

Batch keys are zero-padded two-digit strings ("00", "01", ...) for up to 99
batches. Use plain integers as keys ("0", "1", ...) if total batches < 10.

Do not write any other files. Do not read any source files.
