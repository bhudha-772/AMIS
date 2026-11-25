#!/usr/bin/env python3
"""
MT5 Connector — Bridges the React frontend (/api/mt5/*) to the
MetaTrader 5 terminal via the MetaTrader5 Python package.

Design notes
------------
* The MetaTrader5 package communicates with terminal64.exe through a named-pipe
  IPC layer. The terminal MUST be running before any mt5.* call succeeds.
* On first use the script auto-launches terminal64.exe if it is not already
  running, then polls until the pipe is ready (up to ~30 s).
* Symbol names use the "m" suffix (e.g. EURUSDm) which is the Exness MT5
  convention for extended-precision symbols.
"""
import sys
import os
import json
import time
import subprocess
import signal
import atexit
from pathlib import Path

# ── Ensure MT5 writes a debug log we can inspect ──────────────────────────
os.environ.setdefault("TERMINAL_LOG", "1")
os.environ.setdefault("MT5_LOG_LEVEL", "debug")

# ── Import MT5 library ─────────────────────────────────────────────────────
try:
    import MetaTrader5 as mt5  # pyrefly: ignore[missing-import]
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

# ── Singleton: track the process we launch so we can clean it up ───────────
_LAUNCHED_TERMINAL: subprocess.Popen | None = None


def _registry_terminal_path() -> str | None:
    """Try to locate terminal64.exe via the Windows uninstall registry key."""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\MetaTrader 5",
        )
        install_path, _ = winreg.QueryValueEx(key, "InstallLocation")
        winreg.CloseKey(key)
        exe = Path(install_path) / "terminal64.exe"
        if exe.exists():
            return str(exe)
    except Exception:
        pass
    return None


def _find_terminal_exe() -> str | None:
    """Return the absolute path to terminal64.exe, or None."""
    candidates = [
        r"C:\Program Files\MetaTrader 5\terminal64.exe",
        r"C:\Program Files (x86)\MetaTrader 5\terminal64.exe",
        r"C:\MetaTrader 5\terminal64.exe",
    ]
    for p in candidates:
        if Path(p).exists():
            return p
    # Fallback: registry
    reg = _registry_terminal_path()
    if reg:
        return reg
    return None


def _is_terminal_running() -> bool:
    """Check whether a terminal64.exe process is already alive."""
    try:
        for proc in subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq terminal64.exe", "/NH"],
            capture_output=True, text=True,
        ).stdout.splitlines():
            if "terminal64.exe" in proc.lower():
                return True
    except Exception:
        pass
    return False


def launch_terminal(terminal_exe: str) -> subprocess.Popen | None:
    """Launch terminal64.exe as a visible, persistent process.

    Does NOT hide the window and does NOT terminate the terminal on exit,
    so MT5 remains open for trading and user interaction.
    """
    try:
        # Launch terminal in normal desktop mode, detached so it stays open
        proc = subprocess.Popen(
            [terminal_exe],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True,
        )
        return proc
    except Exception as e:
        print(f"[MT5] Failed to launch terminal: {e}", file=sys.stderr)
        return None


def ensure_mt5_running(timeout: int = 8) -> bool:
    """Make sure the MT5 IPC pipe is ready and mt5.initialize() succeeds.

    Strategy:
    1. Try mt5.initialize() immediately (fast path, <1 s).
    2. Try mt5.initialize(path=exe_path) which allows MT5's official library to
       locate and connect/start the terminal.
    3. If needed, launch terminal64.exe visibly and poll until connected.
    """
    if not MT5_AVAILABLE:
        print("[MT5] MetaTrader5 package not installed", file=sys.stderr)
        return False

    # Fast path: try to initialize directly
    if mt5.initialize():
        print("[MT5] Connected to running terminal (fast path)", file=sys.stderr)
        return True

    exe_path = _find_terminal_exe()
    if exe_path:
        # Try initializing with explicit path
        try:
            if mt5.initialize(path=exe_path):
                print(f"[MT5] Connected via path: {exe_path}", file=sys.stderr)
                return True
        except Exception as e:
            print(f"[MT5] Initialize with path failed: {e}", file=sys.stderr)

    if not exe_path:
        print("[MT5] Cannot find terminal64.exe — is MetaTrader 5 installed?", file=sys.stderr)
        return False

    print(f"[MT5] Launching terminal: {exe_path}", file=sys.stderr)
    proc = launch_terminal(exe_path)

    # Poll until init succeeds or timeout
    deadline = time.time() + timeout
    attempt = 0
    while time.time() < deadline:
        time.sleep(2)
        attempt += 1
        if mt5.initialize(path=exe_path) if exe_path else mt5.initialize():
            print(f"[MT5] Successfully connected after launch (attempt {attempt})", file=sys.stderr)
            return True
        print(f"[MT5] Waiting for terminal IPC... (attempt {attempt})", file=sys.stderr)

    print("[MT5] Timeout waiting for terminal to initialize", file=sys.stderr)
    return False

