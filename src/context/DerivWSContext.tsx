import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { DERIV_PUBLIC_WS_URL } from "../config/derivConfig";
import { closeWebSocketGracefully } from "../utils/closeWebSocketGracefully";
import { redactDerivUrl } from "../utils/derivOptionsApi";

export interface DerivTick {
  ask: number;
  bid: number;
  epoch: number;
  id: string;
  pip_size: number;
  quote: number;
  symbol: string;
}

export interface DerivAsset {
  symbol: string;
  name: string;
  category: string;
}

type MessageCallback = (data: any) => void;

export interface DerivWSContextType {
  isConnected: boolean;
  isExhausted: boolean;
  error: string | null;
  ticks: Record<string, DerivTick>;
  histories: Record<string, number[]>;
  subscribe: (symbol: string) => void;
  unsubscribe: (symbol: string) => void;
  reconnect: () => void;
  getWebSocket: () => WebSocket | null;
  sendMessage: (message: any) => void;
  addMessageListener: (callback: MessageCallback) => void;
  removeMessageListener: (callback: MessageCallback) => void;
}

const DerivWSContext = createContext<DerivWSContextType | null>(null);

export const SUPPORTED_ASSETS: DerivAsset[] = [
  { symbol: "R_50", name: "Volatility 50 Index", category: "Volatility Indices" },
  { symbol: "R_100", name: "Volatility 100 Index", category: "Volatility Indices" },
  { symbol: "R_10", name: "Volatility 10 Index", category: "Volatility Indices" },
  { symbol: "R_25", name: "Volatility 25 Index", category: "Volatility Indices" },
  { symbol: "R_75", name: "Volatility 75 Index", category: "Volatility Indices" },
  { symbol: "1HZ100V", name: "Volatility 100 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ10V", name: "Volatility 10 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ25V", name: "Volatility 25 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ50V", name: "Volatility 50 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ75V", name: "Volatility 75 (1s) Index", category: "Volatility Indices" },
  { symbol: "RDBULL", name: "Bull Market Index", category: "Daily Reset Indices" },
  { symbol: "RDBEAR", name: "Bear Market Index", category: "Daily Reset Indices" },
];

// Module-level state for WebSocket connection (survives React re-renders)
// Default transport: the NEW Options API PUBLIC socket (no app_id, no auth —
// verified empirically to serve ticks / ticks_history / active_symbols).
// DerivTrader switches this to a REST-minted OTP URL when a token is active
// via setDerivWsUrl(); trading then rides that authenticated socket.
let wsUrl = DERIV_PUBLIC_WS_URL;
let wsInstance: WebSocket | null = null;
let reconnectAttempts = 0;
let isConnecting = false;
const maxReconnectAttempts = 10;
// When the fast backoff ladder is exhausted (e.g. a Deriv-side outage - the
// ws.derivws.com gateway returned Cloudflare 520 for EVERY request, including
// other app_ids, so it was never an app_id problem) we keep probing every 60s
// instead of staying dead until the user reloads the page.
const slowRetryIntervalMs = 60000;
let slowRetryTimer: any = null;
let exhaustedLogged = false;
// The provider registers its connect() here so the module-level helpers
// (setDerivWsUrl / triggerDerivReconnect) can start a FRESH socket. Closing an
// already-CLOSED socket after an outage is a silent no-op (no onclose fires),
// which used to leave the "Reconnect" button dead.
let activeConnectFn: (() => void) | null = null;
const subscribedSymbols = new Set<string>();
let pingInterval: any = null;
let tickPollInterval: any = null;
const messageListeners = new Set<MessageCallback>();
const messageQueue: any[] = []; // Queue messages until WebSocket is OPEN
// Market data (tick/history) is batched into a 250ms flush window so the huge
// consumer tree (DerivTrader ~5k lines) doesn't re-render at 12Hz and freeze.
const pendingMarketEvents: any[] = [];
let marketFlushTimer: any = null;

