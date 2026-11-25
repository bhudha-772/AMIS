#!/usr/bin/env python3
"""
Deriv market scanner for Over 1 / Under 8 (1 tick).

What it does
  1. Lists the open synthetic-index markets.
  2. Pulls the last 5,000 ticks of each and extracts the last digit.
  3. Asks Deriv for the live payout of DIGITOVER 1 and DIGITUNDER 8 on each market.
  4. For every (market, contract) it reports win rate, a 95% interval, the break-even
     win rate implied by the payout, expected value, and a significance test that is
     corrected for scanning many markets at once.
  5. Verdict: TRADE only if a market has a statistically supported edge that also holds
     in both halves of the sample. Otherwise it tells you the best-payout market, which
     is the one real difference between markets, and says plainly that it is still a
     negative-expected-value trade.

Usage
  pip install websockets
  python3 deriv_market_scanner.py              live scan (needs internet access to Deriv)
  python3 deriv_market_scanner.py --selftest   offline test on simulated markets
  python3 deriv_market_scanner.py --ticks 5000 --app-id 1089

Note: the live connection part was NOT run by the author (Deriv was unreachable from the
build environment). The analysis part was tested offline with --selftest.
"""
import argparse
import asyncio
import json
import math
import random
import sys

WS_URL = "wss://ws.derivws.com/websockets/v3?app_id={app_id}"
BASE_P = 0.80          # fair win probability of Over 1 and of Under 8
CONTRACTS = {"over1": ("DIGITOVER", "1", lambda d: d >= 2),
             "under8": ("DIGITUNDER", "8", lambda d: d <= 7)}


# ---------------------------------------------------------------- statistics
def wilson(k, n, z=1.96):
    if n == 0:
        return 0.0, 1.0
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return centre - half, centre + half


def p_greater(k, n, p0=BASE_P):
    """One-sided normal-approx p-value for 'true win rate > p0'."""
    if n == 0:
        return 1.0
    z = (k / n - p0) / math.sqrt(p0 * (1 - p0) / n)
    return 0.5 * math.erfc(z / math.sqrt(2))


def analyze(markets, alpha=0.05):
    """markets: {symbol: {"digits": [int,...], "payout": {"over1": r, "under8": r}}}
    r = net profit per 1 staked on a win (payout/stake - 1)."""
    rows = []
    for sym, m in markets.items():
        d = m["digits"]
        n = len(d)
        for key, (_, _, win) in CONTRACTS.items():
            r = m["payout"].get(key)
            wins = [1 if win(x) else 0 for x in d]
            k = sum(wins)
            half = n // 2
            k1, k2 = sum(wins[:half]), sum(wins[half:])
            rows.append(dict(symbol=sym, contract=key, n=n, k=k, wr=k / n if n else 0.0,
                             lo=wilson(k, n)[0], hi=wilson(k, n)[1],
                             p=p_greater(k, n), p1=p_greater(k1, half), p2=p_greater(k2, n - half),
                             r=r))
    tests = len(rows)
    for row in rows:
        row["p_adj"] = min(1.0, row["p"] * tests)            # Bonferroni
        r = row["r"]
        if r is None:
            row.update(be=None, ev_fair=None, ev_emp=None, ev_low=None, supported=False)
            continue
        row["be"] = 1 / (1 + r)                              # break-even win rate
        row["ev_fair"] = BASE_P * r - (1 - BASE_P)           # EV if the feed is fair (80%)
        row["ev_emp"] = row["wr"] * r - (1 - row["wr"])
        row["ev_low"] = row["lo"] * r - (1 - row["lo"])      # conservative EV
        row["supported"] = (row["p_adj"] < alpha and row["lo"] > row["be"]
                            and row["p1"] < 0.05 and row["p2"] < 0.05)
    return rows, tests


def report(rows, tests):
    print("\nScanned %d market/contract pairs (Bonferroni factor %d)\n" % (len(rows), tests))
    hdr = "%-10s %-7s %6s %7s %15s %7s %8s %9s %9s %s" % (
        "market", "type", "n", "win%", "95% interval", "payout", "breakev%", "EV(fair)", "p_adj", "")
    print(hdr)
    print("-" * len(hdr))
    ranked = sorted(rows, key=lambda x: (x["ev_fair"] if x["ev_fair"] is not None else -9), reverse=True)
    for x in ranked:
        pay = "%5.1f%%" % (100 * x["r"]) if x["r"] is not None else "   n/a"
        be = "%7.2f" % (100 * x["be"]) if x["be"] is not None else "    n/a"
        evf = "%+8.4f" % x["ev_fair"] if x["ev_fair"] is not None else "     n/a"
        flag = "<-- supported edge" if x.get("supported") else ""
        print("%-10s %-7s %6d %7.2f %7.2f-%-7.2f %7s %8s %9s %9.3f %s" % (
            x["symbol"], x["contract"], x["n"], 100 * x["wr"], 100 * x["lo"], 100 * x["hi"],
            pay, be, evf, x["p_adj"], flag))
    winners = [x for x in rows if x.get("supported")]
    print()
    if winners:
        best = max(winners, key=lambda x: x["ev_low"])
        print("VERDICT: TRADE %s %s. Win rate %.2f%% (95%% low %.2f%%) vs break-even %.2f%%, holds in both halves."
              % (best["symbol"], best["contract"], 100 * best["wr"], 100 * best["lo"], 100 * best["be"]))
        print("Re-scan on fresh ticks before relying on it. A real bias should persist; luck will not.")
    else:
        priced = [x for x in rows if x["ev_fair"] is not None]
        print("VERDICT: NO market shows a statistically supported edge. Do not expect a win-rate advantage anywhere.")
        if priced:
            b = max(priced, key=lambda x: x["ev_fair"])
            print("The only real difference is payout. Highest payout: %s %s at %.1f%% (break-even needs 25.0%% at an 80%% win rate)."
                  % (b["symbol"], b["contract"], 100 * b["r"]))
            if b["ev_fair"] < 0:
                print("Even there the expected value is %+.2f%% per 1 staked. It is the cheapest place to trade, not a profitable one."
                      % (100 * b["ev_fair"]))
            else:
                print("Expected value there is %+.2f%% per 1 staked if the feed is fair." % (100 * b["ev_fair"]))


