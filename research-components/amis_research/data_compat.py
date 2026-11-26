"""Historical data compatibility for Deriv and Forex (MT5) candles.

Both sources are normalised to one UTC-indexed OHLC(V) DataFrame with lower-case
columns: open, high, low, close, volume. From there it converts to the layouts
backtesting.py (Open/High/Low/Close/Volume) and VectorBT/TA-Lib (lower-case) expect.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping

import pandas as pd

OHLC = ["open", "high", "low", "close"]


def normalize_deriv_candles(candles: Iterable[Mapping[str, Any]]) -> pd.DataFrame:
    """Deriv `ticks_history` (style=candles) rows: {epoch, open, high, low, close}.

    Deriv has no volume for synthetic indices, so volume is set to 0.
    """
    df = pd.DataFrame(list(candles))
    if df.empty:
        return _empty()
    df["time"] = pd.to_datetime(df["epoch"], unit="s", utc=True)
    df = df.set_index("time")[OHLC].astype(float)
    df["volume"] = 0.0
    return _finish(df)


def normalize_mt5_rates(rates: Iterable[Mapping[str, Any]]) -> pd.DataFrame:
    """MetaTrader5 `copy_rates_*` rows: time, open, high, low, close, tick_volume."""
    df = pd.DataFrame(list(rates))
    if df.empty:
        return _empty()
    df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
    vol = "tick_volume" if "tick_volume" in df else None
    df["volume"] = df[vol].astype(float) if vol else 0.0
    df = df.set_index("time")[OHLC + ["volume"]].astype(float)
    return _finish(df)


def _empty() -> pd.DataFrame:
    idx = pd.DatetimeIndex([], tz="UTC", name="time")
    return pd.DataFrame(columns=OHLC + ["volume"], index=idx, dtype=float)


def _finish(df: pd.DataFrame) -> pd.DataFrame:
    return df[~df.index.duplicated(keep="last")].sort_index()


@dataclass
class OHLCReport:
    rows: int = 0
    duplicate_timestamps: int = 0
    nan_rows: int = 0
    bad_high_low: int = 0
    non_positive_prices: int = 0
    median_step_seconds: float | None = None
    gaps: int = 0
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


def validate_ohlc(df: pd.DataFrame, max_gap_steps: float = 3.0) -> OHLCReport:
    """Check a frame is safe to feed into a backtester.

    Gaps are reported, not treated as errors, because Forex closes on weekends.
    """
    r = OHLCReport(rows=len(df))
    if df.empty:
        r.problems.append("no rows")
        return r
    missing = [c for c in OHLC if c not in df.columns]
    if missing:
        r.problems.append(f"missing columns: {missing}")
        return r
    r.duplicate_timestamps = int(df.index.duplicated().sum())
    r.nan_rows = int(df[OHLC].isna().any(axis=1).sum())
    r.non_positive_prices = int((df[OHLC] <= 0).any(axis=1).sum())
    hi_ok = df["high"] >= df[["open", "close", "low"]].max(axis=1)
    lo_ok = df["low"] <= df[["open", "close", "high"]].min(axis=1)
    r.bad_high_low = int((~(hi_ok & lo_ok)).sum())
    if not df.index.is_monotonic_increasing:
        r.problems.append("index not sorted ascending")
    steps = df.index.to_series().diff().dropna().dt.total_seconds()
    if len(steps):
        r.median_step_seconds = float(steps.median())
        if r.median_step_seconds > 0:
            r.gaps = int((steps > r.median_step_seconds * max_gap_steps).sum())
    for name, n in (
        ("duplicate timestamps", r.duplicate_timestamps),
        ("rows with NaN", r.nan_rows),
        ("non-positive prices", r.non_positive_prices),
        ("rows where high/low contradict open/close", r.bad_high_low),
    ):
        if n:
            r.problems.append(f"{n} {name}")
    return r


def to_backtesting_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Layout for backtesting.py: capitalised columns, tz-naive DatetimeIndex."""
    out = df.rename(columns=str.capitalize)
    out.index = out.index.tz_convert("UTC").tz_localize(None)
    return out
