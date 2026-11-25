import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw,
  Key,
  LogOut,
  ShieldCheck,
  Clock,
  Zap,
  Activity,
  Coins,
  Sliders,
  X,
} from "lucide-react";
import { DERIV_PUBLIC_WS_URL } from "../config/derivConfig";
import { closeWebSocketGracefully } from "../utils/closeWebSocketGracefully";
import {
  fetchOptionsAccounts,
  requestAccountOtpUrl,
  redactDerivUrl,
} from "../utils/derivOptionsApi";
import { SMCPanel } from "./SMCPanel";

interface DerivAsset {
  name: string;
  symbol: string;
  category: "Volatility Indices" | "Daily Reset Indices";
}

// Deriv synthetic indices that support Accumulator (ACCU) contracts.
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

// Deriv authoritative pip-size map per symbol.
const ASSET_PIP_SIZES: Record<string, number> = {
  "1HZ100V": 2,
  "1HZ10V": 2,
  "1HZ25V": 2,
  "1HZ50V": 2,
  "1HZ75V": 2,
  R_10: 3,
  R_25: 3,
  R_50: 4,
  R_75: 2,
  R_100: 2,
  RDBULL: 2,
  RDBEAR: 2,
};

interface DerivTick {
  ask: number;
  bid: number;
  epoch: number;
  id: string;
  pip_size: number;
  quote: number;
  symbol: string;
}

// Accumulator (ACCU) proposal returned by the API.
interface AccumulatorProposal {
  id: string;
  ask_price: number;
  payout: number;
  spot: number;
  maxPayout: number;
  maxTicks: number;
  barrierPercentage: string;
  highBarrier: string;
  lowBarrier: string;
}

// A live accumulator position (from proposal_open_contract updates).
interface OpenAccuContract {
  contractId: number;
  symbol: string;
  growthRate: number;
  stake: number;
  entrySpot: number;
  currentSpot: number;
  entryTime: number;
  profit: number;
  profitPct: number;
  is_valid_to_sell: number;
  is_sold: number;
  is_expired: number;
  status: string;
  current_tick: number;
}

const GROWTH_RATES = [0.01, 0.02, 0.03, 0.04, 0.05];

interface Toast {
  id: number;
  message: string;
}


