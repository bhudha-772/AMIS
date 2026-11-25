/**
 * Deriv market scanner for Over 1 / Under 8 (1 tick).
 * Pure port of deriv_market_scanner.py.
 */
import { DERIV_PUBLIC_WS_URL } from "../config/derivConfig";

export const BASE_P = 0.80;

export type ScanContractKey = "over1" | "under8";

export interface ScanContractSpec {
  contractType: string;
  barrier: string;
  label: string;
  win: (digit: number) => boolean;
}

export const SCAN_CONTRACTS: Record<ScanContractKey, ScanContractSpec> = {
  over1: { contractType: "DIGITOVER", barrier: "1", label: "Over 1", win: (d) => d >= 2 },
  under8: { contractType: "DIGITUNDER", barrier: "8", label: "Under 8", win: (d) => d <= 7 },
};

export interface ScanMarketData {
  symbol: string;
  digits: number[];
  payout: Partial<Record<ScanContractKey, number>>;
}

export interface ScanRow {
  symbol: string;
  contract: ScanContractKey;
  n: number;
  k: number;
  wr: number;
  lo: number;
  hi: number;
  p: number;
  p1: number;
  p2: number;
  p_adj: number;
  r: number | null;
  be: number | null;
  ev_fair: number | null;
  ev_emp: number | null;
  ev_low: number | null;
  supported: boolean;
}

export interface ScanVerdict {
  kind: "trade" | "no_edge";
  winners: ScanRow[];
  bestTrade?: ScanRow;
  bestPayout?: ScanRow;
  message: string;
}

export interface ScanProgress {
  phase: "scanning" | "done";
  current: number;
  total: number;
  symbol?: string;
}

// ---------------------------------------------------------------- statistics
export function wilsonInterval(
  k: number,
  n: number,
  z = 1.96,
): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 1 };
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half =
    (z * Math.sqrt(p * (1 - p) / n + (z * z) / (4 * n * n))) / den;
  return { lo: centre - half, hi: centre + half };
}

export function pGreater(k: number, n: number, p0 = BASE_P): number {
  if (n === 0) return 1;
  const z = (k / n - p0) / Math.sqrt((p0 * (1 - p0)) / n);
  return 0.5 * erfc(z / Math.sqrt(2));
}

