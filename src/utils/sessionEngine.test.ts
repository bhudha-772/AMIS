/**
 * DETERMINISTIC TESTS — SESSION & SCALPING INTELLIGENCE ENGINE
 *
 * Validates the DST-correct session detection, overlap identification,
 * scalpability scoring/grading, pair routing, and the "what to look for"
 * playbook that gets injected into the AI prompt.
 *
 * Run directly:  npx tsx src/utils/sessionEngine.test.ts
 */

import {
  getSessionState,
  sessionShortLabel,
  sessionPlaybookForPrompt,
  isScalpableWindow,
  utcOffsetHours,
  SESSION_WINDOWS,
} from "./sessionEngine";

export function runSessionEngineTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const assert = (condition: boolean, msg: string) => {
    if (condition) passed++;
    else {
      failed++;
      errors.push(`Assertion failed: ${msg}`);
      console.error(`❌ [SESSION TEST FAIL] ${msg}`);
    }
  };

  console.log("=== Running Session & Scalping Engine Tests ===");

  // Helper: does `list` contain `item`?
  const has = (list: string[], item: string) => list.includes(item);

  // ── 1. LONDON → NEW YORK OVERLAP (winter, no DST) ──────────────────────
  // 2025-01-15 (Wed) 15:00 UTC. London local 15:00 (open 8-17 ✓),
  // New York local 10:00 EST (open 8-17 ✓). Both open → overlap.
  const ln = getSessionState("EURUSD", new Date("2025-01-15T15:00:00Z"));
  assert(ln.isOverlap, "London-NY overlap detected in winter");
  assert(ln.overlapLabel === "London–New York", `Overlap label is London–New York (got ${ln.overlapLabel})`);
  assert(ln.dominantSession === "LONDON", `Dominant is LONDON by volume (got ${ln.dominantSession})`);
  assert(has(ln.openSessions, "LONDON") && has(ln.openSessions, "NEWYORK"), "Both LONDON and NEWYORK open");
  assert(ln.grade === "A" || ln.grade === "B", `Prime overlap grades A/B (got ${ln.grade}, score ${ln.scalpScore})`);
  assert(ln.scalpScore >= 85, `Prime overlap scores high (got ${ln.scalpScore})`);
  assert(ln.expectedSpreadPips <= 1.0, `Prime overlap has tight spread (got ${ln.expectedSpreadPips})`);
  assert(ln.volatilityMultiplier >= 1.5, `Prime overlap has elevated vol multiplier (got ${ln.volatilityMultiplier})`);
  assert(!ln.isOffHours, "Overlap is not off-hours");
  assert(isScalpableWindow(ln, "EURUSD"), "EURUSD scalpable during London-NY overlap");

  // ── 2. LONDON ONLY (winter) ─────────────────────────────────────────────
  // 2025-01-15 10:00 UTC. London local 10:00 (open ✓). New York local 05:00
  // EST (closed, before 8). Tokyo local 19:00 (closed). Sydney local 21:00
  // AEDT (closed). Only London open → no overlap.
  const lo = getSessionState("GBPUSD", new Date("2025-01-15T10:00:00Z"));
  assert(!lo.isOffHours, "London mid-session is not off-hours");
  assert(lo.dominantSession === "LONDON", `Dominant is LONDON (got ${lo.dominantSession})`);
  assert(!lo.isOverlap, `London-only is not an overlap (got ${lo.overlapLabel})`);
  assert(lo.grade === "A" || lo.grade === "B", `London-only grades A/B (got ${lo.grade})`);
  assert(has(lo.bestPairs, "GBPUSD"), "GBPUSD listed as in-session during London");
  assert(isScalpableWindow(lo, "GBPUSD"), "GBPUSD scalpable during London");

  // ── 3. TOKYO SESSION (winter) ───────────────────────────────────────────
  // 2025-01-15 01:00 UTC. Tokyo local 10:00 JST (open 9-18 ✓).
  // Sydney local 12:00 AEDT (open 8-17 ✓) → Sydney+Tokyo overlap.
  const tk = getSessionState("USDJPY", new Date("2025-01-15T01:00:00Z"));
  assert(!tk.isOffHours, "Tokyo morning is not off-hours");
  assert(tk.dominantSession === "TOKYO" || tk.dominantSession === "SYDNEY",
    `Dominant is a Pacific centre (got ${tk.dominantSession})`);
  assert(has(tk.openSessions, "TOKYO"), "TOKYO open at 01:00 UTC in winter");
  assert(tk.grade !== "F", `Asian session should not be grade F (got ${tk.grade})`);
  assert(isScalpableWindow(tk, "USDJPY"), "USDJPY scalpable during Tokyo");

  // ── 4. OFF-HOURS / DEAD ZONE (weekend) ──────────────────────────────────
  // Saturday — every centre is closed regardless of clock time.
  const wknd = getSessionState("EURUSD", new Date("2025-01-18T12:00:00Z"));
  assert(wknd.isOffHours, "Saturday is off-hours");
  assert(wknd.dominantSession === "OFF", `Weekend dominant is OFF (got ${wknd.dominantSession})`);
  assert(wknd.openSessions.length === 0, "No centres open on Saturday");
  assert(wknd.grade === "F", `Weekend grades F (got ${wknd.grade})`);
  assert(wknd.scalpScore < 40, `Weekend scores low (got ${wknd.scalpScore})`);
  assert(!isScalpableWindow(wknd, "EURUSD"), "EURUSD NOT scalpable on weekend");
  assert(wknd.whatToLookFor.length > 0, "Off-hours still returns guidance (sit on hands)");

  // ── 5. PAIR ROUTING — closed-session pair is avoided ────────────────────
  // During London-only, USDJPY's home centre (Tokyo) is shut and NY is shut,
  // so JPY has no home centre open → should be flagged for caution.
  const jpDuringLondon = getSessionState("USDJPY", new Date("2025-01-15T10:00:00Z"));
  assert(
    !isScalpableWindow(jpDuringLondon, "USDJPY"),
    "USDJPY NOT scalpable when Tokyo (its home centre) is closed"
  );

  // XAUUSD (gold) trades best in London/NY — in-session during London.
  assert(
    isScalpableWindow(lo, "XAUUSD"),
    "XAUUSD scalpable during London (its home centre)"
  );

  // ── 6. DAYLIGHT-SAVING AWARENESS ────────────────────────────────────────
  // New York is EST (UTC-5) in January and EDT (UTC-4) in July. The engine
  // must resolve local hours via Intl so the UTC boundary shifts.
  assert(utcOffsetHours(new Date("2025-01-15T12:00:00Z"), "America/New_York") === -5,
    `NY offset is -5 (EST) in January (got ${utcOffsetHours(new Date("2025-01-15T12:00:00Z"), "America/New_York")})`);
  assert(utcOffsetHours(new Date("2025-07-15T12:00:00Z"), "America/New_York") === -4,
    `NY offset is -4 (EDT) in July (got ${utcOffsetHours(new Date("2025-07-15T12:00:00Z"), "America/New_York")})`);

  // In July (EDT), New York opens at 08:00 EDT = 12:00 UTC (not 13:00 as in
  // winter). At 2025-07-15 13:00 UTC, NY local is 09:00 (open) AND London is
  // open (BST) → still an overlap, but the UTC window has shifted by DST.
  const summerNy = getSessionState("EURUSD", new Date("2025-07-15T13:00:00Z"));
  assert(has(summerNy.openSessions, "NEWYORK"), "NY open at 13:00 UTC in July (EDT)");
  assert(summerNy.isOverlap, "London-NY overlap persists in summer under DST");

  // Verify the same WALL-CLOCK UTC hour differs across DST for NY opening:
  // 12:30 UTC in January = 07:30 EST → NY still CLOSED; in July = 08:30 EDT → OPEN.
  const janNyEdge = getSessionState("EURUSD", new Date("2025-01-15T12:30:00Z"));
  const julNyEdge = getSessionState("EURUSD", new Date("2025-07-15T12:30:00Z"));
  assert(!has(janNyEdge.openSessions, "NEWYORK"), "NY closed at 12:30 UTC in winter (pre-open)");
  assert(has(julNyEdge.openSessions, "NEWYORK"), "NY open at 12:30 UTC in summer (post-DST open)");

  // ── 7. PLAYBOOK & PROMPT HELPERS ────────────────────────────────────────
  const prime = getSessionState("EURUSD", new Date("2025-01-15T15:00:00Z"));
  assert(prime.whatToLookFor.length > 0, "Prime window returns a playbook");
  assert(
    prime.whatToLookFor.some(t => /sweep|pullback|trend/i.test(t)),
    "Prime playbook mentions sweeps/pullbacks/trend"
  );

  const shortLabel = sessionShortLabel(prime);
  assert(/overlap/i.test(shortLabel), `Short label names the overlap (got "${shortLabel}")`);

  const prompt = sessionPlaybookForPrompt(prime, "EURUSD");
  assert(prompt.includes("SCALPING SESSION PLAYBOOK"), "Prompt block has a playbook header");
  assert(prompt.includes("EURUSD"), "Prompt block references the symbol");
  assert(prompt.includes("LONDON"), "Prompt block names the active centre");
  assert(prompt.includes("grade"), "Prompt block includes the scalp grade");
  assert(prompt.includes("home session is OPEN"), "Prompt flags EURUSD home session open");

  // Off-hours prompt should carry a caution, not a green light.
  const offPrompt = sessionPlaybookForPrompt(wknd, "EURUSD");
  assert(offPrompt.includes("off-hours") || offPrompt.includes("NONE"), "Off-hours prompt says no active centre");

  // ── 8. WINDOWS EXPORT SANITY ────────────────────────────────────────────
  assert(SESSION_WINDOWS.length === 4, "Four session windows exported");
  assert(
    SESSION_WINDOWS.every(w => w.timeZone && w.openLocalHour < w.closeLocalHour),
    "Every window has a timezone and a valid local hour range"
  );

  console.log(`=== Session & Scalping Engine Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) console.error("Failures:", errors);
  return { passed, failed, errors };
}

// Auto-run if directly executed via tsx
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("sessionEngine.test")) {
  const res = runSessionEngineTests();
  process.exit(res.failed > 0 ? 1 : 0);
}



