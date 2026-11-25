#!/usr/bin/env python3
import sys
import json
import time
import math
try:
    import MetaTrader5 as mt5  # pyrefly: ignore[missing-import]
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

def calculate_liquidity_sweeps(candles):
    """Calculate liquidity sweep zones"""
    if len(candles) < 10:
        return {"high_sweeps": [], "low_sweeps": [], "recent_high": 0, "recent_low": 0}
    
    # Find recent significant highs/lows
    highs = [c['high'] for c in candles[-20:]]
    lows = [c['low'] for c in candles[-20:]]
    
    recent_high = max(highs[:-5]) if len(highs) > 5 else max(highs)
    recent_low = min(lows[:-5]) if len(lows) > 5 else min(lows)
    
    # Identify potential liquidity sweeps
    high_sweeps = []
    low_sweeps = []
    
    # Check for price rejection above/below recent extremes
    for i, candle in enumerate(candles[-10:]):
        if candle['close'] > recent_high and candle['open'] < recent_high:
            # Potential high sweep
            high_sweeps.append({
                "time": candle['time'],
                "level": recent_high,
                "strength": (candle['close'] - recent_high) / recent_high * 100
            })
        
        if candle['close'] < recent_low and candle['open'] > recent_low:
            # Potential low sweep
            low_sweeps.append({
                "time": candle['time'],
                "level": recent_low,
                "strength": (recent_low - candle['close']) / recent_low * 100
            })
    
    return {
        "high_sweeps": high_sweeps,
        "low_sweeps": low_sweeps,
        "recent_high": recent_high,
        "recent_low": recent_low
    }

