import React, { useState, useMemo } from "react";
import { useBinance } from "../context/BinanceContext";
import { OrderBookEntry } from "../types";
import { Layers, List, TrendingUp, TrendingDown } from "lucide-react";

export const OrderBook: React.FC = () => {
  const { orderBook, currentPrice } = useBinance();
  const [displayMode, setDisplayMode] = useState<"both" | "bids" | "asks">("both");
  const [groupingStep, setGroupingStep] = useState<number>(0); // Index of decimals options

  // Possible decimal configurations based on active price scale
  const decimalOptions = useMemo(() => {
    if (currentPrice === 0) return [2, 1, 0];
    if (currentPrice < 0.1) return [6, 5, 4];
    if (currentPrice < 10) return [4, 3, 2];
    if (currentPrice < 100) return [3, 2, 1];
    return [2, 1, 0]; // For BTC, ETH etc.
  }, [currentPrice]);

  const decimals = decimalOptions[groupingStep] ?? 2;

  // Aggregate Order Book entries based on chosen decimal precision
  const aggregateList = (list: OrderBookEntry[], isAsk: boolean): OrderBookEntry[] => {
    if (list.length === 0) return [];
    
    const scale = Math.pow(10, decimals);
    const aggregated: Record<string, number> = {};

    list.forEach((item) => {
      // Round price according to selected decimals
      let roundedPrice = Math.round(item.price * scale) / scale;
      
      // For asks, we round UP, for bids we round DOWN to ensure proper book mapping
      if (isAsk) {
        roundedPrice = Math.ceil(item.price * scale) / scale;
      } else {
        roundedPrice = Math.floor(item.price * scale) / scale;
      }

      const key = roundedPrice.toFixed(decimals);
      aggregated[key] = (aggregated[key] || 0) + item.amount;
    });

    let cumTotal = 0;
    const sortedEntries = Object.entries(aggregated)
      .map(([pStr, amount]) => ({
        price: parseFloat(pStr),
        amount,
        total: parseFloat(pStr) * amount,
        cumulativeTotal: 0,
      }));

    // Asks are sorted ascending (lowest ask at bottom), bids descending (highest bid at top)
    if (isAsk) {
      sortedEntries.sort((a, b) => a.price - b.price);
    } else {
      sortedEntries.sort((a, b) => b.price - a.price);
    }

    // Recalculate cumulative totals
    const finalEntries = sortedEntries.map((entry) => {
      cumTotal += entry.amount;
      return {
        ...entry,
        cumulativeTotal: cumTotal,
      };
    });

    return finalEntries;
  };

  const processedAsks = useMemo(() => {
    return aggregateList(orderBook.asks, true);
  }, [orderBook.asks, decimals]);

  const processedBids = useMemo(() => {
    return aggregateList(orderBook.bids, false);
  }, [orderBook.bids, decimals]);

  // Max cumulative size determines the visual width of depth bars
  const maxCumulative = useMemo(() => {
    const askMax = processedAsks.length > 0 ? processedAsks[processedAsks.length - 1].cumulativeTotal : 0;
    const bidMax = processedBids.length > 0 ? processedBids[processedBids.length - 1].cumulativeTotal : 0;
    return Math.max(askMax, bidMax, 1);
  }, [processedAsks, processedBids]);

  // Adjust display amounts depending on layout
  const visibleAsks = useMemo(() => {
    if (displayMode === "asks") {
      return processedAsks.slice(0, 30).reverse(); // Show deeper asks
    }
    if (displayMode === "bids") {
      return [];
    }
    return processedAsks.slice(0, 14).reverse(); // 14 for combined
  }, [processedAsks, displayMode]);

  const visibleBids = useMemo(() => {
    if (displayMode === "bids") {
      return processedBids.slice(0, 30);
    }
    if (displayMode === "asks") {
      return [];
    }
    return processedBids.slice(0, 14);
  }, [processedBids, displayMode]);

  // Format Helper
  const formatPrice = (val: number) => {
    return val.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatAmount = (val: number) => {
    if (val >= 1000) return (val / 1000).toFixed(2) + "k";
    return val.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  };

  return (
    <div id="orderbook-component" className="flex flex-col h-full bg-[#1e2026] text-xs">
      {/* Title & Display Controls */}
      <div id="orderbook-header-controls" className="flex items-center justify-between px-3 py-2 border-b border-[#24262b] select-none">
        <span className="font-bold text-[#eaecef]">Order Book</span>
        
        {/* Layout Selectors */}
        <div className="flex items-center space-x-1">
          <button
            id="orderbook-mode-both"
            onClick={() => setDisplayMode("both")}
            title="Show Bids & Asks"
            className={`p-1.5 rounded transition ${
              displayMode === "both" ? "bg-[#2b2f36] text-[#f0b90b]" : "text-[#848e9c] hover:text-white hover:bg-[#2b2f36]/40"
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            id="orderbook-mode-bids"
            onClick={() => setDisplayMode("bids")}
            title="Bids Only"
            className={`p-1.5 rounded transition ${
              displayMode === "bids" ? "bg-[#2b2f36] text-[#0ecb81]" : "text-[#848e9c] hover:text-[#0ecb81] hover:bg-[#2b2f36]/40"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
          </button>
          <button
            id="orderbook-mode-asks"
            onClick={() => setDisplayMode("asks")}
            title="Asks Only"
            className={`p-1.5 rounded transition ${
              displayMode === "asks" ? "bg-[#2b2f36] text-[#f6465d]" : "text-[#848e9c] hover:text-[#f6465d] hover:bg-[#2b2f36]/40"
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Table Subheaders */}
      <div id="orderbook-subheaders" className="grid grid-cols-3 text-[10px] text-[#848e9c] px-3 py-1.5 border-b border-[#24262b]/40 font-medium">
        <span className="text-left">Price (USDT)</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Total (USDT)</span>
      </div>

      {/* Main Order Lists Canvas */}
      <div id="orderbook-lists-scrollable" className="flex-1 flex flex-col justify-between overflow-y-auto min-h-0 select-none custom-scrollbar">
        {/* 1. ASKS Section (Red) */}
        {visibleAsks.length > 0 && (
          <div id="orderbook-asks-container" className="flex flex-col justify-end flex-1 min-h-0">
            {visibleAsks.map((ask, idx) => {
              const widthPct = Math.min(100, (ask.cumulativeTotal / maxCumulative) * 100);
              return (
                <div
                  id={`orderbook-ask-row-${idx}`}
                  key={`ask-${ask.price}-${idx}`}
                  className="relative grid grid-cols-3 px-3 py-1 items-center hover:bg-[#2b2f36]/30 text-right font-mono transition-colors text-[11px]"
                >
                  {/* Depth Background Bar */}
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-[#f6465d]/8 pointer-events-none transition-all duration-300"
                    style={{ width: `${widthPct}%` }}
                  />
                  {/* Price */}
                  <span className="text-left text-[#f6465d] font-semibold">{formatPrice(ask.price)}</span>
                  {/* Amount */}
                  <span className="text-[#eaecef]">{formatAmount(ask.amount)}</span>
                  {/* Total */}
                  <span className="text-[#848e9c] text-[10px]">
                    {(ask.price * ask.amount).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 2. SPREAD Dashboard Panel */}
        <div id="orderbook-spread-container" className="my-1 py-1.5 px-3 bg-[#16181a] border-y border-[#24262b] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span
              id="orderbook-current-price-display"
              className={`text-sm font-bold font-mono transition-colors duration-300 ${
                processedBids[0] && processedAsks[0]
                  ? currentPrice >= processedBids[0].price
                    ? "text-[#0ecb81]"
                    : "text-[#f6465d]"
                  : "text-[#eaecef]"
              }`}
            >
              {currentPrice > 0 ? (
                currentPrice.toLocaleString(undefined, {
                  minimumFractionDigits: decimals,
                  maximumFractionDigits: decimals,
                })
              ) : (
                <span className="text-gray-500 animate-pulse">Syncing...</span>
              )}
            </span>
          </div>

          <div className="flex flex-col items-end text-[10px] font-mono">
            <span className="text-[#eaecef]">Spread: {orderBook.spread > 0 ? orderBook.spread.toFixed(decimals) : "0.00"}</span>
            <span className="text-[#848e9c] text-[9px]">{orderBook.spreadPercent > 0 ? `${orderBook.spreadPercent.toFixed(3)}%` : "0.00%"}</span>
          </div>
        </div>

        {/* 3. BIDS Section (Green) */}
        {visibleBids.length > 0 && (
          <div id="orderbook-bids-container" className="flex flex-col flex-1 min-h-0">
            {visibleBids.map((bid, idx) => {
              const widthPct = Math.min(100, (bid.cumulativeTotal / maxCumulative) * 100);
              return (
                <div
                  id={`orderbook-bid-row-${idx}`}
                  key={`bid-${bid.price}-${idx}`}
                  className="relative grid grid-cols-3 px-3 py-1 items-center hover:bg-[#2b2f36]/30 text-right font-mono transition-colors text-[11px]"
                >
                  {/* Depth Background Bar */}
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-[#0ecb81]/8 pointer-events-none transition-all duration-300"
                    style={{ width: `${widthPct}%` }}
                  />
                  {/* Price */}
                  <span className="text-left text-[#0ecb81] font-semibold">{formatPrice(bid.price)}</span>
                  {/* Amount */}
                  <span className="text-[#eaecef]">{formatAmount(bid.amount)}</span>
                  {/* Total */}
                  <span className="text-[#848e9c] text-[10px]">
                    {(bid.price * bid.amount).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Aggregate Decimals Grouping Controller */}
      <div id="orderbook-aggregate-selector" className="p-2 border-t border-[#24262b] bg-[#1a1c22] flex items-center justify-between">
        <span className="text-[10px] text-[#848e9c] flex items-center">
          <Layers className="w-3 h-3 mr-1" /> Precision
        </span>
        
        <div className="flex items-center space-x-1">
          {decimalOptions.map((opt, idx) => (
            <button
              id={`precision-opt-${opt}`}
              key={opt}
              onClick={() => setGroupingStep(idx)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition ${
                groupingStep === idx
                  ? "bg-[#2b2f36] text-[#f0b90b]"
                  : "text-[#848e9c] hover:bg-[#2b2f36]/40 hover:text-white"
              }`}
            >
              0.{"0".repeat(Math.max(0, opt - 1))}1
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
