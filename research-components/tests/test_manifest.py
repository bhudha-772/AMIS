import json
from pathlib import Path

MANIFEST = Path(__file__).resolve().parents[1] / "manifest.json"
REQUIRED = {"key", "name", "repo", "pinned_commit", "license", "integration_mode"}


def test_manifest_is_complete_and_pinned():
    projects = json.loads(MANIFEST.read_text())["projects"]
    assert {p["key"] for p in projects} == {"lean", "backtrader", "ta-lib", "vectorbt", "backtesting-py"}
    for p in projects:
        assert REQUIRED <= p.keys()
        assert len(p["pinned_commit"]) == 40
        assert p["repo"].startswith("https://github.com/")
