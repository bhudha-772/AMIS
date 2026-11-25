/**
 * AMIS-FX SESSION & SCALPING INTELLIGENCE ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * A pure (dependency-free) module that answers the two questions a scalper
 * asks before every entry:
 *
 *   1. WHICH financial centres are open right now, and is there an overlap?
 *   2. Given that liquidity, is this a GOOD window to scalp THIS pair — and
 *      what specifically should I be looking for?
 *
 * WHY THIS EXISTS
 *   The previous session detection was a UTC-hour `if/else` chain with wrong
 *   boundaries, no overlap detection, no daylight-saving handling and no pair
 *   routing. Research is unambiguous that session liquidity is the single
 *   biggest scalping factor:
 *     • London handles ~38% of global FX volume, New York ~19%, Tokyo ~5%,
 *       Sydney ~4%.
 *     • The London→New York overlap (12:00–16:00 UTC) carries ~50% of daily
 *       volume and the tightest spreads — EUR/USD averages ~0.8 pips there vs
 *       ~2.3 pips through the thin Asian session.
 *     • The wrong session = wide spreads, choppy price action, unreliable
 *       technicals, and stop-hunts of session extremes.
 *
 * DESIGN NOTES
 *   • DST-correct: sessions follow the LOCAL business hours of Sydney, Tokyo,
 *     London and New York. We resolve each centre's local time with
 *     `Intl.DateTimeFormat(..., { timeZone })` and test against business-hour
 *     ranges, so UTC boundaries shift automatically for AEDT/BST/EDT.
 *   • Pure & side-effect free: every function takes an explicit `Date`, so the
 *     engine is deterministic and trivially unit-testable.
 *   • Shared by BOTH the browser bundle (ForexMT5Trader.tsx) and the Node
 *     server (server.ts prompt building) — no node/browser-only APIs.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** The four institutional trading centres (plus OFF for the dead zone). */
export type SessionName = "SYDNEY" | "TOKYO" | "LONDON" | "NEWYORK" | "OFF";

/** Coarse quality grade for a scalping window (A = prime, F = avoid). */
export type ScalpGrade = "A" | "B" | "C" | "D" | "F";

/** Static definition of a session's local business hours. */
export interface SessionWindow {
  name: SessionName;
  /** IANA timezone of the financial centre (DST-aware). */
  timeZone: string;
  /** Local business open, inclusive, 24h. */
  openLocalHour: number;
  /** Local business close, exclusive, 24h. */
  closeLocalHour: number;
  /** Approx share of global daily FX volume (%). */
  volumeSharePct: number;
}

