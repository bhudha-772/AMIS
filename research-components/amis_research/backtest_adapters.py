"""Thin, lazy adapters. Heavy libraries load only when a function is called."""
from __future__ import annotations

import pandas as pd

from .data_compat import to_backtesting_frame


def run_backtesting_py(df: pd.DataFrame, strategy_cls, **kwargs):
    """Run a backtesting.py Strategy on an AMIS OHLC frame (AGPL-3.0, see LICENSE-REVIEW.md)."""
    from backtesting import Backtest  # pip install backtesting

    return Backtest(to_backtesting_frame(df), strategy_cls, **kwargs).run()


def vectorbt_portfolio_from_signals(df: pd.DataFrame, entries, exits, **kwargs):
    """Build a VectorBT portfolio from boolean entry/exit Series on the close price."""
    import vectorbt as vbt  # pip install vectorbt

    return vbt.Portfolio.from_signals(df["close"], entries, exits, **kwargs)