function erfc(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly =
    t *
    (0.254829592 +
      t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const res = poly * Math.exp(-x * x);
  return x >= 0 ? res : 2 - res;
}

export function analyzeScan(
  markets: Record<string, { digits: number[]; payout: Partial<Record<ScanContractKey, number>> }>,
  alpha = 0.05,
): { rows: ScanRow[]; tests: number } {
  const rows: ScanRow[] = [];
  for (const sym of Object.keys(markets)) {
    const m = markets[sym];
    const d = m.digits;
    const n = d.length;
    for (const key of ["over1", "under8"] as ScanContractKey[]) {
      const spec = SCAN_CONTRACTS[key];
      const wins = d.map((x) => (spec.win(x) ? 1 : 0));
      const k = wins.reduce((a, b) => a + b, 0);
      const half = Math.floor(n / 2);
      const k1 = wins.slice(0, half).reduce((a, b) => a + b, 0);
      const k2 = wins.slice(half).reduce((a, b) => a + b, 0);
      const { lo, hi } = wilsonInterval(k, n);
      const p = pGreater(k, n);
      const p1 = pGreater(k1, half);
      const p2 = pGreater(k2, n - half);
      const r = m.payout[key] ?? null;
      rows.push({
        symbol: sym,
        contract: key,
        n,
        k,
        wr: n ? k / n : 0,
        lo,
        hi,
        p,
        p1,
        p2,
        p_adj: 0,
        r,
        be: null,
        ev_fair: null,
        ev_emp: null,
        ev_low: null,
        supported: false,
      });
    }
  }
  const tests = rows.length;
  for (const row of rows) {
    row.p_adj = Math.min(1, row.p * tests);
    const r = row.r;
    if (r === null) {
      row.be = null;
      row.ev_fair = null;
      row.ev_emp = null;
      row.ev_low = null;
      row.supported = false;
      continue;
    }
    row.be = 1 / (1 + r);
    row.ev_fair = BASE_P * r - (1 - BASE_P);
    row.ev_emp = row.wr * r - (1 - row.wr);
    row.ev_low = row.lo * r - (1 - row.lo);
    row.supported =
      row.p_adj < 0.05 && row.lo > (row.be as number) && row.p1 < 0.05 && row.p2 < 0.05;
  }
  return { rows, tests };
}

export function buildScanVerdict(rows: ScanRow[], tests: number): ScanVerdict {
  const winners = rows.filter((x) => x.supported);
  if (winners.length > 0) {
    const best = winners.reduce((a, b) =>
      (b.ev_low ?? -Infinity) > (a.ev_low ?? -Infinity) ? b : a,
      winners[0],
    );
    return {
      kind: "trade",
      winners,
      bestTrade: best,
      message: `VERDICT: TRADE ${best.symbol} ${best.contract}. Win rate ${(best.wr * 100).toFixed(2)}% (95% low ${(best.lo * 100).toFixed(2)}%) vs break-even ${(best.be! * 100).toFixed(2)}%, holds in both halves. Re-scan on fresh ticks before relying on it - a real bias should persist, luck will not.`,
    };
  }
  const priced = rows.filter((x) => x.ev_fair !== null);
  if (priced.length > 0) {
    const b = priced.reduce((a, c) =>
      (c.ev_fair ?? -Infinity) > (a.ev_fair ?? -Infinity) ? c : a,
      priced[0],
    );
    let msg = `VERDICT: NO market shows a statistically supported edge. Do not expect a win-rate advantage anywhere.`;
    msg += ` The only real difference is payout. Highest payout: ${b.symbol} ${b.contract} at ${((b.r ?? 0) * 100).toFixed(1)}% (break-even needs 25.0% at an 80% win rate).`;
    if ((b.ev_fair ?? 0) < 0) {
      msg += ` Even there the expected value is ${((b.ev_fair ?? 0) * 100).toFixed(2)}% per 1 staked. It is the cheapest place to trade, not a profitable one.`;
    } else {
      msg += ` Expected value there is ${((b.ev_fair ?? 0) * 100).toFixed(2)}% per 1 staked if the feed is fair.`;
    }
    return { kind: "no_edge", winners: [], bestPayout: b, message: msg };
  }
  return { kind: "no_edge", winners: [], message: "VERDICT: NO market shows a statistically supported edge." };
}

// ---------------------------------------------------------------- helpers
function lastDigits(prices: number[], pip: number): number[] {
  return prices.map((p) => {
    const s = Number(p).toFixed(pip);
    return parseInt(s[s.length - 1], 10);
  });
}

function pipFromDeriv(pipSize: number | undefined, fallback: number): number {
  if (typeof pipSize === "number" && pipSize > 0) {
    if (pipSize < 1) {
      const v = Math.round(-Math.log10(pipSize));
      if (v >= 0 && v <= 10) return v;
    } else if (Number.isInteger(pipSize) && pipSize <= 10) {
      return pipSize;
    }
  }
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function openWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      try { ws.close(); } catch { /* noop */ }
      reject(new Error("WebSocket open timeout"));
    }, 20000);
    ws.onopen = () => { clearTimeout(timer); resolve(ws); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("WebSocket error")); };
  });
}

function sendAndWait(ws: WebSocket, req: any, timeoutMs = 20000): Promise<any> {
  return new Promise((resolve, reject) => {
    const rid = req.req_id;
    let done = false;
    const handler = (ev: MessageEvent) => {
      let data: any;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (data?.req_id === rid) {
        if (done) return;
        done = true;
        ws.removeEventListener("message", handler);
        clearTimeout(t);
        resolve(data);
      }
    };
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      ws.removeEventListener("message", handler);
      reject(new Error(`timeout waiting for req_id ${rid}`));
    }, timeoutMs);
    ws.addEventListener("message", handler);
    try { ws.send(JSON.stringify(req)); }
    catch (e) { clearTimeout(t); ws.removeEventListener("message", handler); reject(e); }
  });
}