def calculate_advanced_indicators(candles):
    """Calculate advanced technical indicators"""
    if len(candles) < 20:
        return {}
    
    closes = [c['close'] for c in candles]
    highs = [c['high'] for c in candles]
    lows = [c['low'] for c in candles]
    
    # RSI Calculation
    def calculate_rsi(prices, period=14):
        deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]
        gains = [max(0, delta) for delta in deltas]
        losses = [max(0, -delta) for delta in deltas]
        
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        
        rsi_values = []
        for i in range(period, len(deltas)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            rs = avg_gain / avg_loss if avg_loss != 0 else 0
            rsi = 100 - (100 / (1 + rs))
            rsi_values.append(rsi)
        
        return rsi_values[-1] if rsi_values else 50
    
    # MACD Calculation
    def calculate_ema_series(prices, period):
        """True EMA over the FULL price series (seeded with an SMA of the first `period` bars)."""
        if not prices:
            return []
        if len(prices) < period:
            return [prices[-1]]
        k = 2 / (period + 1)
        series = [sum(prices[:period]) / period]
        for price in prices[period:]:
            series.append(price * k + series[-1] * (1 - k))
        return series

    def calculate_ema(prices, period):
        series = calculate_ema_series(prices, period)
        return series[-1] if series else (prices[-1] if prices else 0)
    
    def calculate_macd(prices):
        """Standard MACD(12, 26, 9).

        The previous implementation was doubly broken:
          1. EMA12/EMA26 were rebuilt from truncated windows (prices[-12:] / prices[-26:]),
             so they were not real EMAs.
          2. The signal line was `calculate_ema([macd_line], 9)` — an EMA of a
             ONE-element list, which mathematically always returns that same element.
             Therefore signal == macd and `histogram` was permanently 0.0.
        Because the confluence score reads `macd_histogram` to add/subtract 10 points,
        a permanently-zero histogram silently deleted that whole scoring component —
        which is a major reason the Confluence Score looked frozen.
        """
        if len(prices) < 26:
            return {"macd": 0, "signal": 0, "histogram": 0}
        
        ema12_series = calculate_ema_series(prices, 12)
        ema26_series = calculate_ema_series(prices, 26)
        if not ema12_series or not ema26_series:
            return {"macd": 0, "signal": 0, "histogram": 0}
        
        # Build the MACD line history (one value per bar) so the signal line is a
        # genuine EMA9 of MACD values rather than of a single point.
        start = len(ema12_series) - len(ema26_series)
        macd_history = [
            ema12_series[start + i] - ema26_series[i]
            for i in range(len(ema26_series))
        ]
        
        macd_line = macd_history[-1]
        signal_series = calculate_ema_series(macd_history, 9)
        signal_line = signal_series[-1] if signal_series else macd_line
        histogram = macd_line - signal_line
        
        return {
            "macd": round(macd_line, 5),
            "signal": round(signal_line, 5),
            "histogram": round(histogram, 5)
        }
    
    # Bollinger Bands Calculation
    def calculate_bollinger_bands(prices, period=20, multiplier=2):
        if len(prices) < period:
            return {"middle": 0, "upper": 0, "lower": 0, "bandwidth": 0}
        
        middle_band = sum(prices[-period:]) / period
        std_dev = math.sqrt(sum((price - middle_band) ** 2 for price in prices[-period:]) / period)
        upper_band = middle_band + (multiplier * std_dev)
        lower_band = middle_band - (multiplier * std_dev)
        bandwidth = (upper_band - lower_band) / middle_band * 100
        
        return {
            "middle": round(middle_band, 5),
            "upper": round(upper_band, 5),
            "lower": round(lower_band, 5),
            "bandwidth": round(bandwidth, 2)
        }
    
    # Calculate current price position relative to BB
    def get_bb_position(price, bb):
        if bb['upper'] == bb['lower']:
            return "MIDDLE"
        position = (price - bb['lower']) / (bb['upper'] - bb['lower'])
        if position > 0.7:
            return "UPPER_BAND_BREACH"
        elif position < 0.3:
            return "LOWER_BAND_BREACH"
        else:
            return "MIDDLE"
    
    # ADX Calculation — proper Wilder's ADX(14)
    def calculate_adx(highs, lows, closes, period=14):
        """Standard Wilder's ADX.

        The previous version returned a RAW 14-bar DX:
          - no True Range normalisation at all, and
          - no Wilder smoothing of DX into ADX.
        Because it was a single unsmoothed window, one new candle could swing the
        value 30+ points (measured live: USDJPYm 7.06 -> 38.24 within 45 seconds),
        which made the UI's "TREND / CHOP" chip flip randomly.

        Proper ADX is heavily smoothed by design, so it moves slowly and is actually
        usable as a regime filter.
        """
        n = len(closes)
        if n < period + 2:
            return 20.0  # Default neutral value

        tr_list = []
        plus_dm_list = []
        minus_dm_list = []

        for i in range(1, n):
            up_move = highs[i] - highs[i - 1]
            down_move = lows[i - 1] - lows[i]

            plus_dm_list.append(up_move if (up_move > down_move and up_move > 0) else 0.0)
            minus_dm_list.append(down_move if (down_move > up_move and down_move > 0) else 0.0)

            # True Range must include gaps against the previous close
            tr = max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1])
            )
            tr_list.append(tr)

        if len(tr_list) < period:
            return 20.0

        # Wilder smoothing: first value is the simple sum, then
        # smoothed = smoothed_prev - (smoothed_prev / period) + current
        tr_smooth = sum(tr_list[:period])
        plus_smooth = sum(plus_dm_list[:period])
        minus_smooth = sum(minus_dm_list[:period])

        dx_values = []

        def push_dx(tr_s, plus_s, minus_s):
            if tr_s <= 0:
                return
            plus_di = 100.0 * (plus_s / tr_s)
            minus_di = 100.0 * (minus_s / tr_s)
            di_sum = plus_di + minus_di
            if di_sum <= 0:
                return
            dx_values.append(100.0 * abs(plus_di - minus_di) / di_sum)

        push_dx(tr_smooth, plus_smooth, minus_smooth)

        for i in range(period, len(tr_list)):
            tr_smooth = tr_smooth - (tr_smooth / period) + tr_list[i]
            plus_smooth = plus_smooth - (plus_smooth / period) + plus_dm_list[i]
            minus_smooth = minus_smooth - (minus_smooth / period) + minus_dm_list[i]
            push_dx(tr_smooth, plus_smooth, minus_smooth)

        if not dx_values:
            return 20.0

        # ADX = Wilder average of DX. Seed with the mean of the first `period` DX
        # readings, then smooth each subsequent one.
        if len(dx_values) < period:
            adx = sum(dx_values) / len(dx_values)
        else:
            adx = sum(dx_values[:period]) / period
            for dx in dx_values[period:]:
                adx = ((adx * (period - 1)) + dx) / period

        return min(100.0, max(0.0, adx))
    
    # Return advanced indicators
    macd_data = calculate_macd(closes)
    return {
        "adx": calculate_adx(highs, lows, closes),
        "rsi": calculate_rsi(closes),
        "macd": macd_data,
        # Flat alias of macd_data["histogram"]. The confluence scorer below reads
        # data["indicators"]["macd_histogram"] — before this alias existed that key
        # was absent, so the MACD +/-10 scoring term never ran at all.
        "macd_histogram": macd_data["histogram"],
        "bollinger": calculate_bollinger_bands(closes),
        "current_price": closes[-1] if closes else 0,
        "avg_volume": sum([c.get('volume', 0) for c in candles]) / len(candles) if candles else 0,
        "volatility": calculate_volatility(closes)
    }

