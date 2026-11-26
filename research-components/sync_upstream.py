#!/usr/bin/env python3
"""Fetch the pinned upstream research repos into research-components/upstream/.

Nothing is vendored into git: checkouts land in a git-ignored folder so that
copyleft source (GPL / AGPL) is never redistributed inside AMIS.

Usage:
    python sync_upstream.py            # all projects
    python sync_upstream.py lean ta-lib
    python sync_upstream.py --list
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.json"
DEST = HERE / "upstream"


def load_manifest() -> list[dict]:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))["projects"]


def run(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(args, cwd=cwd, check=True)


def sync(project: dict) -> None:
    target = DEST / project["key"]
    sha = project["pinned_commit"]
    if not (target / ".git").exists():
        target.mkdir(parents=True, exist_ok=True)
        run("git", "init", "-q", cwd=target)
        run("git", "remote", "add", "origin", project["repo"], cwd=target)
    run("git", "fetch", "--depth", "1", "origin", sha, cwd=target)
    run("git", "checkout", "-q", "--detach", "FETCH_HEAD", cwd=target)
    print(f"[ok] {project['name']} @ {sha[:10]} -> {target}")


def main(argv: list[str]) -> int:
    projects = load_manifest()
    if "--list" in argv:
        for p in projects:
            print(f"{p['key']:16} {p['license']:32} {p['integration_mode']}")
        return 0
    wanted = [a for a in argv if not a.startswith("-")]
    chosen = [p for p in projects if not wanted or p["key"] in wanted]
    unknown = set(wanted) - {p["key"] for p in projects}
    if unknown:
        print(f"unknown project key(s): {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2
    for p in chosen:
        sync(p)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
