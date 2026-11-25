import React from "react";
import { useBinance } from "../context/BinanceContext";
import { Clock } from "lucide-react";

export const MarketTrades: React.FC = () => {
  const { recentTrades } = useBinance();

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  const formatAmount = (val: number) => {
    if (val >= 100) return val.toFixed(2);
    if (val >= 1) return val.toFixed(4);
    return val.toFixed(6);
  };

  return (
    <div id="market-trades-component" className="flex flex-col h-full bg-[#1e2026] text-xs">
      {/* Panel Header */}
      <div id="trades-header" className="px-3 py-2 border-b border-[#24262b] flex items-center justify-between select-none">
        <span className="font-bold text-[#eaecef]">Market Trades</span>
        <div className="flex items-center text-[10px] text-[#848e9c]">
          <Clock className="w-3 h-3 mr-1" />
          <span>Real-time</span>
        </div>
      </div>

      {/* Table Subheaders */}
      <div id="trades-subheaders" className="grid grid-cols-3 text-[10px] text-[#848e9c] px-3 py-1.5 border-b border-[#24262b]/40 font-medium select-none">
        <span className="text-left">Price (USDT)</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Time</span>
      </div>

      {/* Trades Scrollable List */}
      <div id="trades-list-container" className="flex-1 overflow-y-auto custom-scrollbar select-none">
        {recentTrades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[#848e9c]">
            <span className="animate-pulse">Loading execution feed...</span>
          </div>
        ) : (
          recentTrades.map((trade, idx) => {
            const isSell = trade.isBuyerMaker; // true means taker sell (hits bid), false means taker buy (hits ask)
            const priceColor = isSell ? "text-[#f6465d]" : "text-[#0ecb81]";
            const bgClass = isSell ? "hover:bg-[#f6465d]/5" : "hover:bg-[#0ecb81]/5";

            return (
              <div
                id={`market-trade-row-${trade.id}`}
                key={`trade-${trade.id}-${idx}`}
                className={`grid grid-cols-3 px-3 py-1 items-center font-mono text-[11px] border-b border-[#24262b]/10 transition-colors ${bgClass}`}
              >
                {/* Trade Price */}
                <span className={`text-left font-semibold ${priceColor}`}>
                  {trade.price.toLocaleString(undefined, {
                    minimumFractionDigits: trade.price < 10 ? 4 : 2,
                    maximumFractionDigits: trade.price < 10 ? 4 : 2,
                  })}
                </span>

                {/* Trade Amount */}
                <span className="text-right text-[#eaecef]">{formatAmount(trade.amount)}</span>

                {/* Trade Time */}
                <span className="text-right text-[#848e9c] text-[10px]">{formatTime(trade.time)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
