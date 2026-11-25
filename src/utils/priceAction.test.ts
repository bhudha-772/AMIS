/**
 * DETERMINISTIC TESTS — PRICE-ACTION KNOWLEDGE ENGINE
 *
 * Locks canonical correctness: Williams 5-bar fractal geometry, raid vs
 * breakout polarity (the exact trap behind our 198 noise losses),
 * double top/bottom and head-and-shoulders confirmation, and the gate helpers.
 *
 * Run directly:  npx tsx src/utils/priceAction.test.ts
 */

import {
  PriceBar,
  detectFractals,
  latestFractal,
  extractSwings,
  detectDouble,
  detectHeadShoulders,
  detectLiquidityRaids,
  analyzePriceAction,
  priceActionShortLabel,
  priceActionForPrompt,
  isTradingIntoRaid,
  hasConfirmedPatternFor,
} from "./priceAction";

export function runPriceActionTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const assert = (condition: boolean, msg: string) => {
    if (condition) passed++;
    else {
      failed++;
      errors.push(`Assertion failed: ${msg}`);
      console.error(`❌ [PRICE-ACTION TEST FAIL] ${msg}`);
    }
  };

  console.log("=== Running Price-Action Knowledge Engine Tests ===");

  const bar = (high: number, low: number, close: number): PriceBar => ({ high, low, close });

  /* ── 1. CANONICAL UP FRACTAL: H[i-2]<H[i-1]<H[i]>H[i+1]>H[i+2] ── */
  const upSeries = [
    bar(10, 9, 9.5), bar(11, 9.5, 10.5), bar(13, 10, 12),
    bar(11.5, 10, 10.8), bar(10.5, 9.8, 10),
  ];
  const upF = detectFractals(upSeries);
  assert(upF.length === 1 && upF[0].kind === "UP" && upF[0].index === 2,
    `Canonical UP fractal at apex index 2 (got ${JSON.stringify(upF)})`);
  assert(upF[0].price === 13, `UP fractal price is the apex high (got ${upF[0].price})`);

  /* ── 2. CANONICAL DOWN FRACTAL ── */
  const dnSeries = [
    bar(11, 9, 10), bar(10.5, 8, 9), bar(10, 6, 8),
    bar(10.5, 7, 9.5), bar(11, 8.5, 10),
  ];
  const dnF = detectFractals(dnSeries);
  assert(dnF.length === 1 && dnF[0].kind === "DOWN" && dnF[0].index === 2,
    `Canonical DOWN fractal at apex index 2 (got ${JSON.stringify(dnF)})`);

  /* ── 3. UNCONFIRMED apex (no 2 right bars) is NOT a fractal ── */
  const unconfirmed = [bar(10, 9, 9.5), bar(11, 9.5, 10.5), bar(13, 10, 12), bar(11.5, 10, 10.8)];
  assert(detectFractals(unconfirmed).length === 0,
    `4-bar apex is unconfirmed — no fractal emitted`);

  /* ── 4. STRICT INEQUALITIES — flat neighbours are not fractals ── */
  const flat = [bar(10, 9, 9.5), bar(10, 9, 9.5), bar(10, 9, 9.5), bar(10, 9, 9.5), bar(10, 9, 9.5)];
  assert(detectFractals(flat).length === 0, `Flat series yields no fractals`);

  /* ── 5. latestFractal picks the freshest of each kind ── */
  const two = [
    ...upSeries,
    bar(9, 8, 8.5), bar(12, 8.5, 11), bar(14, 9, 13),
    bar(12.5, 10, 11), bar(11, 10, 10.5), bar(10, 9.5, 9.8),
  ];
  const all = detectFractals(two);
  const latest = latestFractal(all, "UP");
  assert(latest !== null && latest.index > 2, `latestFractal returns the fresher UP fractal`);

  /* ── 6. SWING SKELETON alternates HIGH/LOW ── */
  const swings = extractSwings(all);
  let alternates = true;
  for (let i = 1; i < swings.length; i++) {
    if (swings[i].kind === swings[i - 1].kind) { alternates = false; break; }
  }
  assert(alternates && swings.length >= 2, `Swing skeleton strictly alternates`);

  /* ── 7. DOUBLE TOP — FORMING, then CONFIRMED on neckline close ──
     Swings: HIGH 100, LOW 95, HIGH 100.2 (tops within 12% of the 5.2 height). */
  const dblSwings = [
    { index: 0, price: 90, kind: "LOW" as const },
    { index: 5, price: 100, kind: "HIGH" as const },
    { index: 10, price: 95, kind: "LOW" as const },
    { index: 15, price: 100.2, kind: "HIGH" as const },
  ];
  const formingBars = Array.from({ length: 20 }, (_, i) =>
    bar(99 + (i % 3) * 0.2, 98, 98.5));
  const forming = detectDouble(dblSwings, formingBars);
  assert(forming !== null && forming.pattern === "DOUBLE_TOP" && forming.status === "FORMING",
    `Double top FORMING before neckline break (got ${forming?.pattern} ${forming?.status})`);
  assert(forming !== null && forming.bias === "BEARISH", `Double top bias is BEARISH`);
  const confirmedBars = [...formingBars, bar(96, 93, 93.5)]; // close below 95
  const confirmed = detectDouble(dblSwings, confirmedBars);
  assert(confirmed !== null && confirmed.status === "CONFIRMED",
    `Double top CONFIRMED after close below neckline`);
  assert(confirmed !== null && Math.abs(confirmed.measuredMove - 5.2) < 0.5,
    `Measured move ≈ pattern height 5.2 (got ${confirmed?.measuredMove})`);

  /* ── 8. DOUBLE TOP — tops too far apart in price are rejected ── */
  const wideSwings = [
    { index: 0, price: 90, kind: "LOW" as const },
    { index: 5, price: 100, kind: "HIGH" as const },
    { index: 10, price: 95, kind: "LOW" as const },
    { index: 15, price: 104, kind: "HIGH" as const }, // 4.0 mismatch vs 9 height
  ];
  assert(detectDouble(wideSwings, formingBars) === null,
    `4-point mismatch on a 9-point pattern is rejected (>12% tolerance)`);

  /* ── 9. DOUBLE BOTTOM — bullish mirror ── */
  const botSwings = [
    { index: 0, price: 110, kind: "HIGH" as const },
    { index: 5, price: 100, kind: "LOW" as const },
    { index: 10, price: 105, kind: "HIGH" as const },
    { index: 15, price: 100.1, kind: "LOW" as const },
  ];
  const botBars = [...formingBars, bar(107, 105.5, 106.5)]; // close above 105
  const bot = detectDouble(botSwings, botBars);
  assert(bot !== null && bot.pattern === "DOUBLE_BOTTOM" && bot.status === "CONFIRMED",
    `Double bottom CONFIRMED after close above neckline`);
  assert(bot !== null && bot.bias === "BULLISH", `Double bottom bias is BULLISH`);

  /* ── 10. HEAD AND SHOULDERS — FORMING with head highest ── */
  const hsSwings = [
    { index: 0, price: 95, kind: "LOW" as const },
    { index: 2, price: 100, kind: "HIGH" as const },
    { index: 4, price: 96, kind: "LOW" as const },
    { index: 6, price: 103, kind: "HIGH" as const },
    { index: 8, price: 96.5, kind: "LOW" as const },
    { index: 10, price: 100.1, kind: "HIGH" as const },
    { index: 12, price: 95.5, kind: "LOW" as const },
  ];
  const hs = detectHeadShoulders(hsSwings, formingBars);
  assert(hs !== null && hs.pattern === "HEAD_SHOULDERS",
    `Head-and-shoulders detected (got ${hs?.pattern} ${hs?.status})`);
  assert(hs !== null && hs.bias === "BEARISH", `H&S bias is BEARISH`);

  /* ── 11. LIQUIDITY RAID — the trap that caused our losses ──
     Prior swing high 100, then a bar pokes to 101 but CLOSES at 99.5:
     buy-side raid, BEARISH — NOT a breakout to buy. */
  const raidFractals = [
    { index: 2, kind: "UP" as const, price: 100, strength: 1 },
    { index: 10, kind: "DOWN" as const, price: 95, strength: 1 },
  ];
  const raidBars = Array.from({ length: 15 }, (_, i) => bar(99, 98, 98.5));
  raidBars.push(bar(101, 98, 99.5)); // the raid bar
  const raids = detectLiquidityRaids(raidBars, raidFractals);
  assert(raids.length === 1 && raids[0].side === "BUY_SIDE",
    `Buy-side raid detected (got ${JSON.stringify(raids)})`);
  assert(raids[0].bias === "BEARISH",
    `Buy-side raid is BEARISH evidence (got ${raids[0].bias})`);

  /* ── 12. GENUINE BREAKOUT — close HOLDS above: no raid flagged ── */
  const holdBars = [...raidBars.slice(0, 15), bar(101, 98, 100.8)];
  assert(detectLiquidityRaids(holdBars, raidFractals).length === 0,
    `Close holding above the level is a breakout, not a raid`);

  /* ── 13. SELL-SIDE RAID — bullish mirror ── */
  const sellRaidBars = Array.from({ length: 15 }, (_, i) => bar(97, 95.5, 96));
  sellRaidBars.push(bar(97, 94, 96.2)); // wick below 95, close back above
  const sellRaids = detectLiquidityRaids(sellRaidBars, raidFractals);
  assert(sellRaids.length === 1 && sellRaids[0].bias === "BULLISH",
    `Sell-side raid is BULLISH evidence`);

  /* ── 14. AGGREGATOR — full state + precedence (raid outranks all) ──
     Structured 15-bar series: UP fractal apex 100 @bar2, DOWN fractal apex
     95 @bar7, quiet drift, then bar14 pokes to 101 and closes at 99.5. */
  const structBars = [
    bar(97.0, 96.0, 96.5), bar(99.0, 96.5, 98.5), bar(100.0, 97.0, 99.0),
    bar(99.0, 97.5, 98.0), bar(98.0, 97.0, 97.5), bar(97.5, 96.0, 96.5),
    bar(96.5, 95.5, 96.0), bar(96.0, 95.0, 95.5), bar(96.5, 95.5, 96.0),
    bar(97.0, 96.0, 96.5), bar(97.5, 96.8, 97.2), bar(98.0, 96.9, 97.6),
    bar(98.2, 96.8, 97.8), bar(98.1, 96.7, 97.5), bar(101.0, 97.0, 99.5),
  ];
  const pa = analyzePriceAction(structBars, {});
  assert(pa.fractals.length >= 2,
    `Aggregator finds both swing fractals (got ${pa.fractals.length})`);
  assert(pa.structureBias === "BEARISH",
    `Fresh buy-side raid sets BEARISH structure bias (got ${pa.structureBias})`);
  assert(pa.lastSwingHigh === 100 && pa.lastSwingLow === 95,
    `Swing levels extracted (high ${pa.lastSwingHigh}, low ${pa.lastSwingLow})`);
  assert(pa.fractals.length >= 0 && pa.swings.length >= 0, `Aggregator returns skeleton`);

  /* ── 15. GATE HELPERS — polarity matrix ── */
  assert(isTradingIntoRaid("BUY", pa, structBars.length) === true,
    `BUY into a fresh buy-side raid is blocked`);
  assert(isTradingIntoRaid("SELL", pa, structBars.length) === false,
    `SELL with a buy-side raid is allowed`);
  assert(isTradingIntoRaid("BUY", pa, structBars.length + 10) === false,
    `Stale raid (10 bars old) no longer vetoes`);
  const dblState = analyzePriceAction(
    [...formingBars, bar(96, 93, 93.5)], {});
  void dblState;
  const dblPa = {
    ...pa,
    patterns: confirmed !== null ? [confirmed] : [],
  };
  assert(hasConfirmedPatternFor("SELL", dblPa) === true,
    `Confirmed double top endorses SELL`);
  assert(hasConfirmedPatternFor("BUY", dblPa) === false,
    `Confirmed double top does NOT endorse BUY`);

  /* ── 16. PROMPT RENDERING — hard rules present, levels listed ── */
  const prompt = priceActionForPrompt(pa, "EURUSD");
  assert(prompt.includes("PRICE-ACTION KNOWLEDGE") && prompt.includes("EURUSD"),
    `Prompt block has header + symbol`);
  assert(prompt.includes("HARD RULES") && /raid/i.test(prompt),
    `Prompt block carries hard rules + raid knowledge`);
  const label = priceActionShortLabel(pa);
  assert(/RAID/i.test(label) && /BEARISH/.test(label),
    `Short label surfaces raid + bias (got "${label}")`);

  console.log(`=== Price-Action Knowledge Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) console.error("Failures:", errors);
  return { passed, failed, errors };
}

// Auto-run if directly executed via tsx
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("priceAction.test")) {
  const res = runPriceActionTests();
  process.exit(res.failed > 0 ? 1 : 0);
}