def calculate_volatility(prices, period=20):
    """Calculate price volatility as percentage"""
    if len(prices) < 2:
        return 0
    recent = prices[-period:] if len(prices) >= period else prices
    if len(recent) < 2:
        return 0
    mean = sum(recent) / len(recent)
    variance = sum((p - mean) ** 2 for p in recent) / len(recent)
    std_dev = math.sqrt(variance)
    return (std_dev / mean) * 100 if mean != 0 else 0

def calculate_advanced_indicators_legacy(candles):
    """DEAD CODE — NOT CALLED ANYWHERE. Kept only for historical reference.

    Do NOT wire this up as a fallback: its nested `calculate_macd` (below) still
    contains the original defect where the signal line was computed as
    `calculate_ema([macd_line], 9)` — an EMA of a one-element list, which is
    mathematically identical to `macd_line`, making the histogram permanently 0.0.

    The live scanner uses `calculate_advanced_indicators` (defined above), which is
    fixed and validated against pandas' EMA implementation (scratch/test_macd.py).
    """
    if len(candles) < 20:
        return {}
    
    closes = [c['close'] for c in candles]
    highs = [c['high'] for c in candles]
    lows = [c['low'] for c in candles]
    
    # RSI Calculation
    def calculate_rsi(prices, period=14):
        deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]
        gains = [max(0, delta) for delta in deltas]
        losses = [max(0, -delta) for delta in deltas]
        
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        
        rsi_values = []
        for i in range(period, len(deltas)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            rs = avg_gain / avg_loss if avg_loss != 0 else 0
            rsi = 100 - (100 / (1 + rs))
            rsi_values.append(rsi)
        
        return rsi_values[-1] if rsi_values else 50
    
    # MACD Calculation
    def calculate_ema(prices, period):
        if len(prices) < period:
            return prices[-1] if prices else 0
        k = 2 / (period + 1)
        ema = prices[0]
        for price in prices[1:]:
            ema = price * k + ema * (1 - k)
        return ema
    
    def calculate_macd(prices):
        if len(prices) < 26:
            return {"macd": 0, "signal": 0, "histogram": 0}
        
        ema12 = calculate_ema(prices[-12:], 12)
        ema26 = calculate_ema(prices[-26:], 26)
        macd_line = ema12 - ema26
        signal_line = calculate_ema([macd_line], 9)  # Simplified
        histogram = macd_line - signal_line
        
        return {"macd": macd_line, "signal": signal_line, "histogram": histogram}
    
    # Bollinger Bands
    def calculate_bollinger_bands(prices, period=20, std_dev=2):
        if len(prices) < period:
            return {"upper": prices[-1], "middle": prices[-1], "lower": prices[-1]}
        
        middle_band = sum(prices[-period:]) / period
        variance = sum((price - middle_band) ** 2 for price in prices[-period:]) / period
        std_deviation = math.sqrt(variance)
        
        upper_band = middle_band + (std_dev * std_deviation)
        lower_band = middle_band - (std_dev * std_deviation)
        
        return {"upper": upper_band, "middle": middle_band, "lower": lower_band}
    
    # Calculate indicators
    rsi = calculate_rsi(closes, 14) if len(closes) >= 14 else 50
    macd_data = calculate_macd(closes)
    bb_data = calculate_bollinger_bands(closes, 20)
    
    # Volume Profile (simplified)
    volumes = [c['tick_volume'] for c in candles[-20:]] if 'tick_volume' in candles[0] else [1] * min(20, len(candles))
    avg_volume = sum(volumes) / len(volumes) if volumes else 1
    
    return {
        "rsi": round(rsi, 2),
        "macd": round(macd_data["macd"], 5),
        "macd_signal": round(macd_data["signal"], 5),
        "macd_histogram": round(macd_data["histogram"], 5),
        "bb_upper": round(bb_data["upper"], 5),
        "bb_middle": round(bb_data["middle"], 5),
        "bb_lower": round(bb_data["lower"], 5),
        "current_price": closes[-1],
        "avg_volume": round(avg_volume, 2),
        "volatility": round((max(highs[-10:]) - min(lows[-10:])) / closes[-1] * 100, 2)
    }

def analyze_trend_structure(candles):
    """Analyze trend structure and momentum.

    BULLISH/BEARISH/NEUTRAL is decided by comparing the MA5/MA20 separation against the
    market's OWN noise level (standard deviation of the closes) instead of a fixed 0.1%
    price buffer.

    The old fixed `* 1.001 / * 0.999` buffer was arbitrary and mis-scaled: on a $4338
    instrument 0.1% is ~$4.3 while on EURUSD it is 0.0012 — so the same rule meant wildly
    different things per symbol and per timeframe, and it left ~63% of all
    symbol/timeframe cells stamped NEUTRAL (which the UI rendered as the word "SCAN").
    Treating the gap as noise unless it clears a fraction of one standard deviation is
    scale-free, so gold, oil and FX are now judged on equal footing.

    Returns the MA gap and the band used, so callers can show why a verdict was chosen.
    """
    if len(candles) < 10:
        return {"trend": "NEUTRAL", "strength": 0, "momentum": 0, "gap": 0, "band": 0}
    
    # Simple trend based on moving averages
    closes = [c['close'] for c in candles]
    short_ma = sum(closes[-5:]) / 5
    long_ma = sum(closes[-20:]) / 20 if len(closes) >= 20 else sum(closes) / len(closes)
    
    # Momentum calculation
    momentum = ((closes[-1] - closes[-5]) / closes[-5] * 100) if len(closes) >= 5 else 0
    
    # Noise level of this specific market/timeframe.
    window = closes[-20:] if len(closes) >= 20 else closes
    mean = sum(window) / len(window)
    variance = sum((p - mean) ** 2 for p in window) / len(window)
    sigma = variance ** 0.5

    # MA separation must clear half a standard deviation to count as a real lean.
    # (Floored at 0.02% of price so that a near-zero sigma cannot make pure noise
    # classify as a strong trend.)
    gap = short_ma - long_ma
    band = max(sigma * 0.5, long_ma * 0.0002)
    
    if gap > band:
        trend = "BULLISH"
    elif gap < -band:
        trend = "BEARISH"
    else:
        trend = "NEUTRAL"
    
    strength = abs(short_ma - long_ma) / long_ma * 100
    
    return {
        "trend": trend,
        "strength": round(strength, 2),
        "momentum": round(momentum, 2),
        "short_ma": round(short_ma, 5),
        "long_ma": round(long_ma, 5),
        "gap": round(gap, 5),
        "band": round(band, 5)
    }

def scan_symbol(symbol):
    """Scan a single symbol for trading opportunities"""
    if not MT5_AVAILABLE:
        return None
    
    # Get candle data for multiple timeframes
    timeframes = {
        "M5": mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15,
        "M30": mt5.TIMEFRAME_M30,
        "H1": mt5.TIMEFRAME_H1,
        "H4": mt5.TIMEFRAME_H4
    }
    
    analysis_results = {}
    latest_candles = {}
    
    for tf_name, tf_value in timeframes.items():
        rates = mt5.copy_rates_from_pos(symbol, tf_value, 0, 50)
        if rates is not None and len(rates) > 0:
            candles = []
            for rate in rates:
                candles.append({
                    "time": int(rate[0]),
                    "open": float(rate[1]),
                    "high": float(rate[2]),
                    "low": float(rate[3]),
                    "close": float(rate[4]),
                    "tick_volume": int(rate[5])
                })
            
            if candles:
                latest_candles[tf_name] = candles[-1]
                liquidity_data = calculate_liquidity_sweeps(candles)
                indicators_data = calculate_advanced_indicators(candles)
                trend_data = analyze_trend_structure(candles)
                
                analysis_results[tf_name] = {
                    "liquidity": liquidity_data,
                    "indicators": indicators_data,
                    "trend": trend_data,
                    "candle_count": len(candles)
                }
    
    if not analysis_results:
        return None
    
    # Consolidate multi-timeframe analysis
    consolidated_score = 0
    trend_signals = []
    timeframes_with_data = list(analysis_results.keys())
    
    for tf_name in timeframes_with_data:
        data = analysis_results[tf_name]
        
        # Scoring based on various factors.
        # Every term below is CONTINUOUS in its input and tapers to zero at its
        # threshold. The previous version used hard step functions (RSI < 30 ? +15 : 0,
        # trend BULLISH ? +15 : 0, |momentum| > 0.5 ? ...), so the score could only ever
        # move in rigid quanta: a single timeframe flipping its trend label shifted the
        # headline by exactly 15/5 = 3.00, and a MACD sign flip shifted it by 10/5 = 2.00.
        # That made a live panel look like it was jumping between a couple of frozen
        # values. Smooth terms let the score follow price tick-by-tick.
        score = 50  # Base score
        
        ind = data["indicators"]
        tr = data["trend"]
        
        # --- RSI term (up to +15 oversold / +10 overbought) ---
        # Faithful to the original intent: BOTH extremes are treated as opportunity
        # (oversold = reversion entry, overbought = trend continuation), which is why
        # the confluence score is an "opportunity" gauge rather than a direction gauge.
        # The taper makes the contribution approach 0 exactly at RSI 30/70, so crossing
        # the threshold no longer causes a jump.
        rsi = ind.get("rsi", 50)
        if rsi < 30:
            score += 15 * ((30 - rsi) / 30)
        elif rsi > 70:
            score += 10 * ((rsi - 70) / 30)
        
        # --- MACD term (up to +/-10), magnitude scaled ---
        # Normalised against price so gold, oil and FX are scored on the same scale.
        # Because the term is proportional to the histogram, a histogram drifting
        # through zero now slides the score smoothly instead of snapping by 10 points.
        hist = ind.get("macd_histogram", 0)
        ref_price = ind.get("current_price") or 0
        if ref_price:
            macd_scale = abs(ref_price) * 0.002   # 0.2% of price == full weight
            macd_norm = max(-1.0, min(1.0, hist / macd_scale))
            score += 10 * macd_norm
        
        # --- Trend term (up to +15 bullish / -10 bearish), lean scaled ---
        # Scaled by how far the MA gap has travelled beyond the market's own noise
        # band (`band`), so a barely-trending market contributes almost nothing even
        # though its label already reads BULLISH.
        gap = tr.get("gap", 0)
        band = tr.get("band", 0)
        if band:
            lean = max(-1.0, min(1.0, gap / (band * 3)))
            score += (15 * lean) if lean > 0 else (10 * lean)
        
        # --- Momentum term (up to +10 / -5), continuous from zero ---
        momentum = tr.get("momentum", 0)
        mom_norm = max(-1.0, min(1.0, abs(momentum) / 5))
        score += (10 * mom_norm) * (1 if momentum > 0 else -0.5)
        
        # --- Volatility term (up to +5), already continuous ---
        vol = ind.get("volatility", 0)
        score += min(vol * 2, 5)
        
        # Momentum is rounded to 2dp upstream; surface more precision so the headline
        # score can express sub-0.1 movement instead of appearing to hold still.
        score = max(0, min(100, score))
        score = round(score, 3)
        
        consolidated_score += score
        macd_hist_tf = ind.get("macd_histogram", 0)
        trend_signals.append(
            f"{tf_name}: {tr['trend']} ({round(score, 2)}) | "
            f"RSI {round(ind.get('rsi', 50), 1)} | "
            f"ADX {round(ind.get('adx', 0), 1)} | "
            f"MACD {'+' if macd_hist_tf > 0 else '-' if macd_hist_tf < 0 else '0'}"
        )
    
    avg_score = consolidated_score / len(timeframes_with_data) if timeframes_with_data else 50
    
    # Determine overall bias
    if avg_score > 60:
        overall_bias = "BUY"
    elif avg_score < 40:
        overall_bias = "SELL"
    else:
        overall_bias = "NEUTRAL"
    
    return {
        "symbol": symbol,
        "score": round(avg_score, 2),
        "bias": overall_bias,
        "timeframes": analysis_results,
        "trend_signals": trend_signals,
        "latest_prices": {tf: data["close"] for tf, data in latest_candles.items()} if latest_candles else {},
        "consolidated_analysis": f"Multi-timeframe confluence shows {overall_bias} bias with {len(timeframes_with_data)} timeframes analyzed"
    }
def scan_all_markets(exclude_symbols=""):
    """Scan all major markets and rank them"""
    if not MT5_AVAILABLE:
        return {
            "success": True,
            "markets": [],
            "best": None,
            "timestamp": time.time(),
            "analysis_summary": "MT5 not available - using demo data"
        }
    
    # Major forex pairs typically available on Exness MT5
    major_pairs = [
        "EURUSDm", "GBPUSDm", "USDJPYm", "AUDUSDm", "USDCADm", 
        "USDCHFm", "NZDUSDm", "EURJPYm", "GBPJPYm", "EURGBPm",
        "XAUUSDm", "UKOILm", "USOILm"
    ]
    
    # Remove excluded symbols
    if exclude_symbols:
        exclude_list = [s.strip() for s in exclude_symbols.split(",")]
        major_pairs = [pair for pair in major_pairs if pair not in exclude_list]
    
    # Try to select all symbols
    available_symbols = []
    for symbol in major_pairs:
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is not None:
            if not symbol_info.visible:
                if mt5.symbol_select(symbol, True):
                    available_symbols.append(symbol)
            else:
                available_symbols.append(symbol)
    
    # Scan each symbol
    market_results = []
    for symbol in available_symbols:
        try:
            result = scan_symbol(symbol)
            if result:
                market_results.append(result)
        except Exception as e:
            print(f"[DEBUG] Error scanning {symbol}: {str(e)}", file=sys.stderr)
            continue
    
    # Sort by score
    market_results.sort(key=lambda x: x["score"], reverse=True)
    
    # Get the best performer
    best_market = market_results[0] if market_results else None
    
    return {
        "success": True,
        "markets": market_results,
        "best": best_market,
        "total_analyzed": len(market_results),
        "timestamp": time.time(),
        "analysis_summary": f"Analyzed {len(market_results)} markets. Best performer: {best_market['symbol'] if best_market else 'None'} (Score: {best_market['score'] if best_market else 0})"
    }


import subprocess as _subprocess
from pathlib import Path as _Path

def _find_terminal_exe():
    for p in [r"C:\Program Files\MetaTrader 5\terminal64.exe",
              r"C:\Program Files (x86)\MetaTrader 5\terminal64.exe"]:
        if _Path(p).exists():
            return p
    return None

def _is_terminal_running():
    try:
        out = _subprocess.run(["tasklist", "/FI", "IMAGENAME eq terminal64.exe", "/NH"],
                              capture_output=True, text=True).stdout
        return "terminal64.exe" in out.lower()
    except Exception:
        return False

def _launch_terminal(exe_path):
    try:
        info = _subprocess.STARTUPINFO()
        info.dwFlags |= _subprocess.STARTF_USESHOWWINDOW
        info.wShowWindow = 0
        return _subprocess.Popen([exe_path], startupinfo=info,
                                  creationflags=_subprocess.CREATE_NO_WINDOW)
    except Exception as e:
        print(f"[MT5 SCAN] Failed to launch terminal: {e}", file=sys.stderr)
        return None

def _ensure_mt5_running(timeout=12):  # BUG FIX: was 30s — exceeded the server's execAsync kill timeout, causing empty stdout and the demo fallback to also hang
    if not MT5_AVAILABLE:
        return False
    if _is_terminal_running():
        if mt5.initialize():
            return True
    exe = _find_terminal_exe()
    if not exe:
        print("[MT5 SCAN] Cannot find terminal64.exe", file=sys.stderr)
        return False
    print(f"[MT5 SCAN] Launching terminal: {exe}", file=sys.stderr)
    proc = _launch_terminal(exe)
    if proc is None:
        return False
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(1)
        if _is_terminal_running() and mt5.initialize():
            return True
        if proc.poll() is not None:
            return False
    return False

def main():
    try:
        if MT5_AVAILABLE:
            if not _ensure_mt5_running():
                print(json.dumps({
                    "success": False,
                    "error": "Failed to connect to MT5 terminal. Is it installed and accessible?",
                    "timestamp": time.time()
                }))
                return

        if len(sys.argv) > 1 and sys.argv[1] == "scan":
            exclude_symbols = sys.argv[2] if len(sys.argv) > 2 else ""
            result = scan_all_markets(exclude_symbols)
        else:
            result = {
                "success": False,
                "error": "Unknown command. Use 'scan' with optional exclude symbols",
                "timestamp": time.time()
            }

        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "timestamp": time.time()
        }))

if __name__ == "__main__":
    main()