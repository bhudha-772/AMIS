import React, { useState, useEffect, useRef } from "react";
import { useBinance } from "../context/BinanceContext";
import { SUPPORTED_SYMBOLS, SUPPORTED_SYMBOLS_MAP, TickerData } from "../types";
import { Search, ChevronUp, ChevronDown, Flame } from "lucide-react";

export const TickerList: React.FC = () => {
  const { tickers, activeSymbol, setActiveSymbol } = useBinance();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortBy, setSortBy] = useState<"volume" | "price" | "change">("volume");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Track previous prices to determine flash color
  const prevPricesRef = useRef<Record<string, number>>({});
  const [flashes, setFlashes] = useState<Record<string, "up" | "down" | null>>({});

  useEffect(() => {
    const nextFlashes: Record<string, "up" | "down" | null> = {};
    let changed = false;

    SUPPORTED_SYMBOLS.forEach((sym) => {
      const currentPrice = tickers[sym]?.price;
      const prevPrice = prevPricesRef.current[sym];

      if (currentPrice && prevPrice) {
        if (currentPrice > prevPrice) {
          nextFlashes[sym] = "up";
          changed = true;
        } else if (currentPrice < prevPrice) {
          nextFlashes[sym] = "down";
          changed = true;
        }
      }

      if (currentPrice) {
        prevPricesRef.current[sym] = currentPrice;
      }
    });

    if (changed) {
      setFlashes((prev) => ({ ...prev, ...nextFlashes }));
      
      // Clear flash after 400ms
      const timer = setTimeout(() => {
        setFlashes({});
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [tickers]);

  const handleSort = (field: "volume" | "price" | "change") => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDirection("desc");
    }
  };

  // Filter and sort tickers
  const getProcessedTickers = () => {
    const list: TickerData[] = [];

    SUPPORTED_SYMBOLS.forEach((sym) => {
      const ticker = tickers[sym];
      const details = SUPPORTED_SYMBOLS_MAP[sym];
      
      if (ticker) {
        list.push(ticker);
      } else {
        // Fallback placeholder before live WS arrives
        list.push({
          symbol: sym,
          price: 0,
          changePercent: 0,
          high: 0,
          low: 0,
          volume: 0,
          quoteVolume: 0,
          priceChange: 0,
        });
      }
    });

    // Apply Search Filter
    const filtered = list.filter((t) => {
      const details = SUPPORTED_SYMBOLS_MAP[t.symbol];
      const baseSearch = details?.base.toLowerCase() || "";
      const query = searchTerm.toLowerCase();
      return t.symbol.toLowerCase().includes(query) || baseSearch.includes(query);
    });

    // Apply Sorting
    filtered.sort((a, b) => {
      let valA = 0;
      let valB = 0;

      if (sortBy === "volume") {
        valA = a.quoteVolume || 0;
        valB = b.quoteVolume || 0;
      } else if (sortBy === "price") {
        valA = a.price || 0;
        valB = b.price || 0;
      } else if (sortBy === "change") {
        valA = a.changePercent || 0;
        valB = b.changePercent || 0;
      }

      if (valA === valB) return 0;

      if (sortDirection === "asc") {
        return valA > valB ? 1 : -1;
      } else {
        return valA < valB ? 1 : -1;
      }
    });

    return filtered;
  };

  const sortedTickers = getProcessedTickers();

  const renderSortArrow = (field: "volume" | "price" | "change") => {
    if (sortBy !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3 h-3 ml-0.5 inline-block text-[#f0b90b]" />
    ) : (
      <ChevronDown className="w-3 h-3 ml-0.5 inline-block text-[#f0b90b]" />
    );
  };

  return (
    <div id="ticker-list-component" className="flex flex-col h-full bg-[#1e2026] text-xs">
      {/* Search Input Bar */}
      <div id="ticker-search-container" className="p-2 border-b border-[#24262b]">
        <div className="relative flex items-center bg-[#2b2f36] rounded px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-[#f0b90b] transition">
          <Search className="w-3.5 h-3.5 text-[#848e9c] mr-2" />
          <input
            id="market-search-input"
            type="text"
            placeholder="Search Coin / USDT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent w-full border-none outline-none text-white placeholder-[#848e9c] text-xs"
          />
          {searchTerm && (
            <button
              id="clear-search-btn"
              onClick={() => setSearchTerm("")}
              className="text-[#848e9c] hover:text-white text-xs px-1 font-bold"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Sorting Tabs Header */}
      <div id="ticker-sort-headers" className="grid grid-cols-3 gap-1 px-3 py-2 border-b border-[#24262b] text-[#848e9c] font-medium text-[10px] select-none">
        <button
          id="sort-by-pair"
          onClick={() => handleSort("volume")}
          className="text-left hover:text-white transition flex items-center"
        >
          Pair / Vol {renderSortArrow("volume")}
        </button>
        <button
          id="sort-by-price"
          onClick={() => handleSort("price")}
          className="text-right hover:text-white transition flex items-center justify-end"
        >
          Price {renderSortArrow("price")}
        </button>
        <button
          id="sort-by-change"
          onClick={() => handleSort("change")}
          className="text-right hover:text-white transition flex items-center justify-end"
        >
          24h Chg % {renderSortArrow("change")}
        </button>
      </div>

      {/* Real-time Tickers List */}
      <div id="ticker-rows-container" className="flex-1 overflow-y-auto custom-scrollbar">
        {sortedTickers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[#848e9c]">
            <span className="text-sm">No assets found</span>
            <span className="text-[10px] mt-1 text-[#474f59]">Try matching quote or base symbol</span>
          </div>
        ) : (
          sortedTickers.map((t) => {
            const info = SUPPORTED_SYMBOLS_MAP[t.symbol];
            const isActive = t.symbol === activeSymbol;
            const flash = flashes[t.symbol];

            // Setup custom style for tick flashes
            let flashClass = "transition-all duration-300 ";
            if (flash === "up") {
              flashClass += "bg-[#0ecb81]/15 text-[#0ecb81]";
            } else if (flash === "down") {
              flashClass += "bg-[#f6465d]/15 text-[#f6465d]";
            } else {
              flashClass += isActive
                ? "bg-[#2b2f36] text-white"
                : "hover:bg-[#2b2f36]/40 text-[#eaecef]";
            }

            const changeColor =
              t.changePercent > 0
                ? "text-[#0ecb81]"
                : t.changePercent < 0
                ? "text-[#f6465d]"
                : "text-gray-400";

            return (
              <div
                id={`ticker-row-${t.symbol}`}
                key={t.symbol}
                onClick={() => setActiveSymbol(t.symbol)}
                className={`grid grid-cols-3 gap-1 px-3 py-2.5 items-center border-b border-[#24262b]/30 cursor-pointer select-none ${flashClass}`}
              >
                {/* Symbol & 24h Base Volume */}
                <div className="flex flex-col text-left">
                  <div className="flex items-center space-x-1">
                    <span className="font-bold text-white text-[11px]">{info?.base}</span>
                    <span className="text-[#848e9c] text-[9px]">/USDT</span>
                  </div>
                  <span className="text-[#474f59] text-[9px] font-mono mt-0.5">
                    {(t.quoteVolume / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K Vol
                  </span>
                </div>

                {/* Price */}
                <div className="text-right font-mono font-medium text-[11px]">
                  {t.price > 0 ? (
                    t.price.toLocaleString(undefined, {
                      minimumFractionDigits: t.price < 100 ? 4 : 2,
                      maximumFractionDigits: t.price < 100 ? 4 : 2,
                    })
                  ) : (
                    <span className="text-[#474f59]">--</span>
                  )}
                </div>

                {/* 24h Change % */}
                <div className={`text-right font-mono font-semibold text-[11px] ${changeColor}`}>
                  {t.price > 0 ? (
                    `${t.changePercent >= 0 ? "+" : ""}${t.changePercent.toFixed(2)}%`
                  ) : (
                    <span>--</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Markets Footer Stats */}
      <div id="market-footer-panel" className="p-2 border-t border-[#24262b] bg-[#1a1c22] text-[10px] text-[#848e9c] flex items-center justify-between">
        <div className="flex items-center">
          <Flame className="w-3.5 h-3.5 text-orange-500 mr-1.5" />
          <span>Active Streams: <b>20 Pairs</b></span>
        </div>
        <span className="font-mono text-[9px]">Latency: &lt;100ms</span>
      </div>
    </div>
  );
};
