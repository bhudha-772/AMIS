import React, { useRef, useEffect, useState, useMemo } from "react";
import { useBinance } from "../context/BinanceContext";
import { SUPPORTED_SYMBOLS, SUPPORTED_SYMBOLS_MAP, TIMEFRAMES, KlineData, TickerData } from "../types";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Search,
  Sparkles,
  Layers,
  ChevronRight,
  Info
} from "lucide-react";

// Inline Mini Sparkline Component to keep code modular and highly performant
interface SparklineProps {
  symbol: string;
  history: number[];
  isPositive: boolean;
  currentPrice: number;
}

const Sparkline: React.FC<SparklineProps> = React.memo(({ symbol, history, isPositive, currentPrice }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = 180;
    const height = 55;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...history);
    const max = Math.max(...history);
    const range = max - min || 1;

    // Soft padding
    const padTop = 8;
    const padBottom = 8;
    const drawHeight = height - padTop - padBottom;

    const points = history.map((val, idx) => {
      const x = (idx / (history.length - 1)) * (width - 4) + 2;
      const y = padTop + drawHeight - ((val - min) / range) * drawHeight;
      return { x, y };
    });

    const themeColor = isPositive ? "#0ecb81" : "#f6465d";

    // 1. Draw subtle grid background
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.3);
    ctx.lineTo(width, height * 0.3);
    ctx.moveTo(0, height * 0.7);
    ctx.lineTo(width, height * 0.7);
    ctx.stroke();

    // 2. Draw area gradient fill under line
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, isPositive ? "rgba(14, 203, 129, 0.15)" : "rgba(246, 70, 93, 0.15)");
    gradient.addColorStop(1, isPositive ? "rgba(14, 203, 129, 0.0)" : "rgba(246, 70, 93, 0.0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(points[0].x, height);
    points.forEach((p) => {
      ctx.lineTo(p.x, p.y);
    });
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.closePath();
    ctx.fill();

    // 3. Draw smoothed curve
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();

    // 4. Draw high/low range markers
    ctx.font = "8px monospace";
    ctx.fillStyle = "rgba(132, 142, 156, 0.55)";
    
    // Decimals based on price level
    const isMeme = symbol.includes("SHIB") || symbol.includes("PEPE");
    const dec = isMeme ? 6 : (max > 100 ? 1 : 3);
    
    ctx.fillText("H: " + max.toFixed(dec), 4, 8);
    ctx.fillText("L: " + min.toFixed(dec), 4, height - 2);

    // 5. Draw live end pulsing indicator dot
    const lastPoint = points[points.length - 1];
    ctx.fillStyle = themeColor;
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 2.5, 0, 2 * Math.PI);
    ctx.fill();

  }, [history, isPositive, currentPrice, symbol]);

  return (
    <canvas
      ref={canvasRef}
      className="w-[180px] h-[55px] opacity-85 group-hover:opacity-100 transition-opacity"
      style={{ width: "180px", height: "55px" }}
    />
  );
});

Sparkline.displayName = "Sparkline";

