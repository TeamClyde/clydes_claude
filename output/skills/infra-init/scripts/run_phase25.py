"""Phase 2.5 orchestrator.

Pipeline: translate → env_var_scan → serverless_enrich → build_indexes → validate → atomic write.

Inputs:
    --root        target repo root (contains graphify-out/graph.json)
    --graphify    path to graphify-out/graph.json (default: <root>/graphify-out/graph.json)
    --structure   path to .claude-init/structure.json (for repo_type metadata)
    --schema      path to codebase-graph.schema.json (for pre-write validation)
    --commit      short git commit hash (optional)
    --out         path to .claude-init/codebase-graph.json

Writes atomically: temp file then os.replace.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import build_indexes
import env_var_scan
import graphify_translate
import serverless_enrich

log = logging.getLogger("run_phase25")


def _validate(graph: dict, schema_path: Path) -> None:
    try:
        import jsonschema
    except ImportError:
        log.warning("jsonschema not installed — skipping schema validation")
        return
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    jsonschema.validate(instance=graph, schema=schema)
    log.info("Graph passed schema validation")


def run(
    root: Path,
    graphify_json: Path,
    structure_path: Path | None,
    schema_path: Path | None,
    commit: str | None,
    out_path: Path,
) -> dict:
    log.info("Reading graphify output from %s", graphify_json)
    graphify_graph = json.loads(graphify_json.read_text(encoding="utf-8"))

    log.info("Step A: translate")
    graph = graphify_translate.translate(graphify_graph)

    log.info("Step B: env var scan")
    env_result = env_var_scan.scan(root)
    graph["nodes"].extend(env_result["synthetic_module_nodes"])
    graph["nodes"].extend(env_result["env_var_nodes"])
    graph["edges"].extend(env_result["reads_env_edges"])

    log.info("Step C: serverless enrichment")
    serverless_enrich.enrich(graph, root)

    log.info("Step D: build indexes")
    indexes = build_indexes.build(graph)

    repo_type = "unknown"
    if structure_path and structure_path.exists():
        structure = json.loads(structure_path.read_text(encoding="utf-8"))
        repo_type = structure.get("repo_type", "unknown")

    output = {
        "meta": {
            "repo_type": repo_type,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "commit": commit,
            "root": str(root.resolve()),
        },
        "nodes": graph["nodes"],
        "edges": graph["edges"],
        **indexes,
    }

    if schema_path and schema_path.exists():
        _validate(output, schema_path)

    log.info("Step E: atomic write → %s", out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    os.replace(tmp_path, out_path)

    log.info(
        "Phase 2.5 complete: %d nodes, %d edges, %d env_vars",
        len(output["nodes"]),
        len(output["edges"]),
        len(output["env_vars"]),
    )
    return output


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", required=True, type=Path)
    p.add_argument("--graphify", type=Path, default=None)
    p.add_argument("--structure", type=Path, default=None)
    p.add_argument("--schema", type=Path, default=None)
    p.add_argument("--commit", type=str, default=None)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args(argv)

    graphify_json = args.graphify or (args.root / "graphify-out" / "graph.json")

    run(
        root=args.root,
        graphify_json=graphify_json,
        structure_path=args.structure,
        schema_path=args.schema,
        commit=args.commit,
        out_path=args.out,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
