"""Detect the target repo's type from its top-level manifest files.

Writes `.claude-init/structure.json` with `repo_type` + `key_dirs`. Does NOT
enumerate source files — graphify owns that.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

log = logging.getLogger("detect_structure")


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def detect(root: Path) -> dict:
    has = lambda name: (root / name).exists()

    if has("serverless.yml") or has("serverless.yaml"):
        repo_type = "aws-lambda-serverless"
    elif has("template.yaml") or has("template.yml"):
        repo_type = "aws-sam"
    elif has("pubspec.yaml"):
        repo_type = "flutter-mobile"
    elif has("android") and has("ios") and has("package.json"):
        repo_type = "react-native"
    elif (has("CMakeLists.txt") or any(root.glob("*.ino"))
            or any(root.glob("*.slcp")) or any(root.glob("*.cproject"))):
        repo_type = "firmware-embedded"
    elif has("package.json"):
        body = _read_text(root / "package.json")
        if any(fw in body for fw in ('"express"', '"fastify"', '"koa"', '"hono"', '"nestjs"')):
            repo_type = "node-http-backend"
        elif any(fw in body for fw in ('"next"', '"react"', '"vue"', '"svelte"')):
            repo_type = "node-frontend"
        else:
            repo_type = "node-generic"
    elif has("requirements.txt") or has("pyproject.toml"):
        body = _read_text(root / "requirements.txt") + _read_text(root / "pyproject.toml")
        if any(fw in body for fw in ("fastapi", "flask", "django", "starlette")):
            repo_type = "python-http-backend"
        else:
            repo_type = "python-generic"
    elif has("go.mod"):
        repo_type = "go-generic"
    elif has("Cargo.toml"):
        repo_type = "rust-generic"
    else:
        repo_type = "unknown"

    key_dirs = [d.name for d in root.iterdir() if d.is_dir() and not d.name.startswith(".")]
    return {"repo_type": repo_type, "key_dirs": sorted(key_dirs)}


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args(argv)

    result = detect(args.root)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    log.info("Detected repo_type=%s", result["repo_type"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
