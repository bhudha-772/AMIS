import React, { useRef, useEffect, useState } from "react";
import { useBinance } from "../context/BinanceContext";
import { TIMEFRAMES, SUPPORTED_SYMBOLS_MAP } from "../types";
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";

export const TradingChart: React.FC = () => {
  const {
    activeSymbol,
    activeTimeframe,
    setActiveTimeframe,
    klines,
    currentPrice,
    isLoadingKlines,
  } = useBinance();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Chart view states
  const [candlesToShow, setCandlesToShow] = useState<number>(60); // Zoom level
  const [scrollOffset, setScrollOffset] = useState<number>(0); // Pan offset (0 = latest)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; offset: number }>({ x: 0, offset: 0 });
  const [fullscreen, setFullscreen] = useState<boolean>(false);

  // Multi-touch for pinch-to-zoom on mobile
  const touchStartDistRef = useRef<number>(0);
  const touchStartCandlesRef = useRef<number>(60);

  // Resize handler
  const [dimensions, setDimensions] = useState({ width: 800, height: 450 });

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(300, entry.contentRect.height),
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [fullscreen]);

  // Handle drawing to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || klines.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    // Layout configuration
    const paddingRight = 75; // for price Y axis
    const paddingBottom = 25; // for time X axis
    const paddingTop = 25; // header margin
    const chartWidth = dimensions.width - paddingRight;
    const chartHeight = dimensions.height - paddingBottom;
    const mainChartHeight = chartHeight * 0.78; // Candlestick portion
    const volumeChartHeight = chartHeight * 0.18; // Volume portion
    const volumeChartTop = chartHeight * 0.82; // Volume starts here

    // Clear background
    ctx.fillStyle = "#16181a"; // Binance dark-grey
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Calculate view slice
    const totalCandles = klines.length;
    
    // Ensure scroll offset is within valid bounds
    const maxScroll = Math.max(0, totalCandles - candlesToShow);
    const validatedOffset = Math.min(scrollOffset, maxScroll);
    if (validatedOffset !== scrollOffset) {
      setScrollOffset(validatedOffset);
    }

    const startIndex = Math.max(0, totalCandles - candlesToShow - validatedOffset);
    const endIndex = Math.min(totalCandles, totalCandles - validatedOffset);
    const visibleCandles = klines.slice(startIndex, endIndex);

    if (visibleCandles.length === 0) return;

    // Find min and max price/volume in visible slice
    let maxPrice = -Infinity;
    let minPrice = Infinity;
    let maxVolume = -Infinity;

    visibleCandles.forEach((c) => {
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.low < minPrice) minPrice = c.low;
      if (c.volume > maxVolume) maxVolume = c.volume;
    });

    // Add padding to price range (10% upper and lower)
    const priceDiff = maxPrice - minPrice || 1;
    maxPrice += priceDiff * 0.08;
    minPrice -= priceDiff * 0.08;
    if (minPrice < 0) minPrice = 0;

    // Helper functions to map data coordinates to screen coordinates
    const getX = (index: number) => {
      return (index / visibleCandles.length) * chartWidth;
    };

    const getY = (price: number) => {
      return mainChartHeight - ((price - minPrice) / (maxPrice - minPrice)) * (mainChartHeight - paddingTop);
    };

    const getVolumeY = (vol: number) => {
      if (maxVolume === 0) return chartHeight;
      return chartHeight - (vol / maxVolume) * volumeChartHeight;
    };

    const candleWidth = (chartWidth / visibleCandles.length) * 0.72;

    // 1. Draw Grid Lines
    ctx.strokeStyle = "#24262b"; // Subtle grid line color
    ctx.lineWidth = 0.8;
    ctx.font = "10px monospace";
    ctx.fillStyle = "#848e9c"; // Text gray

    // Horizontal Price Lines
    const gridCount = 6;
    for (let i = 0; i <= gridCount; i++) {
      const price = minPrice + (i / gridCount) * (maxPrice - minPrice);
      const y = getY(price);
      
      // Draw grid line
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Draw price label
      ctx.fillText(price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }), chartWidth + 6, y + 4);
    }

    // Vertical Time Lines
    const visibleCount = visibleCandles.length;
    const skip = Math.max(1, Math.floor(visibleCount / 5));
    for (let i = 0; i < visibleCount; i += skip) {
      const candle = visibleCandles[i];
      const x = getX(i) + candleWidth / 2;
      
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, chartHeight);
      ctx.stroke();

      // Time stamp
      const date = new Date(candle.time);
      const timeStr = activeTimeframe.endsWith("d") 
        ? `${date.getMonth() + 1}/${date.getDate()}`
        : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      
      ctx.fillText(timeStr, x - 15, chartHeight + 15);
    }

    // 2. Draw Candlesticks & Volumes
    visibleCandles.forEach((candle, idx) => {
      const isGreen = candle.close >= candle.open;
      const x = getX(idx);
      const centerX = x + candleWidth / 2;

      const openY = getY(candle.open);
      const closeY = getY(candle.close);
      const highY = getY(candle.high);
      const lowY = getY(candle.low);

      const top = Math.min(openY, closeY);
      const height = Math.abs(openY - closeY) || 1; // At least 1px

      const themeGreen = "#0ecb81"; // Binance Green
      const themeRed = "#f6465d"; // Binance Red

      ctx.strokeStyle = isGreen ? themeGreen : themeRed;
      ctx.fillStyle = isGreen ? themeGreen : themeRed;
      ctx.lineWidth = 1.3;

      // Draw Wick (Shadow)
      ctx.beginPath();
      ctx.moveTo(centerX, highY);
      ctx.lineTo(centerX, lowY);
      ctx.stroke();

      // Draw Candle Body
      ctx.fillRect(x, top, candleWidth, height);

      // Draw Volume Bar
      const volY = getVolumeY(candle.volume);
      ctx.fillStyle = isGreen ? "rgba(14, 203, 129, 0.22)" : "rgba(246, 70, 93, 0.22)";
      ctx.fillRect(x, volY, candleWidth, chartHeight - volY);
    });

    // 3. Draw Live Last Price Dashed Line
    if (visibleCandles.length > 0 && currentPrice > 0) {
      const lastPriceY = getY(currentPrice);
      if (lastPriceY >= paddingTop && lastPriceY <= mainChartHeight) {
        ctx.strokeStyle = currentPrice >= klines[klines.length - 2]?.close ? "#0ecb81" : "#f6465d";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(0, lastPriceY);
        ctx.lineTo(chartWidth, lastPriceY);
        ctx.stroke();
        ctx.setLineDash([]); // Reset

        // Price Tag on Right Axis
        ctx.fillStyle = currentPrice >= klines[klines.length - 2]?.close ? "#0ecb81" : "#f6465d";
        ctx.fillRect(chartWidth, lastPriceY - 8, paddingRight, 16);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px monospace";
        ctx.fillText(currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }), chartWidth + 5, lastPriceY + 4);
      }
    }

    // 4. Draw Crosshair and Interactive Tooltip
    if (mousePos && mousePos.x < chartWidth && mousePos.y < chartHeight) {
      const candleIndex = Math.floor((mousePos.x / chartWidth) * visibleCandles.length);
      const hoveredCandle = visibleCandles[candleIndex];

      if (hoveredCandle) {
        const xVal = getX(candleIndex) + candleWidth / 2;
        const yVal = mousePos.y;

        // Draw crosshair lines
        ctx.strokeStyle = "rgba(132, 142, 156, 0.4)";
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);

        // Vert
        ctx.beginPath();
        ctx.moveTo(xVal, paddingTop);
        ctx.lineTo(xVal, chartHeight);
        ctx.stroke();

        // Horiz
        ctx.beginPath();
        ctx.moveTo(0, yVal);
        ctx.lineTo(chartWidth, yVal);
        ctx.stroke();
        ctx.setLineDash([]); // Reset

        // Hover Stats Bar at the Top Left
        ctx.font = "11px sans-serif";
        ctx.fillStyle = "#848e9c";
        
        const dateStr = new Date(hoveredCandle.time).toLocaleString();
        const o = hoveredCandle.open;
        const h = hoveredCandle.high;
        const l = hoveredCandle.low;
        const c = hoveredCandle.close;
        const v = hoveredCandle.volume;
        const chg = c - o;
        const pct = (chg / o) * 100;
        const statColor = chg >= 0 ? "#0ecb81" : "#f6465d";

        ctx.fillStyle = "#1e2026";
        ctx.fillRect(4, 4, chartWidth - 8, 20);

        ctx.fillStyle = "#848e9c";
        ctx.fillText(`Time: `, 8, 17);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(dateStr, 40, 17);

        let curX = 165;
        const drawStat = (label: string, value: string, color = "#ffffff") => {
          ctx.fillStyle = "#848e9c";
          ctx.fillText(label, curX, 17);
          curX += ctx.measureText(label).width + 3;
          ctx.fillStyle = color;
          ctx.fillText(value, curX, 17);
          curX += ctx.measureText(value).width + 12;
        };

        drawStat("O:", o.toLocaleString(undefined, { minimumFractionDigits: 2 }), statColor);
        drawStat("H:", h.toLocaleString(undefined, { minimumFractionDigits: 2 }), statColor);
        drawStat("L:", l.toLocaleString(undefined, { minimumFractionDigits: 2 }), statColor);
        drawStat("C:", c.toLocaleString(undefined, { minimumFractionDigits: 2 }), statColor);
        drawStat("Chg:", `${chg >= 0 ? "+" : ""}${chg.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${chg >= 0 ? "+" : ""}${pct.toFixed(2)}%)`, statColor);
        drawStat("Vol:", v.toLocaleString(undefined, { maximumFractionDigits: 2 }), "#eaecef");

        // Y-axis Hover label tag
        const hoverPrice = minPrice + ((mainChartHeight - yVal) / (mainChartHeight - paddingTop)) * (maxPrice - minPrice);
        if (hoverPrice >= minPrice && hoverPrice <= maxPrice) {
          ctx.fillStyle = "#474f59";
          ctx.fillRect(chartWidth, yVal - 8, paddingRight, 16);
          ctx.fillStyle = "#ffffff";
          ctx.font = "9px monospace";
          ctx.fillText(hoverPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }), chartWidth + 5, yVal + 4);
        }

        // X-axis Hover label tag
        ctx.fillStyle = "#474f59";
        const dateObj = new Date(hoveredCandle.time);
        const xTagText = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const xTagWidth = ctx.measureText(xTagText).width + 10;
        ctx.fillRect(xVal - xTagWidth / 2, chartHeight, xTagWidth, 16);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(xTagText, xVal - xTagWidth / 2 + 5, chartHeight + 11);
      }
    }
  }, [klines, candlesToShow, scrollOffset, mousePos, currentPrice, dimensions, activeTimeframe]);

  // Handlers for Mouse Zoom/Drag
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left click only
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
      const candleWidth = chartWidth / candlesToShow;
      const indexDiff = Math.round(deltaX / candleWidth);
      
      const newOffset = Math.max(0, dragStartRef.current.offset + indexDiff);
      setScrollOffset(newOffset);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setMousePos(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomIntensity = 0.05;
    const change = Math.round(candlesToShow * zoomIntensity * (e.deltaY > 0 ? 1 : -1));
    const nextVal = Math.min(150, Math.max(10, candlesToShow + change));
    setCandlesToShow(nextVal);
  };

  // Mobile touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        dragStartRef.current = {
          x: e.touches[0].clientX - rect.left,
          offset: scrollOffset,
        };
      }
    } else if (e.touches.length === 2) {
      // Pinch to Zoom initial calculations
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartCandlesRef.current = candlesToShow;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.touches.length === 1 && isDragging) {
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      setMousePos({ x, y });

      const deltaX = x - dragStartRef.current.x;
      const chartWidth = dimensions.width - 75;
      const candleWidth = chartWidth / candlesToShow;
      const indexDiff = Math.round(deltaX / candleWidth);
      
      const newOffset = Math.max(0, dragStartRef.current.offset + indexDiff);
      setScrollOffset(newOffset);
    } else if (e.touches.length === 2) {
      // Pinch zoom execution
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = touchStartDistRef.current / dist;
      const nextVal = Math.min(150, Math.max(10, Math.round(touchStartCandlesRef.current * factor)));
      setCandlesToShow(nextVal);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setMousePos(null);
  };

  // Quick Controls
  const adjustZoom = (amount: number) => {
    setCandlesToShow((prev) => Math.min(150, Math.max(10, prev + amount)));
  };

  const resetChart = () => {
    setCandlesToShow(60);
    setScrollOffset(0);
  };

  const toggleFullscreen = () => {
    setFullscreen((prev) => !prev);
  };

  const symDetails = SUPPORTED_SYMBOLS_MAP[activeSymbol] || { name: "", base: "", quote: "" };

  return (
    <div
      id="trading-chart-container"
      ref={containerRef}
      className={`relative flex flex-col bg-[#16181a] border-b border-[#24262b] ${
        fullscreen ? "fixed inset-0 z-50 h-screen w-screen" : "h-[450px]"
      }`}
    >
      {/* Chart Ticker Panel Header */}
      <div id="chart-controls-panel" className="flex items-center justify-between px-3 py-1.5 bg-[#1e2026] border-b border-[#24262b] text-xs">
        {/* Timeframes */}
        <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none">
          <span className="text-[#848e9c] mr-2 hidden sm:inline">Time:</span>
          {TIMEFRAMES.map((tf) => (
            <button
              id={`timeframe-btn-${tf.value}`}
              key={tf.value}
              onClick={() => setActiveTimeframe(tf.value)}
              className={`px-2 py-1 rounded font-medium transition ${
                activeTimeframe === tf.value
                  ? "bg-[#2b2f36] text-[#f0b90b]"
                  : "text-[#848e9c] hover:bg-[#2b2f36] hover:text-white"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 text-[#848e9c]">
          {isLoadingKlines && (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#f0b90b] mr-2" />
          )}

          <button
            id="chart-zoom-in-btn"
            onClick={() => adjustZoom(-10)}
            title="Zoom In"
            className="p-1 hover:bg-[#2b2f36] hover:text-white rounded"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            id="chart-zoom-out-btn"
            onClick={() => adjustZoom(10)}
            title="Zoom Out"
            className="p-1 hover:bg-[#2b2f36] hover:text-white rounded"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            id="chart-reset-btn"
            onClick={resetChart}
            title="Reset Scale"
            className="p-1 hover:bg-[#2b2f36] hover:text-white rounded text-[10px] uppercase font-bold"
          >
            Reset
          </button>
          <button
            id="chart-fullscreen-btn"
            onClick={toggleFullscreen}
            title={fullscreen ? "Exit Fullscreen" : "Fullscreen"}
            className="p-1 hover:bg-[#2b2f36] hover:text-white rounded"
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Drawing Area */}
      <div className="relative flex-1 w-full bg-[#16181a] select-none overflow-hidden">
        {isLoadingKlines && klines.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-[#16181a] z-10">
            <RefreshCw className="w-8 h-8 text-[#f0b90b] animate-spin" />
            <p className="text-xs text-[#848e9c]">Syncing order-book data & chart candles...</p>
          </div>
        ) : null}

        <canvas
          id="candle-chart-canvas"
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full h-full block cursor-crosshair"
          style={{ touchAction: "none" }}
        />

        {/* Drag/Scroll Hint Overlay */}
        {klines.length > 0 && (
          <div className="absolute bottom-8 left-3 text-[10px] text-[#474f59] pointer-events-none bg-[#16181a]/80 px-1.5 py-0.5 rounded backdrop-blur">
            Scroll/Pinch to Zoom • Drag to Pan
          </div>
        )}
      </div>
    </div>
  );
};
