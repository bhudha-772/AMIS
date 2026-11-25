import React, { useState, useEffect, useRef } from "react";
import { DERIV_PUBLIC_WS_URL } from "../config/derivConfig";
import { closeWebSocketGracefully } from "../utils/closeWebSocketGracefully";
import { fetchOptionsAccounts, requestAccountOtpUrl, redactDerivUrl } from "../utils/derivOptionsApi";
import {
  TrendingUp,
  TrendingDown,
  Info,
  Clock,
  Coins,
  ArrowRight,
  RefreshCw,
  Award,
  History,
  CheckCircle,
  XCircle,
  HelpCircle,
  Sliders,
  DollarSign,
  AlertCircle,
  Key,
  LogOut,
  User,
  Shield,
  Lightbulb,
  Sparkles,
  ArrowUpRight,
  Lock,
  X,
  Brain,
  BookOpen,
  Settings,
  Layers
} from "lucide-react";
import { SMCPanel } from "./SMCPanel";

// Types for Machine Learning Insight
interface LearnedInsight {
  id: string;
  timestamp: number;
  symbol: string;
  tradeType: "Rise" | "Fall";
  status: "WON" | "LOST";
  lossStreakBefore: number;
  insightText: string;
  ruleCreated: string;
}

// Types for Deriv WebSocket Tick
interface DerivTick {
  ask: number;
  bid: number;
  epoch: number;
  id: string;
  pip_size: number;
  quote: number;
  symbol: string;
}

// Deriv Asset definition
interface DerivAsset {
  symbol: string;
  name: string;
  category: "Volatility Indices" | "Daily Reset Indices";
}

// Active Contract definition for Rise / Fall Options
interface DerivContract {
  id: string;
  symbol: string;
  symbolName: string;
  type: "Rise" | "Fall";
  stake: number;
  payout: number;
  entryPrice: number;
  durationTicks: number;
  durationMinutes: number;
  durationType: "ticks" | "minutes";
  ticksCollected: { tick: number; epoch: number }[];
  status: "PENDING" | "OPEN" | "WON" | "LOST";
  pendingMessage?: string;
  exitPrice?: number;
  createdAt: number;
  ticksRemaining: number;
  secondsRemaining?: number;
}

