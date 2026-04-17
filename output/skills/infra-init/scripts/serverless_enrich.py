"""Enrich the translated graph with serverless/infra metadata.

Reads `serverless.yml` / `template.yaml` (SAM) and annotates function nodes
with `is_entry_point` + `trigger`, emits `route` nodes with `defines` edges,
and populates env_var defaults/definition file + line. Line numbers come from
a line-tracking YAML loader.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

log = logging.getLogger("serverless_enrich")

try:
    import yaml
except ImportError as e:
    raise SystemExit("PyYAML is required. Install with: pip install pyyaml") from e


class _LineLoader(yaml.SafeLoader):
    pass


def _construct_mapping(loader: _LineLoader, node: yaml.MappingNode) -> dict:
    mapping = loader.construct_mapping(node, deep=True)
    mapping["__line__"] = node.start_mark.line + 1
    return mapping


_LineLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping)


def _construct_cfn_tag(loader: _LineLoader, tag_suffix: str, node: yaml.Node) -> Any:
    """Handle CloudFormation intrinsic tags (!Sub, !Ref, !GetAtt, !Join, !If, ...).

    We don't evaluate CloudFormation — we just need YAML parsing to not explode.
    Return the underlying value (scalar/sequence/mapping) with the tag discarded.
    For env_var defaults this means `!Sub "${Stage}-foo"` becomes the literal
    string "${Stage}-foo", which is the right shape for downstream consumers.
    """
    if isinstance(node, yaml.ScalarNode):
        return loader.construct_scalar(node)
    if isinstance(node, yaml.SequenceNode):
        return loader.construct_sequence(node, deep=True)
    if isinstance(node, yaml.MappingNode):
        return loader.construct_mapping(node, deep=True)
    return None


_LineLoader.add_multi_constructor("!", _construct_cfn_tag)


def _load_yaml(path: Path) -> dict | None:
    try:
        return yaml.load(path.read_text(encoding="utf-8"), Loader=_LineLoader)
    except Exception as e:
        log.warning("Failed to parse %s: %s", path, e)
        return None


def _find_handler_node(nodes: list[dict], handler: str, repo_root: Path) -> dict | None:
    """handler is typically 'src/path/to/file.handler_fn' (dots separate path segments except the last)."""
    if not handler:
        return None

    last_dot = handler.rfind(".")
    if last_dot == -1:
        return None
    module_path = handler[:last_dot].replace(".", "/")
    fn_name = handler[last_dot + 1 :]

    candidates = [f"{module_path}.py", f"{module_path}.ts", f"{module_path}.js"]

    def _norm(p: str) -> str:
        return p.replace("\\", "/")

    for n in nodes:
        if n.get("type") not in ("function", "method"):
            continue
        if n.get("name") != fn_name and not str(n.get("name", "")).endswith("." + fn_name):
            continue
        if _norm(str(n.get("file", ""))) in candidates:
            return n

    for n in nodes:
        if n.get("type") not in ("function", "method"):
            continue
        file_val = _norm(str(n.get("file", "")))
        if n.get("name") == fn_name and any(file_val.endswith(c) for c in candidates):
            return n

    return None


def _synthesize_handler_node(handler: str, repo_root: Path) -> dict | None:
    """Build a minimal function node for a serverless handler graphify missed.

    Returns None if the handler string is malformed or no source file exists
    on disk at the expected path.
    """
    if not handler:
        return None
    last_dot = handler.rfind(".")
    if last_dot == -1:
        return None
    module_path = handler[:last_dot].replace(".", "/")
    fn_name = handler[last_dot + 1 :]

    for ext in (".py", ".ts", ".js"):
        rel = f"{module_path}{ext}"
        disk_path = repo_root / rel
        if disk_path.exists():
            # Use OS-native separator for the `file` field to match graphify's
            # convention on this platform (matters for Windows parity).
            file_field = str(Path(rel))
            return {
                "id": f"{file_field}::{fn_name}",
                "type": "function",
                "name": fn_name,
                "file": file_field,
                "line_start": 1,
            }
    return None


def _event_to_trigger(event_entry: Any) -> tuple[str | None, dict | None]:
    """Return (trigger_string, route_info_or_None)."""
    if not isinstance(event_entry, dict):
        return None, None
    event_entry = {k: v for k, v in event_entry.items() if k != "__line__"}
    if not event_entry:
        return None, None
    event_type, body = next(iter(event_entry.items()))
    if event_type in ("http", "httpApi"):
        if isinstance(body, dict):
            method = str(body.get("method", "ANY")).upper()
            path = body.get("path", "/")
        elif isinstance(body, str):
            parts = body.split(None, 1)
            method = parts[0].upper() if parts else "ANY"
            path = parts[1] if len(parts) > 1 else "/"
        else:
            method = "ANY"
            path = "/"
        if not str(path).startswith("/"):
            path = f"/{path}"
        return f"http:{method}:{path}", {"method": method, "path": path}
    if event_type == "sqs":
        arn = body.get("arn") if isinstance(body, dict) else body
        # arn may be a flattened !GetAtt scalar like "SendNotificationQueue.Arn",
        # a real ARN "arn:aws:sqs:...:queueName", or a reference object.
        arn_str = str(arn) if arn else ""
        queue = arn_str.split(":")[-1]
        if queue.endswith(".Arn"):
            queue = queue[: -len(".Arn")]
        return f"sqs:{queue}", None
    if event_type in ("eventBridge", "eventbridge"):
        if isinstance(body, dict):
            if body.get("schedule"):
                return f"cron:{body['schedule']}", None
            bus = body.get("eventBus")
            if bus:
                # !Ref FilterLifeEventBus → scalar "FilterLifeEventBus"
                return f"eventbridge:{bus}", None
            pattern = body.get("pattern")
            if isinstance(pattern, dict):
                pattern = {k: v for k, v in pattern.items() if k != "__line__"}
            return f"eventbridge:{pattern}", None
        return "eventbridge", None
    if event_type == "schedule":
        rate = body.get("rate") if isinstance(body, dict) else body
        return f"cron:{rate}", None
    if event_type in ("s3", "sns", "dynamodb", "kinesis", "stream"):
        return f"{event_type}", None
    return f"{event_type}", None


def enrich(
    graph: dict,
    root: Path,
    env_var_nodes: list[dict] | None = None,
) -> dict:
    """Mutates and returns `graph` (nodes/edges); also updates provided env_var_nodes in place."""
    nodes: list[dict] = graph.get("nodes", [])
    edges: list[dict] = graph.get("edges", [])

    sls_path = None
    for candidate in ("serverless.yml", "serverless.yaml", "template.yaml", "template.yml"):
        p = root / candidate
        if p.exists():
            sls_path = p
            break
    if sls_path is None:
        log.info("No serverless.yml/template.yaml found — skipping serverless enrichment")
        return graph

    sls = _load_yaml(sls_path) or {}
    sls_rel = sls_path.name

    provider = sls.get("provider") or {}
    provider_env = provider.get("environment") or {}

    env_var_by_name: dict[str, dict] = {}
    for n in list(nodes) + list(env_var_nodes or []):
        if n.get("type") == "env_var":
            env_var_by_name[n.get("name", "")] = n

    def _ensure_env_var(name: str) -> dict:
        """Declared in serverless.yml but not read from code — still emit a node
        so the graph reflects the full Lambda environment contract."""
        node = env_var_by_name.get(name)
        if node is not None:
            return node
        node = {
            "id": f"env::{name}",
            "type": "env_var",
            "name": name,
            "file": "",
            "line_start": 1,
        }
        env_var_by_name[name] = node
        if env_var_nodes is not None:
            env_var_nodes.append(node)
        else:
            nodes.append(node)
        return node

    for var_name, default_val in provider_env.items():
        if var_name == "__line__":
            continue
        node = _ensure_env_var(var_name)
        node["file"] = sls_rel
        node["line_start"] = provider_env.get("__line__", 1)
        if default_val is not None and not isinstance(default_val, dict):
            node["env_var_default"] = default_val
        else:
            node["env_var_default"] = None
        node["defined_in"] = sls_rel

    functions = sls.get("functions") or {}
    route_nodes_added: dict[str, dict] = {}
    for fn_name, fn_def in functions.items():
        if fn_name == "__line__" or not isinstance(fn_def, dict):
            continue

        handler = fn_def.get("handler", "")
        handler_node = _find_handler_node(nodes, handler, root)
        if handler_node is None:
            # Graphify sometimes drops Python files with import-time errors, so
            # a serverless-declared handler can be absent from the graph. If the
            # handler file actually exists on disk, synthesize a minimal node so
            # the Lambda entry-point contract still appears in the graph.
            synth = _synthesize_handler_node(handler, root)
            if synth is None:
                log.warning(
                    "No handler node found for %s (handler=%s) and source file missing",
                    fn_name,
                    handler,
                )
                continue
            nodes.append(synth)
            handler_node = synth
            log.info(
                "Synthesized handler node for %s (graphify did not index %s)",
                fn_name,
                synth["file"],
            )

        events = fn_def.get("events") or []
        triggers: list[str] = []
        for event_entry in events:
            trigger, route_info = _event_to_trigger(event_entry)
            if trigger:
                triggers.append(trigger)
            if route_info:
                route_id = f"route::{route_info['method']}:{route_info['path']}"
                if route_id not in route_nodes_added:
                    route_nodes_added[route_id] = {
                        "id": route_id,
                        "type": "route",
                        "name": f"{route_info['method']} {route_info['path']}",
                        "file": handler_node.get("file", sls_rel),
                        "line_start": handler_node.get("line_start", 1),
                        "is_entry_point": True,
                        "trigger": "http",
                    }
                edges.append(
                    {
                        "type": "defines",
                        "from": handler_node["id"],
                        "to": route_id,
                        "file": sls_rel,
                        "line": fn_def.get("__line__", 1),
                    }
                )

        if triggers:
            handler_node["is_entry_point"] = True
            handler_node["trigger"] = triggers[0] if len(triggers) == 1 else "|".join(triggers)

        fn_env = fn_def.get("environment") or {}
        for var_name, default_val in fn_env.items():
            if var_name == "__line__":
                continue
            node = _ensure_env_var(var_name)
            node["file"] = sls_rel
            node["line_start"] = fn_env.get("__line__", 1)
            if default_val is not None and not isinstance(default_val, dict):
                node["env_var_default"] = default_val
            node["defined_in"] = sls_rel

    nodes.extend(route_nodes_added.values())
    graph["nodes"] = nodes
    graph["edges"] = edges
    return graph


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--graph", required=True, type=Path, help="translated graph JSON (nodes+edges)")
    p.add_argument("--root", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args(argv)

    graph = json.loads(args.graph.read_text(encoding="utf-8"))
    enriched = enrich(graph, args.root)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(enriched, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