// (Re)start keepalive ping + 1s tick poller on an OPEN socket.
// Extracted so both onopen AND the mount effect can call it - this fixes
// the React StrictMode double-effect freeze: the effect cleanup clears the
// poller intervals while the shared module socket stays OPEN, and the second
// connect() call no-ops (socket already OPEN) so the poller never restarts.
function startPollers() {
  if (typeof WebSocket !== "undefined" && (!wsInstance || wsInstance.readyState !== WebSocket.OPEN)) return;
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
      wsInstance.send(JSON.stringify({ ping: 1 }));
    }
  }, 30000);

  // Continuous 1-Second Tick Poller - same technique as the working RiseFall trader.
  // Verified empirically: 12 symbols x 1s = 108/108 responses, zero errors
  // (no throttling) - so send directly, no jitter complexity.
  if (tickPollInterval) clearInterval(tickPollInterval);
  tickPollInterval = setInterval(() => {
          if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
            // Staggered 2s poller: one request every ~150ms instead of 12-at-once
            // every second. Halves total volume and avoids synchronized bursts -
            // with multiple tabs open the old 12Hz burst pattern pushed the same
            // IP past Deriv's throttle threshold, hanging BOTH traders.
            const symbols = Array.from(subscribedSymbols);
            symbols.forEach((s, idx) => {
              setTimeout(() => {
                try {
                  if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                    wsInstance.send(JSON.stringify({ ticks_history: s, count: 1, end: 'latest', style: 'ticks' }));
                  }
                } catch (e) { /* ignore single-symbol poll errors */ }
              }, idx * 150);
            });
          }
        }, 2000);
}

// Process queued messages when WebSocket opens
function processMessageQueue() {
  if (wsInstance?.readyState === WebSocket.OPEN && messageQueue.length > 0) {
    console.log("[DERIV_WS] Processing " + messageQueue.length + " queued messages");
    while (messageQueue.length > 0) {
      const msg = messageQueue.shift();
      wsInstance.send(JSON.stringify(msg));
    }
  }
}

// ── FRESH-CREDENTIAL DIALS ───────────────────────────────────────────────────
// Deriv support guidance: OTP URLs are short-lived — request a fresh one
// whenever a new connection is opened and NEVER re-dial an old one after a
// drop. The owner registers a provider here; connect() awaits it before every
// dial (fallback: the last known URL, so a failed mint just retries later).
export type DerivWsUrlProvider = () => Promise<string | null> | string | null;
let freshUrlProvider: DerivWsUrlProvider | null = null;
// Bumped on every connect()/restart so a provider resolving late can't open a
// zombie socket behind a newer dial.
let dialGeneration = 0;

export function setDerivWsUrlProvider(provider: DerivWsUrlProvider | null) {
  freshUrlProvider = provider;
}

// Reset the retry ladder and start a FRESH socket immediately (see
// activeConnectFn above - close() alone does nothing when the socket is CLOSED).
function restartDerivSocket() {
  reconnectAttempts = 0;
  exhaustedLogged = false;
  // Invalidate any in-flight provider dial — it must not open the socket it
  // was minting for; the fresh connect below owns the next dial.
  dialGeneration++;
  if (slowRetryTimer) {
    clearTimeout(slowRetryTimer);
    slowRetryTimer = null;
  }
  // Detaches the old handlers first: no onclose storm, no
  // "closed before the connection is established" error.
  closeWebSocketGracefully(wsInstance);
  isConnecting = false;
  activeConnectFn?.();
}

// Function to update the WebSocket URL (for authenticated endpoint)
export function setDerivWsUrl(url: string) {
  wsUrl = url;
  restartDerivSocket();
}

// Current transport URL — lets consumers guard setDerivWsUrl() calls so they
// only restart the shared socket when the transport actually changes.
export function getDerivWsUrl(): string {
  return wsUrl;
}

