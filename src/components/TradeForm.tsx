import React, { useState, useEffect } from "react";
import { useBinance } from "../context/BinanceContext";
import { SUPPORTED_SYMBOLS_MAP } from "../types";
import { AlertCircle, CheckCircle2, Wallet } from "lucide-react";

export const TradeForm: React.FC = () => {
  const { activeSymbol, currentPrice, portfolio, placeOrder } = useBinance();

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [type, setType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [priceInput, setPriceInput] = useState<string>("");
  const [amountInput, setAmountInput] = useState<string>("");
  const [percentActive, setPercentActive] = useState<number | null>(null);

  // Notification Banner State
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const symDetails = SUPPORTED_SYMBOLS_MAP[activeSymbol] || { name: "", base: "BTC", quote: "USDT" };
  const baseAsset = symDetails.base;
  const quoteAsset = symDetails.quote;

  // Available Balance depending on trade side
  const availableUSDT = portfolio.balances[quoteAsset]?.free || 0;
  const availableBase = portfolio.balances[baseAsset]?.free || 0;

  // Sync price input on symbol change or initial load for LIMIT orders
  useEffect(() => {
    if (currentPrice > 0) {
      setPriceInput(currentPrice.toString());
    }
  }, [activeSymbol]);

  // Set price input with current price manually
  const useMarketPriceAsLimit = () => {
    if (currentPrice > 0) {
      setPriceInput(currentPrice.toString());
    }
  };

  const handlePercentage = (pct: number) => {
    setPercentActive(pct);
    const execPrice = type === "MARKET" ? currentPrice : parseFloat(priceInput);
    if (!execPrice || execPrice <= 0) return;

    if (side === "BUY") {
      const spendableUSDT = availableUSDT * (pct / 100);
      const amount = spendableUSDT / execPrice;
      // Set to 6 decimals max for base coin
      setAmountInput(amount.toFixed(6));
    } else {
      const sellableBase = availableBase * (pct / 100);
      setAmountInput(sellableBase.toFixed(6));
    }
  };

  const handlePriceChange = (val: string) => {
    setPriceInput(val);
    setPercentActive(null);
  };

  const handleAmountChange = (val: string) => {
    setAmountInput(val);
    setPercentActive(null);
  };

  // Calculate transaction total cost
  const calculatedTotal = React.useMemo(() => {
    const p = type === "MARKET" ? currentPrice : parseFloat(priceInput);
    const a = parseFloat(amountInput);
    if (isNaN(p) || isNaN(a) || p <= 0 || a <= 0) return 0;
    return p * a;
  }, [priceInput, amountInput, type, currentPrice]);

  const handleTradeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(priceInput);
    const a = parseFloat(amountInput);

    if (type === "LIMIT" && (isNaN(p) || p <= 0)) {
      showNotice("error", "Please enter a valid price.");
      return;
    }

    if (isNaN(a) || a <= 0) {
      showNotice("error", "Please enter a valid amount.");
      return;
    }

    const result = placeOrder(side, type, p, a);
    if (result.success) {
      showNotice("success", result.message);
      // Clean inputs
      setAmountInput("");
      setPercentActive(null);
    } else {
      showNotice("error", result.message);
    }
  };

  const showNotice = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  return (
    <div id="trade-form-component" className="bg-[#1e2026] p-4 text-xs h-full flex flex-col border-b border-[#24262b] md:border-b-0">
      {/* Side Selectors (BUY/SELL) */}
      <div id="trade-side-tabs" className="grid grid-cols-2 gap-2 mb-4">
        <button
          id="buy-tab-btn"
          type="button"
          onClick={() => {
            setSide("BUY");
            setPercentActive(null);
          }}
          className={`py-2 rounded font-bold text-center transition-all ${
            side === "BUY"
              ? "bg-[#0ecb81] text-white shadow-lg shadow-[#0ecb81]/15"
              : "bg-[#2b2f36] text-[#848e9c] hover:bg-[#2b2f36]/80 hover:text-white"
          }`}
        >
          Buy
        </button>
        <button
          id="sell-tab-btn"
          type="button"
          onClick={() => {
            setSide("SELL");
            setPercentActive(null);
          }}
          className={`py-2 rounded font-bold text-center transition-all ${
            side === "SELL"
              ? "bg-[#f6465d] text-white shadow-lg shadow-[#f6465d]/15"
              : "bg-[#2b2f36] text-[#848e9c] hover:bg-[#2b2f36]/80 hover:text-white"
          }`}
        >
          Sell
        </button>
      </div>

      {/* Type Selectors (LIMIT/MARKET) */}
      <div id="trade-type-selectors" className="flex items-center space-x-4 mb-4 select-none">
        <button
          id="limit-type-btn"
          type="button"
          onClick={() => setType("LIMIT")}
          className={`pb-1 font-bold border-b-2 transition ${
            type === "LIMIT"
              ? "border-[#f0b90b] text-[#f0b90b]"
              : "border-transparent text-[#848e9c] hover:text-white"
          }`}
        >
          Limit
        </button>
        <button
          id="market-type-btn"
          type="button"
          onClick={() => setType("MARKET")}
          className={`pb-1 font-bold border-b-2 transition ${
            type === "MARKET"
              ? "border-[#f0b90b] text-[#f0b90b]"
              : "border-transparent text-[#848e9c] hover:text-white"
          }`}
        >
          Market
        </button>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          id="trade-notification"
          className={`mb-3 p-2.5 rounded flex items-start space-x-2 animate-fadeIn text-[11px] ${
            notification.type === "success"
              ? "bg-[#0ecb81]/10 text-[#0ecb81] border border-[#0ecb81]/20"
              : "bg-[#f6465d]/10 text-[#f6465d] border border-[#f6465d]/20"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span className="font-medium leading-tight">{notification.message}</span>
        </div>
      )}

      {/* Available Balance Row */}
      <div id="available-balance-row" className="flex items-center justify-between text-[#848e9c] mb-3 select-none">
        <span className="flex items-center text-[10px]">
          <Wallet className="w-3.5 h-3.5 mr-1 text-[#f0b90b]" /> Available:
        </span>
        <span className="font-mono text-[11px] font-bold text-white">
          {side === "BUY" ? (
            `${availableUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
          ) : (
            `${availableBase.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ${baseAsset}`
          )}
        </span>
      </div>

      {/* Form Area */}
      <form id="trade-form" onSubmit={handleTradeSubmit} className="flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-3">
          {/* Price Input Field */}
          <div id="price-input-group" className="flex flex-col space-y-1">
            <label className="text-[10px] text-[#848e9c] font-medium">Price</label>
            <div className="relative flex items-center bg-[#2b2f36] rounded px-3 py-2.5 focus-within:ring-1 focus-within:ring-[#f0b90b] transition">
              {type === "LIMIT" ? (
                <>
                  <input
                    id="limit-price-input"
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={priceInput}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    className="bg-transparent w-full border-none outline-none text-white font-mono text-sm"
                  />
                  <span className="text-[#848e9c] text-xs font-bold font-mono ml-2">USDT</span>
                  <button
                    id="best-price-helper"
                    type="button"
                    onClick={useMarketPriceAsLimit}
                    title="Fill active price"
                    className="absolute right-14 text-[9px] bg-[#1e2026] text-[#f0b90b] hover:bg-[#16181a] px-1 py-0.5 rounded uppercase font-bold"
                  >
                    Best
                  </button>
                </>
              ) : (
                <div className="w-full text-[#848e9c] font-medium py-0.5 select-none text-sm">
                  Market Price (Best execution)
                </div>
              )}
            </div>
          </div>

          {/* Amount Input Field */}
          <div id="amount-input-group" className="flex flex-col space-y-1">
            <label className="text-[10px] text-[#848e9c] font-medium">Amount</label>
            <div className="relative flex items-center bg-[#2b2f36] rounded px-3 py-2.5 focus-within:ring-1 focus-within:ring-[#f0b90b] transition">
              <input
                id="trade-amount-input"
                type="number"
                step="any"
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="bg-transparent w-full border-none outline-none text-white font-mono text-sm"
              />
              <span className="text-[#848e9c] text-xs font-bold font-mono ml-2 uppercase">
                {baseAsset}
              </span>
            </div>
          </div>

          {/* Percentage Presets Grid */}
          <div id="percent-presets-grid" className="grid grid-cols-4 gap-1.5 pt-1">
            {[25, 50, 75, 100].map((pct) => (
              <button
                id={`percentage-btn-${pct}`}
                key={pct}
                type="button"
                onClick={() => handlePercentage(pct)}
                className={`py-1 rounded font-mono font-bold text-center border text-[10px] transition ${
                  percentActive === pct
                    ? "bg-[#2b2f36] border-[#f0b90b] text-[#f0b90b]"
                    : "bg-transparent border-[#24262b] text-[#848e9c] hover:border-[#848e9c] hover:text-white"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Submit Block */}
        <div className="pt-3 space-y-2">
          {/* Estimated Transaction Total Info */}
          <div id="order-cost-total-row" className="flex items-center justify-between text-[#848e9c] text-[11px] px-0.5 py-1 select-none">
            <span>Total Cost (Est.)</span>
            <span className="font-mono font-bold text-white text-xs">
              {calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT
            </span>
          </div>

          <button
            id="order-submit-btn"
            type="submit"
            className={`w-full py-3 rounded-lg font-bold text-sm text-white shadow-lg transition-all active:scale-[0.98] ${
              side === "BUY"
                ? "bg-[#0ecb81] hover:bg-[#0bc17a] shadow-[#0ecb81]/10"
                : "bg-[#f6465d] hover:bg-[#ec3c52] shadow-[#f6465d]/10"
            }`}
          >
            {side === "BUY" ? `Buy ${baseAsset}` : `Sell ${baseAsset}`}
          </button>
        </div>
      </form>
    </div>
  );
};