export interface LiveScanOptions {
  wsUrl?: string;
  symbols: string[];
  tickCount?: number;
  pipSizes?: Record<string, number>;
  onProgress?: (p: ScanProgress) => void;
}

export async function runLiveMarketScan(opts: LiveScanOptions): Promise<{
  rows: ScanRow[];
  tests: number;
  verdict: ScanVerdict;
  markets: Record<string, { digits: number[]; payout: Partial<Record<ScanContractKey, number>> }>;
}> {
  const wsUrl = opts.wsUrl || DERIV_PUBLIC_WS_URL;
  const tickCount = opts.tickCount ?? 5000;
  const symbols = opts.symbols;
  const pipSizes = opts.pipSizes ?? {};
  const ws = await openWs(wsUrl);
  const markets: Record<string, { digits: number[]; payout: Partial<Record<ScanContractKey, number>> }> = {};
  let rid = 0;

  const pending = new Map();
  const onMessage = (ev) => {
    let data;
    try { data = JSON.parse(ev.data); } catch { return; }
    const ridNum = data?.req_id ?? data?.echo_req?.req_id;
    if (ridNum !== undefined) {
      const pend = pending.get(ridNum);
      if (pend) {
        pending.delete(ridNum);
        pend.resolve(data);
      }
    }
  };
  ws.addEventListener("message", onMessage);

  const req = (payload, timeoutMs = 15000) => {
    rid += 1;
    payload.req_id = rid;
    return new Promise((resolve, reject) => {
      pending.set(rid, { resolve, reject });
      const t = setTimeout(() => {
        if (pending.has(rid)) {
          pending.delete(rid);
          reject(new Error("timeout req_id " + rid));
        }
      }, timeoutMs);
      try { ws.send(JSON.stringify(payload)); } catch (e) { pending.delete(rid); clearTimeout(t); reject(e); }
    });
  };

  try {
    const historyResults = await Promise.allSettled(
      symbols.map((sym, i) =>
        req({ ticks_history: sym, end: "latest", count: tickCount, style: "ticks" })
          .then((h: any) => ({ sym, i, h }))
          .catch((e: any) => ({ sym, i, h: null, err: e }))
      )
    );

    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      const result = historyResults[i];
      opts.onProgress?.({ phase: "scanning", current: i + 1, total: symbols.length, symbol: sym });

      let h: any = null;
      if (result.status === "fulfilled") h = (result as any).value.h;
      if (!h || h?.error || !h?.history?.prices) continue;

      const prices: number[] = h.history.prices;
      const pip = pipFromDeriv(h.history.pip_size, pipSizes[sym] ?? 2);
      const digits = lastDigits(prices, pip);
      const payout: Partial<Record<ScanContractKey, number>> = {};

      await Promise.all(["over1", "under8"].map(async (key) => {
        const spec = SCAN_CONTRACTS[key];
        for (const symKey of ["symbol", "underlying_symbol"]) {
          try {
            const pp: any = await req({
              proposal: 1,
              amount: 10,
              basis: "stake",
              contract_type: spec.contractType,
              currency: "USD",
              duration: 1,
              duration_unit: "t",
              [symKey]: sym,
              barrier: spec.barrier,
            });
            if (pp?.proposal) {
              const pay = Number(pp.proposal.payout);
              const ask = Number(pp.proposal.ask_price);
              if (ask > 0) payout[key] = pay / ask - 1;
              return;
            }
            const code = pp?.error?.code;
            if (code && code !== "InputValidationFailed" && code !== "InvalidInput") return;
          } catch { /* try next symKey */ }
        }
      }));

      markets[sym] = { digits, payout };
    }
    opts.onProgress?.({ phase: "done", current: symbols.length, total: symbols.length });
  } finally {
    try { ws.removeEventListener("message", onMessage); ws.close(); } catch { /* noop */ }
  }
  const { rows, tests } = analyzeScan(markets, 0.05);
  const verdict = buildScanVerdict(rows, tests);
  return { rows, tests, verdict, markets };
}