# ---------------------------------------------------------------- live scan
async def call(ws, req):
    await ws.send(json.dumps(req))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("req_id") == req["req_id"]:
            return msg


def last_digits(prices, pip):
    return [int(format(float(p), ".%df" % pip)[-1]) for p in prices]


async def live_scan(app_id, n_ticks):
    try:
        import websockets
    except ImportError:
        sys.exit("Install the dependency first: pip install websockets")
    rid = 0
    markets = {}
    async with websockets.connect(WS_URL.format(app_id=app_id), open_timeout=20) as ws:
        rid += 1
        resp = await call(ws, {"active_symbols": "brief", "product_type": "basic", "req_id": rid})
        if "error" in resp:
            sys.exit("active_symbols failed: %s" % resp["error"])
        syms = [s["symbol"] for s in resp["active_symbols"]
                if s.get("market") == "synthetic_index" and s.get("exchange_is_open", 1)
                and not s.get("is_trading_suspended", 0)]
        print("Open synthetic markets: %d -> %s" % (len(syms), ", ".join(syms)))
        for sym in syms:
            rid += 1
            h = await call(ws, {"ticks_history": sym, "end": "latest", "count": n_ticks,
                                "style": "ticks", "req_id": rid})
            if "error" in h:
                print("  skip %s: %s" % (sym, h["error"].get("message")))
                continue
            pip = int(round(-math.log10(h["pip_size"]))) if h.get("pip_size", 0) and h["pip_size"] < 1 else int(h.get("pip_size", 2))
            digits = last_digits(h["history"]["prices"], pip)
            payout = {}
            for key, (ctype, barrier, _) in CONTRACTS.items():
                for sym_key in ("symbol", "underlying_symbol"):
                    rid += 1
                    p = await call(ws, {"proposal": 1, "amount": 10, "basis": "stake", "contract_type": ctype,
                                        "currency": "USD", "duration": 1, "duration_unit": "t",
                                        sym_key: sym, "barrier": barrier, "req_id": rid})
                    if "proposal" in p:
                        payout[key] = float(p["proposal"]["payout"]) / float(p["proposal"]["ask_price"]) - 1
                        break
                    if p.get("error", {}).get("code") not in ("InputValidationFailed", "InvalidInput"):
                        break
                await asyncio.sleep(0.15)
            markets[sym] = {"digits": digits, "payout": payout}
            print("  %-10s ticks=%d payout over1=%s under8=%s" % (
                sym, len(digits),
                "%.1f%%" % (100 * payout["over1"]) if "over1" in payout else "n/a",
                "%.1f%%" % (100 * payout["under8"]) if "under8" in payout else "n/a"))
    if not markets:
        sys.exit("No market data collected.")
    rows, tests = analyze(markets)
    report(rows, tests)


# ---------------------------------------------------------------- offline self test
def selftest():
    rng = random.Random(3)
    markets = {}
    names = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V",
             "JD10", "JD25", "JD50"]
    for i, s in enumerate(names):
        markets[s] = {"digits": [rng.randrange(10) for _ in range(5000)],
                      "payout": {"over1": 0.17 + 0.01 * (i % 5), "under8": 0.18 + 0.01 * (i % 4)}}
    print("SELFTEST A: 13 fair markets (no real edge anywhere)")
    rows, tests = analyze(markets)
    report(rows, tests)
    print("\n\nSELFTEST B: same, but R_75 is planted with a real 83% Over 1 rate (50,000 ticks) and 21% payout")
    markets["R_75"] = {"digits": [(rng.randrange(2, 10) if rng.random() < 0.83 else rng.randrange(0, 2)) for _ in range(50000)],
                       "payout": {"over1": 0.21, "under8": 0.19}}
    rows, tests = analyze(markets)
    report(rows, tests)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--ticks", type=int, default=5000)
    ap.add_argument("--app-id", default="1089")
    a = ap.parse_args()
    if a.selftest:
        selftest()
    else:
        asyncio.run(live_scan(a.app_id, a.ticks))
