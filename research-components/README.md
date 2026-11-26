# research-components

Additive research layer for AMIS. Nothing outside this folder was changed.

## What is here

| Path | Purpose |
|---|---|
| `manifest.json` | The five upstream projects, pinned to commit SHAs, with licenses and integration mode |
| `sync_upstream.py` | Fetches the pinned upstream repos into `upstream/` (git-ignored) |
| `LICENSE-REVIEW.md` | License summary and the risks for AMIS |
| `amis_research/data_compat.py` | Normalises Deriv candles and MT5 (Forex) rates into one OHLC frame and validates it |
| `amis_research/indicators.py` | TA-Lib indicators with a pandas fallback when TA-Lib is not installed |
| `amis_research/backtest_adapters.py` | Lazy adapters for backtesting.py and VectorBT |
| `tests/` | pytest suite (`python -m pytest research-components/tests`) |

## Use

```bash
python research-components/sync_upstream.py --list
python research-components/sync_upstream.py ta-lib vectorbt   # optional source checkouts
pip install TA-Lib vectorbt backtesting                        # optional libraries
python -m pytest research-components/tests
```

## Status

Done: pinned manifest, license review, data adapters, indicator wrapper, adapters, tests.
Not done: LEAN and Backtrader are pinned but not wired in; the data checks ran on synthetic
candles only, not live Deriv or MT5 history; backtesting.py, VectorBT and TA-Lib were not
installed in the build environment, so their adapters are untested.