// Function to trigger reconnection
export function triggerDerivReconnect() {
  restartDerivSocket();
}

export function DerivWSProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isExhausted, setIsExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, DerivTick>>({});
  const [histories, setHistories] = useState<Record<string, number[]>>({});

  // Notify message listeners
  const notifyListeners = useCallback((data: any) => {
    messageListeners.forEach(cb => cb(data));
  }, []);

  // Process a market event into React state (runs in the 250ms flush window).
  const processMarketEvent = (d: any) => {
    if (d.msg_type === "tick" && d.tick) {
      const tick: DerivTick = d.tick;
      setTicks((p) => ({ ...p, [tick.symbol]: tick }));
      setHistories((p) => {
        const current = p[tick.symbol] || [];
        if (current.length > 0 && current[current.length - 1] === tick.quote) return p;
        return { ...p, [tick.symbol]: [...current, tick.quote].slice(-200) };
      });
    }
    if (d.msg_type === "history" && d.history) {
      const sym = d.echo_req?.ticks_history;
      const prices = d.history.prices || [];
      const times = d.history.times || [];
      if (sym && prices.length > 0) {
        setHistories((p) => {
          const current = p[sym] || [];
          // Full history load (>5 prices) replaces; live 1-tick poll appends.
          if (prices.length > 5) {
            return { ...p, [sym]: prices.slice(-200) };
          }
          let merged = current;
          prices.forEach((price: number) => {
            if (merged.length === 0 || merged[merged.length - 1] !== price) {
              merged = [...merged, price];
            }
          });
          if (merged.length > 200) merged = merged.slice(-200);
          return { ...p, [sym]: merged };
        });

        // ALSO populate the `ticks` map from history responses. The raw
        // `ticks: subscribe` stream rejects these symbols (InvalidSymbol) -
        // this guarantees quotes/bid/ask/barriers always have data.
        const lastPrice = prices[prices.length - 1];
        const lastTime = times.length > 0 ? times[times.length - 1] : Math.floor(Date.now() / 1000);
        setTicks((p) => {
          const existing = p[sym];
          return {
            ...p,
            [sym]: {
              symbol: sym,
              quote: lastPrice,
              epoch: lastTime,
              ask: lastPrice,
              bid: lastPrice,
              id: existing?.id || `${sym}-poll`,
              pip_size: existing?.pip_size || 2,
            },
          };
        });
      }
    }
  };

  // Flush all queued market events once per 250ms window (max ~4 renders/sec).
  const flushMarketEvents = () => {
    marketFlushTimer = null;
    const batch = pendingMarketEvents.splice(0, pendingMarketEvents.length);
    batch.forEach((d) => processMarketEvent(d));
    if (pendingMarketEvents.length > 0) {
      marketFlushTimer = setTimeout(flushMarketEvents, 250);
    }
  };

  const connect = useCallback(() => {
    if (isConnecting || wsInstance?.readyState === WebSocket.OPEN) return;
    if (slowRetryTimer) {
      clearTimeout(slowRetryTimer);
      slowRetryTimer = null;
    }
    isConnecting = true;
    const myDial = ++dialGeneration;

    // Opens the actual socket. Deferred behind the fresh-credential provider
    // below so every dial (first connect AND ladder retries) uses a URL minted
    // for THIS connection instead of one left over from a previous socket.
    const establish = (dialUrl: string) => {
      // Superseded while minting (a restart bumped dialGeneration) — bail
      // rather than open a zombie socket behind the replacement dial.
      if (myDial !== dialGeneration) return;
      // The resolved dial URL may embed a live `?otp=` credential — redact it
      // (Deriv/Amy: credentials never in console logs / screenshots).
      console.log("[DERIV_WS] Connecting:", redactDerivUrl(dialUrl));
      wsInstance = new WebSocket(dialUrl);
    

    wsInstance.onopen = () => {
      console.log("[DERIV_WS] Connected!");
      isConnecting = false;
      setIsConnected(true);
      setIsExhausted(false);
      setError(null);
      reconnectAttempts = 0;
      exhaustedLogged = false;
      subscribedSymbols.forEach((s) => {
        // NOTE: `ticks: subscribe` returns InvalidSymbol for these synthetic
        // indices (verified empirically - all 12 rejected). The ticks_history
        // one-shot + 1s poller below is the working real-time data path.
        wsInstance.send(JSON.stringify({ ticks_history: s, count: 50, end: "latest", style: "ticks" }));
      });
      // Process any queued messages
      processMessageQueue();
      // (Re)start keepalive + 1s tick poller
      startPollers();
    };

    wsInstance.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Non-market messages (authorize, balance, proposal, buy/sell, ping...)
        // are latency-critical / low-volume - hand them straight to listeners.
        if (data.msg_type !== "tick" && data.msg_type !== "history") {
          notifyListeners(data);
          return;
        }
        // Market data: batch into a 250ms flush window. The 12Hz poller would
        // otherwise force ~24 state updates/sec, re-rendering this huge tree
        // and causing the chart to hang/freeze.
        pendingMarketEvents.push(data);
        if (!marketFlushTimer) {
          marketFlushTimer = setTimeout(flushMarketEvents, 250);
        }
      } catch (e) {
        console.error("[DERIV_WS] Parse error:", e);
      }
    };

    wsInstance.onerror = () => {
      // The browser already logs the socket-level failure. Keep ours terse and
      // skip setError here so the descriptive onclose message wins instead of
      // being overwritten by a generic "WebSocket error".
      isConnecting = false;
    };

    wsInstance.onclose = () => {
      setIsConnected(false);
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      if (tickPollInterval) {
        clearInterval(tickPollInterval);
        tickPollInterval = null;
      }
      isConnecting = false;
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.max(2000, Math.min(2000 * Math.pow(2, reconnectAttempts), 30000));
        console.warn("[DERIV_WS] Closed - reconnect attempt " + reconnectAttempts + "/" + maxReconnectAttempts + " in " + delay + "ms");
        setTimeout(connect, delay);
      } else {
        // Fast ladder exhausted (Deriv-side outage). Log ONCE instead of
        // spamming, keep the UI in its "Offline" state, and keep probing in the
        // background so the app self-heals when the gateway comes back.
        if (!exhaustedLogged) {
          exhaustedLogged = true;
          console.error(
            "[DERIV_WS] Deriv gateway unreachable after " + maxReconnectAttempts +
              " attempts - retrying quietly every " + slowRetryIntervalMs / 1000 +
              "s. Was seen when the legacy ws.derivws.com gateway returned 520; the " +
              "public api.derivws.com socket is the default now, so this only fires " +
              "when that endpoint is unreachable too."
          );
        }
        setIsExhausted(true);
        setError("Deriv API is currently unreachable. Retrying in the background.");
        if (slowRetryTimer) clearTimeout(slowRetryTimer);
        slowRetryTimer = setTimeout(() => {
          slowRetryTimer = null;
          console.warn("[DERIV_WS] Background retry: probing the Deriv gateway again");
          connect();
        }, slowRetryIntervalMs);
      }
    };
    };

    const provider = freshUrlProvider;
    if (!provider) {
      establish(wsUrl);
      return;
    }
    // Mint/resolve a fresh URL (8s cap) before dialing. On failure dial the
    // last known URL — if that one is stale the ladder fails and the next
    // attempt gets another fresh mint.
    const freshMint = Promise.resolve()
      .then(() => provider())
      .then((fresh) => fresh || wsUrl)
      .catch((err) => {
        console.warn("[DERIV_WS] Fresh-URL provider failed; dialing last known URL.", err);
        return wsUrl;
      });
    const mintTimeout = new Promise<string>((resolve) => setTimeout(() => resolve(wsUrl), 8000));
    Promise.race([freshMint, mintTimeout]).then((dialUrl) => {
      if (myDial !== dialGeneration) return;
      establish(dialUrl);
    });
  }, []);

  const subscribe = useCallback((symbol: string) => {
    // Guard: skip if this symbol is already tracked. The module-level set
    // persists across remounts (StrictMode/HMR) and onopen bootstraps every
    // subscribed symbol on (re)connect - re-sending here duplicates load.
    if (subscribedSymbols.has(symbol)) return;
    subscribedSymbols.add(symbol);
    if (wsInstance?.readyState === WebSocket.OPEN) {
      // NOTE: `ticks: subscribe` is NOT used - empirical test shows every
      // synthetic index returns InvalidSymbol. Initial history + 1s poller
      // is the reliable data path.
      wsInstance.send(JSON.stringify({ ticks_history: symbol, count: 50, end: "latest", style: "ticks" }));
    } else {
      // Will be fetched when WebSocket connects (onopen handler processes subscribedSymbols)
    }
  }, []);

  const unsubscribe = useCallback((symbol: string) => {
    subscribedSymbols.delete(symbol);
    if (wsInstance?.readyState === WebSocket.OPEN) {
      wsInstance.send(JSON.stringify({ forget: symbol }));
    }
  }, []);

  const reconnect = useCallback(() => {
    // Manual "Retry": reset the ladder and start a fresh socket NOW. Calling
    // close() on an already-CLOSED socket (the normal state after an outage)
    // fires no onclose, so the old code left this button dead.
    restartDerivSocket();
    reconnectAttempts = 0;
    setIsExhausted(false);
    setError(null);
  }, []);

  const getWebSocket = useCallback(() => wsInstance, []);

  const sendMessage = useCallback((message: any) => {
    if (wsInstance?.readyState === WebSocket.OPEN) {
      wsInstance.send(JSON.stringify(message));
    } else {
      // Queue message for when WebSocket connects
      messageQueue.push(message);
    }
  }, []);

  const addMessageListener = useCallback((callback: MessageCallback) => {
    messageListeners.add(callback);
  }, []);

  const removeMessageListener = useCallback((callback: MessageCallback) => {
    messageListeners.delete(callback);
  }, []);

  useEffect(() => {
    // Expose connect() to the module-level helpers (setDerivWsUrl /
    // triggerDerivReconnect) so they can start a fresh socket directly.
    activeConnectFn = connect;
    connect();
    // Restart the pollers if the shared socket is already OPEN. In React
    // StrictMode dev the first effect pass opens the socket and this cleanup
    // clears its intervals; the second pass then no-ops inside connect()
    // (socket already OPEN) - without this the 1s poller never restarts and
    // the chart fills once then hangs.
    if (wsInstance?.readyState === WebSocket.OPEN && subscribedSymbols.size > 0) {
      startPollers();
    }
    return () => {
      // Do NOT close the shared module-level socket here (React dev double-invokes
      // effects, which caused reconnect storms + 'closed before established' errors).
      // The socket is app-wide module state; reconnect logic recycles it.
      if (activeConnectFn === connect) activeConnectFn = null;
      if (pingInterval) clearInterval(pingInterval);
      if (tickPollInterval) clearInterval(tickPollInterval);
    };
  }, [connect]);

  return (
    <DerivWSContext.Provider value={{
      isConnected,
      isExhausted,
      error,
      ticks,
      histories,
      subscribe,
      unsubscribe,
      reconnect,
      getWebSocket,
      sendMessage,
      addMessageListener,
      removeMessageListener
    }}>
      {children}
    </DerivWSContext.Provider>
  );
}

export function useDerivWS(): DerivWSContextType {
  const ctx = useContext(DerivWSContext);
  if (!ctx) throw new Error("useDerivWS must be used within DerivWSProvider");
  return ctx;
}