export const DualChartSection: React.FC = () => {
  const {
    activeSymbol,
    setActiveSymbol,
    activeTimeframe,
    setActiveTimeframe,
    klines,
    tickers,
    currentPrice,
    isLoadingKlines,
  } = useBinance();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Moving Averages for the legend HTML
  const lastMA7 = useMemo(() => {
    if (klines.length < 7) return null;
    const slice = klines.slice(-7);
    return slice.reduce((sum, c) => sum + c.close, 0) / 7;
  }, [klines]);

  const lastMA25 = useMemo(() => {
    if (klines.length < 25) return null;
    const slice = klines.slice(-25);
    return slice.reduce((sum, c) => sum + c.close, 0) / 25;
  }, [klines]);

  // Layout states
  const [candlesToShow, setCandlesToShow] = useState<number>(60);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; offset: number }>({ x: 0, offset: 0 });
  const [dimensions, setDimensions] = useState({ width: 600, height: 420 });

  // Right Panel Markets list
  const [trackedSymbols, setTrackedSymbols] = useState<string[]>([
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "DOGEUSDT",
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Maintain local history of prices for tracked symbols to feed mini sparkline charts
  const [symbolHistories, setSymbolHistories] = useState<Record<string, number[]>>({});

  // Initialize tracked history buffers
  useEffect(() => {
    setSymbolHistories((prev) => {
      const updated = { ...prev };
      trackedSymbols.forEach((sym) => {
        if (!updated[sym] || updated[sym].length === 0) {
          // Generate realistic baseline history
          const ticker = tickers[sym];
          const price = ticker?.price || 100;
          const initialHistory: number[] = [];
          let current = price * (1 - (ticker?.changePercent || 0) / 100);
          
          for (let i = 0; i < 40; i++) {
            const vol = 0.004;
            const walk = current * (Math.random() - 0.49) * vol;
            current += walk;
            initialHistory.push(current);
          }
          // Set last element to exact current price
          initialHistory[initialHistory.length - 1] = price;
          updated[sym] = initialHistory;
        }
      });
      return updated;
    });
  }, [trackedSymbols]);

  // Live update the price histories when tickers update
  useEffect(() => {
    setSymbolHistories((prev) => {
      const next = { ...prev };
      let changed = false;

      trackedSymbols.forEach((sym) => {
        const currentPriceVal = tickers[sym]?.price;
        if (currentPriceVal && next[sym]) {
          const lastHistory = next[sym];
          const lastSavedPrice = lastHistory[lastHistory.length - 1];

          if (lastSavedPrice !== currentPriceVal) {
            const updatedList = [...lastHistory.slice(1), currentPriceVal];
            next[sym] = updatedList;
            changed = true;
          }
        }
      });

      return changed ? next : prev;
    });
  }, [tickers, trackedSymbols]);

  // Handle resizing of the left canvas container
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(320, entry.contentRect.height),
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Main Candlestick Chart Drawing Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || klines.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    // Layout margins
    const paddingRight = 75;
    const paddingBottom = 25;
    const paddingTop = 25;
    const chartWidth = dimensions.width - paddingRight;
    const chartHeight = dimensions.height - paddingBottom;
    const mainChartHeight = chartHeight * 0.78;
    const volumeChartHeight = chartHeight * 0.18;
    const volumeChartTop = chartHeight * 0.82;

    // Elegant dark background
    ctx.fillStyle = "#16181a";
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Calculate view slice with floating-point scrollOffset support
    const totalCandles = klines.length;
    const maxScroll = Math.max(0, totalCandles - candlesToShow);
    const validatedOffset = Math.min(scrollOffset, maxScroll);

    const integerOffset = Math.floor(validatedOffset);
    const fractionalOffset = validatedOffset - integerOffset;

    // Check if we can slice one extra candle on the left for smooth horizontal sliding
    const hasExtraLeft = (totalCandles - candlesToShow - integerOffset - 1) >= 0;
    const startIndex = Math.max(0, totalCandles - candlesToShow - integerOffset - (hasExtraLeft ? 1 : 0));
    const endIndex = Math.min(totalCandles, totalCandles - integerOffset);
    const visibleCandles = klines.slice(startIndex, endIndex);

    if (visibleCandles.length === 0) return;

    // Find min and max values only for strictly visible candles
    let maxPrice = -Infinity;
    let minPrice = Infinity;
    let maxVolume = -Infinity;

    visibleCandles.forEach((c, idx) => {
      // Skip the extra left candle from scale calculations if it's mostly off-screen
      if (hasExtraLeft && idx === 0 && fractionalOffset < 0.1) return;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.low < minPrice) minPrice = c.low;
      if (c.volume > maxVolume) maxVolume = c.volume;
    });

    const priceDiff = maxPrice - minPrice || 1;
    maxPrice += priceDiff * 0.08;
    minPrice -= priceDiff * 0.08;
    if (minPrice < 0) minPrice = 0;

    // We calculate the slotWidth based on candlesToShow
    const slotWidth = chartWidth / candlesToShow;
    const candleWidth = slotWidth * 0.74;

    // Coordinate mapping
    const getX = (indexInSlice: number) => {
      const indexOffset = hasExtraLeft ? -1 : 0;
      return (indexInSlice + indexOffset + fractionalOffset) * slotWidth;
    };

    const getY = (price: number) =>
      mainChartHeight - ((price - minPrice) / (maxPrice - minPrice)) * (mainChartHeight - paddingTop);
    const getVolumeY = (vol: number) =>
      maxVolume === 0 ? chartHeight : chartHeight - (vol / maxVolume) * volumeChartHeight;

    // 1. Draw Grid Lines
    ctx.strokeStyle = "#24262b";
    ctx.lineWidth = 0.8;
    ctx.font = "9px monospace";
    ctx.fillStyle = "#848e9c";

    // Horizontal grid lines
    const gridCount = 6;
    for (let i = 0; i <= gridCount; i++) {
      const price = minPrice + (i / gridCount) * (maxPrice - minPrice);
      const y = getY(price);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Labels
      const isMeme = activeSymbol.includes("SHIB") || activeSymbol.includes("PEPE");
      ctx.fillText(
        price.toLocaleString(undefined, {
          minimumFractionDigits: isMeme ? 6 : 2,
          maximumFractionDigits: isMeme ? 8 : 4,
        }),
        chartWidth + 5,
        y + 3
      );
    }

    // Vertical time grid lines with smooth slide
    const skip = Math.max(1, Math.floor(candlesToShow / 5));
    visibleCandles.forEach((candle, i) => {
      const absoluteIndex = startIndex + i;
      if (absoluteIndex % skip === 0) {
        const x = getX(i) + slotWidth / 2;
        if (x >= 0 && x <= chartWidth) {
          ctx.beginPath();
          ctx.moveTo(x, paddingTop);
          ctx.lineTo(x, chartHeight);
          ctx.stroke();

          const date = new Date(candle.time);
          const timeStr = activeTimeframe.endsWith("d")
            ? `${date.getMonth() + 1}/${date.getDate()}`
            : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
          ctx.fillText(timeStr, x - 12, chartHeight + 14);
        }
      }
    });

    // 2. Draw Moving Averages for trend and formations
    const calculateMA = (period: number, indexInSlice: number) => {
      const absoluteIdx = startIndex + indexInSlice;
      if (absoluteIdx < period - 1) return null;
      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += klines[absoluteIdx - i].close;
      }
      return sum / period;
    };

    const drawMA = (period: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let first = true;

      visibleCandles.forEach((_, i) => {
        const maVal = calculateMA(period, i);
        if (maVal !== null) {
          const x = getX(i) + slotWidth / 2;
          const y = getY(maVal);
          if (x >= 0 && x <= chartWidth) {
            if (first) {
              ctx.moveTo(x, y);
              first = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
      });
      ctx.stroke();
    };

    drawMA(7, "#f0b90b"); // Yellow MA(7)
    drawMA(25, "#e74c3c"); // Pink/Red MA(25)

    // 3. Draw Candlesticks & Volumes
    visibleCandles.forEach((candle, idx) => {
      const isGreen = candle.close >= candle.open;
      const x = getX(idx);
      const centerX = x + slotWidth / 2;

      const openY = getY(candle.open);
      const closeY = getY(candle.close);
      const highY = getY(candle.high);
      const lowY = getY(candle.low);

      const top = Math.min(openY, closeY);
      const height = Math.abs(openY - closeY) || 1;

      const themeGreen = "#0ecb81";
      const themeRed = "#f6465d";

      ctx.strokeStyle = isGreen ? themeGreen : themeRed;
      ctx.fillStyle = isGreen ? themeGreen : themeRed;
      ctx.lineWidth = 1.2;

      // Draw if center point of candle is within the bounds
      if (centerX >= 0 && centerX <= chartWidth) {
        // Shadows/Wicks
        ctx.beginPath();
        ctx.moveTo(centerX, highY);
        ctx.lineTo(centerX, lowY);
        ctx.stroke();

        // Bodies
        ctx.fillRect(x + (slotWidth - candleWidth) / 2, top, candleWidth, height);

        // Volume bars
        const volY = getVolumeY(candle.volume);
        ctx.fillStyle = isGreen ? "rgba(14, 203, 129, 0.18)" : "rgba(246, 70, 93, 0.18)";
        ctx.fillRect(x + (slotWidth - candleWidth) / 2, volY, candleWidth, chartHeight - volY);
      }
    });

    // 4. Live Price Dashed Line
    if (currentPrice > 0) {
      const lastPriceY = getY(currentPrice);
      if (lastPriceY >= paddingTop && lastPriceY <= mainChartHeight) {
        const isUp = currentPrice >= (klines[klines.length - 2]?.close || currentPrice);
        const color = isUp ? "#0ecb81" : "#f6465d";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, lastPriceY);
        ctx.lineTo(chartWidth, lastPriceY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label Tag
        ctx.fillStyle = color;
        ctx.fillRect(chartWidth, lastPriceY - 8, paddingRight, 16);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px monospace";
        const isMeme = activeSymbol.includes("SHIB") || activeSymbol.includes("PEPE");
        ctx.fillText(
          currentPrice.toLocaleString(undefined, {
            minimumFractionDigits: isMeme ? 6 : 2,
            maximumFractionDigits: isMeme ? 8 : 4,
          }),
          chartWidth + 4,
          lastPriceY + 3
        );
      }
    }

    // 5. Interactive Crosshair & Tooltip
    if (mousePos && mousePos.x < chartWidth && mousePos.y < chartHeight) {
      const indexOffset = hasExtraLeft ? -1 : 0;
      const candleIdx = Math.floor((mousePos.x / slotWidth) - indexOffset - fractionalOffset);
      const hoveredCandle = visibleCandles[candleIdx];

      if (hoveredCandle) {
        const xVal = getX(candleIdx) + slotWidth / 2;
        const yVal = mousePos.y;

        ctx.strokeStyle = "rgba(132, 142, 156, 0.35)";
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);

        // Draw vertical
        ctx.beginPath();
        ctx.moveTo(xVal, paddingTop);
        ctx.lineTo(xVal, chartHeight);
        ctx.stroke();

        // Draw horizontal
        ctx.beginPath();
        ctx.moveTo(0, yVal);
        ctx.lineTo(chartWidth, yVal);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hover Stats Banner at the top left of the canvas
        ctx.fillStyle = "#1e2026";
        ctx.fillRect(4, 4, chartWidth - 8, 18);

        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#848e9c";
        const dateStr = new Date(hoveredCandle.time).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        ctx.fillText(`Time: `, 8, 16);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(dateStr, 38, 16);

        let curX = 150;
        const drawValue = (lbl: string, val: string, col = "#ffffff") => {
          ctx.fillStyle = "#848e9c";
          ctx.fillText(lbl, curX, 16);
          curX += ctx.measureText(lbl).width + 3;
          ctx.fillStyle = col;
          ctx.fillText(val, curX, 16);
          curX += ctx.measureText(val).width + 10;
        };

        const o = hoveredCandle.open;
        const h = hoveredCandle.high;
        const l = hoveredCandle.low;
        const c = hoveredCandle.close;
        const chg = c - o;
        const pct = (chg / o) * 100;
        const col = chg >= 0 ? "#0ecb81" : "#f6465d";

        const isMeme = activeSymbol.includes("SHIB") || activeSymbol.includes("PEPE");
        const dec = isMeme ? 6 : 2;

        drawValue("O:", o.toLocaleString(undefined, { minimumFractionDigits: dec }), col);
        drawValue("H:", h.toLocaleString(undefined, { minimumFractionDigits: dec }), col);
        drawValue("L:", l.toLocaleString(undefined, { minimumFractionDigits: dec }), col);
        drawValue("C:", c.toLocaleString(undefined, { minimumFractionDigits: dec }), col);
        drawValue("Chg:", `${chg >= 0 ? "+" : ""}${pct.toFixed(2)}%`, col);

        // Right Hover Price tag
        const hoverPrice = minPrice + ((mainChartHeight - yVal) / (mainChartHeight - paddingTop)) * (maxPrice - minPrice);
        if (hoverPrice >= minPrice && hoverPrice <= maxPrice) {
          ctx.fillStyle = "#474f59";
          ctx.fillRect(chartWidth, yVal - 8, paddingRight, 16);
          ctx.fillStyle = "#ffffff";
          ctx.font = "9px monospace";
          ctx.fillText(
            hoverPrice.toLocaleString(undefined, {
              minimumFractionDigits: isMeme ? 6 : 2,
              maximumFractionDigits: isMeme ? 8 : 4,
            }),
            chartWidth + 4,
            yVal + 3
          );
        }
      }
    }
  }, [klines, candlesToShow, scrollOffset, mousePos, currentPrice, dimensions, activeTimeframe, activeSymbol]);

  // Canvas Interactions Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      dragStartRef.current = {
        x: e.clientX - rect.left,
        offset: scrollOffset,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    if (isDragging) {
      const deltaX = x - dragStartRef.current.x;
      const chartWidth = dimensions.width - 75;
      const slotWidth = chartWidth / candlesToShow;
      const indexDiff = deltaX / slotWidth;
      setScrollOffset(Math.max(0, dragStartRef.current.offset + indexDiff));
    }
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => {
    setIsDragging(false);
    setMousePos(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const change = Math.round(candlesToShow * 0.05 * (e.deltaY > 0 ? 1 : -1));
    setCandlesToShow(Math.min(150, Math.max(10, candlesToShow + change)));
  };

  const handleZoom = (amount: number) => {
    setCandlesToShow((prev) => Math.min(150, Math.max(10, prev + amount)));
  };

  // Add symbol to Tracked list
  const addTrackedSymbol = (sym: string) => {
    if (!trackedSymbols.includes(sym)) {
      setTrackedSymbols([...trackedSymbols, sym]);
    }
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  // Remove symbol from Tracked list
  const removeTrackedSymbol = (e: React.MouseEvent, sym: string) => {
    e.stopPropagation(); // Avoid selecting the coin
    if (trackedSymbols.length <= 1) return; // Retain at least one
    setTrackedSymbols(trackedSymbols.filter((s) => s !== sym));
  };

  // Filter available symbols for adding to desk
  const filteredSymbols = useMemo(() => {
    return SUPPORTED_SYMBOLS.filter(
      (sym) =>
        !trackedSymbols.includes(sym) &&
        (sym.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (SUPPORTED_SYMBOLS_MAP[sym]?.name || "").toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [searchQuery, trackedSymbols]);

  return (
    <div
      id="dual-chart-desk"
      className="flex flex-col lg:flex-row h-auto lg:h-full w-full bg-[#16181a] divide-y lg:divide-y-0 lg:divide-x divide-[#24262b] select-none overflow-y-auto lg:overflow-hidden"
    >
      {/* LEFT SECTION: Interactive High-Fidelity Candlestick Workspace */}
      <div className="flex-none lg:flex-1 flex flex-col min-w-0 h-auto lg:h-full relative">
        {/* Workspace controls */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#1e2026] border-b border-[#24262b] shrink-0">
          <div className="flex items-center space-x-3 overflow-x-auto scrollbar-none pr-2">
            <span className="text-[11px] uppercase tracking-wider text-[#848e9c] font-bold">
              Intervals:
            </span>
            <div className="flex items-center space-x-1 bg-[#16181a] p-0.5 rounded border border-[#2b2f36]">
              {TIMEFRAMES.map((tf) => (
                <button
                  id={`dual-tf-${tf.value}`}
                  key={tf.value}
                  onClick={() => setActiveTimeframe(tf.value)}
                  className={`px-2.5 py-1 text-xs rounded font-semibold transition ${
                    activeTimeframe === tf.value
                      ? "bg-[#2b2f36] text-[#f0b90b] shadow-sm"
                      : "text-[#848e9c] hover:bg-[#2b2f36] hover:text-white"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2 text-[#848e9c]">
            {isLoadingKlines && (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#f0b90b] mr-1" />
            )}
            <div className="text-[10px] bg-[#16181a] px-2 py-1 rounded border border-[#24262b] text-[#848e9c] font-mono hidden sm:inline-block">
              Scale: <span className="text-white font-bold">{candlesToShow} candles</span>
            </div>
            <button
              id="dual-zoom-in"
              onClick={() => handleZoom(-10)}
              className="p-1 hover:bg-[#2b2f36] hover:text-white rounded transition"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              id="dual-zoom-out"
              onClick={() => handleZoom(10)}
              className="p-1 hover:bg-[#2b2f36] hover:text-white rounded transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              id="dual-reset"
              onClick={() => {
                setCandlesToShow(60);
                setScrollOffset(0);
              }}
              className="px-2 py-1 text-[10px] bg-[#2b2f36] hover:bg-[#363a45] text-[#eaecef] rounded font-bold transition uppercase"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Big Canvas area */}
        <div ref={containerRef} className="flex-1 w-full bg-[#16181a] relative overflow-hidden min-h-[280px]">
          {isLoadingKlines && klines.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#16181a]/95 space-y-3 z-20">
              <RefreshCw className="w-8 h-8 text-[#f0b90b] animate-spin" />
              <p className="text-xs text-[#848e9c]">Loading real-time candle feed...</p>
            </div>
          ) : null}

          <canvas
            id="dual-candle-canvas"
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            className="w-full h-full block cursor-crosshair"
            style={{ touchAction: "none" }}
          />

          <div className="absolute bottom-3 left-4 text-[10px] text-[#474f59] pointer-events-none bg-[#16181a]/90 px-2 py-1 rounded border border-[#24262b]/50">
            Swipe or Drag horizontally to scroll • Scroll/Pinch to Zoom
          </div>
          
          {/* Legend corner indicator */}
          <div className="absolute top-3 left-4 bg-[#1e2026]/85 border border-[#24262b] rounded p-2 text-xs pointer-events-none backdrop-blur-sm z-10 flex flex-col space-y-0.5">
            <span className="font-extrabold text-[#f0b90b] tracking-wider text-sm flex items-center space-x-1">
              <span>{SUPPORTED_SYMBOLS_MAP[activeSymbol]?.name || activeSymbol}</span>
              <span className="text-[#848e9c] text-xs">({SUPPORTED_SYMBOLS_MAP[activeSymbol]?.base}/{SUPPORTED_SYMBOLS_MAP[activeSymbol]?.quote})</span>
            </span>
            <div className="text-[10px] text-[#848e9c] font-mono flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
              <span>TF: <b className="text-white">{activeTimeframe.toUpperCase()}</b></span>
              <span>Price: <b className="text-white">{currentPrice ? currentPrice.toLocaleString() : "-"}</b></span>
              {lastMA7 && (
                <span className="text-[#f0b90b]">
                  MA(7): <b className="text-white">${lastMA7.toLocaleString(undefined, { maximumFractionDigits: activeSymbol.includes("SHIB") || activeSymbol.includes("PEPE") ? 6 : 2 })}</b>
                </span>
              )}
              {lastMA25 && (
                <span className="text-[#e74c3c]">
                  MA(25): <b className="text-white">${lastMA25.toLocaleString(undefined, { maximumFractionDigits: activeSymbol.includes("SHIB") || activeSymbol.includes("PEPE") ? 6 : 2 })}</b>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SECTION: Selected Markets Desk (Sleek Real-time Minimized Line Charts) */}
      <div className="w-full lg:w-[350px] xl:w-[410px] flex flex-col bg-[#111317] h-auto lg:h-full shrink-0">
        {/* Section Header */}
        <div className="px-4 py-3 bg-[#1e2026] border-b border-[#24262b] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-1.5 text-white">
            <Layers className="w-4 h-4 text-[#f0b90b]" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Selected Markets Line Charts
            </span>
          </div>

          {/* Add Market Switcher/Picker */}
          <div className="relative">
            <button
              id="add-market-trigger"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold bg-[#f0b90b] hover:bg-[#d4a307] text-black rounded transition shadow-sm"
            >
              <Plus className="w-3 h-3" />
              <span>Track</span>
            </button>

            {isSearchOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-[#1e2026] border border-[#2b2f36] rounded-md shadow-xl z-50 flex flex-col p-2 max-h-64 overflow-hidden">
                <div className="flex items-center bg-[#16181a] px-2 py-1 rounded border border-[#2b2f36] text-[#eaecef] mb-2">
                  <Search className="w-3.5 h-3.5 text-[#848e9c] mr-1.5 shrink-0" />
                  <input
                    id="add-market-search-input"
                    type="text"
                    placeholder="Search market..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent text-xs outline-none w-full placeholder-[#474f59]"
                    autoFocus
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")}>
                      <X className="w-3 h-3 text-[#848e9c] hover:text-white" />
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-[#24262b] custom-scrollbar">
                  {filteredSymbols.length === 0 ? (
                    <div className="text-center py-4 text-xs text-[#848e9c]">
                      No options left
                    </div>
                  ) : (
                    filteredSymbols.map((sym) => {
                      const info = SUPPORTED_SYMBOLS_MAP[sym];
                      const ticker = tickers[sym];
                      return (
                        <button
                          id={`add-sym-opt-${sym}`}
                          key={sym}
                          onClick={() => addTrackedSymbol(sym)}
                          className="w-full text-left px-2 py-1.5 hover:bg-[#2b2f36] transition flex items-center justify-between text-xs rounded"
                        >
                          <div>
                            <span className="font-bold text-white">{info?.base}</span>
                            <span className="text-[#848e9c] text-[10px]">/{info?.quote}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-[10px]">
                              ${ticker?.price?.toLocaleString() || "-"}
                            </div>
                            <div
                              className={`text-[9px] font-bold font-mono ${
                                (ticker?.changePercent || 0) >= 0 ? "text-[#0ecb81]" : "text-[#f6465d]"
                              }`}
                            >
                              {(ticker?.changePercent || 0) >= 0 ? "+" : ""}
                              {ticker?.changePercent?.toFixed(2)}%
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* List of Minimized Line Charts */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar bg-[#0b0c0e]">
          {trackedSymbols.map((sym) => {
            const ticker = tickers[sym];
            const info = SUPPORTED_SYMBOLS_MAP[sym];
            const currentVal = ticker?.price || 0;
            const changePct = ticker?.changePercent || 0;
            const isPositive = changePct >= 0;
            const isActive = activeSymbol === sym;
            const history = symbolHistories[sym] || [];

            const isMeme = sym.includes("SHIB") || sym.includes("PEPE");
            const decimals = isMeme ? 6 : 2;

            return (
              <div
                id={`tracked-card-${sym}`}
                key={sym}
                onClick={() => setActiveSymbol(sym)}
                className={`group p-3 rounded-lg border transition-all cursor-pointer relative ${
                  isActive
                    ? "bg-[#1e222d] border-[#f0b90b]"
                    : "bg-[#14151a] border-[#20222b] hover:bg-[#1a1c24] hover:border-[#2d313f]"
                }`}
              >
                {/* Active Indicator Line */}
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#f0b90b] rounded-l-lg" />
                )}

                {/* Card Title & Remove Control */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-black text-white tracking-wider">
                      {info?.base}
                    </span>
                    <span className="text-[10px] text-[#848e9c] font-medium">
                      /{info?.quote}
                    </span>
                    {isActive && (
                      <span className="text-[9px] bg-[#f0b90b]/10 text-[#f0b90b] px-1 py-0.5 rounded font-black uppercase tracking-wide border border-[#f0b90b]/20">
                        Inspected
                      </span>
                    )}
                  </div>

                  <button
                    id={`remove-tracked-${sym}`}
                    onClick={(e) => removeTrackedSymbol(e, sym)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#2b2f36] hover:text-white text-[#848e9c] rounded transition"
                    title="Stop tracking"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Price, Badge, and Minimized Sparkline Chart Side-By-Side */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col space-y-1">
                    <span className="text-sm font-extrabold font-mono text-white tracking-tight">
                      {currentVal > 0
                        ? currentVal.toLocaleString(undefined, {
                            minimumFractionDigits: decimals,
                            maximumFractionDigits: isMeme ? 8 : 4,
                          })
                        : "Loading..."}
                    </span>
                    <div
                      className={`inline-flex items-center space-x-1 text-xs font-bold font-mono ${
                        isPositive ? "text-[#0ecb81]" : "text-[#f6465d]"
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>
                        {isPositive ? "+" : ""}
                        {changePct.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  {/* Minimized Sparkline Chart */}
                  <div className="bg-[#111317]/60 p-1.5 rounded-md border border-[#20222b] overflow-hidden shrink-0">
                    <Sparkline
                      symbol={sym}
                      history={history}
                      isPositive={isPositive}
                      currentPrice={currentVal}
                    />
                  </div>
                </div>

                {/* Detail overlay hover link */}
                <div className="text-[9px] text-[#474f59] mt-2 group-hover:text-[#848e9c] transition-colors flex items-center space-x-1">
                  <span>Click card to switch primary candlestick chart</span>
                  <ChevronRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Tip Box footer */}
        <div className="p-3 bg-[#1e2026] border-t border-[#24262b] text-[10px] text-[#848e9c] flex items-start space-x-1.5">
          <Info className="w-3.5 h-3.5 text-[#f0b90b] shrink-0 mt-0.5" />
          <p className="leading-normal">
            Both primary candlesticks and minimized side line charts update in real-time. Hover on the main chart to inspect historical tick details.
          </p>
        </div>
      </div>
    </div>
  );
};