def get_account_info():
    """Get MT5 account information"""
    if MT5_AVAILABLE:
        account_info = mt5.account_info()
        if account_info is None:
            return {
                "success": False,
                "error": "Failed to get account info from MT5"
            }
        else:
            # Log additional info for debugging
            print(f"[DEBUG] MT5 Account Info: {account_info}", file=sys.stderr)
            return {
                "success": True,
                "login": account_info.login,
                "name": account_info.name,
                "server": account_info.server,
                "currency": account_info.currency,
                "balance": account_info.balance,
                "equity": account_info.equity,
                "profit": account_info.profit,
                "margin": account_info.margin,
                "margin_free": account_info.margin_free,
                "margin_level": account_info.margin_level,
                # Return leverage as "1:N" string — matches the frontend's display format
                "leverage": f"1:{account_info.leverage}",
                "trade_mode": account_info.trade_mode,
                "trade_allowed": account_info.trade_allowed,
                "timestamp": time.time()
            }
    else:
        # Fallback dummy data
        return {
            "success": True,
            "login": 123456,
            "name": "Demo Account",
            "server": "MetaQuotes-Demo",
            "currency": "USD",
            "balance": 10000.0,
            "equity": 10000.0,
            "profit": 0.0,
            "margin": 0.0,
            "margin_free": 10000.0,
            "margin_level": 0.0,
            "leverage": 100,
            "timestamp": time.time()
        }

def get_ticks():
    """Get market ticks for major symbols"""
    if MT5_AVAILABLE:
        # Exness MT5 uses 'm' suffix for symbols
        symbols = ["EURUSDm", "GBPUSDm", "USDJPYm", "AUDUSDm", "USDCADm", "USDCHFm", "XAUUSDm", "UKOILm"]
        ticks_data = {}
        
        # Debug: Check which symbols are actually available
        print(f"[DEBUG] Checking {len(symbols)} symbols: {symbols}", file=sys.stderr)
        
        for symbol in symbols:
            # First check if symbol exists and is visible
            symbol_info = mt5.symbol_info(symbol)
            if symbol_info is None:
                print(f"[DEBUG] Symbol {symbol} not found", file=sys.stderr)
                continue
                
            if not symbol_info.visible:
                print(f"[DEBUG] Symbol {symbol} not visible, trying to select", file=sys.stderr)
                if not mt5.symbol_select(symbol, True):
                    print(f"[DEBUG] Failed to select symbol {symbol}", file=sys.stderr)
                    continue
            
            tick = mt5.symbol_info_tick(symbol)
            if tick:
                ticks_data[symbol] = {
                    "bid": tick.bid,
                    "ask": tick.ask,
                    "time": tick.time
                }
                print(f"[DEBUG] Got tick for {symbol}: bid={tick.bid}, ask={tick.ask}", file=sys.stderr)
            else:
                print(f"[DEBUG] No tick data for {symbol}", file=sys.stderr)
        
        print(f"[DEBUG] Returning {len(ticks_data)} ticks", file=sys.stderr)
        return {
            "success": True,
            "ticks": ticks_data,
            "timestamp": time.time()
        }
    else:
        # Fallback dummy data
        return {
            "success": True,
            "ticks": {
                "EURUSD": {"bid": 1.0800, "ask": 1.0802, "time": time.time()}
            },
            "timestamp": time.time()
        }

