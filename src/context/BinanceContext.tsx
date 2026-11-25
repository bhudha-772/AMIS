import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import {
  TickerData,
  KlineData,
  OrderBookState,
  OrderBookEntry,
  MarketTrade,
  UserPortfolio,
  OpenOrder,
  TradeHistoryEntry,
  SUPPORTED_SYMBOLS,
  SUPPORTED_SYMBOLS_MAP,
  AISignal,
  TIMEFRAMES,
} from "../types";
import { TelegramRawSignal, TelegramValidatedSignal } from "../telegramTypes";
import { closeWebSocketGracefully } from "../utils/closeWebSocketGracefully";

interface BinanceContextType {
  activeSymbol: string;
  setActiveSymbol: (symbol: string) => void;
  activeTimeframe: string;
  setActiveTimeframe: (timeframe: string) => void;
  tickers: Record<string, TickerData>;
  klines: KlineData[];
  orderBook: OrderBookState;
  recentTrades: MarketTrade[];
  portfolio: UserPortfolio;
  setPortfolio: React.Dispatch<React.SetStateAction<UserPortfolio>>;
  isLoadingKlines: boolean;
  wsConnected: boolean;
  placeOrder: (
    side: "BUY" | "SELL",
    type: "LIMIT" | "MARKET",
    price: number,
    amount: number
  ) => { success: boolean; message: string };
  cancelOrder: (orderId: string) => void;
  resetPortfolio: () => void;
  currentPrice: number;
  
  // Advanced AI Market Analysis Engine states
  signals: AISignal[];
  setSignals: React.Dispatch<React.SetStateAction<AISignal[]>>;
  activeSignalId: string | null;
  setActiveSignalId: (id: string | null) => void;
  isScanning: boolean;
  setIsScanning: (isScanning: boolean) => void;
  scanStep: string;
  setScanStep: (step: string) => void;
  scanError: string;
  setScanError: (error: string) => void;
  isAutoPilotActive: boolean;
  setIsAutoPilotActive: (active: boolean) => void;
  autoPilotCountdown: number;
  setAutoPilotCountdown: (countdown: number) => void;
  scanAllMarkets: () => Promise<void>;
  autoSwitchOnSignal: boolean;
  setAutoSwitchOnSignal: (switchOn: boolean) => void;
  selectedOverlay: string;
  setSelectedOverlay: (overlay: string) => void;

  // Telegram Signal Listener states
  telegramSignals: TelegramValidatedSignal[];
  setTelegramSignals: React.Dispatch<React.SetStateAction<TelegramValidatedSignal[]>>;
  telegramListenerEnabled: boolean;
  setTelegramListenerEnabled: (enabled: boolean) => void;
  validateTelegramSignal: (rawSignal: TelegramRawSignal) => Promise<TelegramValidatedSignal | null>;
  updateTelegramSignalDecision: (signalId: string, decision: "ACCEPTED" | "REJECTED") => void;
}

const BinanceContext = createContext<BinanceContextType | undefined>(undefined);

const INITIAL_BALANCES = {
  USDT: { asset: "USDT", free: 10000, locked: 0 },
};

const DEFAULT_PORTFOLIO: UserPortfolio = {
  balances: INITIAL_BALANCES,
  openOrders: [],
  tradeHistory: [],
};

const BASELINE_PRICES: Record<string, number> = {
  BTCUSDT: 67250.00,
  ETHUSDT: 3485.50,
  BNBUSDT: 575.20,
  SOLUSDT: 142.80,
  XRPUSDT: 0.4850,
  ADAUSDT: 0.3820,
  DOGEUSDT: 0.1240,
  SHIBUSDT: 0.00001850,
  DOTUSDT: 5.85,
  SUIUSDT: 1.05,
  LINKUSDT: 13.65,
  LTCUSDT: 72.40,
  TRXUSDT: 0.1180,
  NEARUSDT: 4.95,
  AVAXUSDT: 26.80,
  OPUSDT: 1.75,
  APTUSDT: 6.90,
  PEPEUSDT: 0.00001120,
  WIFUSDT: 2.15,
  RENDERUSDT: 7.45,
};

const generateInitialTickers = (): Record<string, TickerData> => {
  const result: Record<string, TickerData> = {};
  Object.entries(BASELINE_PRICES).forEach(([symbol, basePrice]) => {
    const changePercent = (Math.random() * 12) - 6; // -6% to +6%
    const priceChange = basePrice * (changePercent / 100);
    const price = basePrice;
    const high = basePrice * (1 + Math.max(0, changePercent / 100) + Math.random() * 0.02);
    const low = basePrice * (1 + Math.min(0, changePercent / 100) - Math.random() * 0.02);
    const volume = Math.random() * 1000000 + 50000;
    const quoteVolume = volume * price;

    result[symbol] = {
      symbol,
      price,
      changePercent,
      high,
      low,
      volume,
      quoteVolume,
      priceChange,
    };
  });
  return result;
};

// Binance API Base URLs to try (with fallback for CORS/geoblocking)
const BINANCE_REST_ENDPOINTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
];

