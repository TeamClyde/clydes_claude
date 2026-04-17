"""Translate graphify's graph.json (NetworkX node_link_data) into our schema.

Invoked by /infra-init under python3.11 (fallback python3.14). Never resolves the
interpreter itself.

Inputs  : graphify-out/graph.json
Outputs : dict with "nodes" and "edges" arrays in our codebase-graph schema
          (top-level indexes are added later by build_indexes.py)

Defensive against upstream drift: unknown edge types and missing fields are
logged and dropped rather than crashing.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any

log = logging.getLogger("graphify_translate")

SKIP_EDGE_TYPES = {"method", "inherits", "uses"}
EDGE_TYPE_REMAP = {
    "contains": "contains",
    "imports": "imports",
    "imports_from": "imports",
    "calls": "calls",
}

_LOCATION_RE = re.compile(r"L(\d+)")


def _get_edge_type(edge: dict) -> str | None:
    for key in ("type", "relation", "edge_type", "key"):
        if key in edge and isinstance(edge[key], str):
            return edge[key]
    return None


def _normalize_label(label: str) -> str:
    label = (label or "").strip()
    if label.startswith("."):
        label = label[1:]
    if label.endswith("()"):
        label = label[:-2]
    return label


def _parse_line(source_location: Any) -> int | None:
    if not source_location:
        return None
    if isinstance(source_location, int):
        return source_location
    m = _LOCATION_RE.search(str(source_location))
    return int(m.group(1)) if m else None


def _classify_nodes(graphify_nodes: list[dict], graphify_edges: list[dict]) -> dict[str, str]:
    """Return graphify_id -> our node type (class|function|method)."""
    method_targets: set[str] = set()
    method_sources: set[str] = set()
    inherits_sources: set[str] = set()
    inherits_targets: set[str] = set()

    for edge in graphify_edges:
        etype = _get_edge_type(edge)
        src = edge.get("source")
        dst = edge.get("target")
        if etype == "method":
            if src:
                method_sources.add(src)
            if dst:
                method_targets.add(dst)
        elif etype == "inherits":
            if src:
                inherits_sources.add(src)
            if dst:
                inherits_targets.add(dst)

    out: dict[str, str] = {}
    for n in graphify_nodes:
        nid = n.get("id")
        if nid is None or not n.get("source_file"):
            continue
        if nid in method_targets:
            out[nid] = "method"
        elif nid in method_sources or nid in inherits_sources or nid in inherits_targets:
            out[nid] = "class"
        else:
            out[nid] = "function"
    return out


def _owning_class_label(
    method_id: str,
    graphify_edges: list[dict],
    graphify_nodes_by_id: dict[str, dict],
) -> str | None:
    for edge in graphify_edges:
        if _get_edge_type(edge) != "method":
            continue
        if edge.get("target") != method_id:
            continue
        src_id = edge.get("source")
        src_node = graphify_nodes_by_id.get(src_id) if src_id else None
        if src_node is None:
            continue
        return _normalize_label(src_node.get("label", ""))
    return None


def translate(graphify_graph: dict) -> dict:
    """Translate graphify node_link_data into our schema's nodes + edges.

    Raises:
        ValueError: if top-level `nodes` or `links` are missing or not lists.
                    This is the smoke test for upstream schema drift.
    """
    if not isinstance(graphify_graph.get("nodes"), list) or not isinstance(
        graphify_graph.get("links"), list
    ):
        raise ValueError(
            "graphify output shape changed — translator update required. "
            "Expected top-level `nodes` and `links` to be arrays."
        )

    g_nodes: list[dict] = graphify_graph["nodes"]
    g_edges: list[dict] = graphify_graph["links"]
    g_nodes_by_id = {n.get("id"): n for n in g_nodes if n.get("id") is not None}

    type_by_gid = _classify_nodes(g_nodes, g_edges)

    our_nodes: list[dict] = []
    gid_to_our_id: dict[str, str] = {}
    seen_our_ids: set[str] = set()
    source_files: set[str] = set()

    for g_node in g_nodes:
        gid = g_node.get("id")
        source_file = g_node.get("source_file")
        if gid is None or not source_file:
            continue

        inferred = type_by_gid.get(gid)
        if inferred is None:
            continue

        label = _normalize_label(g_node.get("label", ""))
        if not label:
            log.warning("Skipping node with empty label (gid=%s)", gid)
            continue

        if inferred == "method":
            class_label = _owning_class_label(gid, g_edges, g_nodes_by_id)
            if class_label:
                name = f"{class_label}.{label}"
                our_id = f"{source_file}::{class_label}.{label}"
            else:
                name = label
                our_id = f"{source_file}::{label}"
        else:
            name = label
            our_id = f"{source_file}::{label}"

        if our_id in seen_our_ids:
            log.warning("Duplicate node id after remap — skipping (%s)", our_id)
            continue

        seen_our_ids.add(our_id)
        gid_to_our_id[gid] = our_id
        source_files.add(source_file)

        our_nodes.append(
            {
                "id": our_id,
                "type": inferred,
                "name": name,
                "file": source_file,
                "line_start": _parse_line(g_node.get("source_location")) or 1,
            }
        )

    for source_file in sorted(source_files):
        file_id = source_file
        if file_id in seen_our_ids:
            continue
        seen_our_ids.add(file_id)
        our_nodes.append(
            {
                "id": file_id,
                "type": "file",
                "name": Path(source_file).name,
                "file": source_file,
                "line_start": 1,
            }
        )

    # Synthesize external-dep nodes for graphify nodes with no source_file.
    # These are stdlib / third-party symbols (e.g. enum.Enum) that graphify
    # references in imports_from edges but doesn't assign a file to.
    for g_node in g_nodes:
        gid = g_node.get("id")
        if gid is None or gid in gid_to_our_id:
            continue
        if g_node.get("source_file"):
            continue
        label = _normalize_label(g_node.get("label", ""))
        if not label:
            continue
        our_id = f"external::{label}"
        if our_id in seen_our_ids:
            gid_to_our_id[gid] = our_id
            continue
        seen_our_ids.add(our_id)
        gid_to_our_id[gid] = our_id
        our_nodes.append(
            {
                "id": our_id,
                "type": "external",
                "name": label,
                "file": "",
                "line_start": 1,
            }
        )

    our_edges: list[dict] = []
    dropped_types: dict[str, int] = {}
    skipped_counts: dict[str, int] = {}
    unresolved_counts: dict[str, int] = {}

    for edge in g_edges:
        etype = _get_edge_type(edge)
        if etype is None:
            continue
        if etype in SKIP_EDGE_TYPES:
            skipped_counts[etype] = skipped_counts.get(etype, 0) + 1
            continue
        mapped = EDGE_TYPE_REMAP.get(etype)
        if mapped is None:
            dropped_types[etype] = dropped_types.get(etype, 0) + 1
            continue

        src = gid_to_our_id.get(edge.get("source"))
        dst = gid_to_our_id.get(edge.get("target"))
        if src is None or dst is None:
            unresolved_counts[mapped] = unresolved_counts.get(mapped, 0) + 1
            continue

        # Normalize imports direction: "from" = the importing file, "to" = the
        # imported symbol.  Graphify's imports_from is inconsistent — sometimes
        # the external node is in source, sometimes in target.  Use source_file
        # on the edge (always the importing file) as the authority.
        if mapped == "imports":
            edge_file = edge.get("source_file", "")
            src_node_file = ""
            dst_node_file = ""
            for n in our_nodes:
                if n["id"] == src:
                    src_node_file = n.get("file", "")
                elif n["id"] == dst:
                    dst_node_file = n.get("file", "")
            if not src_node_file and dst_node_file:
                src, dst = dst, src

        out_edge: dict = {"type": mapped, "from": src, "to": dst}
        if edge.get("source_file"):
            out_edge["file"] = edge["source_file"]
        line = _parse_line(edge.get("source_location"))
        if line is not None:
            out_edge["line"] = line
        our_edges.append(out_edge)

    for etype, count in sorted(dropped_types.items()):
        log.warning("Dropped %d edge(s) of unknown graphify type %r", count, etype)
    if skipped_counts:
        log.info(
            "Skipped edge types (intentional): %s",
            ", ".join(f"{t}={c}" for t, c in sorted(skipped_counts.items())),
        )
    if unresolved_counts:
        log.warning(
            "Dropped edges with unresolved nodes: %s",
            ", ".join(f"{t}={c}" for t, c in sorted(unresolved_counts.items())),
        )

    return {"nodes": our_nodes, "edges": our_edges}


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--graphify-json", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args(argv)

    graphify_graph = json.loads(args.graphify_json.read_text(encoding="utf-8"))
    result = translate(graphify_graph)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    log.info(
        "Wrote %d nodes, %d edges to %s",
        len(result["nodes"]),
        len(result["edges"]),
        args.out,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
