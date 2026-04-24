"""Scan source files for environment-variable reads using tree-sitter.

Detects (per plan):
    Python : os.environ["X"], os.environ.get("X"[, default]), os.getenv("X"[, default])
    TS/JS  : process.env.X, process.env["X"], const {X, Y: local} = process.env

Writes enrichments.json with schema:
    {"env_vars": [{"name": str, "reads": ["file:line", ...], "default": null, "defined_in": null}],
     "entry_points": []}

If the repo has no .py/.ts/.js/.tsx/.jsx files, returns zero env_vars without error.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

log = logging.getLogger("env_var_scan")

try:
    from tree_sitter import Language, Parser, Query
except ImportError as e:
    raise SystemExit(
        "tree-sitter is required. Run setup.sh or: "
        "python3.11 -m pip install --user tree-sitter tree-sitter-python tree-sitter-typescript"
    ) from e

try:
    from tree_sitter import QueryCursor  # tree-sitter >= 0.25
except ImportError:
    QueryCursor = None  # type: ignore[assignment]


def _run_matches(query, root_node):
    """Run a compiled Query against a node. tree-sitter 0.25 moved matches()
    from Query onto QueryCursor; older versions kept it on Query itself."""
    if QueryCursor is not None:
        return QueryCursor(query).matches(root_node)
    return query.matches(root_node)


def _load_py_language() -> "Language | None":
    try:
        import tree_sitter_python as tsp

        return Language(tsp.language())
    except Exception as e:
        log.warning("tree-sitter-python unavailable: %s", e)
        return None


def _load_ts_languages() -> tuple["Language | None", "Language | None"]:
    try:
        import tree_sitter_typescript as tsts

        return Language(tsts.language_typescript()), Language(tsts.language_tsx())
    except Exception as e:
        log.warning("tree-sitter-typescript unavailable: %s", e)
        return None, None


PY_QUERY = r"""
; os.environ["X"]
(subscript
  value: (attribute
    object: (identifier) @_os
    attribute: (identifier) @_env)
  subscript: (string) @var_name
  (#eq? @_os "os")
  (#eq? @_env "environ")) @read

; os.environ.get("X") / os.getenv("X")
(call
  function: [
    (attribute
      object: (attribute
        object: (identifier) @_os2
        attribute: (identifier) @_env2)
      attribute: (identifier) @_get)
    (attribute
      object: (identifier) @_os3
      attribute: (identifier) @_getenv)
  ]
  arguments: (argument_list . (string) @var_name_call)
  (#eq? @_os2 "os")
  (#eq? @_env2 "environ")
  (#eq? @_get "get")
  (#eq? @_os3 "os")
  (#eq? @_getenv "getenv")) @read_call
"""

TS_QUERY = r"""
; process.env.X
(member_expression
  object: (member_expression
    object: (identifier) @_proc
    property: (property_identifier) @_env)
  property: (property_identifier) @var_name_dot
  (#eq? @_proc "process")
  (#eq? @_env "env")) @read_dot

; process.env["X"]
(subscript_expression
  object: (member_expression
    object: (identifier) @_proc2
    property: (property_identifier) @_env2)
  index: (string) @var_name_sub
  (#eq? @_proc2 "process")
  (#eq? @_env2 "env")) @read_sub

; const { X, Y: local } = process.env
(variable_declarator
  name: (object_pattern) @pattern
  value: (member_expression
    object: (identifier) @_proc3
    property: (property_identifier) @_env3)
  (#eq? @_proc3 "process")
  (#eq? @_env3 "env")) @destructure
"""


@dataclass
class EnvRead:
    var_name: str
    file: str
    line: int


def _strip_string(text: str) -> str:
    text = text.strip()
    if len(text) >= 2 and text[0] in "\"'`" and text[-1] == text[0]:
        return text[1:-1]
    return text


def _iter_dest_names(pattern_node, src: bytes) -> Iterable[tuple[str, int]]:
    """Yield (var_name, line) for each key in an object_pattern destructuring."""
    for child in pattern_node.children:
        if child.type == "shorthand_property_identifier_pattern":
            name = child.text.decode("utf-8", errors="replace")
            yield name, child.start_point[0] + 1
        elif child.type in ("pair_pattern", "object_assignment_pattern"):
            key_node = child.child_by_field_name("key")
            if key_node is not None:
                name = key_node.text.decode("utf-8", errors="replace")
                yield name, key_node.start_point[0] + 1


def scan_python_file(path: Path, rel: str, lang) -> list[EnvRead]:
    parser = Parser(lang)
    src = path.read_bytes()
    tree = parser.parse(src)
    query = Query(lang, PY_QUERY)
    reads: list[EnvRead] = []

    matches = _run_matches(query, tree.root_node)
    for _pattern_index, captures in matches:
        var_node = None
        if "var_name" in captures:
            var_node = captures["var_name"][0]
        elif "var_name_call" in captures:
            var_node = captures["var_name_call"][0]
        if var_node is None:
            continue
        raw = var_node.text.decode("utf-8", errors="replace")
        name = _strip_string(raw)
        if not name:
            continue
        reads.append(
            EnvRead(
                var_name=name,
                file=rel,
                line=var_node.start_point[0] + 1,
            )
        )
    return reads


def scan_ts_file(path: Path, rel: str, lang) -> list[EnvRead]:
    parser = Parser(lang)
    src = path.read_bytes()
    tree = parser.parse(src)
    query = Query(lang, TS_QUERY)
    reads: list[EnvRead] = []

    matches = _run_matches(query, tree.root_node)
    for _pattern_index, captures in matches:
        if "pattern" in captures:
            pattern_node = captures["pattern"][0]
            for name, line in _iter_dest_names(pattern_node, src):
                reads.append(EnvRead(var_name=name, file=rel, line=line))
            continue

        var_node = None
        if "var_name_dot" in captures:
            var_node = captures["var_name_dot"][0]
        elif "var_name_sub" in captures:
            var_node = captures["var_name_sub"][0]
        if var_node is None:
            continue
        raw = var_node.text.decode("utf-8", errors="replace")
        name = _strip_string(raw)
        if not name:
            continue
        reads.append(
            EnvRead(
                var_name=name,
                file=rel,
                line=var_node.start_point[0] + 1,
            )
        )
    return reads


SKIP_DIRS = {
    ".git", ".venv", "venv", "node_modules", "dist", "build", ".next",
    "__pycache__", ".claude-init", ".claude-init.backup", "graphify-out",
    ".pytest_cache",
}


def _iter_source_files(root: Path, suffixes: set[str]) -> Iterable[Path]:
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in suffixes:
            continue
        parts = set(path.relative_to(root).parts)
        if parts & SKIP_DIRS:
            continue
        yield path


def scan(root: Path) -> dict:
    py_lang = _load_py_language()
    ts_lang, tsx_lang = _load_ts_languages()

    reads: list[EnvRead] = []

    if py_lang is not None:
        for path in _iter_source_files(root, {".py"}):
            rel = path.relative_to(root).as_posix()
            try:
                reads.extend(scan_python_file(path, rel, py_lang))
            except Exception as e:
                log.warning("Python scan failed for %s: %s", rel, e)

    if ts_lang is not None:
        for path in _iter_source_files(root, {".ts", ".js"}):
            rel = path.relative_to(root).as_posix()
            try:
                reads.extend(scan_ts_file(path, rel, ts_lang))
            except Exception as e:
                log.warning("TS scan failed for %s: %s", rel, e)

    if tsx_lang is not None:
        for path in _iter_source_files(root, {".tsx", ".jsx"}):
            rel = path.relative_to(root).as_posix()
            try:
                reads.extend(scan_ts_file(path, rel, tsx_lang))
            except Exception as e:
                log.warning("TSX scan failed for %s: %s", rel, e)

    by_var: dict[str, list[str]] = {}
    for r in reads:
        by_var.setdefault(r.var_name, []).append(f"{r.file}:{r.line}")

    log.info("env_var_scan: %d reads, %d unique vars", len(reads), len(by_var))

    return {
        "env_vars": [
            {"name": name, "reads": refs, "default": None, "defined_in": None}
            for name, refs in sorted(by_var.items())
        ],
        "entry_points": [],
    }


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args(argv)

    result = scan(args.root)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