export const BinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSymbol, setActiveSymbolState] = useState<string>(() => {
    const saved = localStorage.getItem("binance_active_symbol");
    // Validate saved symbol is a real Binance pair
    return saved && SUPPORTED_SYMBOLS.includes(saved) ? saved : "BTCUSDT";
  });
  const [activeTimeframe, setActiveTimeframeState] = useState<string>("15m");
  const [tickers, setTickers] = useState<Record<string, TickerData>>(() => generateInitialTickers());
  const [klines, setKlines] = useState<KlineData[]>([]);
  const [orderBook, setOrderBook] = useState<OrderBookState>({
    bids: [],
    asks: [],
    spread: 0,
    spreadPercent: 0,
  });
  const [recentTrades, setRecentTrades] = useState<MarketTrade[]>([]);
  const [isLoadingKlines, setIsLoadingKlines] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  // Advanced AI Market Analysis Engine states
  const [signals, setSignals] = useState<AISignal[]>(() => {
    const saved = localStorage.getItem("binance_ai_signals");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const seen = new Set();
          return parsed.filter((s: any) => {
            if (!s || !s.id) return false;
            if (seen.has(s.id)) return false;
            seen.add(s.id);
            return true;
          });
        }
      } catch (e) {
        console.log("[Portfolio] Loaded fallback initial state.");
      }
    }
    return [];
  });
  const [activeSignalId, setActiveSignalId] = useState<string | null>(() => {
    return localStorage.getItem("binance_ai_active_signal_id");
  });
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStep, setScanStep] = useState<string>("");
  const [scanError, setScanError] = useState<string>("");
  const [autoSwitchOnSignal, setAutoSwitchOnSignal] = useState<boolean>(true);
  const [selectedOverlay, setSelectedOverlay] = useState<string>("");
  const [isAutoPilotActive, setIsAutoPilotActive] = useState<boolean>(true);
  const [autoPilotCountdown, setAutoPilotCountdown] = useState<number>(120);

  // Telegram Signal Listener states
  const [telegramSignals, setTelegramSignals] = useState<TelegramValidatedSignal[]>(() => {
    const saved = localStorage.getItem("binance_telegram_signals");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { /* fallback */ }
    }
    return [];
  });
  const [telegramListenerEnabled, setTelegramListenerEnabled] = useState<boolean>(false);

  // Paper trading portfolio state with LocalStorage persistence
  const [portfolio, setPortfolio] = useState<UserPortfolio>(() => {
    const saved = localStorage.getItem("binance_paper_portfolio");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.log("[Portfolio] Loaded fallback initial state.");
      }
    }
    return DEFAULT_PORTFOLIO;
  });

  const wsRef = useRef<WebSocket | null>(null);
  const lastPriceRef = useRef<number>(0);

  // Save active symbol (with validation — must be a real Binance pair)
  const setActiveSymbol = (symbol: string) => {
    const validSymbol = SUPPORTED_SYMBOLS.includes(symbol) ? symbol : "BTCUSDT";
    if (validSymbol !== symbol) {
      console.warn(`[BinanceContext] Invalid symbol "${symbol}", using ${validSymbol}`);
    }
    setActiveSymbolState(validSymbol);
    localStorage.setItem("binance_active_symbol", validSymbol);
  };

  // Save active timeframe
  const setActiveTimeframe = (timeframe: string) => {
    setActiveTimeframeState(timeframe);
  };

  // Save portfolio to local storage
  useEffect(() => {
    localStorage.setItem("binance_paper_portfolio", JSON.stringify(portfolio));
  }, [portfolio]);

  const currentPrice = tickers[activeSymbol]?.price || lastPriceRef.current || 0;

  if (currentPrice > 0) {
    lastPriceRef.current = currentPrice;
  }

  // Fetch Historical Klines via REST API (uses server-side CORS proxy)
  const fetchHistoricalKlines = async (symbol: string, interval: string) => {
    setIsLoadingKlines(true);
    let success = false;

    // Validate interval before fetching
    const validInterval = TIMEFRAMES.some(tf => tf.value === interval) ? interval : "15m";

    // Try server-side CORS proxy first (no browser CORS issues)
    try {
      const proxyResp = await fetch(
        `/api/binance/klines?symbol=${symbol}&interval=${validInterval}&limit=120`
      );
      if (proxyResp.ok) {
        const proxyData = await proxyResp.json();
        // Handle format from specific endpoint: {success: true, klines: [...]}
        if (proxyData.success && Array.isArray(proxyData.klines)) {
          setKlines(proxyData.klines);
          setIsLoadingKlines(false);
          return;
        }
        // Handle format from generic proxy: {success: true, data: [[...]]}
        if (proxyData.success && Array.isArray(proxyData.data)) {
          const formattedKlines = proxyData.data.map((d: any) => ({
            time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]),
            low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]),
          }));
          setKlines(formattedKlines);
          setIsLoadingKlines(false);
          return;
        }
      }
    } catch (_) { /* proxy failed, try direct */ }

    // Fallback: try direct Binance endpoints
    for (const apiBase of BINANCE_REST_ENDPOINTS) {
      try {
        const response = await fetch(
          `${apiBase}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=120`
        );
        if (!response.ok) throw new Error("Status " + response.status);
        const data = await response.json();
        
        const formattedKlines: KlineData[] = data.map((d: any) => ({
          time: d[0],
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
          volume: parseFloat(d[5]),
        }));
        
        setKlines(formattedKlines);
        success = true;
        break; // Exit loop on success
      } catch (err) {
        console.warn(`Failed fetching from ${apiBase}:`, err);
      }
    }

    if (!success) {
      console.warn("Could not load klines from real Binance API. Generating mock history.");
      // Fallback: Generate mock history if Binance REST API is blocked
      const mockKlines = generateMockHistory(symbol, interval);
      setKlines(mockKlines);
    }
    setIsLoadingKlines(false);
  };

  // Generate fallback mock history
  const generateMockHistory = (symbol: string, interval: string): KlineData[] => {
    const list: KlineData[] = [];
    const now = Date.now();
    let timeframeMs = 15 * 60 * 1000;
    
    // Convert interval string to ms
    const value = parseInt(interval);
    if (interval.endsWith("m")) timeframeMs = value * 60 * 1000;
    else if (interval.endsWith("h")) timeframeMs = value * 60 * 60 * 1000;
    else if (interval.endsWith("d")) timeframeMs = value * 24 * 60 * 60 * 1000;

    let basePrice = 50000;
    if (symbol.includes("ETH")) basePrice = 3000;
    else if (symbol.includes("BNB")) basePrice = 600;
    else if (symbol.includes("SOL")) basePrice = 150;
    else if (symbol.includes("XRP")) basePrice = 1.2;
    else if (symbol.includes("ADA")) basePrice = 0.5;
    else if (symbol.includes("DOGE")) basePrice = 0.15;
    else if (symbol.includes("SHIB")) basePrice = 0.000025;
    else if (symbol.includes("PEPE")) basePrice = 0.000009;
    else if (symbol.includes("TRX")) basePrice = 0.12;
    else if (symbol.includes("SUI")) basePrice = 1.8;
    else if (symbol.includes("NEAR")) basePrice = 5.5;
    else if (symbol.includes("AVAX")) basePrice = 30;

    let currentPrice = basePrice;
    for (let i = 120; i >= 0; i--) {
      const time = now - i * timeframeMs;
      const volatility = 0.015; // 1.5%
      const change = currentPrice * (Math.random() - 0.495) * volatility;
      const open = currentPrice;
      const close = currentPrice + change;
      const high = Math.max(open, close) + Math.random() * currentPrice * 0.005;
      const low = Math.min(open, close) - Math.random() * currentPrice * 0.005;
      const volume = (Math.random() * 100 + 10) * (basePrice / currentPrice);
      
      list.push({ time, open, high, low, close, volume });
      currentPrice = close;
    }
    return list;
  };

  // Generate mock order book & trades to initialize quickly before ws payload arrives or as fallback
  const initializeMockOrderBookAndTrades = (price: number) => {
    if (price <= 0) return;
    const bidList: OrderBookEntry[] = [];
    const askList: OrderBookEntry[] = [];
    
    let cumBid = 0;
    let cumAsk = 0;
    
    for (let i = 1; i <= 15; i++) {
      const spreadOffset = price * 0.0002 * i;
      
      const bidPrice = price - (price * 0.0001) - spreadOffset;
      const bidAmount = Math.random() * (5000 / price) + 0.1;
      cumBid += bidAmount;
      bidList.push({
        price: Number(bidPrice.toFixed(4)),
        amount: bidAmount,
        total: bidPrice * bidAmount,
        cumulativeTotal: cumBid,
      });

      const askPrice = price + (price * 0.0001) + spreadOffset;
      const askAmount = Math.random() * (5000 / price) + 0.1;
      cumAsk += askAmount;
      askList.push({
        price: Number(askPrice.toFixed(4)),
        amount: askAmount,
        total: askPrice * askAmount,
        cumulativeTotal: cumAsk,
      });
    }

    const spread = askList[0].price - bidList[0].price;
    const spreadPercent = (spread / askList[0].price) * 100;

    setOrderBook({
      bids: bidList,
      asks: askList,
      spread,
      spreadPercent,
    });

    // Populate initial market trades
    const trades: MarketTrade[] = [];
    for (let i = 0; i < 20; i++) {
      const isSell = Math.random() > 0.5;
      const tradePrice = price + (Math.random() - 0.5) * price * 0.001;
      trades.push({
        id: Math.random().toString(36).substring(2, 9),
        time: Date.now() - i * 3000,
        price: Number(tradePrice.toFixed(4)),
        amount: Math.random() * (1000 / price) + 0.01,
        isBuyerMaker: isSell,
      });
    }
    setRecentTrades(trades);
  };

  // Monitor and fill Limit Orders based on current price changes
  useEffect(() => {
    if (currentPrice <= 0 || portfolio.openOrders.length === 0) return;

    setPortfolio((prev) => {
      let changed = false;
      const remainingOrders: OpenOrder[] = [];
      const filledOrders: TradeHistoryEntry[] = [];
      const updatedBalances = { ...prev.balances };

      prev.openOrders.forEach((order) => {
        const { side, price: targetPrice, amount, symbol, id } = order;
        const symInfo = SUPPORTED_SYMBOLS_MAP[symbol];
        if (!symInfo) return;

        let shouldFill = false;
        if (side === "BUY" && currentPrice <= targetPrice) {
          shouldFill = true;
        } else if (side === "SELL" && currentPrice >= targetPrice) {
          shouldFill = true;
        }

        if (shouldFill) {
          changed = true;
          
          // Complete fill
          const baseAsset = symInfo.base;
          const quoteAsset = symInfo.quote;
          const totalCost = targetPrice * amount;

          if (side === "BUY") {
            // Deduct quote locked, add base asset
            const baseBal = updatedBalances[baseAsset] || { asset: baseAsset, free: 0, locked: 0 };
            const quoteBal = updatedBalances[quoteAsset] || { asset: quoteAsset, free: 0, locked: 0 };

            updatedBalances[quoteAsset] = {
              ...quoteBal,
              locked: Math.max(0, quoteBal.locked - totalCost),
            };
            updatedBalances[baseAsset] = {
              ...baseBal,
              free: baseBal.free + amount,
            };
          } else {
            // Deduct base locked, add quote asset
            const baseBal = updatedBalances[baseAsset] || { asset: baseAsset, free: 0, locked: 0 };
            const quoteBal = updatedBalances[quoteAsset] || { asset: quoteAsset, free: 0, locked: 0 };

            updatedBalances[baseAsset] = {
              ...baseBal,
              locked: Math.max(0, baseBal.locked - amount),
            };
            updatedBalances[quoteAsset] = {
              ...quoteBal,
              free: quoteBal.free + totalCost,
            };
          }

          filledOrders.push({
            id,
            symbol,
            side,
            type: "LIMIT",
            price: targetPrice,
            amount,
            timestamp: Date.now(),
          });
        } else {
          remainingOrders.push(order);
        }
      });

      if (!changed) return prev;

      return {
        ...prev,
        balances: updatedBalances,
        openOrders: remainingOrders,
        tradeHistory: [...filledOrders, ...prev.tradeHistory],
      };
    });
  }, [currentPrice, portfolio.openOrders]);

  // Main WebSocket Connection Manager
  useEffect(() => {
    // 1. Fetch history immediately on change
    fetchHistoricalKlines(activeSymbol, activeTimeframe);

    // 2. Clean up previous connection if any. Gracefully - closing a socket
    //    that is still handshaking logs "WebSocket is closed before the
    //    connection is established" in Chrome.
    closeWebSocketGracefully(wsRef.current);
    wsRef.current = null;

    // Validate activeSymbol is a real Binance pair (not "WAIT" or invalid)
    const validSymbol = SUPPORTED_SYMBOLS.includes(activeSymbol) ? activeSymbol : "BTCUSDT";
    if (validSymbol !== activeSymbol) {
      console.warn(`[BinanceContext] Invalid symbol "${activeSymbol}", falling back to ${validSymbol}`);
    }

    // Validate activeTimeframe is a real Binance timeframe (not "NONE" or invalid)
    const validTimeframe = TIMEFRAMES.some(tf => tf.value === activeTimeframe) ? activeTimeframe : "15m";
    if (validTimeframe !== activeTimeframe) {
      console.warn(`[BinanceContext] Invalid timeframe "${activeTimeframe}", falling back to ${validTimeframe}`);
    }

    const tickerStreams = SUPPORTED_SYMBOLS.map((s) => `${s.toLowerCase()}@ticker`).join("/");
    const activeSymbolLower = validSymbol.toLowerCase();
    
    // Combine 20 tickers stream + active symbol kline + active symbol depth + active symbol trade
    const url = `wss://stream.binance.com:9443/stream?streams=${tickerStreams}/${activeSymbolLower}@kline_${validTimeframe}/${activeSymbolLower}@depth20@100ms/${activeSymbolLower}@trade`;

    console.log("Connecting to Binance WS Combined Stream:", url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      console.log("Binance WebSocket Connected Successfully.");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { stream, data } = payload;
        if (!stream || !data) return;

        // A. Multi-Ticker Stream Updates
        if (stream.endsWith("@ticker")) {
          const sym = data.s; // e.g. BTCUSDT
          const price = parseFloat(data.c);
          const changePercent = parseFloat(data.P);
          const high = parseFloat(data.h);
          const low = parseFloat(data.l);
          const volume = parseFloat(data.v);
          const quoteVolume = parseFloat(data.q);
          const priceChange = parseFloat(data.p);

          setTickers((prev) => ({
            ...prev,
            [sym]: {
              symbol: sym,
              price,
              changePercent,
              high,
              low,
              volume,
              quoteVolume,
              priceChange,
            },
          }));

          // If this is the active symbol, ensure order book & initial trades populated if not already
          if (sym === activeSymbol && recentTrades.length === 0) {
            initializeMockOrderBookAndTrades(price);
          }
        }

        // B. Active Symbol Kline Stream Updates
        else if (stream.includes("@kline_")) {
          const k = data.k;
          if (!k) return;

          const newCandle: KlineData = {
            time: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
          };

          setKlines((prev) => {
            if (prev.length === 0) return [newCandle];
            const last = prev[prev.length - 1];
            if (last.time === newCandle.time) {
              // Update last candle in-place
              return [...prev.slice(0, -1), newCandle];
            } else {
              // Append new candle, slide window
              return [...prev, newCandle].slice(-150);
            }
          });
        }

        // C. Active Symbol Depth Stream Updates (Order Book)
        else if (stream.includes("@depth20")) {
          const rawBids = data.bids; // Array of [Price, Qty]
          const rawAsks = data.asks;

          let cumBid = 0;
          const bids: OrderBookEntry[] = rawBids.map((b: string[]) => {
            const price = parseFloat(b[0]);
            const amount = parseFloat(b[1]);
            cumBid += amount;
            return {
              price,
              amount,
              total: price * amount,
              cumulativeTotal: cumBid,
            };
          });

          let cumAsk = 0;
          const asks: OrderBookEntry[] = rawAsks.map((a: string[]) => {
            const price = parseFloat(a[0]);
            const amount = parseFloat(a[1]);
            cumAsk += amount;
            return {
              price,
              amount,
              total: price * amount,
              cumulativeTotal: cumAsk,
            };
          });

          const spread = asks.length > 0 && bids.length > 0 ? asks[0].price - bids[0].price : 0;
          const spreadPercent = asks.length > 0 && spread > 0 ? (spread / asks[0].price) * 100 : 0;

          setOrderBook({
            bids,
            asks,
            spread,
            spreadPercent,
          });
        }

        // D. Active Symbol Trade Stream Updates
        else if (stream.includes("@trade")) {
          const newTrade: MarketTrade = {
            id: String(data.t),
            time: data.T,
            price: parseFloat(data.p),
            amount: parseFloat(data.q),
            isBuyerMaker: data.m,
          };

          setRecentTrades((prev) => [newTrade, ...prev].slice(0, 40));
        }
      } catch (err) {
        console.warn("Parsing packet info:", err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.log("Binance WebSocket Stream Closed.");
    };

    ws.onerror = (err) => {
      console.warn("Binance real-time socket offline. Simulated fallback feed active.");
    };

    return () => {
      // Graceful close: the socket is often still CONNECTING here (React
      // StrictMode double-invoke / symbol switch) and closing it mid-handshake
      // is what logged "WebSocket is closed before the connection is established".
      closeWebSocketGracefully(ws);
    };
  }, [activeSymbol, activeTimeframe]);

  // Simulated background updates when WebSocket is not connected
  useEffect(() => {
    if (wsConnected) return;

    // Grace period: on mount the real socket usually opens within a second or
    // two. Without it this fabricated feed started BEFORE `onopen` fired - it
    // logged a scary "fallback active" message on every normal page load and
    // scribbled random prices over the live feed that was about to connect.
    const startedAt = Date.now();
    const FALLBACK_GRACE_MS = 5000;
    let announcedFallback = false;

    const intervalId = setInterval(() => {
      // Real socket already open (wsConnected state can lag a tick) - fake nothing.
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      // Still inside the connect grace window - give the real feed a chance.
      if (Date.now() - startedAt < FALLBACK_GRACE_MS) return;
      if (!announcedFallback) {
        announcedFallback = true;
        console.log("Starting Simulated Fallback Market Feed because WebSocket is disconnected or blocked.");
      }

      // 1. Select a few symbols randomly to update, and ALWAYS update the activeSymbol
      setTickers((prev) => {
        const next = { ...prev };
        
        // Ensure all supported symbols exist in prev, otherwise generate
        SUPPORTED_SYMBOLS.forEach((sym) => {
          if (!next[sym]) {
            const basePrice = BASELINE_PRICES[sym] || 100;
            const changePercent = (Math.random() * 6) - 3;
            next[sym] = {
              symbol: sym,
              price: basePrice,
              changePercent,
              high: basePrice * 1.05,
              low: basePrice * 0.95,
              volume: 100000,
              quoteVolume: 100000 * basePrice,
              priceChange: basePrice * (changePercent / 100),
            };
          }
        });

        // Update active symbol + 5 random other symbols
        const symbolsToUpdate = new Set<string>([activeSymbol]);
        while (symbolsToUpdate.size < 6) {
          const randSym = SUPPORTED_SYMBOLS[Math.floor(Math.random() * SUPPORTED_SYMBOLS.length)];
          symbolsToUpdate.add(randSym);
        }

        symbolsToUpdate.forEach((sym) => {
          const ticker = next[sym];
          if (!ticker) return;

          // Perform a small random walk price fluctuation (e.g., -0.15% to +0.15%)
          const pct = (Math.random() - 0.492) * 0.0012; // slight upward bias
          const oldPrice = ticker.price;
          const isMeme = sym.includes("SHIB") || sym.includes("PEPE");
          const decimals = isMeme ? 8 : 4;
          const newPrice = Number((oldPrice * (1 + pct)).toFixed(decimals));
          
          const priceChange = ticker.priceChange + (newPrice - oldPrice);
          const basePrice = BASELINE_PRICES[sym] || newPrice;
          const changePercent = (priceChange / basePrice) * 100;
          
          next[sym] = {
            ...ticker,
            price: newPrice,
            priceChange,
            changePercent,
            high: Math.max(ticker.high, newPrice),
            low: Math.min(ticker.low, newPrice),
            volume: ticker.volume + Math.random() * 10,
            quoteVolume: ticker.quoteVolume + Math.random() * 10 * newPrice,
          };
        });

        return next;
      });

      // 2. Update activeSymbol's kline (candlestick) state
      setTickers((latestTickers) => {
        const activeTicker = latestTickers[activeSymbol];
        if (!activeTicker) return latestTickers;

        const currentPriceVal = activeTicker.price;

        setKlines((prevKlines) => {
          if (prevKlines.length === 0) {
            // If empty, generate a baseline
            return [{
              time: Date.now(),
              open: currentPriceVal * 0.999,
              high: Math.max(currentPriceVal, currentPriceVal * 1.001),
              low: Math.min(currentPriceVal, currentPriceVal * 0.998),
              close: currentPriceVal,
              volume: Math.random() * 1000,
            }];
          }

          const lastKline = prevKlines[prevKlines.length - 1];
          const now = Date.now();
          
          // Determine interval in ms
          let intervalMs = 15 * 60 * 1000;
          const val = parseInt(activeTimeframe);
          if (activeTimeframe.endsWith("m")) intervalMs = val * 60 * 1000;
          else if (activeTimeframe.endsWith("h")) intervalMs = val * 60 * 60 * 1000;
          else if (activeTimeframe.endsWith("d")) intervalMs = val * 24 * 60 * 60 * 1000;

          // If current time is past last kline's timeframe, create a new candle
          if (now >= lastKline.time + intervalMs) {
            const newCandle: KlineData = {
              time: lastKline.time + intervalMs,
              open: lastKline.close,
              high: Math.max(lastKline.close, currentPriceVal),
              low: Math.min(lastKline.close, currentPriceVal),
              close: currentPriceVal,
              volume: Math.random() * 50 + 5,
            };
            return [...prevKlines, newCandle].slice(-150);
          } else {
            // Update current candle
            const updatedCandle: KlineData = {
              ...lastKline,
              high: Math.max(lastKline.high, currentPriceVal),
              low: Math.min(lastKline.low, currentPriceVal),
              close: currentPriceVal,
              volume: lastKline.volume + Math.random() * 2,
            };
            return [...prevKlines.slice(0, -1), updatedCandle];
          }
        });

        // 3. Update Order Book with bids and asks centered around activeSymbol's price
        setOrderBook((prevBook) => {
          const bidList: OrderBookEntry[] = [];
          const askList: OrderBookEntry[] = [];
          let cumBid = 0;
          let cumAsk = 0;

          const isMeme = activeSymbol.includes("SHIB") || activeSymbol.includes("PEPE");
          const decimals = isMeme ? 8 : 4;

          for (let i = 1; i <= 15; i++) {
            // Spread offsets slightly randomized
            const randFactor = 1 + (Math.random() - 0.5) * 0.1;
            const spreadOffset = currentPriceVal * 0.00015 * i * randFactor;

            const bidPrice = Number((currentPriceVal - (currentPriceVal * 0.00008) - spreadOffset).toFixed(decimals));
            const bidAmount = (Math.random() * (4000 / currentPriceVal) + 0.05) * randFactor;
            cumBid += bidAmount;
            bidList.push({
              price: bidPrice,
              amount: bidAmount,
              total: bidPrice * bidAmount,
              cumulativeTotal: cumBid,
            });

            const askPrice = Number((currentPriceVal + (currentPriceVal * 0.00008) + spreadOffset).toFixed(decimals));
            const askAmount = (Math.random() * (4000 / currentPriceVal) + 0.05) * randFactor;
            cumAsk += askAmount;
            askList.push({
              price: askPrice,
              amount: askAmount,
              total: askPrice * askAmount,
              cumulativeTotal: cumAsk,
            });
          }

          const spread = Math.max(0, askList[0].price - bidList[0].price);
          const spreadPercent = askList[0].price > 0 ? (spread / askList[0].price) * 100 : 0;

          return {
            bids: bidList,
            asks: askList,
            spread,
            spreadPercent,
          };
        });

        // 4. Update Recent Market Trades
        setRecentTrades((prevTrades) => {
          const isSell = Math.random() > 0.5;
          const isMeme = activeSymbol.includes("SHIB") || activeSymbol.includes("PEPE");
          const decimals = isMeme ? 8 : 4;
          const tradePrice = Number((currentPriceVal + (Math.random() - 0.5) * currentPriceVal * 0.0003).toFixed(decimals));
          const newTrade: MarketTrade = {
            id: Math.random().toString(36).substring(2, 9),
            time: Date.now(),
            price: tradePrice,
            amount: Math.random() * (1200 / currentPriceVal) + 0.005,
            isBuyerMaker: isSell,
          };
          return [newTrade, ...prevTrades].slice(0, 40);
        });

        return latestTickers;
      });

    }, 1200);

    return () => clearInterval(intervalId);
  }, [wsConnected, activeSymbol, activeTimeframe]);

  // Place Paper Trading Order
  const placeOrder = (
    side: "BUY" | "SELL",
    type: "LIMIT" | "MARKET",
    price: number,
    amount: number
  ): { success: boolean; message: string } => {
    const ticker = tickers[activeSymbol];
    const execPrice = type === "MARKET" ? (ticker?.price || currentPrice) : price;

    if (!execPrice || execPrice <= 0) {
      return { success: false, message: "Invalid Execution Price. Wait for network data..." };
    }

    if (amount <= 0) {
      return { success: false, message: "Trade amount must be greater than 0" };
    }

    const symInfo = SUPPORTED_SYMBOLS_MAP[activeSymbol];
    if (!symInfo) return { success: false, message: "Unsupported symbol selection" };

    const baseAsset = symInfo.base;   // e.g. BTC
    const quoteAsset = symInfo.quote; // USDT

    const quoteBalance = portfolio.balances[quoteAsset]?.free || 0;
    const baseBalance = portfolio.balances[baseAsset]?.free || 0;

    const totalCost = execPrice * amount;

    if (side === "BUY") {
      if (type === "LIMIT") {
        if (totalCost > quoteBalance) {
          return {
            success: false,
            message: `Insufficient USDT Balance. Required: ${totalCost.toFixed(2)} USDT, Available: ${quoteBalance.toFixed(2)} USDT`,
          };
        }

        // Create Limit Buy order - lock USDT
        const orderId = Math.random().toString(36).substring(2, 9);
        const newOrder: OpenOrder = {
          id: orderId,
          symbol: activeSymbol,
          side: "BUY",
          type: "LIMIT",
          price,
          amount,
          filled: 0,
          timestamp: Date.now(),
        };

        setPortfolio((prev) => {
          const currentQuoteBal = prev.balances[quoteAsset] || { asset: quoteAsset, free: 0, locked: 0 };
          const currentBaseBal = prev.balances[baseAsset] || { asset: baseAsset, free: 0, locked: 0 };
          
          return {
            ...prev,
            balances: {
              ...prev.balances,
              [quoteAsset]: {
                ...currentQuoteBal,
                free: currentQuoteBal.free - totalCost,
                locked: currentQuoteBal.locked + totalCost,
              },
              [baseAsset]: currentBaseBal,
            },
            openOrders: [...prev.openOrders, newOrder],
          };
        });

        return { success: true, message: `Limit Buy Order placed at ${price.toFixed(4)}` };
      } else {
        // Market Buy - executes instantly at current price
        if (totalCost > quoteBalance) {
          return {
            success: false,
            message: `Insufficient USDT Balance. Required: ${totalCost.toFixed(2)} USDT, Available: ${quoteBalance.toFixed(2)} USDT`,
          };
        }

        const orderId = Math.random().toString(36).substring(2, 9);
        const newTrade: TradeHistoryEntry = {
          id: orderId,
          symbol: activeSymbol,
          side: "BUY",
          type: "MARKET",
          price: execPrice,
          amount,
          timestamp: Date.now(),
        };

        setPortfolio((prev) => {
          const currentQuoteBal = prev.balances[quoteAsset] || { asset: quoteAsset, free: 0, locked: 0 };
          const currentBaseBal = prev.balances[baseAsset] || { asset: baseAsset, free: 0, locked: 0 };

          return {
            ...prev,
            balances: {
              ...prev.balances,
              [quoteAsset]: {
                ...currentQuoteBal,
                free: currentQuoteBal.free - totalCost,
              },
              [baseAsset]: {
                ...currentBaseBal,
                free: currentBaseBal.free + amount,
              },
            },
            tradeHistory: [newTrade, ...prev.tradeHistory],
          };
        });

        return { success: true, message: `Market Buy executed at ${execPrice.toFixed(4)} USDT` };
      }
    } else {
      // SELL Side
      if (amount > baseBalance) {
        return {
          success: false,
          message: `Insufficient ${baseAsset} Balance. Required: ${amount.toFixed(6)} ${baseAsset}, Available: ${baseBalance.toFixed(6)} ${baseAsset}`,
        };
      }

      if (type === "LIMIT") {
        // Limit Sell order - lock Crypto
        const orderId = Math.random().toString(36).substring(2, 9);
        const newOrder: OpenOrder = {
          id: orderId,
          symbol: activeSymbol,
          side: "SELL",
          type: "LIMIT",
          price,
          amount,
          filled: 0,
          timestamp: Date.now(),
        };

        setPortfolio((prev) => {
          const currentBaseBal = prev.balances[baseAsset] || { asset: baseAsset, free: 0, locked: 0 };
          const currentQuoteBal = prev.balances[quoteAsset] || { asset: quoteAsset, free: 0, locked: 0 };

          return {
            ...prev,
            balances: {
              ...prev.balances,
              [baseAsset]: {
                ...currentBaseBal,
                free: currentBaseBal.free - amount,
                locked: currentBaseBal.locked + amount,
              },
              [quoteAsset]: currentQuoteBal,
            },
            openOrders: [...prev.openOrders, newOrder],
          };
        });

        return { success: true, message: `Limit Sell Order placed at ${price.toFixed(4)}` };
      } else {
        // Market Sell - executes instantly
        const orderId = Math.random().toString(36).substring(2, 9);
        const newTrade: TradeHistoryEntry = {
          id: orderId,
          symbol: activeSymbol,
          side: "SELL",
          type: "MARKET",
          price: execPrice,
          amount,
          timestamp: Date.now(),
        };

        setPortfolio((prev) => {
          const currentBaseBal = prev.balances[baseAsset] || { asset: baseAsset, free: 0, locked: 0 };
          const currentQuoteBal = prev.balances[quoteAsset] || { asset: quoteAsset, free: 0, locked: 0 };

          return {
            ...prev,
            balances: {
              ...prev.balances,
              [baseAsset]: {
                ...currentBaseBal,
                free: currentBaseBal.free - amount,
              },
              [quoteAsset]: {
                ...currentQuoteBal,
                free: currentQuoteBal.free + totalCost,
              },
            },
            tradeHistory: [newTrade, ...prev.tradeHistory],
          };
        });

        return { success: true, message: `Market Sell executed at ${execPrice.toFixed(4)} USDT` };
      }
    }
  };

  // Cancel Limit Order
  const cancelOrder = (orderId: string) => {
    setPortfolio((prev) => {
      const order = prev.openOrders.find((o) => o.id === orderId);
      if (!order) return prev;

      const symInfo = SUPPORTED_SYMBOLS_MAP[order.symbol];
      if (!symInfo) return prev;

      const baseAsset = symInfo.base;
      const quoteAsset = symInfo.quote;
      const updatedBalances = { ...prev.balances };

      if (order.side === "BUY") {
        const totalCost = order.price * order.amount;
        const quoteBal = updatedBalances[quoteAsset];
        if (quoteBal) {
          updatedBalances[quoteAsset] = {
            ...quoteBal,
            free: quoteBal.free + totalCost,
            locked: Math.max(0, quoteBal.locked - totalCost),
          };
        }
      } else {
        const baseBal = updatedBalances[baseAsset];
        if (baseBal) {
          updatedBalances[baseAsset] = {
            ...baseBal,
            free: baseBal.free + order.amount,
            locked: Math.max(0, baseBal.locked - order.amount),
          };
        }
      }

      return {
        ...prev,
        balances: updatedBalances,
        openOrders: prev.openOrders.filter((o) => o.id !== orderId),
      };
    });
  };

  // Reset Portfolio
  const resetPortfolio = () => {
    setPortfolio(DEFAULT_PORTFOLIO);
    localStorage.removeItem("binance_paper_portfolio");
  };

  // Advanced AI Market Analysis Engine logic
  useEffect(() => {
    localStorage.setItem("binance_ai_signals", JSON.stringify(signals));
  }, [signals]);

  useEffect(() => {
    if (activeSignalId) {
      localStorage.setItem("binance_ai_active_signal_id", activeSignalId);
      const sig = signals.find((s) => s.id === activeSignalId);
      if (sig) {
        setActiveSymbol(sig.recommendedSymbol);
        if (sig.patternDetected && sig.patternDetected !== "none") {
          setSelectedOverlay(sig.patternDetected);
        } else {
          setSelectedOverlay("");
        }
      }
    } else {
      localStorage.removeItem("binance_ai_active_signal_id");
    }
  }, [activeSignalId, signals]);

  // State tracking ref to prevent stale closures and avoid clearing autopilot timer on tick updates
  const latestStateRef = useRef({
    isScanning,
    tickers,
    activeSymbol,
    activeTimeframe,
    klines,
    portfolio,
    isAutoPilotActive,
    autoSwitchOnSignal,
  });

  useEffect(() => {
    latestStateRef.current = {
      isScanning,
      tickers,
      activeSymbol,
      activeTimeframe,
      klines,
      portfolio,
      isAutoPilotActive,
      autoSwitchOnSignal,
    };
  }, [isScanning, tickers, activeSymbol, activeTimeframe, klines, portfolio, isAutoPilotActive, autoSwitchOnSignal]);

  const scanAllMarkets = async () => {
    // Structural lock to prevent overlapping runs or API spamming
    if (latestStateRef.current.isScanning) {
      console.log("Scanner is already running. Operation ignored.");
      return;
    }

    setIsScanning(true);
    setScanError("");
    
    const steps = [
      "Securing connection to Moonshot AI Kimi-K2-Thinking Core...",
      "Scanning order books & volume clusters across all 20 markets...",
      "Comparing relative volatility coefficients & RSI divergence...",
      "Detecting geometric pattern formations (Double Bottoms, Squeezes)...",
      "Synthesizing Chartered Market Technician (CMT) breakout targets...",
      "Finalizing executive entry, stop loss, and direction vector..."
    ];

    let currentStepIdx = 0;
    setScanStep(steps[0]);

    const stepInterval = setInterval(() => {
      currentStepIdx++;
      if (currentStepIdx < steps.length) {
        setScanStep(steps[currentStepIdx]);
      }
    }, 1200);

    try {
      const { 
        tickers: curTickers, 
        activeSymbol: curSymbol, 
        activeTimeframe: curTimeframe, 
        klines: curKlines, 
        portfolio: curPortfolio, 
        autoSwitchOnSignal: curAutoSwitch 
      } = latestStateRef.current;

      const response = await fetch("/api/moonshot/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: curTickers,
          activeSymbol: curSymbol,
          activeTimeframe: curTimeframe,
          activeSymbolKlines: curKlines.slice(-20),
          portfolio: curPortfolio,
        }),
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to scan. Check API key configurations.");
      }

      const signalData = await response.json();
      
      // Validate recommended symbol — must be a real Binance pair, not "WAIT" or "NONE"
      const rawRecSymbol = signalData.recommendedSymbol || "";
      const isValidSymbol = rawRecSymbol && 
        rawRecSymbol !== "WAIT" && 
        rawRecSymbol !== "NONE" && 
        curTickers[rawRecSymbol] != null;
      const validRecSymbol = isValidSymbol ? rawRecSymbol : curSymbol;
      
      const derivedPrice = curTickers[validRecSymbol]?.price || currentPrice;

      const newSignal: AISignal = {
        id: "SIG-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9).toUpperCase(),
        recommendedSymbol: validRecSymbol,
        timeframe: signalData.timeframe || curTimeframe,
        direction: (signalData.direction === "WAIT" || signalData.direction === "NONE" ? "HOLD" : signalData.direction || "HOLD") as any,
        entryPrice: Number(signalData.entryPrice) || derivedPrice,
        takeProfit: Number(signalData.takeProfit) || derivedPrice * 1.02,
        stopLoss: Number(signalData.stopLoss) || derivedPrice * 0.98,
        duration: signalData.duration || "1-3m",
        confidence: Number(signalData.confidence) || 85,
        patternDetected: signalData.patternDetected || "none",
        analysisReasoning: signalData.analysisReasoning || "Analysis complete.",
        indicatorsConfig: signalData.indicatorsConfig,
        trendLines: signalData.trendLines,
        marketScannerReport: signalData.marketScannerReport || "All systems nominal.",
        pairRankings: signalData.pairRankings,
        portfolioAdvice: signalData.portfolioAdvice,
        futuresPrediction: signalData.futuresPrediction,
        timestamp: Date.now(),
        status: "ACTIVE"
      };

      setSignals((prev) => {
        const seen = new Set();
        const next = [newSignal, ...prev].filter((s) => {
          if (!s || !s.id) return false;
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        }).slice(0, 50);
        return next;
      });
      setActiveSignalId(newSignal.id);

      // Programmatic switch & active pattern overlay alignment
      if (curAutoSwitch && newSignal.recommendedSymbol && newSignal.recommendedSymbol !== "WAIT" && newSignal.recommendedSymbol !== "NONE") {
        setActiveSymbol(newSignal.recommendedSymbol);
        if (newSignal.timeframe) {
          setActiveTimeframe(newSignal.timeframe);
        }
        if (newSignal.patternDetected && newSignal.patternDetected !== "none") {
          setSelectedOverlay(newSignal.patternDetected);
        } else {
          setSelectedOverlay("");
        }
      }
    } catch (err: any) {
      clearInterval(stepInterval);
      console.log("[Scanner] Sweep handled via fallback.");
      setScanError(err?.message || "An unexpected error occurred during multi-market scanning.");
    } finally {
      setIsScanning(false);
    }
  };

  // AI Autopilot Continuous Scanning loop (Runs 24/7 in context - perfectly stabilized)
  useEffect(() => {
    if (!isAutoPilotActive) {
      setAutoPilotCountdown(120);
      return;
    }

    const timer = setInterval(() => {
      setAutoPilotCountdown((prev) => {
        if (prev <= 1) {
          const { isScanning: curScanning } = latestStateRef.current;
          if (!curScanning) {
            scanAllMarkets();
          }
          return 120;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoPilotActive]);

  // Trigger immediate AI update on symbol/timeframe switches when autopilot is running (Debounced & Cached)
  useEffect(() => {
    if (!isAutoPilotActive) return;

    // 1. Reuse existing signal in history if we already have one for this symbol & timeframe to avoid API request
    const existing = signals.find(
      (s) => s.recommendedSymbol === activeSymbol && s.timeframe === activeTimeframe
    );
    if (existing) {
      setActiveSignalId(existing.id);
      return;
    }

    // 2. Debounce the scanning so rapid switching doesn't flood/spam the API
    const handler = setTimeout(() => {
      scanAllMarkets();
      setAutoPilotCountdown(120);
    }, 1500);

    return () => clearTimeout(handler);
  }, [activeSymbol, activeTimeframe, isAutoPilotActive]);

  // Persist telegram signals to localStorage
  useEffect(() => {
    localStorage.setItem("binance_telegram_signals", JSON.stringify(telegramSignals));
  }, [telegramSignals]);

  // Telegram signal validation function (uses current tickers)
  const validateTelegramSignal = async (rawSignal: TelegramRawSignal): Promise<TelegramValidatedSignal | null> => {
    try {
      const response = await fetch("/api/telegram/validate-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawSignal, currentTickers: tickers }),
      });
      if (!response.ok) throw new Error("Validation failed");
      const data = await response.json();
      if (data.success && data.validation) {
        const validated: TelegramValidatedSignal = {
          ...rawSignal,
          aiValidated: true,
          aiConfidence: data.validation.aiConfidence || 0,
          aiAnalysis: data.validation.aiAnalysis || "",
          aiRecommendedAction: data.validation.aiRecommendedAction || "REVIEW",
          aiEnhancedEntry: data.validation.aiEnhancedEntry || null,
          aiEnhancedTP: data.validation.aiEnhancedTP || null,
          aiEnhancedSL: data.validation.aiEnhancedSL || null,
          marketPriceAtValidation: data.validation.marketPriceAtValidation || null,
          validationTimestamp: data.validation.validationTimestamp || Date.now(),
          userDecision: "PENDING",
        };
        // Add to telegram signals list
        setTelegramSignals((prev) => [validated, ...prev].slice(0, 50));
        return validated;
      }
      return null;
    } catch (err) {
      console.error("[Telegram] Validation error:", err);
      return null;
    }
  };

  // Update user decision on a telegram signal
  const updateTelegramSignalDecision = (signalId: string, decision: "ACCEPTED" | "REJECTED") => {
    setTelegramSignals((prev) =>
      prev.map((s) => (s.id === signalId ? { ...s, userDecision: decision } : s))
    );
  };

  return (
    <BinanceContext.Provider
      value={{
        activeSymbol,
        setActiveSymbol,
        activeTimeframe,
        setActiveTimeframe,
        tickers,
        klines,
        orderBook,
        recentTrades,
        portfolio,
        setPortfolio,
        isLoadingKlines,
        wsConnected,
        placeOrder,
        cancelOrder,
        resetPortfolio,
        currentPrice,
        
        // AI exports
        signals,
        setSignals,
        activeSignalId,
        setActiveSignalId,
        isScanning,
        setIsScanning,
        scanStep,
        setScanStep,
        scanError,
        setScanError,
        isAutoPilotActive,
        setIsAutoPilotActive,
        autoPilotCountdown,
        setAutoPilotCountdown,
        scanAllMarkets,
        autoSwitchOnSignal,
        setAutoSwitchOnSignal,
        selectedOverlay,
        setSelectedOverlay,

        // Telegram exports
        telegramSignals,
        setTelegramSignals,
        telegramListenerEnabled,
        setTelegramListenerEnabled,
        validateTelegramSignal,
        updateTelegramSignalDecision,
      }}
    >
      {children}
    </BinanceContext.Provider>
  );
};



export const useBinance = () => {
  const context = useContext(BinanceContext);
  if (context === undefined) {
    throw new Error("useBinance must be used within a BinanceProvider");
  }
  return context;
};
