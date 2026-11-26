"""Research helpers that bridge AMIS market data to external research libraries.

Everything here is additive and imports heavy libraries lazily, so AMIS itself
never depends on them.
"""
from .data_compat import (
    OHLCReport,
    normalize_deriv_candles,
    normalize_mt5_rates,
    to_backtesting_frame,
    validate_ohlc,
)

__all__ = [
    "OHLCReport",
    "normalize_deriv_candles",
    "normalize_mt5_rates",
    "to_backtesting_frame",
    "validate_ohlc",
]
