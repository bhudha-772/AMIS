/**
 * DETERMINISTIC TESTS - DERIV MARKET SCANNER
 *
 * Mirrors deriv_market_scanner.py --selftest. Run: npx tsx src/utils/derivMarketScanner.test.ts
 */
import { analyzeScan, buildScanVerdict, wilsonInterval, pGreater, BASE_P } from "./derivMarketScanner";

export function runDerivMarketScannerTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];
  const assert = (cond: boolean, msg: string) => {
    if (cond) passed++;
    else { failed++; errors.push(`Assertion failed: ${msg}`); console.error(`X [SCANNER TEST FAIL] ${msg}`); }
  };

  console.log("=== Running Deriv Market Scanner Tests ===");

  // 1. Wilson interval sanity
  const w = wilsonInterval(80, 100);
  assert(w.lo > 0.71 && w.lo < 0.72 && w.hi > 0.86 && w.hi < 0.87, `Wilson 80/100 -> ${w.lo.toFixed(3)}-${w.hi.toFixed(3)}`);

  // 2. pGreater sanity (fair 80% should be ~0.5)
  const pg = pGreater(4000, 5000);
  assert(pg > 0.4 && pg < 0.6, `pGreater(4000,5000)=${pg.toFixed(3)} should be ~0.5`);

  // 3. Fair markets -> no supported edge
  const rng = (seed: number) => {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  };
  const r = rng(3);
  const randInt = (n: number) => Math.floor(r() * n);
  const markets: Record<string, { digits: number[]; payout: { over1: number; under8: number } }> = {};
  const names = ["R_10", "R_25", "R_50", "R_75", "R_100", "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "1HZ100V", "JD10", "JD25", "JD50"];
  names.forEach((s, i) => {
    markets[s] = { digits: Array.from({ length: 5000 }, () => randInt(10)), payout: { over1: 0.17 + 0.01 * (i % 5), under8: 0.18 + 0.01 * (i % 4) } };
  });
  const { rows, tests } = analyzeScan(markets as any, 0.05);
  assert(tests === 26, `expected 26 tests, got ${tests}`);
  const winners = rows.filter((x) => x.supported);
  assert(winners.length === 0, `fair markets should yield 0 supported edges, got ${winners.length}`);
  const v = buildScanVerdict(rows, tests);
  assert(v.kind === "no_edge", `verdict should be no_edge, got ${v.kind}`);
  assert(!!v.bestPayout, `bestPayout should be set`);

  // 4. Planted 83% market -> TRADE
  const markets2: any = JSON.parse(JSON.stringify(markets));
  // regenerate planted digits deterministically
  const r2 = rng(7);
  const planted: number[] = [];
  for (let i = 0; i < 50000; i++) {
    planted.push(r2() < 0.83 ? (2 + Math.floor(r2() * 8)) : Math.floor(r2() * 2));
  }
  markets2["R_75"] = { digits: planted, payout: { over1: 0.21, under8: 0.19 } };
  const res2 = analyzeScan(markets2, 0.05);
  const v2 = buildScanVerdict(res2.rows, res2.tests);
  assert(v2.kind === "trade", `planted market should yield TRADE, got ${v2.kind}`);
  assert(v2.bestTrade?.symbol === "R_75" && v2.bestTrade?.contract === "over1", `bestTrade should be R_75 over1, got ${v2.bestTrade?.symbol} ${v2.bestTrade?.contract}`);
  assert((v2.bestTrade?.wr ?? 0) > 0.8, `win rate should be >0.8, got ${v2.bestTrade?.wr}`);

  // 5. BASE_P constant
  assert(BASE_P === 0.80, `BASE_P should be 0.80`);

  console.log(`=== Deriv Market Scanner Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) console.error("Failures:", errors);
  return { passed, failed, errors };
}

if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("derivMarketScanner.test")) {
  const res = runDerivMarketScannerTests();
  process.exit(res.failed > 0 ? 1 : 0);
}