def get_available_symbols():
    """Get list of available symbols on the MT5 account"""
    if MT5_AVAILABLE:
        symbols = mt5.symbols_get()
        if symbols:
            # Return first 20 symbols for debugging
            symbol_list = []
            for symbol in symbols[:20]:
                symbol_list.append({
                    "name": symbol.name,
                    "path": symbol.path,
                    "digits": symbol.digits,
                    "bid": symbol.bid,
                    "ask": symbol.ask
                })
            return {
                "success": True,
                "symbols": symbol_list,
                "total_count": len(symbols)
            }
        else:
            return {
                "success": False,
                "error": "No symbols found"
            }
    else:
        return {
            "success": False,
            "error": "MT5 not available"
        }
        # Fallback dummy data
        return {
            "success": True,
            "ticks": {
                "EURUSD": {"bid": 1.0800, "ask": 1.0802, "time": time.time()}
            },
            "timestamp": time.time()
        }

def get_candles(symbol, timeframe, count):
    """Get candle data for a symbol"""
    if MT5_AVAILABLE:
        timeframe_map = {
            "M1": mt5.TIMEFRAME_M1,
            "M5": mt5.TIMEFRAME_M5,
            "M15": mt5.TIMEFRAME_M15,
            "M30": mt5.TIMEFRAME_M30,
            "H1": mt5.TIMEFRAME_H1,
            "H4": mt5.TIMEFRAME_H4,
            "D1": mt5.TIMEFRAME_D1
        }
        
        mt5_timeframe = timeframe_map.get(timeframe.upper(), mt5.TIMEFRAME_M15)
        
        if mt5.symbol_select(symbol, True):
            rates = mt5.copy_rates_from_pos(symbol, mt5_timeframe, 0, count)
            # Broker digit precision (e.g. XAUUSDm=3, UKOILm=3, EURUSDm=5).
            # The frontend needs this to format prices and derive pip size; without
            # it the UI silently assumed 5 digits for every instrument.
            sym_info = mt5.symbol_info(symbol)
            digits = int(sym_info.digits) if sym_info is not None else 5
            if rates is not None:
                candles = []
                for rate in rates:
                    candles.append({
                        "time": int(rate[0]),
                        "open": float(rate[1]),
                        "high": float(rate[2]),
                        "low": float(rate[3]),
                        "close": float(rate[4]),
                        "volume": int(rate[5])
                    })
                
                return {
                    "success": True,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "digits": digits,
                    "candles": candles,
                    "timestamp": time.time()
                }
            else:
                return {
                    "success": False,
                    "error": f"Failed to get candle data for {symbol}"
                }
        else:
            return {
                "success": False,
                "error": f"Failed to select symbol {symbol}"
            }
    else:
        # Fallback dummy data
        return {
            "success": True,
            "symbol": symbol,
            "timeframe": timeframe,
            "digits": 5,
            "candles": [],
            "timestamp": time.time()
        }
