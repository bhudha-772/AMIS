"""Indicator access: TA-Lib when installed, otherwise a pandas fallback."""
from __future__ import annotations

import pandas as pd

try:  # optional native dependency
    import talib as _talib  # type: ignore
except Exception:  # pragma: no cover - depends on environment
    _talib = None

HAS_TALIB = _talib is not None


def sma(close: pd.Series, period: int) -> pd.Series:
    if HAS_TALIB:
        return pd.Series(_talib.SMA(close.to_numpy(float), timeperiod=period), index=close.index)
    return close.rolling(period).mean()


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Wilder RSI. Matches TA-Lib's RSI once warmed up."""
    if HAS_TALIB:
        return pd.Series(_talib.RSI(close.to_numpy(float), timeperiod=period), index=close.index)
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    return 100 - 100 / (1 + gain / loss)
