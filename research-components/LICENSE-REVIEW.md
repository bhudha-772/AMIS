# License review (2026-11-26)

Read from each upstream `LICENSE` file at the pinned commit in `manifest.json`.
This is a technical summary, not legal advice.

| Project | License | What it means for AMIS |
|---|---|---|
| LEAN | Apache-2.0 | Permissive. Can be used and modified with attribution and a notice of changes. |
| Backtrader | GPL-3.0 | Copyleft. Copying its source into AMIS and distributing the result would require AMIS to be GPL-3.0 too. |
| TA-Lib (Python wrapper) | BSD-2-Clause | Permissive. Keep the copyright notice if redistributed. |
| VectorBT | Apache-2.0 + Commons Clause | You may use and modify it, but not sell it or a service whose value comes substantially from it. |
| backtesting.py | AGPL-3.0 | Strongest copyleft. Offering AMIS to users over a network with this code in it triggers source-disclosure duties. |

## How this folder handles that

- No upstream source is committed. `sync_upstream.py` clones pinned commits into
  `upstream/`, which is git-ignored.
- GPL/AGPL libraries are only reached through lazy imports in `amis_research/backtest_adapters.py`.
- AMIS is a public repo. If you plan to host AMIS as a service or sell it, resolve
  the Backtrader, backtesting.py and VectorBT terms first.

## Dependencies

Run `pip show <package>` after installing for the exact transitive dependency list.
VectorBT requires Python >=3.11 (`pyproject.toml` at the pinned commit).