def execute_trade(symbol, direction, volume, take_profit=0, stop_loss=0, comment=""):
    """Execute a trade order"""
    if not MT5_AVAILABLE:
        return {
            "success": False,
            "error": "MT5 not available",
            "order_id": None
        }
    
    try:
        # Validate symbol
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None:
            return {
                "success": False,
                "error": f"Symbol {symbol} not found",
                "order_id": None
            }
        
        # Select symbol if not already selected
        if not symbol_info.visible:
            if not mt5.symbol_select(symbol, True):
                return {
                    "success": False,
                    "error": f"Failed to select symbol {symbol}",
                    "order_id": None
                }
        
        # Prepare order request
        order_type = mt5.ORDER_TYPE_BUY if direction.upper() == "BUY" else mt5.ORDER_TYPE_SELL
        price = mt5.symbol_info_tick(symbol).ask if order_type == mt5.ORDER_TYPE_BUY else mt5.symbol_info_tick(symbol).bid
        
        # Adapt the filling policy to what this symbol's broker actually accepts.
        # Exness commonly refuses ORDER_FILLING_IOC on FX/Metal symbols, and a
        # rejected filling mode makes order_send() bail out instead of returning
        # a result object at all.
        filling_mode = symbol_info.filling_mode
        if filling_mode is None:
            filling_mode = 0
        if filling_mode & mt5.ORDER_FILLING_FOK:
            order_filling = mt5.ORDER_FILLING_FOK
        elif filling_mode & mt5.ORDER_FILLING_IOC:
            order_filling = mt5.ORDER_FILLING_IOC
        else:
            order_filling = mt5.ORDER_FILLING_RETURN

        # Create order request
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(volume),
            "type": order_type,
            "price": price,
            "deviation": 20,
            "magic": 234000,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": order_filling,
        }
        # Only attach sl/tp when they are actually set. Passing "sl": 0 makes
        # order_send() fail with last_error (-2, 'Invalid "sl" argument') and
        # return None, which is why every order silently failed to place.
        if stop_loss and float(stop_loss) > 0:
            request["sl"] = float(stop_loss)
        if take_profit and float(take_profit) > 0:
            request["tp"] = float(take_profit)
        
        # Send order
        result = mt5.order_send(request)
        
        # order_send() returns None (not a result object) when the request never
        # reaches the trade server — most often because Algo Trading is disabled
        # in the terminal, the account is not allowed to trade, or the request
        # failed validation. Reading result.retcode here raised
        # "'NoneType' object has no attribute 'retcode'" and hid the real reason.
        if result is None:
            last_err = mt5.last_error()
            acct = mt5.account_info()
            diagnostics = {
                "last_error": str(last_err),
                "trade_allowed": getattr(acct, "trade_allowed", None),
                "trade_expert": getattr(acct, "trade_expert", None),
                "account_type": getattr(acct, "type", None),
                "login": getattr(acct, "login", None),
                "server": getattr(acct, "server", None),
                "volume_min": getattr(symbol_info, "volume_min", None),
                "volume_step": getattr(symbol_info, "volume_step", None),
                "filling_mode": filling_mode,
                "order_filling_used": order_filling,
                "price": price,
            }
            hint = ""
            if acct is not None and not getattr(acct, "trade_allowed", True):
                hint = " Broker reports trading NOT allowed on this account (trial/eval restriction)."
            elif acct is not None and not getattr(acct, "trade_expert", True):
                hint = " Algo Trading (Expert Advisors) is DISABLED in the MT5 terminal — press Ctrl+E and enable it."
            return {
                "success": False,
                "error": f"order_send returned None (last_error={last_err}).{hint}",
                "retcode": None,
                "diagnostics": diagnostics,
                "order_id": None
            }
        
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return {
                "success": False,
                "error": f"Order failed with code {result.retcode}: {result.comment}",
                "retcode": result.retcode,
                "order_id": None
            }
        
        return {
            "success": True,
            "order_id": result.order,
            "deal_id": result.deal,
            "price": result.price,
            "volume": result.volume,
            "comment": f"Successfully executed {direction} order for {symbol}"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Trade execution error: {str(e)}",
            "order_id": None
        }


def get_positions():
    """Get all open positions on the account"""
    if not MT5_AVAILABLE:
        return {"success": False, "error": "MT5 not available", "positions": []}
    try:
        positions = mt5.positions_get()
        if positions is None:
            return {"success": False, "error": f"positions_get failed: {mt5.last_error()}", "positions": []}
        result = []
        for pos in positions:
            result.append({
                "ticket": pos.ticket,
                "symbol": pos.symbol,
                "type": "BUY" if pos.type == mt5.POSITION_TYPE_BUY else "SELL",
                "volume": pos.volume,
                "openPrice": pos.price_open,
                "currentPrice": pos.price_current,
                "sl": pos.sl,
                "tp": pos.tp,
                "profit": pos.profit,
                "swap": pos.swap,
                "commission": 0.0,
                "time": pos.time,
                "comment": pos.comment
            })
        return {"success": True, "positions": result, "count": len(result)}
    except Exception as e:
        return {"success": False, "error": f"Positions error: {str(e)}", "positions": []}


def close_position(ticket):
    """Close an open position by ticket (send opposite market deal)"""
    if not MT5_AVAILABLE:
        return {"success": False, "error": "MT5 not available"}
    try:
        positions = mt5.positions_get(ticket=int(ticket))
        if not positions or len(positions) == 0:
            return {"success": False, "error": f"Position #{ticket} not found"}
        pos = positions[0]
        symbol = pos.symbol
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return {"success": False, "error": f"No tick data for {symbol}"}
        if pos.type == mt5.POSITION_TYPE_BUY:
            order_type = mt5.ORDER_TYPE_SELL
            price = tick.bid
        else:
            order_type = mt5.ORDER_TYPE_BUY
            price = tick.ask
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "position": pos.ticket,
            "symbol": symbol,
            "volume": pos.volume,
            "type": order_type,
            "price": price,
            "deviation": 20,
            "magic": 234000,
            "comment": "AMIS close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(request)
        if result is None:
            return {"success": False, "error": f"order_send returned None: {mt5.last_error()}"}
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return {"success": False, "error": f"Close failed with code {result.retcode}: {result.comment}", "retcode": result.retcode}
        return {"success": True, "ticket": ticket, "close_price": result.price, "comment": f"Position #{ticket} closed at {result.price}"}
    except Exception as e:
        return {"success": False, "error": f"Close error: {str(e)}"}


