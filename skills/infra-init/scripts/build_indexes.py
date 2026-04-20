"""Build the four required top-level indexes from nodes + edges.

Produces: symbols, callers, env_vars, endpoints — the indexes the FastMCP
server queries at runtime.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import defaultdict
from pathlib import Path

log = logging.getLogger("build_indexes")


def build(graph: dict) -> dict:
    nodes: list[dict] = graph.get("nodes", [])
    edges: list[dict] = graph.get("edges", [])

    nodes_by_id = {n["id"]: n for n in nodes}

    symbols: dict[str, list[dict]] = defaultdict(list)
    for n in nodes:
        if n.get("type") in ("function", "method", "class"):
            symbols[n["name"]].append(
                {"id": n["id"], "file": n.get("file"), "line_start": n.get("line_start")}
            )

    callers: dict[str, list[dict]] = defaultdict(list)
    for e in edges:
        if e.get("type") != "calls":
            continue
        target = e.get("to")
        if not target:
            continue
        callers[target].append(
            {"from": e.get("from"), "file": e.get("file"), "line": e.get("line")}
        )

    env_vars: dict[str, dict] = {}
    for n in nodes:
        if n.get("type") != "env_var":
            continue
        env_vars[n["name"]] = {
            "defined_in": n.get("defined_in"),
            "default": n.get("env_var_default"),
            "read_by": [],
        }
    for e in edges:
        if e.get("type") != "reads_env":
            continue
        target = e.get("to", "")
        if not target.startswith("env::"):
            continue
        var_name = target[len("env::") :]
        entry = env_vars.get(var_name)
        if entry is None:
            env_vars[var_name] = {"defined_in": None, "default": None, "read_by": []}
            entry = env_vars[var_name]
        entry["read_by"].append(
            {"from": e.get("from"), "file": e.get("file"), "line": e.get("line")}
        )

    exposed: list[dict] = []
    for n in nodes:
        if n.get("type") != "route":
            continue
        name = n.get("name", "")
        parts = name.split(" ", 1)
        method = parts[0] if parts else ""
        path = parts[1] if len(parts) > 1 else ""
        handler_id = None
        for e in edges:
            if e.get("type") == "defines" and e.get("to") == n["id"]:
                handler_id = e.get("from")
                break
        exposed.append(
            {
                "method": method,
                "path": path,
                "file": n.get("file"),
                "line": n.get("line_start"),
                "handler_id": handler_id,
            }
        )

    consumed: dict[str, list] = {}
    endpoints = {"exposed": exposed, "consumed": consumed}

    return {
        "symbols": dict(symbols),
        "callers": dict(callers),
        "env_vars": env_vars,
        "endpoints": endpoints,
    }


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--graph", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args(argv)

    graph = json.loads(args.graph.read_text(encoding="utf-8"))
    indexes = build(graph)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(indexes, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
