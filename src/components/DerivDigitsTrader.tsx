import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  RefreshCw,
  Key,
  LogOut,
  ShieldCheck,
  Coins,
  Hash,
  Sliders,
  X,
  BarChart3,
  Clock,
  Zap,
} from "lucide-react";
import { DERIV_PUBLIC_WS_URL } from "../config/derivConfig";
import { closeWebSocketGracefully } from "../utils/closeWebSocketGracefully";
import {
  fetchOptionsAccounts,
  requestAccountOtpUrl,
} from "../utils/derivOptionsApi";
import { SMCPanel } from "./SMCPanel";
import { ScanRow, ScanVerdict, runLiveMarketScan } from "../utils/derivMarketScanner";

// ---------------------------------------------------------------------------
// Digits trading on Deriv — the six DIGIT* contract types:
//   DIGITMATCH / DIGITDIFF  (last digit matches / differs from a chosen digit)
//   DIGITOVER  / DIGITUNDER (last digit is over / under a chosen digit)
//   DIGITEVEN  / DIGITODD   (last digit is even / odd — no barrier)
// The "last digit" is the final decimal of the quote at the symbol's pip size.
// ---------------------------------------------------------------------------

interface DerivAsset {
  name: string;
  symbol: string;
  category: "Volatility Indices" | "Daily Reset Indices";
}

// Deriv synthetic indices that support the DIGIT* contract family.
const SUPPORTED_ASSETS: DerivAsset[] = [
  { symbol: "R_10", name: "Volatility 10 Index", category: "Volatility Indices" },
  { symbol: "R_25", name: "Volatility 25 Index", category: "Volatility Indices" },
  { symbol: "R_50", name: "Volatility 50 Index", category: "Volatility Indices" },
  { symbol: "R_75", name: "Volatility 75 Index", category: "Volatility Indices" },
  { symbol: "R_100", name: "Volatility 100 Index", category: "Volatility Indices" },
  { symbol: "1HZ10V", name: "Volatility 10 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ25V", name: "Volatility 25 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ50V", name: "Volatility 50 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ75V", name: "Volatility 75 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ100V", name: "Volatility 100 (1s) Index", category: "Volatility Indices" },
];

// Authoritative pip-size map per symbol (number of decimal places).
const ASSET_PIP_SIZES: Record<string, number> = {
  "1HZ10V": 2,
  "1HZ25V": 2,
  "1HZ50V": 2,
  "1HZ75V": 2,
  "1HZ100V": 2,
  R_10: 3,
  R_25: 3,
  R_50: 4,
  R_75: 2,
  R_100: 2,
};

type ContractMode =
  | "DIGITMATCH"
  | "DIGITDIFF"
  | "DIGITOVER"
  | "DIGITUNDER"
  | "DIGITEVEN"
  | "DIGITODD";

type TradeType = "matches-differs" | "over-under" | "even-odd";

interface DerivTick {
  ask: number;
  bid: number;
  epoch: number;
  id: string;
  pip_size: number;
  quote: number;
  symbol: string;
}

interface DigitStats {
  counts: number[]; // occurrences of each digit 0-9
  percentages: number[]; // 0-100 per digit
  totalTicks: number;
}

interface DigitContract {
  contractId: number;
  symbol: string;
  contractMode: ContractMode;
  digit: number;
  stake: number;
  entryDigit: number;
  entrySpot: number;
  currentDigit: number | null;
  profit: number;
  profitPct: number;
  status: string;
  is_valid_to_sell: number;
  is_sold: number;
  is_expired: number;
  payout: string;
  buyPrice: string;
  bidPrice: string;
  entryTime: number;
  durationTicks: number;
  ticksElapsed: number;
}

interface ClosedDigitContract {
  id: number;
  symbol: string;
  contractMode: ContractMode;
  digit: number;
  stake: number;
  entryDigit: number;
  exitDigit: number;
  profit: number;
  status: string;
  payout: number;
  entryTime: number;
}

// ---------------------------------------------------------------------------
// Digit math helpers (mirrors digits-no-chart-app/lib/digit-stats.ts)
// ---------------------------------------------------------------------------

function getLastDigit(price: number, pipSize: number): number {
  const priceStr = price.toFixed(pipSize);
  const lastChar = priceStr[priceStr.length - 1];
  return parseInt(lastChar, 10);
}

function computeDigitStats(prices: number[], pipSize: number): DigitStats {
  const counts = new Array(10).fill(0);
  for (const price of prices) {
    const digit = getLastDigit(price, pipSize);
    if (digit >= 0 && digit <= 9) counts[digit]++;
  }
  const totalTicks = prices.length;
  const percentages = counts.map((c) => (totalTicks > 0 ? (c / totalTicks) * 100 : 0));
  return { counts, percentages, totalTicks };
}

function formatFullTickQuote(quote: number, tick: DerivTick | null, symbol?: string): string {
  const pip = tick?.pip_size ?? ASSET_PIP_SIZES[symbol ?? ""] ?? 2;
  return quote.toFixed(pip);
}

// Trade-type → contract mode options, matching the reference Digits template.
const CONTRACT_MODE_OPTIONS: Record<TradeType, ContractMode[]> = {
  "matches-differs": ["DIGITMATCH", "DIGITDIFF"],
  "over-under": ["DIGITOVER", "DIGITUNDER"],
  "even-odd": ["DIGITEVEN", "DIGITODD"],
};

const CONTRACT_MODE_LABELS: Record<ContractMode, string> = {
  DIGITMATCH: "Matches",
  DIGITDIFF: "Differs",
  DIGITOVER: "Over",
  DIGITUNDER: "Under",
  DIGITEVEN: "Even",
  DIGITODD: "Odd",
};

function needsBarrier(contractMode: ContractMode): boolean {
  return contractMode !== "DIGITEVEN" && contractMode !== "DIGITODD";
}