export function DerivAccumulatorTrader() {
  // --- Auth / tokens (same flow as Rise & Fall) ---
  const [demoToken, setDemoToken] = useState<string>(
    () => "pat_0f7076d9ad23de5ea77a6a3c26c79f0e3e474e9b90fd229443edf811daffc3cd",
  );
  const [realToken, setRealToken] = useState<string>(
    () => "pat_0f7076d9ad23de5ea77a6a3c26c79f0e3e474e9b90fd229443edf811daffc3cd",
  );
  const [activeAccountType, setActiveAccountType] = useState<"demo" | "real">(
    () =>
      (localStorage.getItem("deriv_active_account_type") as "demo" | "real") || "demo",
  );

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

  const [demoInput, setDemoInput] = useState<string>("");
  const [realInput, setRealInput] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [showTokenSettings, setShowTokenSettings] = useState<boolean>(false);

  // Persist seeded/provided PAT so the trading socket can mint an OTP session.
  useEffect(() => {
    if (demoToken) localStorage.setItem("deriv_demo_token", demoToken);
  }, [demoToken]);
  useEffect(() => {
    if (realToken) localStorage.setItem("deriv_real_token", realToken);
  }, [realToken]);

  const derivToken = activeAccountType === "demo" ? demoToken : realToken;
  const authInfo = activeAccountType === "demo" ? demoAuthInfo : realAuthInfo;

  const [sandboxBalance, setSandboxBalance] = useState<number>(() => {
    const saved = localStorage.getItem("deriv_sandbox_balance");
    return saved ? Number(saved) : 10000.0;
  });

  useEffect(() => {
    localStorage.setItem("deriv_sandbox_balance", String(sandboxBalance));
  }, [sandboxBalance]);

  const balance = authInfo ? Number(authInfo.balance) : sandboxBalance;

  // --- Market & trade inputs ---
  const [activeAsset, setActiveAsset] = useState<DerivAsset>(SUPPORTED_ASSETS[0]);
  const [showAssetDropdown, setShowAssetDropdown] = useState<boolean>(false);
  const [lastTick, setLastTick] = useState<DerivTick | null>(null);

  const [stake, setStake] = useState<number>(10.0);
  const [growthRate, setGrowthRate] = useState<number>(0.01);
  const [takeProfit, setTakeProfit] = useState<string>("");

  // --- Live stream + trading state ---
  const [tickHistory, setTickHistory] = useState<number[]>([]);
  const [wsStatus, setWsStatus] =
    useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [isWsAuthorized, setIsWsAuthorized] = useState<boolean>(false);
  const [reconnectTrigger, setReconnectTrigger] = useState<number>(0);
  const [isSMCOpen, setIsSMCOpen] = useState<boolean>(false);

  const [proposal, setProposal] = useState<AccumulatorProposal | null>(null);
  const [openContract, setOpenContract] = useState<OpenAccuContract | null>(null);
  const [closedContracts, setClosedContracts] = useState<OpenAccuContract[]>([]);
  const [isBuying, setIsBuying] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef<number>(0);

  const addToast = useCallback((message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // --- Refs the socket effect reads so it never needs to re-run on input changes ---
  const activeAssetRef = useRef<DerivAsset>(activeAsset);
  useEffect(() => {
    activeAssetRef.current = activeAsset;
  }, [activeAsset]);
  const stakeRef = useRef<number>(stake);
  useEffect(() => {
    stakeRef.current = stake;
  }, [stake]);
  const growthRateRef = useRef<number>(growthRate);
  useEffect(() => {
    growthRateRef.current = growthRate;
  }, [growthRate]);
  const takeProfitRef = useRef<string>(takeProfit);
  useEffect(() => {
    takeProfitRef.current = takeProfit;
  }, [takeProfit]);
  const accountTypeRef = useRef<"demo" | "real">(activeAccountType);
  useEffect(() => {
    accountTypeRef.current = activeAccountType;
  }, [activeAccountType]);
  // Mirrors isWsAuthorized so the socket effect can gate pricing without re-running.
  const isWsAuthorizedRef = useRef<boolean>(false);
  useEffect(() => {
    isWsAuthorizedRef.current = isWsAuthorized;
  }, [isWsAuthorized]);

  // Format a quote to its native decimals (no padding/truncation).
  const formatFullTickQuote = (
    quote: number | undefined | null,
    tick?: DerivTick | null,
    symbol?: string,
  ): string => {
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

  // Bumped to force the socket effect to re-request a fresh ACCU proposal.
  const [proposalNonce, setProposalNonce] = useState<number>(0);


  // Reset accumulator session state on token/account change.
  useEffect(() => {
    setProposal(null);
    setOpenContract(null);
    setClosedContracts([]);
  }, [derivToken, activeAccountType]);

  // --- OTP session (pre-authenticated WS URL for live trading) ---
  const [otpWsUrl, setOtpWsUrl] = useState<string | null>(null);
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
        const url = await mintFreshOtp();
        if (!cancelled) setOtpWsUrl(url);
      } catch {
        if (!cancelled) setOtpWsUrl(null);
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

  // --- Save / logout handlers ---
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
    addToast("Logged out of Deriv account. Switched to Sandbox Mode.");
  };

  const handleSaveToken = () => {
    const value = activeAccountType === "demo" ? demoInput : realInput;
    if (!value.trim()) return;
    setAuthError(null);
    if (activeAccountType === "demo") {
      setDemoToken(value.trim());
      setDemoAuthInfo(null);
      localStorage.setItem("deriv_demo_token", value.trim());
      localStorage.setItem("deriv_active_account_type", "demo");
    } else {
      setRealToken(value.trim());
      setRealAuthInfo(null);
      localStorage.setItem("deriv_real_token", value.trim());
      localStorage.setItem("deriv_active_account_type", "real");
    }
    addToast(`${activeAccountType === "demo" ? "Demo" : "Real"} token saved. Connecting...`);
  };


  // A single live socket ref shared by buy/sell actions (assigned in connectWS).
  const socketRef = useRef<WebSocket | null>(null);

  // --- WebSocket: connect, subscribe to ticks + accumulator proposal ---
  useEffect(() => {
    // NEW Deriv Options API transport (matches DerivRiseFallTrader): an OTP
    // URL is pre-authenticated for live trading; otherwise the public
    // market-data socket powers ticks while proposals stay unavailable in
    // Sandbox mode. The legacy ws.derivws.com v3 gateway is intentionally
    // avoided (returns Cloudflare 520 — see derivConfig.ts).
    const socket = otpWsUrl || DERIV_PUBLIC_WS_URL;

    let ws: WebSocket;
    let pingInterval: ReturnType<typeof setInterval>;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let isMounted = true;

    // --- Message router (reads refs/state setters; stable across re-renders) ---
    const handleMessage = (data: any) => {
      // A. Authorize
      if (data.msg_type === "authorize") {
        if (data.error) {
          setIsWsAuthorized(false);
          setAuthError(
            data.error.message || "Invalid API token. Operating in Sandbox Mode.",
          );
        } else if (data.authorize) {
          const auth = data.authorize;
          const scopes = auth.scopes || [];
          if (scopes.length > 0 && !scopes.includes("trade")) {
            setAuthError(
              "Your token is missing the 'trade' scope. Create a token on developers.deriv.com with 'trade' & 'trading_information' scopes.",
            );
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
            scopes,
          };
          if (accountTypeRef.current === "demo") {
            setDemoAuthInfo(updatedAuth);
            localStorage.setItem("deriv_demo_auth_info", JSON.stringify(updatedAuth));
          } else {
            setRealAuthInfo(updatedAuth);
            localStorage.setItem("deriv_real_auth_info", JSON.stringify(updatedAuth));
          }
          setIsWsAuthorized(true);
          setAuthError(null);
        }
      }

      // B. Balance
      if (data.msg_type === "balance" && data.balance) {
        const balanceVal = Number(data.balance.balance);
        if (accountTypeRef.current === "demo") {
          setDemoAuthInfo((prev) => (prev ? { ...prev, balance: balanceVal } : null));
        } else {
          setRealAuthInfo((prev) => (prev ? { ...prev, balance: balanceVal } : null));
        }
      }

      // C. Tick history
      if (data.msg_type === "history" && data.history) {
        const prices: number[] = data.history.prices || [];
        const times: number[] = data.history.times || [];
        const respSymbol = data.echo_req?.ticks_history || activeAssetRef.current.symbol;
        if (prices.length > 0 && respSymbol === activeAssetRef.current.symbol) {
          const lastPrice = prices[prices.length - 1];
          const lastEpoch =
            times[times.length - 1] || Math.floor(Date.now() / 1000);
          if (prices.length === 1) {
            setTickHistory((prev) => {
              if (prev.length > 0 && prev[prev.length - 1] === lastPrice) return prev;
              return [...prev.slice(-39), lastPrice];
            });
          } else {
            setTickHistory(prices.slice(-40));
          }
          setLastTick({
            ask: lastPrice,
            bid: lastPrice,
            epoch: lastEpoch,
            id: `hist-${lastEpoch}`,
            pip_size: data.history?.pip_size ?? 4,
            quote: lastPrice,
            symbol: respSymbol,
          });
        }
      }

      // D. Live tick stream
      if (data.msg_type === "tick" && data.tick) {
        const tickData: DerivTick = data.tick;
        if (tickData.symbol === activeAssetRef.current.symbol) {
          setLastTick(tickData);
          setTickHistory((prev) => {
            if (prev.length > 0 && prev[prev.length - 1] === tickData.quote) return prev;
            return [...prev.slice(-39), tickData.quote];
          });
          setOpenContract((prev) =>
            prev ? { ...prev, currentSpot: tickData.quote } : null,
          );
        }
      }

      // E. Accumulator proposal
      if (data.msg_type === "proposal" && data.proposal) {
        const p = data.proposal;
        const details = p.contract_details || {};
        if ((p.contract_type || "") !== "ACCU") return;
        setProposal({
          id: p.id,
          ask_price: Number(p.ask_price),
          payout: Number(p.payout),
          spot: Number(p.spot),
          maxPayout:
            details.maximum_payout ?? Number(p.validation_params?.payout?.max ?? 0),
          maxTicks: details.maximum_ticks ?? (p.validation_params?.max_ticks ?? 0),
          barrierPercentage: details.tick_size_barrier_percentage
            ? `±${details.tick_size_barrier_percentage}`
            : "",
          highBarrier: details.high_barrier ?? "",
          lowBarrier: details.low_barrier ?? "",
        });
      }


      // F. Buy confirmation → begin live tracking
      if (data.msg_type === "buy" && data.buy) {
        const buy = data.buy;
        setIsBuying(false);
        setOpenContract({
          contractId: Number(buy.contract_id),
          symbol: buy.underlying_symbol || activeAssetRef.current.symbol,
          growthRate: growthRateRef.current,
          stake: stakeRef.current,
          entrySpot: Number(buy.buy_price),
          currentSpot: Number(buy.buy_price),
          entryTime: Math.floor(Date.now() / 1000),
          profit: 0,
          profitPct: 0,
          is_valid_to_sell: 0,
          is_sold: 0,
          is_expired: 0,
          status: "open",
          current_tick: 0,
        });
        // Start streaming this contract's live ticks / profit / barrier state.
        socketRef.current?.send(
          JSON.stringify({ proposal_open_contract: 1, contract_id: Number(buy.contract_id), subscribe: 1 }),
        );
        // Stop re-pricing proposals while a contract is open (the dedicated
        // polling effect keys off `openContract` and will resume on close).
        if (proposalPollRef.current) {
          clearInterval(proposalPollRef.current);
          proposalPollRef.current = null;
        }
        setProposal(null);
        addToast(
          `Accumulator bought @ ${(growthRateRef.current * 100).toFixed(0)}% growth rate!`,
        );
      } else if (data.msg_type === "buy" && data.error) {
        setIsBuying(false);
        addToast(`Buy failed: ${data.error.message}`);
      }

      // G. Live contract (POC) updates
      if (data.msg_type === "proposal_open_contract") {
        const poc = data.proposal_open_contract;
        if (!poc) return;
        const isClosed = !!poc.is_sold || !!poc.is_expired || poc.status !== "open";
        setOpenContract((prev) => {
          if (!prev || prev.contractId !== poc.contract_id) return prev;
          return {
            ...prev,
            profit: Number(poc.profit ?? 0),
            profitPct: Number(poc.profit_percentage ?? 0),
            is_valid_to_sell: poc.is_valid_to_sell ?? 0,
            is_sold: poc.is_sold ?? 0,
            is_expired: poc.is_expired ?? 0,
            status: poc.status ?? "open",
            current_tick: poc.tick_count ?? 0,
            currentSpot: Number(poc.current_spot ?? prev.currentSpot),
          };
        });
        // Side effects kept OUT of the state updater to preserve updater purity.
        if (isClosed) {
          setClosedContracts((c) => [
            {
              contractId: Number(poc.contract_id),
              symbol: poc.underlying_symbol || activeAssetRef.current.symbol,
              growthRate: growthRateRef.current,
              stake: Number(poc.buy_price ?? 0),
              entrySpot: Number(poc.entry_spot ?? 0),
              currentSpot: Number(poc.current_spot ?? 0),
              entryTime: Number(poc.date_start ?? 0),
              profit: Number(poc.profit ?? 0),
              profitPct: Number(poc.profit_percentage ?? 0),
              is_valid_to_sell: poc.is_valid_to_sell ?? 0,
              is_sold: poc.is_sold ?? 0,
              is_expired: poc.is_expired ?? 0,
              status: poc.status ?? "closed",
              current_tick: poc.tick_count ?? 0,
            },
            ...c,
          ]);
          const fp = Number(poc.profit ?? 0);
          addToast(
            fp >= 0
              ? `Accumulator closed. Profit: +$${fp.toFixed(2)}`
              : `Accumulator closed. Loss: $${fp.toFixed(2)} (barrier hit)`,
          );
        }
      }

      // H. Sell confirmation
      if (data.msg_type === "sell" && data.sell) {
        setIsClosing(false);
        addToast(`Accumulator sold for $${Number(data.sell.sold_for).toFixed(2)}`);
      } else if (data.msg_type === "sell" && data.error) {
        setIsClosing(false);
        addToast(`Sell failed: ${data.error.message}`);
      }
    };

    const connectWS = async () => {
      if (!isMounted) return;
      setWsStatus("connecting");

      // Fresh credential per dial (Deriv guidance): while an OTP session is
      // active, re-mint before EVERY (re)connection — a URL minted for an
      // earlier socket must never be re-dialled after a drop. On mint failure
      // fall back to the last known URL; its failure re-enters the retry loop.
      let dialUrl = socket;
      if (otpWsUrl) {
        try {
          const fresh = await mintFreshOtp();
          if (fresh) dialUrl = fresh;
        } catch (err) {
          console.warn("[DERIV ACCU WS] OTP re-mint failed; re-dialing last known URL:", err);
        }
        if (!isMounted) return;
      }
      console.log(
        `[DERIV ACCU WS] Connecting to ${otpWsUrl ? "OTP authenticated" : "public"} socket -> ${redactDerivUrl(dialUrl)}`,
      );
      ws = new WebSocket(dialUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setWsStatus("connected");

        // OTP socket is already authenticated — never send `authorize` on it.
        // The public socket can't hold an account session, so trading stays in
        // Sandbox mode there (proposal/buy reply AuthorizationRequired).
        if (otpWsUrl) {
          setIsWsAuthorized(true);
          setAuthError(null);
          ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        } else {
          setIsWsAuthorized(false);
        }

        const primarySym = activeAssetRef.current.symbol;
        ws.send(
          JSON.stringify({
            ticks_history: primarySym,
            count: 50,
            end: "latest",
            style: "ticks",
          }),
        );
        ws.send(JSON.stringify({ ticks: primarySym, subscribe: 1 }));

        // NOTE: ACCU pricing is an account-only call — the public socket replies
        // AuthorizationRequired. Proposal polling (effect below) only starts once
        // `isWsAuthorized` flips true, which happens exclusively on the OTP path
        // (set in onopen above + confirmed by the balance subscription there).

        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
        }, 30000);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        handleMessage(data);
      };

      ws.onclose = () => {
        if (!isMounted) return;
        clearInterval(pingInterval);
        setWsStatus("disconnected");
        reconnectTimeout = setTimeout(() => {
          if (isMounted) connectWS();
        }, 3000);
      };

      ws.onerror = () => {
        if (isMounted) setWsStatus("disconnected");
      };
    };

    connectWS();

    return () => {
      isMounted = false;
      clearInterval(pingInterval);
      clearTimeout(reconnectTimeout);
      closeWebSocketGracefully(ws);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpWsUrl, reconnectTrigger, proposalNonce]);


  // Re-request a fresh proposal whenever a trade input changes.
  useEffect(() => {
    if (wsStatus === "connected") setProposalNonce((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAsset.symbol, stake, growthRate, takeProfit]);

  // Start/resume ACCU proposal polling as soon as the session is authorized and
  // no contract is open. The initial (public-socket authorize) path lands here
  // after the authorize response flips isWsAuthorized to true.
  const proposalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const sock = socketRef.current;
    if (!isWsAuthorized || openContract || wsStatus !== "connected" || !sock) return;

    const sendProposal = () => {
      if (sock.readyState !== WebSocket.OPEN) return;
      const payload: Record<string, unknown> = {
        proposal: 1,
        amount: stakeRef.current,
        basis: "stake",
        contract_type: "ACCU",
        currency: "USD",
        underlying_symbol: activeAssetRef.current.symbol,
        growth_rate: growthRateRef.current,
        subscribe: 1,
      };
      const tp = parseFloat(takeProfitRef.current);
      if (tp && tp > 0) payload.limit_order = { take_profit: tp };
      sock.send(JSON.stringify(payload));
    };

    sendProposal();
    proposalPollRef.current = setInterval(sendProposal, 2000);
    return () => {
      if (proposalPollRef.current) {
        clearInterval(proposalPollRef.current);
        proposalPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWsAuthorized, openContract, wsStatus, proposalNonce]);

  const handleBuy = () => {
    if (!proposal) return;
    setIsBuying(true);
    socketRef.current?.send(
      JSON.stringify({ buy: proposal.id, price: proposal.ask_price }),
    );
  };

  const handleClose = () => {
    if (!openContract) return;
    setIsClosing(true);
    // ACCU positions are closed by selling at the current bid price.
    socketRef.current?.send(JSON.stringify({ sell: openContract.contractId, price: 1 }));
  };

  // --- Derived display values ---
  const currencySymbol = authInfo ? authInfo.currency : "USD";
  const highBarrierNum = proposal ? parseFloat(proposal.highBarrier) : NaN;
  const lowBarrierNum = proposal ? parseFloat(proposal.lowBarrier) : NaN;
  const currentSpot = lastTick?.quote ?? 0;
  const hasCrossedBarrier =
    !!lastTick &&
    !isNaN(highBarrierNum) &&
    !isNaN(lowBarrierNum) &&
    (currentSpot >= highBarrierNum || currentSpot <= lowBarrierNum);
  const activePipSize = ASSET_PIP_SIZES[activeAsset.symbol] ?? 2;


  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 select-none overflow-hidden font-sans">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-2xs shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-[#f0b90b] flex items-center justify-center text-white font-black text-xs shadow-sm">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-black text-slate-900 tracking-tight uppercase">
                Deriv Accumulators Trading App
              </h1>
              <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                ACCU Contract
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold text-left">
              Growth-rate accumulators — payout compounds per tick while price stays
              inside the barrier range.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === "connected" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
              }`}
            />
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
            <span>
              {isWsAuthorized
                ? authInfo?.is_virtual
                  ? "DEMO ACCOUNT"
                  : "REAL ACCOUNT"
                : "SANDBOX MODE"}
            </span>
          </button>

          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-3.5 py-1.5 rounded-xl font-mono text-left shadow-2xs">
            <span className="text-[8px] font-bold block uppercase text-emerald-600 tracking-wider">
              {isWsAuthorized ? "Deriv Live Balance" : "Sandbox Practice Balance"}
            </span>
            <span className="text-xs font-black">
              ${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
              {currencySymbol}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsSMCOpen(!isSMCOpen)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border font-bold text-xs transition cursor-pointer ${
              isSMCOpen
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>SMC</span>
          </button>
        </div>
      </header>


      {/* TOKEN SETTINGS PANEL */}
      {showTokenSettings && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 shrink-0">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-900">
                Deriv API Token
              </span>
              <div className="flex bg-white border border-amber-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setActiveAccountType("demo")}
                  className={`px-3 py-1 text-[10px] font-black uppercase ${
                    activeAccountType === "demo"
                      ? "bg-amber-500 text-white"
                      : "text-amber-800"
                  }`}
                >
                  Demo
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAccountType("real")}
                  className={`px-3 py-1 text-[10px] font-black uppercase ${
                    activeAccountType === "real"
                      ? "bg-amber-500 text-white"
                      : "text-amber-800"
                  }`}
                >
                  Real
                </button>
              </div>
            </div>
            <p className="text-[10px] text-amber-800 leading-relaxed">
              Paste a token created on developers.deriv.com with the{" "}
              <strong>trade</strong> &amp; <strong>trading_information</strong>{" "}
              scopes. Leave empty to stay in Sandbox (market data still live).
            </p>
            <div className="flex items-center space-x-2">
              <input
                type="password"
                placeholder={`Enter ${activeAccountType === "demo" ? "Demo" : "Real"} API token...`}
                value={activeAccountType === "demo" ? demoInput : realInput}
                onChange={(e) =>
                  activeAccountType === "demo"
                    ? setDemoInput(e.target.value)
                    : setRealInput(e.target.value)
                }
                className="flex-1 bg-white border border-amber-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveToken}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition"
              >
                Connect
              </button>
            </div>
            {authError && (
              <div className="text-[10px] text-rose-700 font-bold font-mono bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {authError}
              </div>
            )}
            {derivToken && (
              <div className="pt-2 border-t border-amber-200 flex items-center justify-between">
                <span className="text-xs text-emerald-700 font-bold font-mono">
                  Token Saved &amp; Active
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center space-x-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200">

        {/* LEFT PANE: Asset selector, spot quote & barrier-band chart */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 lg:overflow-y-auto custom-scrollbar p-4 space-y-4">

          {/* Asset Picker */}
          <div className="bg-white border border-slate-200 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAssetDropdown(!showAssetDropdown)}
                className="bg-white border border-slate-300 hover:border-slate-400 px-4 py-2 rounded-xl text-xs font-black flex items-center space-x-2 transition cursor-pointer shadow-2xs text-slate-800"
              >
                <Coins className="w-4 h-4 text-[#f0b90b]" />
                <span>
                  {activeAsset.name} ({activeAsset.symbol})
                </span>
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
              </button>
              {showAssetDropdown && (
                <div className="absolute left-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 divide-y divide-slate-100 overflow-hidden text-left max-h-96 overflow-y-auto">
                  <div className="p-2 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider sticky top-0">
                    Select Deriv Synthetic Index
                  </div>
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
                          ? "bg-amber-50 text-[#f0b90b] font-black border border-amber-100"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span>{asset.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {asset.symbol}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3 font-mono">
              <span
                className={`text-2xl sm:text-3xl font-black tracking-tight transition-colors duration-200 ${
                  tickHistory.length > 1 &&
                  tickHistory[tickHistory.length - 1] >= tickHistory[tickHistory.length - 2]
                    ? "text-[#0ecb81]"
                    : "text-[#f6465d]"
                }`}
              >
                {lastTick ? formatFullTickQuote(lastTick.quote, lastTick) : "---"}
              </span>
              {tickHistory.length > 1 && (
                <span
                  className={`text-sm font-black px-2 py-0.5 rounded-md flex items-center ${
                    tickHistory[tickHistory.length - 1] >= tickHistory[tickHistory.length - 2]
                      ? "bg-emerald-100 text-[#0ecb81]"
                      : "bg-rose-100 text-[#f6465d]"
                  }`}
                >
                  {tickHistory[tickHistory.length - 1] >= tickHistory[tickHistory.length - 2]
                    ? "▲"
                    : "▼"}
                </span>
              )}
            </div>
          </div>

          {/* Barrier-Band Chart */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center min-h-[360px] relative">
            {/* Barrier legend */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-[#f0b90b]" />
                <span>Accumulator Barrier Zone</span>
              </span>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  hasCrossedBarrier
                    ? "bg-rose-100 text-rose-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {hasCrossedBarrier ? "⚠ BARRIER CROSSED" : "● INSIDE ZONE"}
              </span>
            </div>

            {tickHistory.length > 1 ? (
              (() => {
                const min = Math.min(...tickHistory);
                const max = Math.max(...tickHistory);
                const padding = (max - min) * 0.1 || 1;
                const yMin = min - padding;
                const yMax = max + padding;

                const width = 1000;
                const height = 300;
                const padLeft = 100;
                const padRight = 40;
                const padTop = 20;
                const padBottom = 40;
                const plotW = width - padLeft - padRight;
                const plotH = height - padTop - padBottom;

                const svgCoords = tickHistory.map((val, idx) => {
                  const x = padLeft + (idx / (tickHistory.length - 1)) * plotW;
                  const y = padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;
                  return { x, y, val };
                });

                const barrierY = (val: number) =>
                  padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;
                const clamp = (y: number) =>
                  Math.max(padTop, Math.min(padTop + plotH, y));
                const highY = isNaN(highBarrierNum) ? padTop : clamp(barrierY(highBarrierNum));
                const lowY = isNaN(lowBarrierNum)
                  ? padTop + plotH
                  : clamp(barrierY(lowBarrierNum));
                const bandColor = hasCrossedBarrier ? "#cc2e3d" : "#008832";

                return (
                  <div className="relative w-full h-[300px] select-none">
                    <svg
                      viewBox="0 0 1000 300"
                      className="w-full h-full overflow-visible"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="accuGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={bandColor} stopOpacity="0.18" />
                          <stop offset="100%" stopColor={bandColor} stopOpacity="0.02" />
                        </linearGradient>
                      </defs>

                      {/* Barrier band */}
                      {!isNaN(highBarrierNum) && !isNaN(lowBarrierNum) && (
                        <rect
                          x={padLeft}
                          y={highY}
                          width={plotW}
                          height={Math.max(0, lowY - highY)}
                          fill={bandColor}
                          fillOpacity="0.08"
                        />
                      )}

                      {/* Axes */}
                      <line
                        x1={padLeft}
                        y1={padTop + plotH}
                        x2={width - padRight}
                        y2={padTop + plotH}
                        stroke="#cbd5e1"
                        strokeWidth="1.5"
                      />
                      <line
                        x1={padLeft}
                        y1={padTop}
                        x2={padLeft}
                        y2={padTop + plotH}
                        stroke="#cbd5e1"
                        strokeWidth="1.5"
                      />

                      {/* Barrier lines */}
                      {!isNaN(highBarrierNum) && (
                        <line
                          x1={padLeft}
                          y1={highY}
                          x2={width - padRight}
                          y2={highY}
                          stroke={bandColor}
                          strokeWidth="1.5"
                          strokeDasharray="6,4"
                        />
                      )}
                      {!isNaN(lowBarrierNum) && (
                        <line
                          x1={padLeft}
                          y1={lowY}
                          x2={width - padRight}
                          y2={lowY}
                          stroke={bandColor}
                          strokeWidth="1.5"
                          strokeDasharray="6,4"
                        />
                      )}


                      {/* Area + price line */}
                      <path
                        d={`M ${svgCoords[0]?.x},${padTop + plotH} L ${svgCoords
                          .map((c) => `${c.x},${c.y}`)
                          .join(" L ")} L ${svgCoords[svgCoords.length - 1]?.x},${
                          padTop + plotH
                        } Z`}
                        fill="url(#accuGradient)"
                      />
                      <path
                        d={`M ${svgCoords.map((c) => `${c.x},${c.y}`).join(" L ")}`}
                        fill="none"
                        stroke={bandColor}
                        strokeWidth="3"
                        strokeLinecap="round"
                      />

                      {/* Barrier labels */}
                      {!isNaN(highBarrierNum) && (
                        <text
                          x={padLeft + 6}
                          y={highY - 5}
                          fill={bandColor}
                          fontSize="10"
                          fontWeight="900"
                          fontFamily="monospace"
                        >
                          HIGH BARRIER: {highBarrierNum.toFixed(ASSET_PIP_SIZES[activeAsset.symbol] ?? 2)}
                        </text>
                      )}
                      {!isNaN(lowBarrierNum) && (
                        <text
                          x={padLeft + 6}
                          y={lowY + 13}
                          fill={bandColor}
                          fontSize="10"
                          fontWeight="900"
                          fontFamily="monospace"
                        >
                          LOW BARRIER: {lowBarrierNum.toFixed(activePipSize)}
                        </text>
                      )}
                    </svg>

                    <div className="absolute top-2.5 left-2 bg-white/90 border border-slate-200 p-2 rounded-xl text-[9px] font-mono shadow-2xs">
                      <span className="text-slate-600 font-extrabold">
                        ● Authentic Deriv Stream ({activeAsset.name})
                      </span>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-slate-400 space-y-2">
                <RefreshCw className="w-8 h-8 text-[#f0b90b] animate-spin" />
                <span className="text-xs font-bold font-mono">
                  Connecting to live real-time Deriv ticks...
                </span>
              </div>
            )}
          </div>

          {/* Smart Money Concepts Panel */}
          {isSMCOpen && (
            <div className="mb-4">
              <SMCPanel
                prices={tickHistory}
                symbol={activeAsset.symbol}
                provider="DERIV"
                currentPrice={lastTick?.quote}
                onApplySetup={(setup) => {
                  if (setup.direction === "LONG") {
                    addToast(
                      `Institutional Confluence: market leans UP — accumulator may survive longer (${setup.confidence}% confidence)`,
                      "info",
                    );
                  } else if (setup.direction === "SHORT") {
                    addToast(
                      `Institutional Confluence: market leans DOWN — watch the lower barrier (${setup.confidence}% confidence)`,
                      "info",
                    );
                  }
                }}
              />
            </div>
          )}

          {/* Live Active Accumulator Card */}
          {openContract && (
            <div
              className={`border p-4 rounded-2xl text-left space-y-3 ${
                hasCrossedBarrier
                  ? "bg-rose-50 border-rose-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider flex items-center space-x-1.5 text-slate-800">
                  <Clock className="w-4 h-4 text-[#f0b90b]" />
                  <span>Active Accumulator</span>
                </h4>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white border border-slate-200 font-mono">
                  {openContract.growthRate * 100}% growth
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-2.5">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                    Entry Spot
                  </span>
                  <span className="text-sm font-black text-slate-800 font-mono">
                    {openContract.entrySpot.toFixed(activePipSize)}
                  </span>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-2.5">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                    Current Spot
                  </span>
                  <span
                    className={`text-sm font-black font-mono ${
                      hasCrossedBarrier ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {(openContract.currentSpot ?? currentSpot).toFixed(activePipSize)}
                  </span>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-2.5">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                    Ticks Survived
                  </span>
                  <span className="text-sm font-black text-slate-800 font-mono">
                    {openContract.current_tick ?? 0}
                  </span>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-2.5">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                    Live P&amp;L
                  </span>
                  <span
                    className={`text-sm font-black font-mono ${
                      openContract.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {openContract.profit >= 0 ? "+" : ""}${openContract.profit.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANE: Accumulator Controls */}
        <div className="w-full lg:w-80 bg-white p-5 flex flex-col justify-between shrink-0 space-y-4 shadow-md text-left">
          <div className="space-y-4">
            {/* Header */}
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-[#f0b90b]" />
                <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider">
                  Accumulator Parameters
                </h3>
              </div>
              <p className="text-[10px] text-slate-500 pt-1 leading-relaxed">
                Payout compounds at the selected rate for every tick the price stays
                inside the barrier range. Touching a barrier closes the contract at a
                loss.
              </p>
            </div>

            {/* Growth Rate Selector */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">
                Growth Rate
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {GROWTH_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={!!openContract}
                    onClick={() => setGrowthRate(r)}
                    className={`py-2 rounded-xl text-xs font-black font-mono transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      growthRate === r
                        ? "bg-[#f0b90b] text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {r * 100}%
                  </button>
                ))}
              </div>
            </div>

            {/* Stake Input */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-black block tracking-wider">
                Stake Amount (USD)
              </span>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl shadow-xs">
                <span className="px-3 text-slate-400 font-black font-mono">$</span>
                <input
                  type="number"
                  min="1"
                  disabled={!!openContract}
                  value={stake}
                  onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-transparent py-2.5 border-none text-slate-800 font-black text-sm font-mono focus:outline-none disabled:opacity-50"
                />
                <span className="px-3 text-[10px] text-slate-400 font-black font-mono">USD</span>
              </div>
            </div>

            {/* Take Profit Input */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-black block tracking-wider">
                Take Profit (optional, USD)
              </span>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl shadow-xs">
                <span className="px-3 text-slate-400 font-black font-mono">$</span>
                <input
                  type="number"
                  min="0"
                  disabled={!!openContract}
                  placeholder="Auto-close at profit"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  className="w-full bg-transparent py-2.5 border-none text-slate-800 font-black text-sm font-mono focus:outline-none disabled:opacity-50 placeholder:text-slate-300"
                />
                <span className="px-3 text-[10px] text-slate-400 font-black font-mono">USD</span>
              </div>
            </div>


            {/* Barrier Info Card */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 text-xs font-mono space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 font-semibold">
                <span>High Barrier</span>
                <span className="text-slate-800 font-black">
                  {!isNaN(highBarrierNum) ? highBarrierNum.toFixed(activePipSize) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 font-semibold">
                <span>Low Barrier</span>
                <span className="text-slate-800 font-black">
                  {!isNaN(lowBarrierNum) ? lowBarrierNum.toFixed(activePipSize) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 font-semibold">
                <span>Barrier Width</span>
                <span className="text-amber-600 font-black">
                  {proposal?.barrierPercentage || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 font-semibold border-t border-slate-200 pt-2">
                <span>Max Payout</span>
                <span className="text-emerald-600 font-black">
                  {proposal?.maxPayout ? `$${proposal.maxPayout.toFixed(2)}` : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            {openContract ? (
              <button
                type="button"
                disabled={!openContract.is_valid_to_sell || isClosing}
                onClick={handleClose}
                className="w-full bg-[#f6465d] hover:bg-[#e03e54] disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-3.5 rounded-xl flex items-center justify-center space-x-2 transition duration-200 shadow-md shadow-rose-500/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
                <span className="text-xs font-black uppercase tracking-wider">
                  {isClosing
                    ? "Closing..."
                    : openContract.is_valid_to_sell
                      ? `Close @ $${openContract.profit.toFixed(2)}`
                      : "Waiting for sell window..."}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!proposal || !lastTick || wsStatus !== "connected" || isBuying}
                onClick={handleBuy}
                className="w-full bg-[#f0b90b] hover:bg-[#d9a70a] disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-3.5 rounded-xl flex items-center justify-between px-4 transition duration-200 shadow-md shadow-amber-500/10 cursor-pointer"
              >
                <div className="flex items-center space-x-2">
                  <Zap className="w-5 h-5 fill-white" />
                  <div className="text-left">
                    <span className="block text-xs font-black uppercase tracking-wider">
                      BUY ACCUMULATOR
                    </span>
                    <span className="block text-[8px] opacity-90 font-semibold font-mono">
                      {growthRate * 100}% compounding growth rate
                    </span>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <span className="block text-[9px] text-white opacity-80 font-bold">
                    Payout:
                  </span>
                  <span className="block text-xs font-black">
                    {proposal?.maxPayout
                      ? `$${proposal.maxPayout.toFixed(2)}`
                      : `$${stake.toFixed(2)}`}
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TOAST MESSAGES */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold flex items-center space-x-2 border border-slate-800"
          >
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
