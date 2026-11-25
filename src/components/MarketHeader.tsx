import React from "react";
import { useBinance } from "../context/BinanceContext";
import { SUPPORTED_SYMBOLS_MAP } from "../types";
import { Radio } from "lucide-react";

export const MarketHeader: React.FC = () => {
  const { activeSymbol, tickers, wsConnected } = useBinance();

  const symDetails = SUPPORTED_SYMBOLS_MAP[activeSymbol] || { name: "", base: "BTC", quote: "USDT" };
  const ticker = tickers[activeSymbol];

  const changePercent = ticker?.changePercent ?? 0;
  const isPositive = changePercent >= 0;
  const changeColor = isPositive ? "text-[#0ecb81]" : "text-[#f6465d]";
  const changePrefix = isPositive ? "+" : "";

  return (
    <div
      id="market-header-component"
      className="bg-[#1e2026] px-4 py-3 border-b border-[#24262b] flex flex-col md:flex-row md:items-center justify-between text-xs space-y-3.5 md:space-y-0 select-none"
    >
      {/* 1. Left Section: Coin Identity & Price */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          {/* AppX Logo Icon */}
          <div className="w-7 h-7 bg-[#f0b90b] rounded-md flex items-center justify-center font-bold text-black text-sm shadow shadow-yellow-500/10">
            X
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-1">
              <span className="font-extrabold text-white text-base tracking-wide">{symDetails.base}</span>
              <span className="text-[#848e9c] text-xs font-bold">/ {symDetails.quote}</span>
            </div>
            <span className="text-[#848e9c] text-[10px] leading-none mt-0.5">{symDetails.name}</span>
          </div>
        </div>

        {/* Big Live Price */}
        <div className="flex flex-col pl-4 border-l border-[#24262b]">
          <span
            id="header-price-display"
            className={`text-xl font-bold font-mono tracking-tight leading-none ${changeColor}`}
          >
            {ticker && ticker.price > 0 ? (
              ticker.price.toLocaleString(undefined, {
                minimumFractionDigits: ticker.price < 10 ? 4 : 2,
                maximumFractionDigits: ticker.price < 10 ? 4 : 2,
              })
            ) : (
              <span className="text-gray-500 animate-pulse">Syncing...</span>
            )}
          </span>
          <span className="text-[#848e9c] text-[10px] font-mono mt-1">
            ≈ {ticker && ticker.price > 0 ? ticker.price.toFixed(2) : "0.00"} USD
          </span>
        </div>
      </div>

      {/* 2. Middle Section: 24h Ticker Stats Grid */}
      <div className="flex-1 max-w-xl grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 md:px-6">
        {/* 24h Change */}
        <div className="flex flex-col">
          <span className="text-[#848e9c] text-[10px]">24h Change</span>
          <span id="header-stat-change" className={`font-mono font-bold mt-1 text-[11px] ${changeColor}`}>
            {ticker ? (
              `${changePrefix}${ticker.priceChange.toLocaleString(undefined, {
                maximumFractionDigits: ticker.price < 10 ? 4 : 2,
              })} (${changePrefix}${ticker.changePercent.toFixed(2)}%)`
            ) : (
              <span className="text-gray-600">-</span>
            )}
          </span>
        </div>

        {/* 24h High */}
        <div className="flex flex-col">
          <span className="text-[#848e9c] text-[10px]">24h High</span>
          <span id="header-stat-high" className="font-mono text-white font-medium mt-1 text-[11px]">
            {ticker && ticker.high > 0 ? (
              ticker.high.toLocaleString(undefined, {
                minimumFractionDigits: ticker.price < 10 ? 4 : 2,
                maximumFractionDigits: ticker.price < 10 ? 4 : 2,
              })
            ) : (
              <span className="text-gray-600">-</span>
            )}
          </span>
        </div>

        {/* 24h Low */}
        <div className="flex flex-col">
          <span className="text-[#848e9c] text-[10px]">24h Low</span>
          <span id="header-stat-low" className="font-mono text-white font-medium mt-1 text-[11px]">
            {ticker && ticker.low > 0 ? (
              ticker.low.toLocaleString(undefined, {
                minimumFractionDigits: ticker.price < 10 ? 4 : 2,
                maximumFractionDigits: ticker.price < 10 ? 4 : 2,
              })
            ) : (
              <span className="text-gray-600">-</span>
            )}
          </span>
        </div>

        {/* 24h Volume (Base Coin) */}
        <div className="flex flex-col">
          <span className="text-[#848e9c] text-[10px]">24h Volume({symDetails.base})</span>
          <span id="header-stat-vol-base" className="font-mono text-white font-medium mt-1 text-[11px]">
            {ticker && ticker.volume > 0 ? (
              ticker.volume.toLocaleString(undefined, { maximumFractionDigits: 1 })
            ) : (
              <span className="text-gray-600">-</span>
            )}
          </span>
        </div>

        {/* 24h Volume (USDT) */}
        <div className="flex flex-col">
          <span className="text-[#848e9c] text-[10px]">24h Volume(USDT)</span>
          <span id="header-stat-vol-usdt" className="font-mono text-white font-medium mt-1 text-[11px]">
            {ticker && ticker.quoteVolume > 0 ? (
              ticker.quoteVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })
            ) : (
              <span className="text-gray-600">-</span>
            )}
          </span>
        </div>
      </div>

      {/* 3. Right Section: Connectivity status indicator */}
      <div className="flex items-center space-x-1.5 self-start md:self-auto">
        <div className={`relative flex h-2 w-2`}>
          {wsConnected && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0ecb81] opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              wsConnected ? "bg-[#0ecb81]" : "bg-amber-500 animate-pulse"
            }`}
          ></span>
        </div>
        <span
          id="ws-status-badge"
          className={`font-semibold tracking-wide uppercase text-[9px] ${
            wsConnected ? "text-[#0ecb81]" : "text-amber-500"
          }`}
        >
          {wsConnected ? "WS Online" : "Simulated Feed"}
        </span>
      </div>
    </div>
  );
};