// Matches/Differs/Over/Under/Even/Odd are all tick-based on Deriv; the digit
// is compared at the exit tick after the chosen number of ticks.
function needsDuration(contractMode: ContractMode): boolean {
  return (
    contractMode === "DIGITMATCH" ||
    contractMode === "DIGITDIFF" ||
    contractMode === "DIGITOVER" ||
    contractMode === "DIGITUNDER"
  );
}

function predictionText(contractMode: ContractMode): string {
  switch (contractMode) {
    case "DIGITMATCH":
      return "match";
    case "DIGITDIFF":
      return "differ from";
    case "DIGITOVER":
      return "be over";
    case "DIGITUNDER":
      return "be under";
    case "DIGITEVEN":
      return "be even";
    case "DIGITODD":
      return "be odd";
  }
}

interface Toast {
  id: string;
  message: string;
}
export function DerivDigitsTrader() {
  // --- Account / auth state (mirrors the Rise & Fall / Accumulator traders) ---
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
  const accountTypeRef = useRef<"demo" | "real">(activeAccountType);
  useEffect(() => {
    accountTypeRef.current = activeAccountType;
  }, [activeAccountType]);

  const [demoAuthInfo, setDemoAuthInfo] = useState<any | null>(() => {
    const saved = localStorage.getItem("deriv_demo_auth_info");
    return saved ? JSON.parse(saved) : null;
  });
  const [realAuthInfo, setRealAuthInfo] = useState<any | null>(() => {
    const saved = localStorage.getItem("deriv_real_auth_info");
    return saved ? JSON.parse(saved) : null;
  });

  const [demoInput, setDemoInput] = useState<string>("");
  const [realInput, setRealInput] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [showTokenSettings, setShowTokenSettings] = useState<boolean>(false);
  const [otpWsUrl, setOtpWsUrl] = useState<string | null>(null);

  // Persist seeded/provided PAT so the trading socket can mint an OTP session.
  useEffect(() => {
    if (demoToken) localStorage.setItem("deriv_demo_token", demoToken);
  }, [demoToken]);
  useEffect(() => {
    if (realToken) localStorage.setItem("deriv_real_token", realToken);
  }, [realToken]);

  const derivToken = activeAccountType === "demo" ? demoToken : realToken;
  const authInfo = activeAccountType === "demo" ? demoAuthInfo : realAuthInfo;

  const [sandboxBalance, setSandboxBalance] = useState<number>(
    () => Number(localStorage.getItem("deriv_sandbox_balance")) || 10000.0,
  );
  useEffect(() => {
    localStorage.setItem("deriv_sandbox_balance", String(sandboxBalance));
  }, [sandboxBalance]);

  const balance = authInfo ? Number(authInfo.balance) : sandboxBalance;
  const currencySymbol = authInfo ? authInfo.currency : "USD";

  // --- Market / trade inputs ---
  const [activeAsset, setActiveAsset] = useState<DerivAsset>(SUPPORTED_ASSETS[0]);
  const activeAssetRef = useRef<DerivAsset>(activeAsset);
  useEffect(() => {
    activeAssetRef.current = activeAsset;
  }, [activeAsset]);

  const [showAssetDropdown, setShowAssetDropdown] = useState<boolean>(false);
  const [lastTick, setLastTick] = useState<DerivTick | null>(null);
  const [tickHistory, setTickHistory] = useState<number[]>([]);
  const [tickTimes, setTickTimes] = useState<number[]>([]);

  const [tradeType, setTradeTypeRaw] = useState<TradeType>("matches-differs");
  const [contractMode, setContractMode] = useState<ContractMode>("DIGITMATCH");
  const [selectedDigit, setSelectedDigit] = useState<number>(5);
  const [stake, setStake] = useState<number>(1.0);
  const [duration, setDuration] = useState<number>(1);

  // --- Connection state ---
  const [wsStatus, setWsStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [isWsAuthorized, setIsWsAuthorized] = useState<boolean>(false);
  const [reconnectTrigger, setReconnectTrigger] = useState<number>(0);
  const [isSMCOpen, setIsSMCOpen] = useState<boolean>(false);
  const [proposalNonce, setProposalNonce] = useState<number>(0);

  // --- Trading state ---
  const [proposal, setProposal] = useState<any | null>(null);
  const [isBuying, setIsBuying] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [openContract, setOpenContract] = useState<DigitContract | null>(null);
  const openContractRef = useRef<DigitContract | null>(null);
  useEffect(() => { openContractRef.current = openContract; }, [openContract]);
  const [closedContracts, setClosedContracts] = useState<ClosedDigitContract[]>([]);

  // --- Toasts ---
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  // --- Market scanner (Over 1 / Under 8) ---
  const [scanRunning, setScanRunning] = useState<boolean>(false);
  const scanRunningRef = useRef<boolean>(false);
  useEffect(() => { scanRunningRef.current = scanRunning; }, [scanRunning]);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; symbol?: string } | null>(null);
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [scanTests, setScanTests] = useState<number>(0);
  const [scanVerdict, setScanVerdict] = useState<ScanVerdict | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [autoTradePending, setAutoTradePending] = useState<boolean>(false);
  const [autoLoop, setAutoLoop] = useState<boolean>(false);
  const autoLoopRef = useRef<boolean>(false);
  const tradeDoneRef = useRef<(() => void) | null>(null);
  useEffect(() => { autoLoopRef.current = autoLoop; }, [autoLoop]);

  // Refs so the stable message router always reads the latest input values.
  const stakeRef = useRef<number>(stake);
  const durationRef = useRef<number>(duration);
  const contractModeRef = useRef<ContractMode>(contractMode);
  const selectedDigitRef = useRef<number>(selectedDigit);
  useEffect(() => {
    stakeRef.current = stake;
    durationRef.current = duration;
    contractModeRef.current = contractMode;
    selectedDigitRef.current = selectedDigit;
  }, [stake, duration, contractMode, selectedDigit]);

  const setTradeType = (type: TradeType) => {
    setTradeTypeRaw(type);
    setContractMode(CONTRACT_MODE_OPTIONS[type][0]);
  };

  const pipSize = lastTick?.pip_size ?? ASSET_PIP_SIZES[activeAsset.symbol] ?? 2;


  // --- OTP mint (fresh per dial, short cache — never re-dial a dropped URL) ---
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
    if (!accounts || accounts.length === 0) throw new Error("no Options accounts");
    const filtered = accounts.filter((acc) => acc.account_type === activeAccountType);
    const account = filtered.length > 0 ? filtered[0] : accounts[0];
    const url = await requestAccountOtpUrl(account.account_id, token);
    if (!url) throw new Error("Deriv did not return an OTP WebSocket URL");
    otpMintCacheRef.current = { key: cacheKey, url, at: Date.now() };
    return url;
  };

  // Mint the OTP session whenever a token / account type is present.
  useEffect(() => {
    let cancelled = false;
    const mint = async () => {
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
        if (cancelled) return;
        if (url) setOtpWsUrl(url);
      } catch (err: any) {
        if (cancelled) return;
        setIsWsAuthorized(false);
        setAuthError(
          err?.message ||
            "Live trading unavailable — could not mint an OTP session. Market data is live; trades run in Sandbox mode.",
        );
      } finally {
        if (!cancelled) setIsAuthenticating(false);
      }
    };
    mint();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivToken, activeAccountType]);

  const handleSaveDemoToken = () => {
    const t = demoInput.trim();
    setDemoToken(t);
    setDemoInput("");
    if (t) localStorage.setItem("deriv_demo_token", t);
    else localStorage.removeItem("deriv_demo_token");
    setDemoAuthInfo(null);
    setActiveAccountType("demo");
    localStorage.setItem("deriv_active_account_type", "demo");
    setReconnectTrigger((p) => p + 1);
  };
  const handleSaveRealToken = () => {
    const t = realInput.trim();
    setRealToken(t);
    setRealInput("");
    if (t) localStorage.setItem("deriv_real_token", t);
    else localStorage.removeItem("deriv_real_token");
    setRealAuthInfo(null);
    setActiveAccountType("real");
    localStorage.setItem("deriv_active_account_type", "real");
    setReconnectTrigger((p) => p + 1);
  };
  const handleLogout = () => {
    setDemoToken("");
    setRealToken("");
    setDemoAuthInfo(null);
    setRealAuthInfo(null);
    localStorage.removeItem("deriv_demo_token");
    localStorage.removeItem("deriv_real_token");
    localStorage.removeItem("deriv_demo_auth_info");
    localStorage.removeItem("deriv_real_auth_info");
    setIsWsAuthorized(false);
    setReconnectTrigger((p) => p + 1);
    addToast("Logged out of Deriv account. Switched to Sandbox Mode.");
  };

  // A single live socket ref shared by buy/sell actions (assigned in connectWS).
  const socketRef = useRef<WebSocket | null>(null);

  // --- WebSocket: connect, subscribe to ticks + digit proposal ---
  useEffect(() => {
    const socket = otpWsUrl || DERIV_PUBLIC_WS_URL;

    let ws: WebSocket;
    let pingInterval: ReturnType<typeof setInterval>;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let proposalInterval: ReturnType<typeof setInterval>;
    let isMounted = true;

    const buildProposalPayload = () => {
      const payload: Record<string, unknown> = {
        proposal: 1,
        amount: stakeRef.current,
        basis: "stake",
        contract_type: contractModeRef.current,
        currency: "USD",
        duration: durationRef.current,
        duration_unit: "t",
        underlying_symbol: activeAssetRef.current.symbol,
        subscribe: 1,
      };
      // MATCH/DIFF/OVER/UNDER need a barrier digit; EVEN/ODD have none.
      if (contractModeRef.current !== "DIGITEVEN" && contractModeRef.current !== "DIGITODD") {
        payload.barrier = String(selectedDigitRef.current);
      }
      return payload;
    };

    const handleMessage = (data: any) => {
      // A. Authorize
      if (data.msg_type === "authorize") {
        if (data.error) {
          setIsWsAuthorized(false);
          setAuthError(data.error.message || "Invalid API token. Sandbox Mode.");
        } else if (data.authorize) {
          const auth = data.authorize;
          const scopes = auth.scopes || [];
          if (scopes.length > 0 && !scopes.includes("trade")) {
            setAuthError("Token missing 'trade' scope. Create one on developers.deriv.com with 'trade' & 'trading_information'.");
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
          setDemoAuthInfo((prev: any) => (prev ? { ...prev, balance: balanceVal } : null));
        } else {
          setRealAuthInfo((prev: any) => (prev ? { ...prev, balance: balanceVal } : null));
        }
      }

      // C. Tick history
      if (data.msg_type === "history" && data.history) {
        const prices: number[] = data.history.prices || [];
        const times: number[] = data.history.times || [];
        const respSymbol = data.echo_req?.ticks_history || activeAssetRef.current.symbol;
        if (prices.length > 0 && respSymbol === activeAssetRef.current.symbol) {
          const lastPrice = prices[prices.length - 1];
          const lastEpoch = times[times.length - 1] || Math.floor(Date.now() / 1000);
          const receivedTick: DerivTick = {
            ask: lastPrice,
            bid: lastPrice,
            epoch: lastEpoch,
            id: `hist-${lastEpoch}`,
            pip_size: data.history?.pip_size ?? ASSET_PIP_SIZES[respSymbol] ?? 2,
            quote: lastPrice,
            symbol: respSymbol,
          };
          if (prices.length === 1) {
            setTickHistory((prev) => (prev.length > 0 && prev[prev.length - 1] === lastPrice ? prev : [...prev.slice(-39), lastPrice]));
            setTickTimes((prev) => (prev.length > 0 && prev[prev.length - 1] === lastEpoch ? prev : [...prev.slice(-39), lastEpoch]));
          } else {
            setTickHistory(prices.slice(-40));
            setTickTimes(times.slice(-40));
          }
          setLastTick(receivedTick);
        }
      }

      // D. Live streamed ticks
      if (data.msg_type === "tick" && data.tick) {
        const tickData: DerivTick = data.tick;
        if (tickData.symbol === activeAssetRef.current.symbol) {
          setLastTick(tickData);
          setTickHistory((prev) => (prev.length > 0 && prev[prev.length - 1] === tickData.quote ? prev : [...prev.slice(-39), tickData.quote]));
          setTickTimes((prev) => (prev.length > 0 && prev[prev.length - 1] === tickData.epoch ? prev : [...prev.slice(-39), tickData.epoch]));
        }
      }

      // E. Proposal confirmation (stores latest quote to buy against)
      if (data.msg_type === "proposal" && data.proposal) {
        setProposal(data.proposal);
        // Auto-buy immediately when a scan-triggered proposal arrives — no React-effect delay.
        if (autoTradePending && !isBuying && !openContract) {
          setAutoTradePending(false);
          setIsBuying(true);
          socketRef.current?.send(JSON.stringify({ buy: data.proposal.id, price: data.proposal.ask_price }));
        }
      }

      // F. Buy confirmation → begin live tracking
      if (data.msg_type === "buy" && data.buy) {
        const buy = data.buy;
        setIsBuying(false);
        const entrySpot = Number(buy.buy_price);
        const entryDigit = getLastDigit(
          entrySpot,
          ASSET_PIP_SIZES[buy.underlying_symbol || activeAssetRef.current.symbol] ?? 2,
        );
        setOpenContract({
          contractId: Number(buy.contract_id),
          symbol: buy.underlying_symbol || activeAssetRef.current.symbol,
          contractMode: contractModeRef.current,
          digit: selectedDigitRef.current,
          stake: stakeRef.current,
          entryDigit,
          entrySpot,
          currentDigit: entryDigit,
          profit: 0,
          profitPct: 0,
          status: "open",
          is_valid_to_sell: 0,
          is_sold: 0,
          is_expired: 0,
          payout: buy.payout || "0",
          buyPrice: buy.buy_price || "0",
          bidPrice: buy.bid_price || "0",
          entryTime: Math.floor(Date.now() / 1000),
          durationTicks: durationRef.current,
          ticksElapsed: 0,
        });
        // Subscribe to live POC updates so we know when the contract closes.
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({ proposal_open_contract: 1, contract_id: Number(buy.contract_id), subscribe: 1 }),
          );
        }
        addToast(`Digits ${CONTRACT_MODE_LABELS[contractModeRef.current]} contract purchased!`);
      } else if (data.msg_type === "buy" && data.error) {
        setIsBuying(false);
        addToast(`Buy failed: ${data.error.message}`);
        if (tradeDoneRef.current) { tradeDoneRef.current(); tradeDoneRef.current = null; }
      }

      // G. Live contract (POC) updates
      if (data.msg_type === "proposal_open_contract") {
        const poc = data.proposal_open_contract;
        if (!poc) return;
        const isClosed = !!poc.is_sold || !!poc.is_expired || poc.status !== "open";
        setOpenContract((prev) => {
          if (!prev || Number(prev.contractId) !== Number(poc.contract_id)) return prev;
          const currentSpot = Number(poc.current_spot ?? prev.entrySpot);
          const updated: DigitContract = {
            ...prev,
            profit: Number(poc.profit ?? 0),
            profitPct: Number(poc.profit_percentage ?? 0),
            is_valid_to_sell: poc.is_valid_to_sell ?? 0,
            is_sold: poc.is_sold ?? 0,
            is_expired: poc.is_expired ?? 0,
            status: poc.status ?? "open",
            currentDigit: getLastDigit(currentSpot, ASSET_PIP_SIZES[prev.symbol] ?? 2),
            ticksElapsed: poc.tick_count ?? prev.ticksElapsed,
            bidPrice: poc.bid_price ?? prev.bidPrice,
          };
          if (isClosed) {
            if (tradeDoneRef.current) { tradeDoneRef.current(); tradeDoneRef.current = null; }
            setClosedContracts((c) => [
              {
                id: updated.contractId,
                symbol: updated.symbol,
                contractMode: updated.contractMode,
                digit: updated.digit,
                stake: updated.stake,
                entryDigit: updated.entryDigit,
                exitDigit: updated.currentDigit ?? updated.entryDigit,
                profit: updated.profit,
                status: poc.status === "won" ? "won" : "lost",
                payout: Number(poc.payout ?? 0),
                entryTime: updated.entryTime,
              },
              ...c,
            ]);
            addToast(
              updated.profit >= 0
                ? `Digits contract won! +$${updated.profit.toFixed(2)}`
                : `Digits contract lost. $${updated.profit.toFixed(2)}`,
            );
            return null;
          }
          return updated;
        });
      }

      // H. Sell confirmation
      if (data.msg_type === "sell" && data.sell) {
        addToast(`Contract sold for $${Number(data.sell.sold_for).toFixed(2)}`);
      } else if (data.msg_type === "sell" && data.error) {
        addToast(`Sell failed: ${data.error.message}`);
      }
    };

    const connectWS = async () => {
      if (!isMounted) return;
      setWsStatus("connecting");

      if (socketRef.current) {
        try {
          closeWebSocketGracefully(socketRef.current);
        } catch (e) { }
      }

      // Fresh credential per dial (Deriv guidance): while an OTP session is
      // active, re-mint before EVERY (re)connection — a URL minted for an
      // earlier socket must never be re-dialled after a drop.
      let dialUrl = socket;
      if (otpWsUrl) {
        try {
          const fresh = await mintFreshOtp();
          if (fresh) dialUrl = fresh;
        } catch (err) {
          console.warn("[DERIV DIGITS WS] OTP re-mint failed; re-dialing last known URL:", err);
        }
      }
      if (!isMounted) return;

      console.log(`[DERIV DIGITS WS] Connecting to Deriv Endpoint -> URL: ${dialUrl.replace(/otp=[^&]+/, "otp=[REDACTED]")}`);
      ws = new WebSocket(dialUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setWsStatus("connected");
        setIsBuying(false);
        if (!otpWsUrl && derivToken && derivToken.trim() !== "") {
          ws.send(JSON.stringify({ authorize: derivToken }));
        } else if (otpWsUrl) {
          setIsWsAuthorized(true);
          setAuthError(null);
          ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        }
        const primarySym = activeAssetRef.current.symbol;
        ws.send(JSON.stringify({ ticks_history: primarySym, count: 50, end: "latest", style: "ticks" }));
        ws.send(JSON.stringify({ ticks: primarySym, subscribe: 1 }));
        ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        ws.send(JSON.stringify(buildProposalPayload()));

        proposalInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(buildProposalPayload()));
        }, 2000);
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
        clearInterval(proposalInterval);
        // Invalidate the OTP cache so the next dial mints a fresh URL
        // instead of reusing one that just failed.
        otpMintCacheRef.current = null;
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
      clearInterval(proposalInterval);
      clearTimeout(reconnectTimeout);
      otpMintCacheRef.current = null;
      closeWebSocketGracefully(ws as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpWsUrl, reconnectTrigger, proposalNonce]);

  // Proposal requests are sent on-demand (see handleRunScan) and via the
  // 2s proposalInterval; no socket reconnect needed on input changes.


  const handleBuy = () => {
    if (!proposal) return;
    setIsBuying(true);
    socketRef.current?.send(JSON.stringify({ buy: proposal.id, price: proposal.ask_price }));
  };

  const handleClose = () => {
    if (!openContract) return;
    setIsClosing(true);
    // Sell early at the current live bid price (tracked from the POC stream).
    socketRef.current?.send(
      JSON.stringify({ sell: openContract.contractId, price: openContract.bidPrice || 1 }),
    );
  };

  // --- Derived display values ---
  const digitStats = useMemo(
    () => computeDigitStats(tickHistory, pipSize),
    [tickHistory, pipSize],
  );
  const handleRunScan = async () => {
    if (scanRunning) return;
    setScanRunning(true);
    setScanError(null);
    setScanRows([]);
    setScanVerdict(null);
    try {
      const symbols = SUPPORTED_ASSETS.map((a) => a.symbol);
      const pipSizes = SUPPORTED_ASSETS.reduce((acc, a) => {
        acc[a.symbol] = ASSET_PIP_SIZES[a.symbol];
        return acc;
      }, {} as Record<string, number>);
      const res = await runLiveMarketScan({
        symbols,
        tickCount: 5000,
        pipSizes,
        onProgress: (p) =>
          setScanProgress({ current: p.current, total: p.total, symbol: p.symbol }),
      });
      setScanRows(res.rows);
      setScanTests(res.tests);
      setScanVerdict(res.verdict);
      const pick = res.verdict.bestTrade ?? res.verdict.bestPayout;
      if (pick) {
        const asset = SUPPORTED_ASSETS.find((a) => a.symbol === pick.symbol);
        if (asset) {
          activeAssetRef.current = asset;
          setActiveAsset(asset);
        }
        if (pick.contract === "over1") {
          setTradeType("over-under");
          setContractMode("DIGITOVER");
          setSelectedDigit(1);
          contractModeRef.current = "DIGITOVER";
          selectedDigitRef.current = 1;
        } else {
          setTradeType("over-under");
          setContractMode("DIGITUNDER");
          setSelectedDigit(8);
          contractModeRef.current = "DIGITUNDER";
          selectedDigitRef.current = 8;
        }
        // Request a fresh proposal on the existing socket immediately (no reconnect wait).
        const wsNow = socketRef.current;
        if (wsNow && wsNow.readyState === WebSocket.OPEN) {
          const sym = activeAssetRef.current.symbol;
          try { wsNow.send(JSON.stringify({ ticks_history: sym, count: 50, end: "latest", style: "ticks" })); } catch {}
          try { wsNow.send(JSON.stringify({ ticks: sym, subscribe: 1 })); } catch {}
          const payload: Record<string, unknown> = {
            proposal: 1,
            amount: stakeRef.current,
            basis: "stake",
            contract_type: contractModeRef.current,
            currency: "USD",
            duration: durationRef.current,
            duration_unit: "t",
            underlying_symbol: sym,
            subscribe: 1,
          };
          if (contractModeRef.current !== "DIGITEVEN" && contractModeRef.current !== "DIGITODD") {
            payload.barrier = String(selectedDigitRef.current);
          }
          try { wsNow.send(JSON.stringify(payload)); } catch {}
        }
        if (!openContractRef.current) {
          setProposal(null);
          setAutoTradePending(true);
          addToast(`Scan done. Auto-trading ${pick.symbol} ${pick.contract} (best pick).`);
          if (autoLoopRef.current) {
            await Promise.race([
              new Promise<void>((resolve) => { tradeDoneRef.current = resolve; }),
              new Promise<void>((resolve) => setTimeout(resolve, 120000)),
            ]);
            tradeDoneRef.current = null;
          }
        } else {
          addToast(`Scan done. ${pick.symbol} ${pick.contract} is the best pick (trade in progress, not auto-buying).`);
          if (autoLoopRef.current && tradeDoneRef.current) { tradeDoneRef.current(); tradeDoneRef.current = null; }
        }
      } else {
        addToast("Scan done. No market to trade.");
        if (autoLoopRef.current && tradeDoneRef.current) { tradeDoneRef.current(); tradeDoneRef.current = null; }
      }
    } catch (e: any) {
      setScanError(e?.message ?? "Scan failed");
    } finally {
      setScanRunning(false);
      setScanProgress(null);
    }
  };

  const handleApplyScanPick = (row?: ScanRow) => {
    const pick = row ?? scanVerdict?.bestTrade ?? scanVerdict?.bestPayout;
    if (!pick) return;
    const asset = SUPPORTED_ASSETS.find((a) => a.symbol === pick.symbol);
    if (asset) setActiveAsset(asset);
    if (pick.contract === "over1") {
      setTradeType("over-under");
      setContractMode("DIGITOVER");
      setSelectedDigit(1);
    } else {
      setTradeType("over-under");
      setContractMode("DIGITUNDER");
      setSelectedDigit(8);
    }
  };

  // Automatic loop: scan -> pick best market -> trade -> wait for close -> repeat.
  useEffect(() => {
    if (!autoLoop) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      while (autoLoopRef.current && !cancelled) {
        if (openContractRef.current) { await sleep(1000); continue; }
        if (scanRunningRef.current) { await sleep(500); continue; }
        try { await handleRunScan(); } catch (e) { console.error(e); }
        await sleep(500);
      }
    })();
    return () => { cancelled = true; };
  }, [autoLoop]);

  const currentSpot = lastTick?.quote ?? 0;
  const lastDigit = lastTick ? getLastDigit(lastTick.quote, pipSize) : null;

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 select-none overflow-hidden font-sans">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-2xs shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-[#7c3aed] flex items-center justify-center text-white shadow-sm">
            <Hash className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-black text-slate-900 tracking-tight uppercase">
                Deriv Digits Trading App
              </h1>
              <span className="bg-purple-100 text-purple-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                DIGIT Contract
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold text-left">
              Trade the last decimal digit — matches, differs, over, under, even or odd.
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

      {showTokenSettings && (
        <div className="bg-purple-50 border-b border-purple-200 px-4 py-3 shrink-0">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-900">
                Deriv API Token
              </span>
              <div className="flex bg-white border border-purple-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setActiveAccountType("demo")}
                  className={`px-3 py-1 text-[10px] font-black uppercase ${
                    activeAccountType === "demo"
                      ? "bg-purple-600 text-white"
                      : "text-purple-800"
                  }`}
                >
                  Demo
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAccountType("real")}
                  className={`px-3 py-1 text-[10px] font-black uppercase ${
                    activeAccountType === "real"
                      ? "bg-purple-600 text-white"
                      : "text-purple-800"
                  }`}
                >
                  Real
                </button>
              </div>
            </div>
            <p className="text-[10px] text-purple-800 leading-relaxed">
              Paste a token created on developers.deriv.com with the{" "}
              <strong>trade</strong> &amp; <strong>trading_information</strong>{" "}
              scopes. Leave empty to stay in Sandbox (market data still live).
            </p>

            {activeAccountType === "demo" ? (
              <div className="flex items-center space-x-2">
                <input
                  type="password"
                  placeholder="Enter Demo API token..."
                  value={demoInput}
                  onChange={(e) => setDemoInput(e.target.value)}
                  className="flex-1 bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveDemoToken}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition"
                >
                  Connect
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <input
                  type="password"
                  placeholder="Enter Real API token..."
                  value={realInput}
                  onChange={(e) => setRealInput(e.target.value)}
                  className="flex-1 bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveRealToken}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition"
                >
                  Connect
                </button>
              </div>
            )}

            {authError && (
              <div className="text-[10px] text-rose-700 font-bold font-mono bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {authError}
              </div>
            )}

            {derivToken && (
              <div className="pt-2 border-t border-purple-200 flex items-center justify-between">
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
        {/* LEFT PANE */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 lg:overflow-y-auto custom-scrollbar p-4 space-y-4">
          {/* Asset Picker + Spot */}
          <div className="bg-white border border-slate-200 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAssetDropdown(!showAssetDropdown)}
                className="bg-white border border-slate-300 hover:border-slate-400 px-4 py-2 rounded-xl text-xs font-black flex items-center space-x-2 transition cursor-pointer shadow-2xs text-slate-800"
              >
                <Coins className="w-4 h-4 text-[#7c3aed]" />
                <span>
                  {activeAsset.name} ({activeAsset.symbol})
                </span>
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
                            ? "bg-purple-50 text-[#7c3aed] font-black border border-purple-100"
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
                </div>
              )}
            </div>

            {/* Spot + Last Digit */}
            <div className="flex items-center space-x-4 font-mono">
              <div className="text-right">
                <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                  Last Digit
                </span>
                <span className="text-3xl font-black text-[#7c3aed] leading-none">
                  {lastDigit !== null ? lastDigit : "—"}
                </span>
              </div>
              <div className="flex items-center space-x-3">
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
          </div>

          {/* SMC Panel */}
          {isSMCOpen && (
            <SMCPanel
              prices={tickHistory}
              symbol={activeAsset.symbol}
              provider="DERIV"
              currentPrice={lastTick?.quote}
              onApplySetup={(setup) => {
                const d =
                  lastDigit !== null
                    ? `Last digit is ${lastDigit} (${lastDigit % 2 === 0 ? "EVEN" : "ODD"}); ${setup.direction} confluence at ${setup.confidence}%.`
                    : `${setup.direction} confluence at ${setup.confidence}%.`;
                addToast(d);
              }}
            />
          )}

          {/* Digit distribution (0-9 over recent ticks) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                <BarChart3 className="w-4 h-4 text-[#7c3aed]" />
                <span>Digit Distribution</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-bold font-mono">
                {digitStats.totalTicks} ticks
              </span>
            </div>
            <div className="grid grid-cols-10 gap-1.5">
              {Array.from({ length: 10 }).map((_, d) => {
                const pct = digitStats.percentages[d];
                const isLast = lastDigit === d;
                return (
                  <div
                    key={d}
                    className={`flex flex-col items-center justify-end rounded-lg border py-2 ${
                      isLast
                        ? "border-[#7c3aed] bg-purple-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <span
                      className={`text-sm font-black font-mono ${
                        isLast ? "text-[#7c3aed]" : "text-slate-700"
                      }`}
                    >
                      {d}
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold font-mono">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Market scanner (Over 1 / Under 8) */}
          {tradeType === "over-under" && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <BarChart3 className="w-4 h-4 text-[#7c3aed]" />
                  <span>Market Scanner - Over 1 / Under 8</span>
                </h4>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleRunScan}
                    disabled={scanRunning || autoLoop}
                    className="bg-[#7c3aed] hover:bg-[#6d28d9] disabled:bg-slate-200 disabled:text-slate-400 text-white text-[10px] font-black px-3 py-1.5 rounded-xl transition cursor-pointer"
                  >
                    {scanRunning ? "Scanning & will auto-trade..." : "Run Scan & Auto-Trade"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoLoop((v) => !v)}
                    className={`${
                      autoLoop
                        ? "bg-rose-500 hover:bg-rose-600"
                        : "bg-emerald-500 hover:bg-emerald-600"
                    } text-white text-[10px] font-black px-3 py-1.5 rounded-xl transition cursor-pointer`}
                  >
                    {autoLoop ? "Stop Auto" : "Start Auto (loop)"}
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Scans all open synthetic markets (last 5,000 ticks each), pulls the live Over 1 / Under 8 payout, and tests each with a multiple-markets correction. When done it auto-picks the best market (supported edge if any, otherwise the highest-payout market) and places a trade. Use "Start Auto (loop)" to re-scan and re-trade automatically. Every tick is independent - scanning does not create an edge.
              </p>
              {scanProgress && (
                <div className="text-[10px] text-slate-600 font-mono">
                  Scanning {scanProgress.current}/{scanProgress.total}
                  {scanProgress.symbol ? ` - ${scanProgress.symbol}` : ""}
                </div>
              )}
              {scanError && (
                <div className="text-[10px] text-rose-700 font-bold font-mono bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {scanError}
                </div>
              )}
              {scanVerdict && (
                <div
                  className={`text-[10px] font-bold font-mono rounded-lg px-3 py-2 border ${
                    scanVerdict.kind === "trade"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-amber-50 text-amber-900 border-amber-200"
                  }`}
                >
                  {scanVerdict.message}
                </div>
              )}
              {scanRows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[9px] font-mono">
                    <thead>
                      <tr className="text-slate-400 uppercase">
                        <th className="text-left py-1">Market</th>
                        <th className="text-left py-1">Type</th>
                        <th className="text-right py-1">n</th>
                        <th className="text-right py-1">Win%</th>
                        <th className="text-right py-1">95% lo</th>
                        <th className="text-right py-1">Payout</th>
                        <th className="text-right py-1">BreakEv</th>
                        <th className="text-right py-1">EV(fair)</th>
                        <th className="text-right py-1">p_adj</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanRows
                        .slice()
                        .sort((a, b) => (b.ev_fair ?? -9) - (a.ev_fair ?? -9))
                        .map((row) => (
                          <tr
                            key={`${row.symbol}-${row.contract}`}
                            className={row.supported ? "bg-emerald-50" : ""}
                          >
                            <td className="py-1 font-bold">{row.symbol}</td>
                            <td className="py-1">{row.contract}</td>
                            <td className="py-1 text-right">{row.n}</td>
                            <td className="py-1 text-right">{(row.wr * 100).toFixed(1)}</td>
                            <td className="py-1 text-right">{(row.lo * 100).toFixed(1)}</td>
                            <td className="py-1 text-right">
                              {row.r !== null ? `${(row.r * 100).toFixed(1)}%` : "n/a"}
                            </td>
                            <td className="py-1 text-right">
                              {row.be !== null ? `${(row.be * 100).toFixed(1)}%` : "n/a"}
                            </td>
                            <td className="py-1 text-right">
                              {row.ev_fair !== null ? `${(row.ev_fair * 100).toFixed(2)}%` : "n/a"}
                            </td>
                            <td className="py-1 text-right">{row.p_adj.toFixed(3)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              {scanVerdict && (scanVerdict.bestTrade || scanVerdict.bestPayout) && (
                <button
                  type="button"
                  onClick={() => handleApplyScanPick()}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-black py-2 rounded-xl transition cursor-pointer"
                >
                  Use {scanVerdict.bestTrade?.symbol ?? scanVerdict.bestPayout?.symbol}{" "}
                  {scanVerdict.bestTrade?.contract ?? scanVerdict.bestPayout?.contract} as active market
                </button>
              )}
            </div>
          )}

          {/* Recent digit history strip */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">
              Recent Digits
            </span>
            <div className="flex flex-wrap gap-1.5">
              {tickHistory.slice(-24).map((price, idx) => {
                const d = getLastDigit(price, pipSize);
                return (
                  <span
                    key={idx}
                    className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-black font-mono border ${
                      d % 2 === 0
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {d}
                  </span>
                );
              })}
              {tickHistory.length === 0 && (
                <span className="text-xs text-slate-400 font-mono">
                  Waiting for live ticks...
                </span>
              )}
            </div>
          </div>

          {/* Active digit contract */}
          {openContract && (
            <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl text-left space-y-2">
              <h4 className="text-xs font-black text-purple-800 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-purple-600" />
                <span>Active Digit Contract</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold">
                    Prediction
                  </span>
                  <span className="font-black text-slate-900">
                    {CONTRACT_MODE_LABELS[openContract.contractMode]}
                    {needsBarrier(openContract.contractMode)
                      ? ` ${openContract.digit}`
                      : ""}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold">
                    Entry → Current
                  </span>
                  <span className="font-black text-slate-900">
                    {openContract.entryDigit} →{" "}
                    {openContract.currentDigit !== null ? openContract.currentDigit : "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold">
                    Profit
                  </span>
                  <span
                    className={`font-black ${
                      openContract.profit >= 0 ? "text-[#0ecb81]" : "text-[#f6465d]"
                    }`}
                  >
                    ${openContract.profit.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] text-slate-400 uppercase font-bold">
                    Ticks
                  </span>
                  <span className="font-black text-slate-900">
                    {openContract.ticksElapsed} / {openContract.durationTicks}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANE: Trade Controls */}
        <div className="w-full lg:w-80 bg-white p-5 flex flex-col justify-between shrink-0 space-y-4 shadow-md text-left overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            {/* Header */}
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Hash className="w-4 h-4 text-[#7c3aed]" />
                <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider">
                  Digit Parameters
                </h3>
              </div>
              <p className="text-[10px] text-slate-500 pt-1 leading-relaxed">
                Predict whether the last decimal digit will {predictionText(contractMode)}
                {needsBarrier(contractMode) ? " your chosen digit." : "."}
              </p>
            </div>

            {/* Trade Type Selector */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">
                Trade Type
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["matches-differs", "Match / Differ"],
                    ["over-under", "Over / Under"],
                    ["even-odd", "Even / Odd"],
                  ] as [TradeType, string][]
                ).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTradeType(type)}
                    className={`py-2 rounded-xl text-[10px] font-black transition cursor-pointer ${
                      tradeType === type
                        ? "bg-[#7c3aed] text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contract Mode Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">
                Contract Mode
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {CONTRACT_MODE_OPTIONS[tradeType].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setContractMode(mode)}
                    className={`py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                      contractMode === mode
                        ? "bg-[#7c3aed] text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {CONTRACT_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            </div>

            {/* Digit Picker (only for modes that need a barrier) */}
            {needsBarrier(contractMode) && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">
                  Prediction Digit
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 10 }).map((_, d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDigit(d)}
                      className={`py-2 rounded-lg text-xs font-black font-mono transition cursor-pointer ${
                        selectedDigit === d
                          ? "bg-[#7c3aed] text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}


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
                  value={stake}
                  onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-transparent py-2.5 border-none text-slate-800 font-black text-sm font-mono focus:outline-none"
                />
                <span className="px-3 text-[10px] text-slate-400 font-black font-mono">
                  USD
                </span>
              </div>
            </div>

            {/* Duration (only for tick-based digit contracts) */}
            {needsDuration(contractMode) && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 uppercase font-black block tracking-wider">
                  Duration (Ticks)
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDuration(t)}
                      className={`py-2 rounded-xl text-xs font-black font-mono transition cursor-pointer ${
                        duration === t
                          ? "bg-[#7c3aed] text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}


            {/* Proposal / Payout Card */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 text-xs font-mono space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 font-semibold">
                <span>Contract Type</span>
                <span className="text-[#7c3aed] font-black">{contractMode}</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 font-semibold">
                <span>Prediction</span>
                <span className="text-slate-800 font-black">
                  {needsBarrier(contractMode)
                    ? `Digit ${selectedDigit}`
                    : needsDuration(contractMode)
                      ? `${duration} tick${duration > 1 ? "s" : ""}`
                      : "Even / Odd"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 font-semibold border-t border-slate-200 pt-2">
                <span>Est. Payout</span>
                <span className="text-emerald-600 font-black">
                  {proposal
                    ? `$${Number(proposal.payout).toFixed(2)}`
                    : `$${(stake * 1.95).toFixed(2)}`}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                <span>Net Profit</span>
                <span className="text-emerald-500 font-black">
                  {proposal
                    ? `+$${(Number(proposal.payout) - Number(proposal.ask_price)).toFixed(2)}`
                    : `+$${(stake * 0.95).toFixed(2)}`}
                </span>
              </div>
            </div>

            {/* BUY Button */}
            <button
              type="button"
              disabled={!lastTick || wsStatus !== "connected" || isBuying || !proposal}
              onClick={handleBuy}
              className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-3.5 rounded-xl flex items-center justify-center space-x-2 transition duration-200 shadow-md shadow-purple-500/10 cursor-pointer"
            >
              <Zap className="w-5 h-5 fill-white" />
              <span className="uppercase tracking-wider">
                {isBuying ? "Purchasing..." : `Buy ${contractMode}`}
              </span>
            </button>


          {/* Active Open Digit Contract */}
          {openContract && (
            <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl text-left space-y-2">
              <h4 className="text-xs font-black text-purple-800 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-purple-600" />
                <span>Active Digit Contract</span>
              </h4>
              <div className="bg-white p-3 rounded-xl border border-purple-200 flex items-center justify-between text-xs font-mono shadow-2xs">
                <div>
                  <div className="flex items-center space-x-2 font-black">
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-100 text-purple-700">
                      {openContract.contractType}
                    </span>
                    <span className="text-slate-900">{openContract.symbol}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Stake: <strong className="text-slate-800">${openContract.stake.toFixed(2)}</strong>
                    {openContract.ticksRemaining != null && (
                      <span> &middot; {openContract.ticksRemaining} ticks left</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isClosing}
                    className="bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 text-white text-[10px] font-black px-3 py-1.5 rounded-lg transition"
                  >
                    {isClosing ? "Closing..." : "Close"}
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* TOASTS */}
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

