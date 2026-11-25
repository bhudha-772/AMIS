import React, { useState } from "react";
import { useBinance } from "../context/BinanceContext";
import { SUPPORTED_SYMBOLS_MAP, SUPPORTED_SYMBOLS, AssetBalance } from "../types";
import { Trash2, AlertCircle, TrendingUp, TrendingDown, Eye, EyeOff } from "lucide-react";

export const UserPositions: React.FC = () => {
  const { portfolio, tickers, cancelOrder, resetPortfolio } = useBinance();
  const [activeTab, setActiveTab] = useState<"orders" | "assets" | "history">("orders");
  const [hideZero, setHideZero] = useState<boolean>(true);

  // Format Helper
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Calculate live value of a specific asset holding
  const getAssetValuation = (asset: string, totalAmount: number): number => {
    if (asset === "USDT") return totalAmount;
    
    // Find first symbol paired with this asset
    const activePair = SUPPORTED_SYMBOLS.find(
      (sym) => SUPPORTED_SYMBOLS_MAP[sym]?.base === asset
    );

    if (!activePair) return 0;
    const price = tickers[activePair]?.price || 0;
    return totalAmount * price;
  };

  // Calculate overall portfolio total value
  const totalPortfolioValue = React.useMemo(() => {
    let sum = 0;
    Object.values(portfolio.balances).forEach((bal: any) => {
      const b = bal as AssetBalance;
      const total = b.free + b.locked;
      sum += getAssetValuation(b.asset, total);
    });
    return sum;
  }, [portfolio.balances, tickers]);

  const uniqueOpenOrders = React.useMemo(() => {
    const seen = new Set<string>();
    return portfolio.openOrders.filter((ord) => {
      if (!ord || !ord.id || seen.has(ord.id)) return false;
      seen.add(ord.id);
      return true;
    });
  }, [portfolio.openOrders]);

  const uniqueTradeHistory = React.useMemo(() => {
    const seen = new Set<string>();
    return portfolio.tradeHistory.filter((tr) => {
      if (!tr || !tr.id || seen.has(tr.id)) return false;
      seen.add(tr.id);
      return true;
    });
  }, [portfolio.tradeHistory]);

  return (
    <div id="user-positions-component" className="bg-[#1e2026] text-xs h-full flex flex-col select-none">
      {/* Tab Selectors & Controls */}
      <div id="positions-header-tabs" className="flex flex-wrap items-center justify-between border-b border-[#24262b] bg-[#1a1c22]">
        <div className="flex overflow-x-auto scrollbar-none">
          <button
            id="tab-open-orders"
            onClick={() => setActiveTab("orders")}
            className={`px-4 py-3 font-semibold border-b-2 text-[11px] whitespace-nowrap transition ${
              activeTab === "orders"
                ? "border-[#f0b90b] text-[#f0b90b] bg-[#1e2026]"
                : "border-transparent text-[#848e9c] hover:text-white"
            }`}
          >
            Open Orders ({portfolio.openOrders.length})
          </button>
          <button
            id="tab-assets"
            onClick={() => setActiveTab("assets")}
            className={`px-4 py-3 font-semibold border-b-2 text-[11px] whitespace-nowrap transition ${
              activeTab === "assets"
                ? "border-[#f0b90b] text-[#f0b90b] bg-[#1e2026]"
                : "border-transparent text-[#848e9c] hover:text-white"
            }`}
          >
            Assets / Balances
          </button>
          <button
            id="tab-history"
            onClick={() => setActiveTab("history")}
            className={`px-4 py-3 font-semibold border-b-2 text-[11px] whitespace-nowrap transition ${
              activeTab === "history"
                ? "border-[#f0b90b] text-[#f0b90b] bg-[#1e2026]"
                : "border-transparent text-[#848e9c] hover:text-white"
            }`}
          >
            Trade History ({portfolio.tradeHistory.length})
          </button>
        </div>

        {/* Global Controls */}
        <div className="flex items-center space-x-3 px-4 py-2 text-[10px] text-[#848e9c]">
          {activeTab === "assets" && (
            <button
              id="toggle-zero-balances"
              onClick={() => setHideZero((prev) => !prev)}
              className="flex items-center hover:text-white transition cursor-pointer"
            >
              {hideZero ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
              <span>{hideZero ? "Show Zero" : "Hide Zero"}</span>
            </button>
          )}

          <button
            id="reset-trading-portfolio"
            onClick={() => {
              if (window.confirm("Are you sure you want to reset your paper trading balance back to 10,000 USDT?")) {
                resetPortfolio();
              }
            }}
            className="text-red-400 hover:text-red-500 hover:underline transition uppercase font-bold text-[9px]"
          >
            Reset Balance
          </button>
        </div>
      </div>

      {/* Tab Panels Contents */}
      <div id="positions-content-scroller" className="flex-1 overflow-y-auto custom-scrollbar min-h-[140px]">
        {/* 1. OPEN ORDERS PANEL */}
        {activeTab === "orders" && (
          <div id="open-orders-tab" className="min-w-full">
            {portfolio.openOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[#848e9c]">
                <AlertCircle className="w-6 h-6 text-[#474f59] mb-2" />
                <span>No active open orders. Try placing a Limit order above!</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono">
                  <thead>
                    <tr className="text-[10px] text-[#848e9c] border-b border-[#24262b] bg-[#1a1c22]/40 select-none">
                      <th className="px-4 py-2 font-normal">Date</th>
                      <th className="px-4 py-2 font-normal">Symbol</th>
                      <th className="px-4 py-2 font-normal">Type</th>
                      <th className="px-4 py-2 font-normal">Side</th>
                      <th className="px-4 py-2 font-normal text-right">Price (USDT)</th>
                      <th className="px-4 py-2 font-normal text-right">Amount</th>
                      <th className="px-4 py-2 font-normal text-right">Est. Total</th>
                      <th className="px-4 py-2 font-normal text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueOpenOrders.map((ord) => {
                      const symInfo = SUPPORTED_SYMBOLS_MAP[ord.symbol];
                      const sideColor = ord.side === "BUY" ? "text-[#0ecb81]" : "text-[#f6465d]";
                      const total = ord.price * ord.amount;

                      return (
                        <tr
                          id={`open-order-row-${ord.id}`}
                          key={ord.id}
                          className="border-b border-[#24262b]/30 hover:bg-[#2b2f36]/20 transition-colors text-[11px]"
                        >
                          <td className="px-4 py-2.5 text-[#848e9c] text-[10px]">{formatTime(ord.timestamp)}</td>
                          <td className="px-4 py-2.5 font-bold text-[#eaecef]">
                            {symInfo?.base}
                            <span className="text-[#848e9c] text-[9px]">/USDT</span>
                          </td>
                          <td className="px-4 py-2.5 text-[#eaecef]">{ord.type}</td>
                          <td className={`px-4 py-2.5 font-bold ${sideColor}`}>{ord.side}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#eaecef]">
                            {ord.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[#eaecef]">
                            {ord.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                          </td>
                          <td className="px-4 py-2.5 text-right text-white">
                            {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              id={`cancel-order-btn-${ord.id}`}
                              onClick={() => cancelOrder(ord.id)}
                              title="Cancel Order"
                              className="p-1 hover:bg-red-500/10 text-red-400 hover:text-red-500 rounded transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 mx-auto" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 2. BALANCES & PORTFOLIO ASSETS PANEL */}
        {activeTab === "assets" && (
          <div id="assets-tab" className="px-4 py-3">
            {/* Total balance aggregate overview */}
            <div id="portfolio-valuation-overview" className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-[#16181a] p-4 rounded-lg border border-[#24262b] mb-4 space-y-2 sm:space-y-0">
              <div>
                <span className="text-[#848e9c] text-[10px] uppercase tracking-wider font-bold">Estimated Portfolio Valuation</span>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className="text-xl font-bold font-mono text-white">
                    {totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs text-[#f0b90b] font-bold">USDT</span>
                </div>
              </div>
              <div className="text-[10px] text-[#848e9c] leading-relaxed">
                <p>Starting balance: <b>10,000 USDT</b></p>
                <p className="mt-0.5">Valuation updates automatically with incoming ticker WebSocket packets.</p>
              </div>
            </div>

            {/* Asset Table Grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono">
                <thead>
                  <tr className="text-[10px] text-[#848e9c] border-b border-[#24262b] select-none">
                    <th className="px-3 py-1.5 font-normal">Asset</th>
                    <th className="px-3 py-1.5 font-normal text-right">Available Balance</th>
                    <th className="px-3 py-1.5 font-normal text-right">In Orders (Locked)</th>
                    <th className="px-3 py-1.5 font-normal text-right">Total Quantity</th>
                    <th className="px-3 py-1.5 font-normal text-right">Value (USDT)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Generate assets: Always show USDT, then list other symbols in portfolio holding */}
                  {(() => {
                    const assetList = ["USDT"];
                    SUPPORTED_SYMBOLS.forEach((sym) => {
                      const base = SUPPORTED_SYMBOLS_MAP[sym]?.base;
                      if (base && !assetList.includes(base)) assetList.push(base);
                    });

                    return assetList
                      .map((asset) => {
                        const bal = portfolio.balances[asset] || { asset, free: 0, locked: 0 };
                        const total = bal.free + bal.locked;
                        const valuation = getAssetValuation(asset, total);
                        return { asset, free: bal.free, locked: bal.locked, total, valuation };
                      })
                      .filter((item) => {
                        if (!hideZero) return true;
                        // Always show USDT, or assets with balance > 0
                        return item.asset === "USDT" || item.total > 0.000001;
                      })
                      .map((item) => (
                        <tr
                          id={`asset-row-${item.asset}`}
                          key={item.asset}
                          className="border-b border-[#24262b]/30 hover:bg-[#2b2f36]/20 transition-colors text-[11px]"
                        >
                          <td className="px-3 py-2 font-bold text-white flex items-center space-x-1.5">
                            <span className="bg-[#24262b] px-1.5 py-0.5 rounded text-[10px]">
                              {item.asset}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-[#eaecef]">
                            {item.free.toLocaleString(undefined, {
                              minimumFractionDigits: item.asset === "USDT" ? 2 : 4,
                              maximumFractionDigits: item.asset === "USDT" ? 2 : 8,
                            })}
                          </td>
                          <td className="px-3 py-2 text-right text-[#848e9c]">
                            {item.locked > 0 ? (
                              item.locked.toLocaleString(undefined, {
                                minimumFractionDigits: item.asset === "USDT" ? 2 : 4,
                                maximumFractionDigits: item.asset === "USDT" ? 2 : 8,
                              })
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-[#eaecef]">
                            {item.total.toLocaleString(undefined, {
                              minimumFractionDigits: item.asset === "USDT" ? 2 : 4,
                              maximumFractionDigits: item.asset === "USDT" ? 2 : 8,
                            })}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-[#f0b90b]">
                            {item.valuation.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })} USDT
                          </td>
                        </tr>
                      ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. TRADE HISTORY PANEL */}
        {activeTab === "history" && (
          <div id="trade-history-tab" className="min-w-full">
            {portfolio.tradeHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[#848e9c]">
                <AlertCircle className="w-6 h-6 text-[#474f59] mb-2" />
                <span>No trades executed yet. Complete a trade above to see logs!</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono">
                  <thead>
                    <tr className="text-[10px] text-[#848e9c] border-b border-[#24262b] bg-[#1a1c22]/40 select-none">
                      <th className="px-4 py-2 font-normal">Execution Time</th>
                      <th className="px-4 py-2 font-normal">Symbol</th>
                      <th className="px-4 py-2 font-normal">Type</th>
                      <th className="px-4 py-2 font-normal">Side</th>
                      <th className="px-4 py-2 font-normal text-right">Fill Price</th>
                      <th className="px-4 py-2 font-normal text-right">Quantity</th>
                      <th className="px-4 py-2 font-normal text-right">Total Transacted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueTradeHistory.map((tr) => {
                      const symInfo = SUPPORTED_SYMBOLS_MAP[tr.symbol];
                      const sideColor = tr.side === "BUY" ? "text-[#0ecb81]" : "text-[#f6465d]";
                      const total = tr.price * tr.amount;

                      return (
                        <tr
                          id={`trade-history-row-${tr.id}`}
                          key={tr.id}
                          className="border-b border-[#24262b]/30 hover:bg-[#2b2f36]/20 transition-colors text-[11px]"
                        >
                          <td className="px-4 py-2.5 text-[#848e9c] text-[10px]">{formatTime(tr.timestamp)}</td>
                          <td className="px-4 py-2.5 font-bold text-[#eaecef]">
                            {symInfo?.base}
                            <span className="text-[#848e9c] text-[9px]">/USDT</span>
                          </td>
                          <td className="px-4 py-2.5 text-[#848e9c] uppercase font-bold text-[10px]">{tr.type}</td>
                          <td className={`px-4 py-2.5 font-bold ${sideColor}`}>
                            <span className="flex items-center space-x-1">
                              {tr.side === "BUY" ? <TrendingUp className="w-3.5 h-3.5 mr-1" /> : <TrendingDown className="w-3.5 h-3.5 mr-1" />}
                              {tr.side}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#eaecef]">
                            {tr.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[#eaecef]">
                            {tr.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-white">
                            {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