const SUPPORTED_ASSETS: DerivAsset[] = [
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

// NOTE: the old `const DERIV_APP_ID = "1089"` that lived here was dead code —
// never referenced. The App ID is now the single value from ../config/derivConfig.

export function DerivRiseFallTrader() {
  // Demo & Real API Tokens and Account States
  const [demoToken, setDemoToken] = useState<string>(() => {
    return localStorage.getItem("deriv_demo_token") || "";
  });
  const [realToken, setRealToken] = useState<string>(() => {
    return localStorage.getItem("deriv_real_token") || "";
  });
  const [activeAccountType, setActiveAccountType] = useState<"demo" | "real">(() => {
    return (localStorage.getItem("deriv_active_account_type") as "demo" | "real") || "demo";
  });

  const [demoAuthInfo, setDemoAuthInfo] = useState<{
    balance: number;
    currency: string;
    email: string;
    fullname: string;
    is_virtual: number;
    loginid: string;
    scopes: string[];
  } | null>(() => {
    const saved = localStorage.getItem("deriv_demo_auth_info");
    return saved ? JSON.parse(saved) : null;
  });

  const [realAuthInfo, setRealAuthInfo] = useState<{
    balance: number;
    currency: string;
    email: string;
    fullname: string;
    is_virtual: number;
    loginid: string;
    scopes: string[];
  } | null>(() => {
    const saved = localStorage.getItem("deriv_real_auth_info");
    return saved ? JSON.parse(saved) : null;
  });

  // APP ID: removed the old localStorage-backed, numeric-only state. It was never
  // set (`setDerivAppId` never ran) and silently forced a stale ID while REST and
  // socket code used different hardcoded values. The App ID now comes only from
  // src/config/derivConfig.ts, so no local copy is retained here.

  const [demoInput, setDemoInput] = useState<string>("");
  const [realInput, setRealInput] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [showTokenSettings, setShowTokenSettings] = useState<boolean>(false);

  // Active token and balance depending on selected mode
  // Persist seeded/provided PAT so the trading socket can mint an OTP session.
  useEffect(() => {
    if (demoToken) localStorage.setItem("deriv_demo_token", demoToken);
  }, [demoToken]);
  useEffect(() => {
    if (realToken) localStorage.setItem("deriv_real_token", realToken);
  }, [realToken]);

  const derivToken = activeAccountType === "demo" ? demoToken : realToken;
  const authInfo = activeAccountType === "demo" ? demoAuthInfo : realAuthInfo;

  // Local simulated Sandbox balance (starts with $10,000 USD)
  const [sandboxBalance, setSandboxBalance] = useState<number>(() => {
    const saved = localStorage.getItem("deriv_sandbox_balance");
    return saved ? Number(saved) : 10000.0;
  });

  useEffect(() => {
    localStorage.setItem("deriv_sandbox_balance", String(sandboxBalance));
  }, [sandboxBalance]);

  const balance = authInfo ? Number(authInfo.balance) : sandboxBalance;
  const currencySymbol = authInfo ? authInfo.currency : "USD";

  // Selected Asset & Parameters
  const [activeAsset, setActiveAsset] = useState<DerivAsset>(SUPPORTED_ASSETS[0]);
  const activeAssetRef = useRef<DerivAsset>(activeAsset);
  useEffect(() => {
    activeAssetRef.current = activeAsset;
  }, [activeAsset]);

  const [showAssetDropdown, setShowAssetDropdown] = useState<boolean>(false);
  const [lastTick, setLastTick] = useState<DerivTick | null>(null);

  // Trade Inputs
  const [stake, setStake] = useState<number>(10.0);
  const [durationValue, setDurationValue] = useState<number>(5);
  const [durationType, setDurationType] = useState<"ticks" | "minutes">("ticks");

  // Price history and connection states
  const [tickHistory, setTickHistory] = useState<number[]>([]);
  const [tickTimes, setTickTimes] = useState<number[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [isWsAuthorized, setIsWsAuthorized] = useState<boolean>(false);
  const [reconnectTrigger, setReconnectTrigger] = useState<number>(0);
  const [isSMCOpen, setIsSMCOpen] = useState<boolean>(false);

  // NEW Deriv Options API: a REST-minted, PRE-AUTHENTICATED WebSocket URL
  // (POST /trading/v1/options/accounts/{id}/otp with the PAT as a Bearer token).
  // Null while unavailable — the socket then runs on the public market-data
  // endpoint and trading stays in Sandbox mode. Mirrors the proven flow in
  // DerivTrader.handleAuthorizeToken.
  const [otpWsUrl, setOtpWsUrl] = useState<string | null>(null);

  // Per-dial OTP mint with a short cache (Deriv guidance: an OTP URL must be
  // re-requested for EACH new connection — never re-dialled after a drop).
  // Writes NO state: it also runs from inside connectWS below, where touching
  // otpWsUrl would recurse into another reconnect.
  const otpMintCacheRef = useRef<{ key: string; url: string; at: number } | null>(null);
  const mintFreshOtp = async (): Promise<string | null> => {
    const token = derivToken.trim();
    if (!token) return null;
    const cacheKey = `${activeAccountType}:${token}`;
    const cached = otpMintCacheRef.current;
    if (cached && cached.key === cacheKey && Date.now() - cached.at < 15000) {
      return cached.url;
    }
    const accounts = await fetchOptionsAccounts(token);
    if (!accounts || accounts.length === 0) {
      throw new Error("no Options accounts for this token");
    }
    const filtered = accounts.filter((acc) => acc.account_type === activeAccountType);
    const account = filtered.length > 0 ? filtered[0] : accounts[0];
    const url = await requestAccountOtpUrl(account.account_id, token);
    if (!url) throw new Error("Deriv did not return an OTP WebSocket URL");
    otpMintCacheRef.current = { key: cacheKey, url, at: Date.now() };
    console.log("[DERIV RISE/FALL AUTH] Minted a fresh OTP URL for this dial.");
    return url;
  };

  useEffect(() => {
    let cancelled = false;

    const mintOtpSession = async () => {
      setOtpWsUrl(null);
      setIsWsAuthorized(false);
      if (!derivToken || derivToken.trim() === "") {
        setAuthError(null);
        setIsAuthenticating(false);
        return;
      }
      setIsAuthenticating(true);
      try {
        const accounts = await fetchOptionsAccounts(derivToken.trim());
        if (!accounts || accounts.length === 0) {
          throw new Error("no Options accounts for this token");
        }
        const filtered = accounts.filter(
          (acc) =>
            (activeAccountType === "demo" && acc.account_type === "demo") ||
            (activeAccountType === "real" && acc.account_type === "real")
        );
        const account = filtered.length > 0 ? filtered[0] : accounts[0];

        const updatedAuth = {
          balance: account.balance ?? 0.0,
          currency: account.currency || "USD",
          email: "",
          fullname: "Deriv Options Account",
          is_virtual: account.account_type === "demo" ? 1 : 0,
          loginid: account.account_id,
          scopes: ["trade", "trading_information"],
        };
        if (activeAccountType === "demo") {
          setDemoAuthInfo(updatedAuth);
          localStorage.setItem("deriv_demo_auth_info", JSON.stringify(updatedAuth));
        } else {
          setRealAuthInfo(updatedAuth);
          localStorage.setItem("deriv_real_auth_info", JSON.stringify(updatedAuth));
        }

        const otpUrl = await requestAccountOtpUrl(account.account_id, derivToken.trim());
        if (cancelled) return;
        if (!otpUrl) throw new Error("Deriv did not return an OTP WebSocket URL");
        console.log("[DERIV RISE/FALL AUTH] OTP session minted — live trading socket ready.");
        // Seed the per-dial cache: the socket effect reconnects immediately
        // and should reuse this URL instead of minting a twin.
        otpMintCacheRef.current = {
          key: `${activeAccountType}:${derivToken.trim()}`,
          url: otpUrl,
          at: Date.now(),
        };
        setOtpWsUrl(otpUrl);
        setAuthError(null);
      } catch (err) {
        if (cancelled) return;
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[DERIV RISE/FALL AUTH] OTP mint failed:", err);
        setAuthError(
          `Live trading disabled (${reason}). Market data streams normally; trades stay in Sandbox mode.`
        );
      } finally {
        if (!cancelled) setIsAuthenticating(false);
      }
    };

    mintOtpSession();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivToken, activeAccountType]);

  // Non-blocking Toast notification state
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "error" | "warning" | "success" | "info" }>>([]);

  const addToast = (message: string, type: "error" | "warning" | "success" | "info" = "error") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };

  // Deriv Authoritative Market Pip Size Map
  const ASSET_PIP_SIZES: Record<string, number> = {
    "1HZ100V": 2,
    "1HZ10V": 2,
    "1HZ25V": 2,
    "1HZ50V": 2,
    "1HZ75V": 2,
    "R_10": 3,
    "R_25": 3,
    "R_50": 4,
    "R_75": 2,
    "R_100": 2,
    "RDBULL": 2,
    "RDBEAR": 2,
  };

  // Helper to format quote to its TRUE NATIVE DECIMALS without artificial zero padding or truncation
  const formatFullTickQuote = (quote: number | undefined | null, tick?: DerivTick | null, symbol?: string): string => {
    if (quote === undefined || quote === null || isNaN(quote)) return "---";
    if (tick && typeof tick.pip_size === "number" && tick.pip_size >= 0) {
      return quote.toFixed(tick.pip_size);
    }
    const sym = symbol || tick?.symbol || activeAssetRef.current.symbol;
    if (sym in ASSET_PIP_SIZES) {
      return quote.toFixed(ASSET_PIP_SIZES[sym]);
    }
    if (sym.includes("frx")) return quote.toFixed(5);

    const str = String(quote);
    if (str.includes(".")) {
      return quote.toFixed(str.split(".")[1].length);
    }
    return quote.toFixed(2);
  };

  // Active contracts & History
  const [activeContracts, setActiveContracts] = useState<DerivContract[]>([]);
  const activeContractsRef = useRef<DerivContract[]>([]);
  useEffect(() => {
    activeContractsRef.current = activeContracts;
  }, [activeContracts]);

  const updateActiveContracts = (newContracts: DerivContract[]) => {
    activeContractsRef.current = newContracts;
    setActiveContracts(newContracts);
  };

  const [contractHistory, setContractHistory] = useState<DerivContract[]>(() => {
    const saved = localStorage.getItem("deriv_risefall_history");
    if (!saved) return [];
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("deriv_risefall_history", JSON.stringify(contractHistory));
  }, [contractHistory]);

  const [isJournalOpen, setIsJournalOpen] = useState<boolean>(false);

  // WebSocket Connection - Replicated exact DerivTrader pipeline
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let pingInterval: any;
    let tickStreamInterval: any;
    let reconnectTimer: any;
    let isMounted = true;
    let ws: WebSocket | null = null;

    const connectWS = async () => {
      if (!isMounted) return;
      setWsStatus("connecting");

      if (socketRef.current) {
        try {
          // Graceful: closing mid-handshake logs "WebSocket is closed before
          // the connection is established" in Chrome.
          closeWebSocketGracefully(socketRef.current);
        } catch (e) { }
      }

      // NEW Deriv Options API transport (the legacy ws.derivws.com/websockets/v3
      // gateway this used to point at returns Cloudflare 520; Deriv support has
      // directed us to the new endpoints):
      //   • otpWsUrl — a REST-minted socket that is ALREADY authenticated, so no
      //     `authorize` message is ever sent (Deriv docs: do not auth after connect).
      //   • otherwise the PUBLIC market-data socket — no app_id, no auth; ticks,
      //     history and ping work, account-scoped calls are unavailable by design.
      const wsUrl = otpWsUrl || DERIV_PUBLIC_WS_URL;
      // Fresh credential per dial (Deriv guidance): while an OTP session is
      // active, re-mint before EVERY (re)connection — a URL minted for an
      // earlier socket must never be re-dialled after a drop. On mint failure
      // fall back to the last known URL; its failure then re-enters the retry
      // ladder, which will try minting again.
      let dialUrl = wsUrl;
      if (otpWsUrl) {
        try {
          const fresh = await mintFreshOtp();
          if (fresh) dialUrl = fresh;
        } catch (err) {
          console.warn("[DERIV RISE/FALL WS] OTP re-mint failed; re-dialing last known URL:", err);
        }
        if (!isMounted) return;
      }
      // Dial URL can embed a live `?otp=` credential — redact before logging.
      console.log(`[DERIV RISE/FALL WS] Connecting to Deriv Endpoint -> URL: ${redactDerivUrl(dialUrl)}`);
      ws = new WebSocket(dialUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setWsStatus("connected");
        if (!derivToken || otpWsUrl) setIsAuthenticating(false);

        if (otpWsUrl) {
          // Pre-authenticated OTP session → live trading is allowed. Never send
          // `authorize` on this socket (Deriv docs are explicit about that).
          setIsWsAuthorized(true);
          setAuthError(null);
          ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
          console.log("[DERIV RISE/FALL WS] ✅ OTP session active — live trading enabled.");
        } else if (derivToken && derivToken.trim() !== "") {
          // Token present but no OTP session could be minted. The public socket
          // cannot hold an account session (balance/proposal reply
          // AuthorizationRequired) — stay honest and run in Sandbox mode.
          setIsWsAuthorized(false);
          setAuthError(
            (prev) =>
              prev ||
              "Live trading unavailable — no OTP session for this token (see console for the REST error). Market data is live; trades run in Sandbox mode."
          );
          console.warn("[DERIV RISE/FALL WS] No OTP session — Sandbox mode.");
        } else {
          // Sandbox mode (no token): the public socket is all we need.
          setIsWsAuthorized(false);
          console.log("[DERIV RISE/FALL WS] ✅ Public market-data socket connected (Sandbox mode).");
        }

        console.log(`[DERIV RISE/FALL WS] ✅ Connected! Subscribing to market asset: [${activeAsset.symbol}]`);

        // 2. Initial 50 ticks history request
        const primarySym = activeAssetRef.current.symbol;
        ws.send(JSON.stringify({
          ticks_history: primarySym,
          count: 50,
          end: "latest",
          style: "ticks",
        }));

        // 3. Subscribe to live continuous ticks
        ws.send(JSON.stringify({
          ticks: primarySym,
          subscribe: 1
        }));

        // 4. Continuous 1-Second Tick Poller to prevent step stalls
        tickStreamInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              ticks_history: primarySym,
              count: 1,
              end: "latest",
              style: "ticks"
            }));
          }
        }, 1000);

        // Ping every 30 seconds to keep connection open
        pingInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        const data = JSON.parse(event.data);

        // A. Handle Authorization Response
        if (data.msg_type === "authorize") {
          setIsAuthenticating(false);
          if (data.error) {
            setIsWsAuthorized(false);
            setAuthError(data.error.message || "Invalid API token. Operating in Sandbox Mode.");
          } else if (data.authorize) {
            const auth = data.authorize;
            const scopes = auth.scopes || [];
            if (scopes.length > 0 && !scopes.includes("trade")) {
              setAuthError("Your token is missing the 'trade' scope. Create a token on developers.deriv.com with 'trade' & 'trading_information' scopes.");
              setIsWsAuthorized(false);
              return;
            }
            const updatedAuth = {
              balance: Number(auth.balance),
              currency: auth.currency || "USD",
              email: auth.email || "",
              fullname: auth.fullname || "",
              is_virtual: Number(auth.is_virtual),
              loginid: auth.loginid || "",
              scopes: auth.scopes || [],
            };
            setIsWsAuthorized(true);
            if (auth.is_virtual) {
              setDemoAuthInfo(updatedAuth);
              localStorage.setItem("deriv_demo_auth_info", JSON.stringify(updatedAuth));
            } else {
              setRealAuthInfo(updatedAuth);
              localStorage.setItem("deriv_real_auth_info", JSON.stringify(updatedAuth));
            }
            ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
          }
        }

        // B. Handle Live Balance Updates
        if (data.msg_type === "balance" && data.balance) {
          const balanceVal = Number(data.balance.balance);
          if (activeAccountType === "demo") {
            setDemoAuthInfo((prev) => (prev ? { ...prev, balance: balanceVal } : null));
          } else {
            setRealAuthInfo((prev) => (prev ? { ...prev, balance: balanceVal } : null));
          }
        }

        // C. Handle Ticks History
        if (data.msg_type === "history" && data.history) {
          const prices: number[] = data.history.prices || [];
          const times: number[] = data.history.times || [];
          const respSymbol = data.echo_req?.ticks_history || activeAssetRef.current.symbol;

          if (prices.length > 0) {
            const lastPrice = prices[prices.length - 1];
            const lastEpoch = times[times.length - 1] || Math.floor(Date.now() / 1000);

            const receivedTick: DerivTick = {
              ask: lastPrice,
              bid: lastPrice,
              epoch: lastEpoch,
              id: `hist-${lastEpoch}`,
              pip_size: data.history?.pip_size ?? ASSET_PIP_SIZES[respSymbol] ?? 4,
              quote: lastPrice,
              symbol: respSymbol
            };

            if (respSymbol === activeAssetRef.current.symbol) {
              if (prices.length === 1) {
                setTickHistory((prev) => {
                  if (prev.length > 0 && prev[prev.length - 1] === lastPrice) return prev;
                  return [...prev.slice(-39), lastPrice];
                });
                setTickTimes((prev) => {
                  if (prev.length > 0 && prev[prev.length - 1] === lastEpoch) return prev;
                  return [...prev.slice(-39), lastEpoch];
                });
              } else {
                setTickHistory(prices.slice(-40));
                setTickTimes(times.slice(-40));
              }
              setLastTick(receivedTick);
              processContractsWithNewTick(respSymbol, lastPrice, lastEpoch);
            }
          }
        }

        // D. Handle Live Streamed Ticks
        if (data.msg_type === "tick" && data.tick) {
          const tickData: DerivTick = data.tick;
          if (tickData.symbol === activeAssetRef.current.symbol) {
            setLastTick(tickData);
            setTickHistory((prev) => {
              if (prev.length > 0 && prev[prev.length - 1] === tickData.quote) return prev;
              return [...prev.slice(-39), tickData.quote];
            });
            setTickTimes((prev) => {
              if (prev.length > 0 && prev[prev.length - 1] === tickData.epoch) return prev;
              return [...prev.slice(-39), tickData.epoch];
            });
            processContractsWithNewTick(tickData.symbol, tickData.quote, tickData.epoch);
          }
        }

        // E. Handle Deriv Contract Proposal Confirmations
        if (data.msg_type === "proposal" && data.proposal) {
          const propId = data.proposal.id;
          const reqId = data.req_id ? String(data.req_id - 1000000) : null;
          if (reqId && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ buy: propId, price: stake }));
          }
        }
      };

      ws.onerror = () => setWsStatus("disconnected");
      ws.onclose = () => {
        if (!isMounted) return;
        setWsStatus("disconnected");
        // Background retry: re-run this effect 60s later so the trader
        // self-heals after a Deriv gateway outage (the endpoint can return
        // 520 for minutes at a time) instead of staying dead until a manual
        // reconnect or a full page reload.
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (isMounted) setReconnectTrigger((prev) => prev + 1);
        }, 60000);
      };
    };

    connectWS();

    return () => {
      isMounted = false;
      // Graceful: the socket is usually still CONNECTING under React
      // StrictMode, and closing it mid-handshake is what logged
      // "WebSocket is closed before the connection is established".
      closeWebSocketGracefully(ws);
      clearInterval(pingInterval);
      clearInterval(tickStreamInterval);
      clearTimeout(reconnectTimer);
    };
  }, [activeAsset.symbol, derivToken, otpWsUrl, reconnectTrigger]);

  // Contract Tick Evaluator & Automatic Settlement
  const processContractsWithNewTick = (symbol: string, currentPrice: number, epoch: number) => {
    const currentContracts = activeContractsRef.current;
    if (currentContracts.length === 0) return;

    const stillActive: DerivContract[] = [];
    const finishedContracts: DerivContract[] = [];

    currentContracts.forEach((contract) => {
      if (contract.symbol !== symbol) {
        stillActive.push(contract);
        return;
      }

      const updatedTicks = [...contract.ticksCollected, { tick: currentPrice, epoch }];
      const ticksLeft = contract.durationTicks - updatedTicks.length;

      if (ticksLeft <= 0) {
        const finalSpot = currentPrice;
        const isWin = contract.type === "Rise" ? finalSpot > contract.entryPrice : finalSpot < contract.entryPrice;

        const finished: DerivContract = {
          ...contract,
          ticksCollected: updatedTicks,
          status: isWin ? "WON" : "LOST",
          ticksRemaining: 0,
          exitPrice: finalSpot,
        };
        finishedContracts.push(finished);
      } else {
        stillActive.push({
          ...contract,
          ticksCollected: updatedTicks,
          ticksRemaining: ticksLeft,
        });
      }
    });

    if (finishedContracts.length > 0) {
      finishedContracts.forEach((c) => {
        if (c.status === "WON") {
          if (!isWsAuthorized) {
            setSandboxBalance((b) => b + c.payout);
          }
          addToast(`🎉 Contract WON! Payout: +$${c.payout.toFixed(2)} (${c.type} on ${c.symbol})`, "success");
        } else {
          addToast(`❌ Contract Lost. -$${c.stake.toFixed(2)} (${c.type} on ${c.symbol})`, "error");
        }
        setContractHistory((hist) => [c, ...hist].slice(0, 100));
      });
      updateActiveContracts(stillActive);
    } else {
      updateActiveContracts(stillActive);
    }
  };

  // Execute Rise or Fall Contract
  const purchaseRiseFallContract = (type: "Rise" | "Fall") => {
    if (activeContractsRef.current.length > 0) {
      addToast("A trade is currently active. Please wait for settlement before placing another.", "warning");
      return;
    }

    if (!lastTick) {
      addToast("Price stream connecting. Please wait a second.", "warning");
      return;
    }

    const currentSpot = lastTick.quote;
    const targetStake = stake;
    const activePayout = Number((targetStake * 1.95).toFixed(2));

    if (balance < targetStake) {
      addToast(`Insufficient Balance ($${balance.toFixed(2)}) to place $${targetStake.toFixed(2)} trade.`, "warning");
      return;
    }

    const isLiveTrading = isWsAuthorized && socketRef.current && socketRef.current.readyState === WebSocket.OPEN;

    if (!isLiveTrading) {
      setSandboxBalance((b) => b - targetStake);
    }

    const numericId = Math.floor(100000 + Math.random() * 900000);
    const conId = String(numericId);

    const newContract: DerivContract = {
      id: conId,
      symbol: activeAsset.symbol,
      symbolName: activeAsset.name,
      type,
      stake: targetStake,
      payout: activePayout,
      entryPrice: currentSpot,
      durationType: durationType,
      durationTicks: durationValue,
      durationMinutes: durationValue,
      ticksCollected: [{ tick: currentSpot, epoch: lastTick.epoch }],
      status: isLiveTrading ? "PENDING" : "OPEN",
      createdAt: Date.now(),
      ticksRemaining: durationValue,
    };

    updateActiveContracts([newContract, ...activeContractsRef.current]);

    if (isLiveTrading) {
      const contractType = type === "Rise" ? "CALL" : "PUT";
      const proposalPayload = {
        proposal: 1,
        amount: targetStake,
        basis: "stake",
        contract_type: contractType,
        currency: authInfo ? authInfo.currency : "USD",
        duration: durationValue,
        duration_unit: "t",
        // New Options API field name (old `symbol` is rejected with
        // "Properties not allowed: symbol") — verified live.
        underlying_symbol: activeAsset.symbol,
        req_id: 1000000 + numericId
      };

      try {
        socketRef.current!.send(JSON.stringify(proposalPayload));
        console.log("[DERIV RISE/FALL] Real proposal sent:", proposalPayload);
      } catch (e) {
        console.error("Failed to send proposal to Deriv:", e);
      }
    } else {
      addToast(`Placed ${type} contract on ${activeAsset.name} at $${currentSpot.toFixed(2)}`, "info");
    }
  };

  const handleSaveDemoToken = () => {
    if (!demoInput.trim()) return;
    const token = demoInput.trim().replace(/^["']|["']$/g, '');
    setDemoToken(token);
    localStorage.setItem("deriv_demo_token", token);
    setActiveAccountType("demo");
    localStorage.setItem("deriv_active_account_type", "demo");
    setDemoInput("");
    setReconnectTrigger((prev) => prev + 1);
    addToast("Deriv Demo API Token saved. Connecting...", "info");
  };

  const handleSaveRealToken = () => {
    if (!realInput.trim()) return;
    const token = realInput.trim().replace(/^["']|["']$/g, '');
    setRealToken(token);
    localStorage.setItem("deriv_real_token", token);
    setActiveAccountType("real");
    localStorage.setItem("deriv_active_account_type", "real");
    setRealInput("");
    setReconnectTrigger((prev) => prev + 1);
    addToast("Deriv Real API Token saved. Connecting...", "info");
  };

  const handleLogout = () => {
    if (activeAccountType === "demo") {
      setDemoToken("");
      setDemoAuthInfo(null);
      localStorage.removeItem("deriv_demo_token");
      localStorage.removeItem("deriv_demo_auth_info");
    } else {
      setRealToken("");
      setRealAuthInfo(null);
      localStorage.removeItem("deriv_real_token");
      localStorage.removeItem("deriv_real_auth_info");
    }
    setIsWsAuthorized(false);
    setReconnectTrigger((prev) => prev + 1);
    addToast("Logged out of Deriv account. Switched to Sandbox Mode.", "info");
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 select-none overflow-hidden font-sans">
      {/* BRAND HEADER BAR */}
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-2xs shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-[#0ecb81] flex items-center justify-center text-white font-black text-xs shadow-sm">
            📈
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-black text-slate-900 tracking-tight uppercase">Deriv Rise &amp; Fall Trading App</h1>
              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                Official Deriv Stream
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold text-left">
              Real-time binary Rise/Fall contracts powered by continuous 100% authentic Deriv tick streams
            </p>
          </div>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold font-mono">
            <span className={`w-2 h-2 rounded-full ${wsStatus === "connected" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
            <span className="text-slate-700 uppercase">{wsStatus}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowTokenSettings(!showTokenSettings)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center space-x-1.5 transition cursor-pointer ${
              isWsAuthorized
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-amber-50 border-amber-300 text-amber-900"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>{isWsAuthorized ? (authInfo?.is_virtual ? "DEMO ACCOUNT" : "REAL ACCOUNT") : "SANDBOX MODE"}</span>
          </button>

          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-3.5 py-1.5 rounded-xl font-mono text-left shadow-2xs">
            <span className="text-[8px] font-bold block uppercase text-emerald-600 tracking-wider">
              {isWsAuthorized ? "Deriv Live Balance" : "Sandbox Practice Balance"}
            </span>
            <span className="text-xs font-black">${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsJournalOpen(!isJournalOpen)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 font-bold text-xs hover:bg-purple-100 transition cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-purple-600" />
            <span>Options Journal</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSMCOpen(!isSMCOpen)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border font-bold text-xs transition cursor-pointer ${
              isSMCOpen
                ? "bg-indigo-100 text-indigo-800 border-indigo-300 shadow-sm"
                : "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
            }`}
          >
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>SMC Analysis</span>
          </button>
        </div>
      </header>

      {/* TOKEN / ACCOUNT SETTINGS MODAL OVERLAY */}
      {showTokenSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-5 space-y-4 font-sans text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Key className="w-5 h-5 text-[#0ecb81]" />
                <h3 className="font-black text-slate-900 text-sm uppercase">Deriv Account Credentials</h3>
              </div>
              <button onClick={() => setShowTokenSettings(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl font-mono text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveAccountType("demo");
                  localStorage.setItem("deriv_active_account_type", "demo");
                }}
                className={`py-1.5 rounded-lg font-bold transition ${activeAccountType === "demo" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"}`}
              >
                Demo Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveAccountType("real");
                  localStorage.setItem("deriv_active_account_type", "real");
                }}
                className={`py-1.5 rounded-lg font-bold transition ${activeAccountType === "real" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"}`}
              >
                Real Account
              </button>
            </div>

            {/* Input Form */}
            {activeAccountType === "demo" ? (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 block">Deriv Demo API Token</label>
                <div className="flex space-x-2">
                  <input
                    type="password"
                    placeholder="Enter Demo API token..."
                    value={demoInput}
                    onChange={(e) => setDemoInput(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                  />
                  <button onClick={handleSaveDemoToken} className="bg-[#0ecb81] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#0bb572] transition">
                    Connect
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 block">Deriv Real API Token</label>
                <div className="flex space-x-2">
                  <input
                    type="password"
                    placeholder="Enter Real API token..."
                    value={realInput}
                    onChange={(e) => setRealInput(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                  />
                  <button onClick={handleSaveRealToken} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition">
                    Connect
                  </button>
                </div>
              </div>
            )}

            {derivToken && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-emerald-700 font-bold font-mono">Token Saved &amp; Active</span>
                <button onClick={handleLogout} className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center space-x-1">
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        
        {/* LEFT PANE: Asset Selector, Spot Quote & Real-time SVG Tick Chart */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 lg:overflow-y-auto custom-scrollbar p-4 space-y-4">
          
          {/* Asset Picker Header */}
          <div className="bg-white border border-slate-200 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAssetDropdown(!showAssetDropdown)}
                className="bg-white border border-slate-300 hover:border-slate-400 px-4 py-2 rounded-xl text-xs font-black flex items-center space-x-2 transition cursor-pointer shadow-2xs text-slate-800"
              >
                <Coins className="w-4 h-4 text-[#ff444f]" />
                <span>{activeAsset.name} ({activeAsset.symbol})</span>
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showAssetDropdown && (
                <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 divide-y divide-slate-100 overflow-hidden text-left">
                  <div className="p-2 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Select Deriv Synthetic Index
                  </div>
                  <div className="max-h-72 overflow-y-auto p-1 space-y-0.5">
                    {SUPPORTED_ASSETS.map((asset) => (
                      <button
                        key={asset.symbol}
                        type="button"
                        onClick={() => {
                          setActiveAsset(asset);
                          setShowAssetDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs flex items-center justify-between transition cursor-pointer ${
                          activeAsset.symbol === asset.symbol
                            ? "bg-emerald-50 text-[#0ecb81] font-black border border-emerald-100"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="font-bold">{asset.name}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{asset.symbol}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Current Price Display from rise-fall-app */}
            <div className="flex items-center space-x-3 font-mono">
              <span className={`text-2xl sm:text-3xl font-black tracking-tight transition-colors duration-200 ${
                tickHistory.length > 1 && tickHistory[tickHistory.length - 1] >= tickHistory[tickHistory.length - 2]
                  ? "text-[#0ecb81]"
                  : "text-[#f6465d]"
              }`}>
                {lastTick ? formatFullTickQuote(lastTick.quote, lastTick) : "---"}
              </span>
              {tickHistory.length > 1 && (
                <span className={`text-sm font-black px-2 py-0.5 rounded-md flex items-center ${
                  tickHistory[tickHistory.length - 1] >= tickHistory[tickHistory.length - 2]
                    ? "bg-emerald-100 text-[#0ecb81]"
                    : "bg-rose-100 text-[#f6465d]"
                }`}>
                  {tickHistory[tickHistory.length - 1] >= tickHistory[tickHistory.length - 2] ? "▲" : "▼"}
                </span>
              )}
            </div>
          </div>

          {/* Smart Money Concepts (SMC) Panel */}
          {isSMCOpen && (
            <div className="mb-4">
              <SMCPanel
                prices={tickHistory}
                symbol={activeAsset.symbol}
                provider="DERIV"
                currentPrice={lastTick?.quote}
                onApplySetup={(setup) => {
                  if (setup.direction === 'LONG') {
                    addToast(`Institutional Confluence: Consider RISE (${setup.confidence}% confidence)`, "info");
                  } else if (setup.direction === 'SHORT') {
                    addToast(`Institutional Confluence: Consider FALL (${setup.confidence}% confidence)`, "info");
                  }
                }}
              />
            </div>
          )}

          {/* Real-Time SVG Tick Chart */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center min-h-[360px] relative">
            {tickHistory.length > 1 ? (
              (() => {
                const min = Math.min(...tickHistory);
                const max = Math.max(...tickHistory);
                const padding = (max - min) * 0.1 || 1;
                const yMin = min - padding;
                const yMax = max + padding;

                const width = 1000;
                const height = 300;
                const paddingLeft = 100;
                const paddingRight = 40;
                const paddingTop = 20;
                const paddingBottom = 40;
                const plotWidth = width - paddingLeft - paddingRight;
                const plotHeight = height - paddingTop - paddingBottom;

                const svgCoords = tickHistory.map((val, idx) => {
                  const x = paddingLeft + (idx / (tickHistory.length - 1)) * plotWidth;
                  const y = paddingTop + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;
                  return { x, y, val };
                });

                return (
                  <div className="relative w-full h-[300px] select-none">
                    <svg viewBox="0 0 1000 300" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="riseFallGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0ecb81" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#0ecb81" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* X & Y Axis */}
                      <line x1={100} y1={260} x2={960} y2={260} stroke="#cbd5e1" strokeWidth="1.5" />
                      <line x1={100} y1={20} x2={100} y2={260} stroke="#cbd5e1" strokeWidth="1.5" />

                      {/* Area & Price Line */}
                      <path d={`M ${svgCoords[0]?.x},260 L ${svgCoords.map((c) => `${c.x},${c.y}`).join(" L ")} L ${svgCoords[svgCoords.length - 1]?.x},260 Z`} fill="url(#riseFallGradient)" />
                      <path d={`M ${svgCoords.map((c) => `${c.x},${c.y}`).join(" L ")}`} fill="none" stroke="#0ecb81" strokeWidth="3" strokeLinecap="round" />

                      {/* Active Contract Entry Markers */}
                      {activeContracts.map((c) => {
                        const y = paddingTop + plotHeight - ((c.entryPrice - yMin) / (yMax - yMin)) * plotHeight;
                        return (
                          <g key={c.id}>
                            <line x1={100} y1={y} x2={960} y2={y} stroke="#ff444f" strokeWidth="2" strokeDasharray="5,5" />
                            <text x={110} y={y - 6} fill="#ff444f" fontSize="10" fontWeight="900" fontFamily="monospace">
                              ENTRY SPOT: ${c.entryPrice.toFixed(2)} ({c.type})
                            </text>
                          </g>
                        );
                      })}
                    </svg>

                    <div className="absolute top-2.5 left-10 bg-white/90 border border-slate-200 p-2 rounded-xl text-[9px] font-mono shadow-2xs">
                      <span className="text-slate-600 font-extrabold">● Authentic Deriv Stream ({activeAsset.name})</span>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-slate-400 space-y-2">
                <RefreshCw className="w-8 h-8 text-[#0ecb81] animate-spin" />
                <span className="text-xs font-bold font-mono">Connecting to live real-time Deriv ticks...</span>
              </div>
            )}
          </div>

          {/* Active Pending Options Grid */}
          {activeContracts.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-150 p-4 rounded-2xl text-left space-y-2">
              <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>Active Rise &amp; Fall Contracts ({activeContracts.length})</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeContracts.map((c) => (
                  <div key={c.id} className="bg-white p-3 rounded-xl border border-emerald-200 flex items-center justify-between text-xs font-mono shadow-2xs">
                    <div>
                      <div className="flex items-center space-x-2 font-black">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] ${c.type === "Rise" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                          {c.type.toUpperCase()}
                        </span>
                        <span className="text-slate-900">{c.symbol}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        Entry: <strong className="text-slate-800">${c.entryPrice.toFixed(2)}</strong>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-[#0ecb81] block">{c.ticksRemaining} Ticks Left</span>
                      <span className="text-[10px] text-slate-500">Stake: ${c.stake}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANE: Dedicated Rise & Fall Contract Controls */}
        <div className="w-full lg:w-80 bg-white p-5 flex flex-col justify-between shrink-0 space-y-4 shadow-md text-left">
          <div className="space-y-4">
            
            {/* Header */}
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-[#0ecb81]" />
                <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider">Rise &amp; Fall Parameters</h3>
              </div>
              <p className="text-[10px] text-slate-500 pt-1 leading-relaxed">
                Predict whether the market exit spot will be strictly higher (Rise) or lower (Fall) than the entry spot.
              </p>
            </div>

            {/* Target Level Panel */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1 text-center font-mono">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Contract Target Level</span>
              <div className="text-sm font-black text-slate-800">
                Entry Spot (0.00 offset)
              </div>
              <div className="text-emerald-600 font-extrabold text-[11px] pt-0.5">
                Standard 95.0% Binary Payout
              </div>
            </div>

            {/* Duration Selector */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Duration (Ticks)</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 3, 5, 10].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDurationValue(t)}
                    className={`py-2 rounded-xl text-xs font-black font-mono transition cursor-pointer ${
                      durationValue === t
                        ? "bg-[#0ecb81] text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t} Ticks
                  </button>
                ))}
              </div>
            </div>

            {/* Stake Input Area */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-black block tracking-wider">Stake Amount (USD)</span>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl shadow-xs">
                <span className="px-3 text-slate-400 font-black font-mono">$</span>
                <input
                  type="number"
                  min="1"
                  value={stake}
                  onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-transparent py-2.5 border-none text-slate-800 font-black text-sm font-mono focus:outline-none"
                />
                <span className="px-3 text-[10px] text-slate-400 font-black font-mono">USD</span>
              </div>
            </div>

            {/* Yield & Payout Card */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 text-xs font-mono space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 font-semibold">
                <span>Contract Yield</span>
                <span className="text-emerald-600 font-black">+95.0% Standard Payout</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 font-semibold border-t border-slate-200 pt-2">
                <span>Est. Payout</span>
                <span className="text-emerald-600 font-black">${(stake * 1.95).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                <span>Net Profit</span>
                <span className="text-emerald-500 font-black">+$${(stake * 0.95).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Action Buy Buttons */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={!lastTick || wsStatus !== "connected"}
              onClick={() => purchaseRiseFallContract("Rise")}
              className="w-full bg-[#0ecb81] hover:bg-[#0bb572] disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-3.5 rounded-xl flex items-center justify-between px-4 transition duration-200 shadow-md shadow-emerald-500/10 cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 fill-white" />
                <div className="text-left">
                  <span className="block text-xs font-black uppercase tracking-wider">RISE 📈</span>
                  <span className="block text-[8px] opacity-90 font-semibold font-mono">
                    Target: &gt; ${lastTick ? formatFullTickQuote(lastTick.quote, lastTick) : "..."}
                  </span>
                </div>
              </div>
              <div className="text-right font-mono">
                <span className="block text-[9px] text-white opacity-80 font-bold">Payout:</span>
                <span className="block text-xs font-black">${(stake * 1.95).toFixed(2)}</span>
              </div>
            </button>

            <button
              type="button"
              disabled={!lastTick || wsStatus !== "connected"}
              onClick={() => purchaseRiseFallContract("Fall")}
              className="w-full bg-[#f6465d] hover:bg-[#e0384d] disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-3.5 rounded-xl flex items-center justify-between px-4 transition duration-200 shadow-md shadow-red-500/10 cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <TrendingDown className="w-5 h-5 fill-white" />
                <div className="text-left">
                  <span className="block text-xs font-black uppercase tracking-wider">FALL 📉</span>
                  <span className="block text-[8px] opacity-90 font-semibold font-mono">
                    Target: &lt; ${lastTick ? formatFullTickQuote(lastTick.quote, lastTick) : "..."}
                  </span>
                </div>
              </div>
              <div className="text-right font-mono">
                <span className="block text-[9px] text-white opacity-80 font-bold">Payout:</span>
                <span className="block text-xs font-black">${(stake * 1.95).toFixed(2)}</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* OPTIONS JOURNAL OVERLAY */}
      {isJournalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs cursor-pointer" onClick={() => setIsJournalOpen(false)} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 font-sans text-left">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-purple-600" />
                <h3 className="font-black text-slate-900 text-sm uppercase">Rise &amp; Fall Trade History</h3>
              </div>
              <button onClick={() => setIsJournalOpen(false)} className="p-1 hover:bg-slate-200 text-slate-500 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
              {contractHistory.length === 0 ? (
                <div className="py-10 text-center text-slate-400">No Rise/Fall trades executed in this session yet.</div>
              ) : (
                contractHistory.map((c) => (
                  <div key={c.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-black flex items-center space-x-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] ${c.status === "WON" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{c.status}</span>
                        <span>{c.type} on {c.symbol}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">Entry: ${formatFullTickQuote(c.entryPrice, null, c.symbol)} | Exit: ${c.exitPrice ? formatFullTickQuote(c.exitPrice, null, c.symbol) : "N/A"}</div>
                    </div>
                    <div className="text-right">
                      <span className={`font-black block ${c.status === "WON" ? "text-emerald-600" : "text-rose-500"}`}>
                        {c.status === "WON" ? `+$${(c.payout - c.stake).toFixed(2)}` : `-$${c.stake.toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOAST MESSAGES */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold flex items-center space-x-2 border border-slate-800">
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
