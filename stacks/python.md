# python — Stack Hat

## Tooling

- **MCPs:** `pyright-lsp` — symbol resolution, type inference, go-to-definition during planning and editing.
- **CLI tools:**
  - `ruff` — lint + format (replaces flake8/isort/black). Install: `pip install ruff`. Run: `ruff check --fix` and `ruff format`.
  - `pyright` — static type checker. Install: `pip install pyright` (or use the `pyright-lsp` MCP).
  - `pytest` + `pytest-cov` — tests + coverage. Install: `pip install pytest pytest-cov`. Run: `pytest --cov`.
  - `mypy` — stricter typing where wanted. Install: `pip install mypy`.
  - `mutmut` — mutation testing on pure-logic modules. Install: `pip install mutmut`.
- **VSCode extensions:** `ms-python.python`, `ms-python.vscode-pylance`, `charliermarsh.ruff`.

## Hat

- Type-annotate every public function signature. Lean on `pyright`/`pyright-lsp` for inference and symbol lookups — resolve types from the tool, don't guess them.
- Prefer `pathlib.Path` over `os.path`; f-strings over `%`/`.format()`.
- Never use mutable default arguments (`def f(x=[])`) — use `None` and assign inside.
- Manage resources with context managers (`with`), not manual open/close.
- Never write a bare `except:` — catch specific exceptions; let unexpected ones propagate.
- Prefer `dataclasses`/`pydantic` for structured data over ad-hoc dicts/tuples.
- Run `ruff check --fix` (and `ruff format`) before every commit.
- Reach for `pytest -k <expr>` and fixtures over ad-hoc debug scripts.