/** Full computed session state for a symbol at an instant in time. */
export interface SessionState {
  dominantSession: SessionName;
  openSessions: SessionName[];
  isOffHours: boolean;
  isOverlap: boolean;
  overlapLabel: string | null;
  scalpScore: number;
  grade: ScalpGrade;
  volatilityMultiplier: number;
  expectedSpreadPips: number;
  behaviour: string;
  bestPairs: string[];
  avoidPairs: string[];
  whatToLookFor: string[];
  isTransition: boolean;
  dominantUtcOffsetHours: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION DEFINITIONS (local business hours per centre)
// ─────────────────────────────────────────────────────────────────────────────
// These local-hour ranges reproduce the widely cited UTC windows when DST is
// applied: Sydney 08–17 local ≈ 22:00–07:00 UTC; Tokyo 09–18 ≈ 00:00–09:00;
// London 08–17 ≈ 07:00–16:00; New York 08–17 ≈ 12:00–21:00.
export const SESSION_WINDOWS: SessionWindow[] = [
  { name: "SYDNEY",  timeZone: "Australia/Sydney", openLocalHour: 8, closeLocalHour: 17, volumeSharePct: 4 },
  { name: "TOKYO",   timeZone: "Asia/Tokyo",       openLocalHour: 9, closeLocalHour: 18, volumeSharePct: 5 },
  { name: "LONDON",  timeZone: "Europe/London",    openLocalHour: 8, closeLocalHour: 17, volumeSharePct: 38 },
  { name: "NEWYORK", timeZone: "America/New_York", openLocalHour: 8, closeLocalHour: 17, volumeSharePct: 19 },
];

// ─────────────────────────────────────────────────────────────────────────────
// PAIR ROUTING — which currencies belong to which centre
// ─────────────────────────────────────────────────────────────────────────────
// A pair is "in session" when at least one of its constituent currencies has
// its home centre open. (EURUSD needs London OR New York; USDJPY needs Tokyo
// OR London OR New York.)
const CENTRE_CURRENCIES: Record<SessionName, string[]> = {
  SYDNEY: ["AUD", "NZD"],
  TOKYO: ["JPY"],
  LONDON: ["EUR", "GBP", "CHF"],
  NEWYORK: ["USD", "CAD"],
  OFF: [],
};

/** Canonical scalping pairs grouped by the centre that trades them best. */
export const SESSION_PAIRS: Record<SessionName, string[]> = {
  SYDNEY: ["AUDUSD", "NZDUSD", "AUDNZD", "AUDJPY"],
  TOKYO: ["USDJPY", "EURJPY", "GBPJPY", "AUDJPY", "NZDJPY"],
  LONDON: ["EURUSD", "GBPUSD", "EURGBP", "GBPJPY", "EURJPY", "XAUUSD"],
  NEWYORK: ["EURUSD", "GBPUSD", "USDCAD", "USDCHF", "XAUUSD", "US30"],
  OFF: [],
};

/** Recognised high-liquidity overlaps (centre pairs) and their labels. */
const OVERLAPS: { a: SessionName; b: SessionName; label: string }[] = [
  { a: "LONDON", b: "NEWYORK", label: "London–New York" },
  { a: "TOKYO",  b: "LONDON",  label: "Tokyo–London" },
  { a: "SYDNEY", b: "TOKYO",   label: "Sydney–Tokyo" },
];

// ─────────────────────────────────────────────────────────────────────────────
// TIME HELPERS (DST-aware via Intl)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the LOCAL hour (0-23) in the given IANA timezone at `date`. */
function localHourIn(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" });
  const part = fmt.formatToParts(date).find(p => p.type === "hour");
  return part ? parseInt(part.value, 10) : 0;
}

/** Returns the LOCAL weekday (0=Sun..6=Sat) in the given timezone. */
function localWeekdayIn(date: Date, timeZone: string): number {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short" }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[day] ?? 0;
}

/** UTC offset (in hours) of a timezone at `date` (DST-adjusted). */
export function utcOffsetHours(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 3_600_000;
}

/** True when the centre is inside business hours on `date`. */
function isCentreOpen(date: Date, w: SessionWindow): boolean {
  const wd = localWeekdayIn(date, w.timeZone);
  if (wd === 0 || wd === 6) return false; // weekends shut
  const h = localHourIn(date, w.timeZone);
  return h >= w.openLocalHour && h < w.closeLocalHour;
}

/** Distance (in hours) from the nearest session open/close boundary. */
function hoursToNearestBoundary(date: Date, w: SessionWindow): number {
  const h = localHourIn(date, w.timeZone);
  return Math.min(Math.abs(h - w.openLocalHour), Math.abs(h - w.closeLocalHour));
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE / NORMALISATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function gradeFor(score: number): ScalpGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Base scalping quality (0-100) for each centre when it trades ALONE.
 * These are NOT raw volume shares — they reflect how scalpable each session
 * actually is: London and New York are prime (tight spreads, deep book, real
 * flow), Tokyo is a solid C (range-bound but tradeable on JPY), Sydney is the
 * thinnest of the four. Off-hours is floored low so it can never grade well.
 * Raw volume-share normalisation was rejected because it undervalues NY (~19%)
 * and Tokyo (~5%) into D/F, which would wrongly veto legitimate sessions.
 */
const SESSION_SCALP_BASE: Record<SessionName, number> = {
  LONDON: 80,
  NEWYORK: 75,
  TOKYO: 62,
  SYDNEY: 55,
  OFF: 18,
};

/**
 * Composite scalping score (0–100): the best open centre's base quality,
 * plus an overlap premium (the London→NY overlap is materially better than
 * either alone), minus a transition penalty for sitting on a session boundary.
 */
function computeScore(
  open: SessionName[],
  isOverlap: boolean,
  overlapLabel: string | null,
  isTransition: boolean
): number {
  if (open.length === 0) return SESSION_SCALP_BASE.OFF; // dead zone — never scalp
  let score = Math.max(...open.map(n => SESSION_SCALP_BASE[n] ?? 40));
  if (isOverlap && overlapLabel === "London–New York") score += 14;
  else if (isOverlap) score += 8;
  if (isTransition) score -= 12;
  return Math.max(10, Math.min(100, Math.round(score)));
}


/** Strip broker suffix / case so "EURUSDm" === "EURUSD". */
function normalize(symbol: string): string {
  const s = String(symbol || "").trim().toUpperCase();
  return s.endsWith("M") && /(USD|JPY|GBP|EUR|AUD|NZD|CAD|CHF|XAU|XAG)M$/.test(s)
    ? s.slice(0, -1)
    : s;
}

/** True if `symbol` contains any of the given currency legs. */
function matchesCurrencies(symbol: string, currencies: string[]): boolean {
  if (!symbol) return false;
  return currencies.some(c => symbol.includes(c));
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the full session/scalping state for a symbol at an instant.
 * @param symbol Trading symbol (e.g. "EURUSD", "EURUSDm", "XAUUSD").
 * @param at     Instant to evaluate (defaults to now). Pass explicit dates
 *               in tests for determinism.
 */
export function getSessionState(symbol?: string, at: Date = new Date()): SessionState {
  const windows = SESSION_WINDOWS;
  const open = windows.filter(w => isCentreOpen(at, w)).map(w => w.name);

  // Dominant = open centre with the largest volume share.
  let dominant: SessionName = "OFF";
  if (open.length > 0) {
    const vol = (s: SessionName) => SESSION_WINDOWS.find(w => w.name === s)?.volumeSharePct ?? 0;
    dominant = open.reduce((best, n) => (vol(n) > vol(best) ? n : best), open[0]);
  }
  const isOffHours = open.length === 0;

  // Overlap: at least two centres open AND they form a known pair.
  let isOverlap = false;
  let overlapLabel: string | null = null;
  if (open.length >= 2) {
    for (const o of OVERLAPS) {
      if (open.includes(o.a) && open.includes(o.b)) {
        isOverlap = true;
        overlapLabel = o.label;
        break;
      }
    }
    if (!overlapLabel) {
      isOverlap = true;
      overlapLabel = open.join("–");
    }
  }

  // Transition: any open centre within ±1h of its open/close boundary.
  const isTransition = open.some(n => {
    const w = windows.find(x => x.name === n)!;
    return hoursToNearestBoundary(at, w) <= 1;
  });

  const scalpScore = computeScore(open, isOverlap, overlapLabel, isTransition);
  const grade = gradeFor(scalpScore);

  // Volatility multiplier: overlaps and the big western centres pump range;
  // the thin Asian/Sydney windows compress it.
  let volatilityMultiplier = 1.0;
  if (overlapLabel === "London–New York") volatilityMultiplier = 1.7;
  else if (isOverlap) volatilityMultiplier = 1.4;
  else if (dominant === "LONDON" || dominant === "NEWYORK") volatilityMultiplier = 1.35;
  else if (dominant === "TOKYO") volatilityMultiplier = 0.85;
  else if (dominant === "SYDNEY") volatilityMultiplier = 0.7;
  if (isTransition) volatilityMultiplier *= 1.15;

  const expectedSpreadPips =
    overlapLabel === "London–New York" ? 0.8
    : isOverlap ? 1.1
    : dominant === "LONDON" || dominant === "NEWYORK" ? 1.3
    : dominant === "TOKYO" ? 1.8
    : dominant === "SYDNEY" ? 2.1
    : 3.0; // off-hours

  const sym = normalize(symbol ?? "");
  const bestPairs = pairsForOpenSessions(open, sym);
  const avoidPairs = pairsForClosedCentres(open, sym);
  const behaviour = behaviourFor(dominant, isOverlap, overlapLabel, isOffHours);
  const whatToLookFor = playbookFor(dominant, isOverlap, overlapLabel, isOffHours, isTransition);

  const dominantWindow = windows.find(w => w.name === dominant);
  const dominantUtcOffsetHours = dominantWindow ? utcOffsetHours(at, dominantWindow.timeZone) : 0;

  return {
    dominantSession: dominant,
    openSessions: open,
    isOffHours,
    isOverlap,
    overlapLabel,
    scalpScore,
    grade,
    volatilityMultiplier,
    expectedSpreadPips,
    behaviour,
    bestPairs,
    avoidPairs,
    whatToLookFor,
    isTransition,
    dominantUtcOffsetHours,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAIR ROUTING
// ─────────────────────────────────────────────────────────────────────────────

/** Pairs that belong to a centre currently open (plus the requested symbol). */
function pairsForOpenSessions(open: SessionName[], symbol: string): string[] {
  const out = new Set<string>();
  for (const n of open) {
    for (const p of SESSION_PAIRS[n] ?? []) out.add(p);
  }
  if (symbol && matchesCurrencies(symbol, open.flatMap(n => CENTRE_CURRENCIES[n] ?? []))) {
    out.add(symbol);
  }
  return [...out];
}

/** Pairs whose home centre is CLOSED (thin — avoid scalping). */
function pairsForClosedCentres(open: SessionName[], symbol: string): string[] {
  const closed = (Object.keys(SESSION_PAIRS) as SessionName[])
    .filter(n => n !== "OFF" && !open.includes(n));
  const openLegs = open.flatMap(n => CENTRE_CURRENCIES[n] ?? []);
  const out = new Set<string>();
  for (const n of closed) {
    for (const p of SESSION_PAIRS[n] ?? []) {
      if (!matchesCurrencies(p, openLegs)) out.add(p);
    }
  }
  if (symbol && !matchesCurrencies(symbol, openLegs)) out.add(symbol);
  return [...out];
}

/** One-line behavioural summary. */
function behaviourFor(
  dominant: SessionName,
  isOverlap: boolean,
  overlapLabel: string | null,
  isOffHours: boolean
): string {
  if (isOffHours) {
    return "OFF-HOURS — markets shut or illiquid. Spreads blow out and price action is unreliable. Do not scalp.";
  }
  if (overlapLabel === "London–New York") {
    return "PRIME — London/New York overlap. ~50% of daily volume, tightest spreads, strongest directional flow. Best scalping window of the day.";
  }
  if (isOverlap) {
    return `Active overlap (${overlapLabel}) — elevated liquidity and expanding ranges as two centres hand over.`;
  }
  switch (dominant) {
    case "LONDON":
      return "London — ~38% of global volume. Tight spreads, breakout-friendly, EUR/GBP in play.";
    case "NEWYORK":
      return "New York — US flow and news drive USD pairs; London trend continuation or reversal at the open.";
    case "TOKYO":
      return "Tokyo — steady range/mean-reversion on JPY pairs; watch for an Asian-range sweep ahead of London.";
    case "SYDNEY":
      return "Sydney — quiet, low-volatility channels on AUD/NZD; favour range fades over breakouts.";
    default:
      return "Market in standard liquidity conditions.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAYBOOK — concrete things to look for in each window
// ─────────────────────────────────────────────────────────────────────────────

function playbookFor(
  dominant: SessionName,
  isOverlap: boolean,
  overlapLabel: string | null,
  isOffHours: boolean,
  isTransition: boolean
): string[] {
  if (isOffHours) {
    return [
      "No institutional flow — sit on hands.",
      "If you must watch, only note the prior session's high/low as liquidity for the next open.",
      "Spreads are wide; any signal here is noise, not edge.",
    ];
  }

  const base: string[] = [];

  if (overlapLabel === "London–New York") {
    base.push(
      "Prime scalp window: tightest spreads (~0.8p EUR/USD) and deepest book — trade pullbacks in the direction of the dominant trend.",
      "US data (CPI, NFP, FOMC) lands here: expect a liquidity sweep both ways, then continuation — don't front-run the first spike.",
      "Watch for the London high/low to be taken out on NY acceleration — that sweep is the continuation signal.",
      "Target 5–15 pips with a hard stop; momentum resolves 1:1.5+ RR quickly."
    );
  } else if (isOverlap) {
    base.push(
      `Overlap (${overlapLabel}): liquidity expanding as centres hand over — favour the stronger leg of the pair.`,
      "Session-boundary sweeps are common: let the first 5–15 minutes resolve before committing.",
      "Tighten your stop — transition volatility is elevated but less directional."
    );
  } else if (dominant === "LONDON") {
    base.push(
      "London open killzone: look for a sweep of the Asian range high/low, then reversal/continuation in the sweep direction.",
      "EUR/USD & GBP/USD: tightest spreads of the handover — breakout of the overnight range is the classic setup.",
      "UK/EU red-folder news can gap the tape — size down or stand aside on the print.",
      "Favour breakout/continuation scalps over fading the London trend."
    );
  } else if (dominant === "NEWYORK") {
    base.push(
      "New York session: trade USD pairs and gold; London trend often continues or reverses at the NY open.",
      "US data releases (12:30–14:30 UTC typical) spike liquidity — wait for the initial sweep, trade the retest.",
      "If London set a clear range, NY frequently provides the expansion leg — trade the break with a retest entry."
    );
  } else if (dominant === "TOKYO") {
    base.push(
      "Tokyo/Asian range: JPY pairs drift in a channel — fade the range extremes rather than chasing breakouts.",
      "Watch the Asian session high/low: a sweep into the London open is the day's highest-probability liquidity event.",
      "Lower volatility — use tighter targets and respect the range until London changes character."
    );
  } else if (dominant === "SYDNEY") {
    base.push(
      "Sydney session: quiet AUD/NZD channels — mean-reversion/fade setups, avoid breakout trades.",
      "Low liquidity = wider effective spreads; only A-grade levels are worth an entry.",
      "Sets the Asian range that Tokyo extends and London later sweeps."
    );
  }

  if (isTransition) {
    base.push(
      "TRANSITION (±1h of a session boundary): liquidity arriving/leaving — expect stop-hunts of the recent high/low. Widen the stop or wait for confirmation."
    );
  }

  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT / DISPLAY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Compact one-liner for logs & telemetry, e.g. "London–New York overlap (A, 92)". */
export function sessionShortLabel(s: SessionState): string {
  if (s.isOffHours) return `OFF-HOURS (grade F, ${s.scalpScore})`;
  const core = s.isOverlap && s.overlapLabel ? `${s.overlapLabel} overlap` : s.dominantSession;
  return `${core} — grade ${s.grade}, scalp ${s.scalpScore}/100`;
}

/**
 * Rich, model-friendly markdown block describing the session for the AI prompt.
 * It tells the model which centre is open, the overlap quality, the pair's
 * home session, and the concrete setups the window favours — so `shouldTrade`
 * decisions are grounded in liquidity instead of raw candles alone.
 */
export function sessionPlaybookForPrompt(s: SessionState, symbol?: string): string {
  const lines: string[] = [];
  lines.push(`## SCALPING SESSION PLAYBOOK${symbol ? ` (${symbol})` : ""}`);
  lines.push(
    `- Active centre(s): ${s.isOffHours ? "NONE (off-hours)" : s.openSessions.join(" + ")} | Dominant: ${s.dominantSession}`
  );
  lines.push(
    `- Overlap: ${s.isOverlap ? (s.overlapLabel ?? "yes") : "none"} | Scalp grade: ${s.grade} (${s.scalpScore}/100) | Expected spread: ${s.expectedSpreadPips.toFixed(1)} pips`
  );
  lines.push(`- Liquidity behaviour: ${s.behaviour}`);
  if (symbol) {
    const sym = normalize(symbol);
    const inSession = matchesCurrencies(sym, s.openSessions.flatMap(n => CENTRE_CURRENCIES[n] ?? []));
    lines.push(
      inSession
        ? `- ${symbol} home session is OPEN — spreads tight, flow credible.`
        : `- ⚠️ ${symbol} home session is CLOSED — thin/wide, treat any signal with suspicion.`
    );
  }
  if (s.whatToLookFor.length > 0) {
    lines.push("- What this window favours:");
    for (const w of s.whatToLookFor) lines.push(`  • ${w}`);
  }
  return lines.join("\n");
}

/**
 * Is this a window where scalping THIS pair is advisable? Used by the trader
 * as an objective gate: pair-in-session + minimum scalp score.
 *
 * "In session" is satisfied EITHER by a constituent currency's home centre
 * being open (EURUSD during London) OR by the symbol being a canonical pair
 * of an open centre (XAUUSD / US30 — instruments that don't decompose into
 * simple currency legs but are definitionally traded by that centre).
 */
export function isScalpableWindow(s: SessionState, symbol: string, minScore: number = 55): boolean {
  if (s.isOffHours) return false;
  if (s.scalpScore < minScore) return false;
  const sym = normalize(symbol);
  if (!sym) return false;
  // Canonical pair membership for any open centre.
  for (const n of s.openSessions) {
    if ((SESSION_PAIRS[n] ?? []).map(normalize).includes(sym)) return true;
  }
  // Otherwise fall back to constituent-currency matching.
  const legs = s.openSessions.flatMap(n => CENTRE_CURRENCIES[n] ?? []);
  return matchesCurrencies(sym, legs);
}







