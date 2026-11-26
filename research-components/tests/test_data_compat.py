import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from amis_research import (  # noqa: E402
    normalize_deriv_candles,
    normalize_mt5_rates,
    to_backtesting_frame,
    validate_ohlc,
)
from amis_research.indicators import rsi, sma  # noqa: E402

T0 = 1_700_000_000


def deriv_rows(n=30, step=60):
    return [
        {"epoch": T0 + i * step, "open": 100 + i, "high": 101 + i, "low": 99 + i, "close": 100.5 + i}
        for i in range(n)
    ]


def mt5_rows(n=30, step=60):
    return [
        {"time": T0 + i * step, "open": 1.10 + i / 1e4, "high": 1.1005 + i / 1e4,
         "low": 1.0995 + i / 1e4, "close": 1.1002 + i / 1e4, "tick_volume": 10 + i,
         "spread": 2, "real_volume": 0}
        for i in range(n)
    ]


def test_deriv_candles_normalise_and_validate():
    df = normalize_deriv_candles(deriv_rows())
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert str(df.index.tz) == "UTC"
    assert validate_ohlc(df).ok


def test_mt5_rates_normalise_and_validate():
    df = normalize_mt5_rates(mt5_rows())
    assert df["volume"].iloc[0] == 10
    rep = validate_ohlc(df)
    assert rep.ok and rep.median_step_seconds == 60


def test_duplicates_are_collapsed_and_bad_bars_reported():
    rows = deriv_rows(5) + [deriv_rows(5)[-1]]
    assert len(normalize_deriv_candles(rows)) == 5
    df = normalize_deriv_candles(deriv_rows(5))
    df.iloc[2, df.columns.get_loc("high")] = 1.0
    rep = validate_ohlc(df)
    assert not rep.ok and rep.bad_high_low == 1


def test_weekend_style_gap_is_counted_not_fatal():
    rows = mt5_rows(10) + [dict(r, time=r["time"] + 172800) for r in mt5_rows(10)[5:]]
    df = normalize_mt5_rates(rows)
    rep = validate_ohlc(df)
    assert rep.gaps >= 1


def test_backtesting_layout():
    out = to_backtesting_frame(normalize_deriv_candles(deriv_rows()))
    assert list(out.columns) == ["Open", "High", "Low", "Close", "Volume"]
    assert out.index.tz is None


def test_indicators_fallback_shapes():
    close = normalize_deriv_candles(deriv_rows(40))["close"]
    assert sma(close, 5).iloc[-1] == close.iloc[-5:].mean()
    r = rsi(close, 14).dropna()
    assert ((r >= 0) & (r <= 100)).all()
