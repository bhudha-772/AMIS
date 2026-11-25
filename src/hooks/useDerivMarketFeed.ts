import { useState, useEffect, useRef } from "react";
import type { DerivTick } from "../context/DerivWSContext";
import { DERIV_PUBLIC_WS_URL } from "../config/derivConfig";

// NEW Options API PUBLIC socket — no app_id / auth needed; serves the same
// v3-style messages (ticks / ticks_history / ping — verified against it).
const DERIV_FEED_URL = DERIV_PUBLIC_WS_URL;

/**
 * useDerivMarketFeed — dedicated single-symbol Deriv market feed.
 *
 * This is the EXACT proven data path from DerivRiseFallTrader (which never
 * freezes): own socket + 50-tick bootstrap + live `ticks` subscribe + 1s
 * single-tick poller + 30s ping + auto-reconnect. All state is local, so the
 * shared 12-symbol context batch updates (which re-render huge trees and
 * cause the DerivTrader chart to hang/freeze) never touch this path.
 *
 * Consumers isolated from shared-context re-renders:
 *  - DerivTrader chart + price quotes (hot path, every tick)
 *  - any future panel that needs one smooth symbol feed
 *
 * The shared DerivWSContext stays subscribed for AI/scanner/trading ops —
 * this hook only replaces the *chart/quote* data source.
 */
export function useDerivMarketFeed(symbol: string) {
  const [tick, setTick] = useState<DerivTick | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [times, setTimes] = useState<number[]>([]);
  const [feedSymbol, setFeedSymbol] = useState<string>(symbol);
  const [feedStatus, setFeedStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;
    let poller: any = null;
    let pingTimer: any = null;
    let reconnectTimer: any = null;

    setFeedSymbol(symbol);
    setHistory([]);
    setTimes([]);
    setTick(null);
    setFeedStatus("connecting");

    const connectFeed = () => {
      if (!isMounted) return;
      try {
        ws = new WebSocket(DERIV_FEED_URL);
      } catch (e) { return; }

      ws.onopen = () => {
        if (!isMounted || !ws) return;
        const s = symbolRef.current;
        setFeedStatus("connected");
        // 1. Bootstrap: last 50 ticks
        ws.send(JSON.stringify({ ticks_history: s, count: 50, end: "latest", style: "ticks" }));
        // 2. Live tick stream (Deriv pushes every new tick for 1s indices)
        ws.send(JSON.stringify({ ticks: s, subscribe: 1 }));
        // 3. 1s single-tick poller — the anti-stall guarantee (same as Rise/Fall)
        poller = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ticks_history: symbolRef.current, count: 1, end: "latest", style: "ticks" }));
          }
        }, 1000);
        // 4. 30s ping keepalive (Deriv idles sockets without traffic)
        pingTimer = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
        }, 30000);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data);
          const s = symbolRef.current;
          if (data.msg_type === "history" && data.history) {
            const prices: number[] = data.history.prices || [];
            const tms: number[] = data.history.times || [];
            if (prices.length === 0) return;
            const lastPrice = prices[prices.length - 1];
            const lastEpoch = tms.length > 0 ? tms[tms.length - 1] : Math.floor(Date.now() / 1000);
            const pipSize: number = data.history?.pip_size ?? 4;
            if (prices.length === 1) {
              setHistory((prev) => {
                if (prev.length > 0 && prev[prev.length - 1] === lastPrice) return prev;
                return [...prev.slice(-39), lastPrice];
              });
              setTimes((prev) => {
                if (prev.length > 0 && prev[prev.length - 1] === lastEpoch) return prev;
                return [...prev.slice(-39), lastEpoch];
              });
            } else {
              setHistory(prices.slice(-40));
              setTimes(tms.slice(-40));
            }
            setFeedSymbol(s);
            setTick({ ask: lastPrice, bid: lastPrice, epoch: lastEpoch, id: `feed-${s}-${lastEpoch}`, pip_size: pipSize, quote: lastPrice, symbol: s });
          } else if (data.msg_type === "tick" && data.tick) {
            const t = data.tick as DerivTick;
            if (t.symbol !== s) return;
            setTick(t);
            setFeedSymbol(s);
            setHistory((prev) => {
              if (prev.length > 0 && prev[prev.length - 1] === t.quote) return prev;
              return [...prev.slice(-39), t.quote];
            });
            setTimes((prev) => {
              if (prev.length > 0 && prev[prev.length - 1] === t.epoch) return prev;
              return [...prev.slice(-39), t.epoch];
            });
          }
        } catch (e) { /* ignore feed parse errors */ }
      };

      ws.onerror = () => { if (isMounted) setFeedStatus("disconnected"); };
      // Auto-reconnect with backoff — poller restarts on open
      ws.onclose = () => {
        if (!isMounted) return;
        setFeedStatus("disconnected");
        if (poller) { clearInterval(poller); poller = null; }
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        reconnectTimer = setTimeout(connectFeed, 3000);
      };
    };

    connectFeed();
    return () => {
      isMounted = false;
      if (poller) clearInterval(poller);
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) { try { ws.onclose = null; ws.onerror = null; ws.close(); } catch (e) { } }
    };
  }, [symbol]);

  return { tick, history, times, feedSymbol, feedStatus };
}