def modify_position(ticket, sl, tp):
    """Modify SL/TP of an open position by ticket"""
    if not MT5_AVAILABLE:
        return {"success": False, "error": "MT5 not available"}
    try:
        positions = mt5.positions_get(ticket=int(ticket))
        if not positions or len(positions) == 0:
            return {"success": False, "error": f"Position #{ticket} not found"}
        pos = positions[0]
        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "position": pos.ticket,
            "symbol": pos.symbol,
            "sl": float(sl) if sl and float(sl) > 0 else 0,
            "tp": float(tp) if tp and float(tp) > 0 else 0,
        }
        result = mt5.order_send(request)
        if result is None:
            return {"success": False, "error": f"order_send returned None: {mt5.last_error()}"}
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return {"success": False, "error": f"Modify failed with code {result.retcode}: {result.comment}", "retcode": result.retcode}
        return {"success": True, "ticket": ticket, "sl": request["sl"], "tp": request["tp"], "comment": f"Position #{ticket} SL/TP modified"}
    except Exception as e:
        return {"success": False, "error": f"Modify error: {str(e)}"}

def main():
    try:
        # Ensure the MT5 terminal is running before any mt5.* call
        if MT5_AVAILABLE:
            if not ensure_mt5_running():
                result = {
                    'success': False,
                    'error': 'Failed to connect to MT5 terminal. Is it installed and accessible?',
                    'last_error': str(mt5.last_error()) if hasattr(mt5, 'last_error') else 'No error info'
                }
                print(json.dumps(result))
                return
            print('[DEBUG] MT5 connected successfully', file=sys.stderr)
            account_info = mt5.account_info()
            if account_info:
                print(f'[DEBUG] Account: {account_info.login} @ {account_info.server}', file=sys.stderr)

        # Handle commands based on arguments
        if len(sys.argv) <= 1:
            result = get_account_info()
        elif sys.argv[1] == 'ticks':
            result = get_ticks()
        elif sys.argv[1] == 'symbols':
            result = get_available_symbols()
        elif sys.argv[1] == 'candles' and len(sys.argv) >= 5:
            symbol = sys.argv[2]
            timeframe = sys.argv[3]
            count = int(sys.argv[4])
            result = get_candles(symbol, timeframe, count)
        elif sys.argv[1] == 'trade' and len(sys.argv) >= 7:
            symbol = sys.argv[2]
            direction = sys.argv[3]
            volume = sys.argv[4]
            take_profit = sys.argv[5]
            stop_loss = sys.argv[6]
            comment = sys.argv[7] if len(sys.argv) > 7 else ''
            result = execute_trade(symbol, direction, volume, take_profit, stop_loss, comment)
        elif sys.argv[1] == 'positions':
            result = get_positions()
        elif sys.argv[1] == 'close' and len(sys.argv) >= 3:
            result = close_position(sys.argv[2])
        elif sys.argv[1] == 'modify' and len(sys.argv) >= 5:
            result = modify_position(sys.argv[2], sys.argv[3], sys.argv[4])
        elif sys.argv[1] == 'scan':
            exclude_symbols = sys.argv[2] if len(sys.argv) > 2 else ''
            result = {
                'success': False,
                'error': 'Scan command moved to separate scanner. Use mt5_scanner.py'
            }
        else:
            result = {
                'success': False,
                'error': 'Unknown command. Available: ticks, symbols, candles, trade'
            }

        print(json.dumps(result))

    except Exception as e:
        result = {
            "success": False,
            "error": f"Script error: {str(e)}"
        }
        print(json.dumps(result))

if __name__ == "__main__":
    main()