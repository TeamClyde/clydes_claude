"""Enrich enrichments.json with serverless/infra metadata.

Reads `serverless.yml` / `template.yaml` (SAM) and fills in env_var defaults and
definition file, and adds entry_points from serverless function handlers with their
trigger descriptions. Line numbers come from a line-tracking YAML loader.

Modifies enrichments.json in-place (--enrichments flag).
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


def enrich_supplemental(enrichments: dict, root: Path) -> dict:
    """Update enrichments.json with serverless.yml metadata.

    Fills in `default` and `defined_in` on env_var entries. Adds entry_points
    from serverless function handlers with their trigger descriptions.
    """
    sls_path = None
    for candidate in ("serverless.yml", "serverless.yaml", "template.yaml", "template.yml"):
        p = root / candidate
        if p.exists():
            sls_path = p
            break
    if sls_path is None:
        log.info("No serverless.yml/template.yaml found — skipping serverless enrichment")
        return enrichments

    sls = _load_yaml(sls_path) or {}
    sls_rel = sls_path.name

    env_by_name: dict[str, dict] = {e["name"]: e for e in enrichments["env_vars"]}
    provider_env = sls.get("provider", {}).get("environment") or {}

    # Provider-level env vars
    for var_name, default_val in provider_env.items():
        if not var_name or var_name == "__line__":
            continue
        default_str = str(default_val) if default_val is not None and not isinstance(default_val, dict) else None
        if var_name in env_by_name:
            env_by_name[var_name]["default"] = default_str
            env_by_name[var_name]["defined_in"] = sls_rel
        else:
            env_by_name[var_name] = {"name": var_name, "reads": [], "default": default_str, "defined_in": sls_rel}

    # Function handlers
    entry_points: list[dict] = []
    for fn_name, fn_def in (sls.get("functions") or {}).items():
        if fn_name == "__line__" or not isinstance(fn_def, dict):
            continue

        handler = fn_def.get("handler", "")
        fn_env = fn_def.get("environment") or {}

        # Extract first matching trigger from events list
        trigger = None
        for event_entry in fn_def.get("events") or []:
            t, _ = _event_to_trigger(event_entry)
            if t:
                trigger = t
                break

        # Function-level env vars (may override provider defaults)
        fn_env_names: list[str] = []
        for var_name, default_val in fn_env.items():
            if not var_name or var_name == "__line__":
                continue
            fn_env_names.append(var_name)
            default_str = str(default_val) if default_val is not None and not isinstance(default_val, dict) else None
            if var_name in env_by_name:
                env_by_name[var_name]["default"] = default_str
                env_by_name[var_name]["defined_in"] = sls_rel
            else:
                env_by_name[var_name] = {"name": var_name, "reads": [], "default": default_str, "defined_in": sls_rel}

        all_env_names = [k for k in provider_env if k and k != "__line__"] + fn_env_names
        entry_points.append({"handler": handler, "trigger": trigger, "env_vars": all_env_names})

    enrichments["env_vars"] = sorted(env_by_name.values(), key=lambda e: e["name"])
    enrichments["entry_points"] = entry_points
    return enrichments


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", required=True, type=Path)
    p.add_argument("--enrichments", required=True, type=Path)
    args = p.parse_args(argv)

    if args.enrichments.exists():
        enrichments = json.loads(args.enrichments.read_text(encoding="utf-8"))
    else:
        enrichments = {"env_vars": [], "entry_points": []}

    updated = enrich_supplemental(enrichments, args.root)
    args.enrichments.parent.mkdir(parents=True, exist_ok=True)
    args.enrichments.write_text(json.dumps(updated, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
