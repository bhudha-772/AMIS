// Permanent Reusable Deriv API v3 Diagnostic CLI Tool
// Run using: npm run deriv:diagnostics
//
// Loads .env so DERIV_APP_ID / DERIV_API_TOKEN / DERIV_SERVER can be configured
// there instead of being exported in the shell. Without this, `npm run
// deriv:diagnostics` silently fell back to app 1089 (Deriv's public test app),
// which cannot authenticate a Personal Access Token.
import "dotenv/config";

// Same App ID as the app (src/config/derivConfig.ts). This is a Node script, so
// it reads process.env rather than Vite's import.meta.env.
// 1089 is Deriv's PUBLIC test app — fine for read-only public data, but it will
// NOT authenticate your Personal Access Token.
const APP_ID = process.env.DERIV_APP_ID || process.env.VITE_DERIV_APP_ID || "";
const DERIV_TOKEN = process.env.DERIV_API_TOKEN || "";
const WS_URL = `wss://${process.env.DERIV_SERVER || "ws.derivws.com"}/websockets/v3?app_id=${APP_ID}`;

console.log("===============================================================");
console.log(`🔬 DERIV PLATFORM DIAGNOSTIC CLI SERVICE [App ID: ${APP_ID}]`);
console.log(`🌐 Server Endpoint: ${WS_URL}`);
console.log(`🔑 Auth Token Configured: ${DERIV_TOKEN ? "YES (Present)" : "NO (Public Sandbox)"}`);
console.log("===============================================================\n");

// Fail loudly rather than connecting with `?app_id=` (which Deriv rejects with a
// confusing error that looks like a token problem).
if (!APP_ID) {
  console.error("No App ID configured. Set DERIV_APP_ID (or VITE_DERIV_APP_ID) in .env.");
  process.exit(1);
}

// The legacy `authorize` message needs a token. Without one this run only proves
// public market data works — it does NOT prove the PAT or its scopes.
if (!DERIV_TOKEN) {
  console.warn("WARNING: no DERIV_API_TOKEN set - the authorize step will be SKIPPED.");
  console.warn("         This run cannot verify your PAT scopes. Add DERIV_API_TOKEN to .env.\n");
}

const ws = new WebSocket(WS_URL);
let step = 0;

const logStep = (title: string) => {
  step++;
  console.log(`\n--- [STEP ${step}] ${title} ---`);
};

ws.onopen = () => {
  console.log("✅ WebSocket Connection Opened Successfully!");

  // Step 1: website_status
  logStep("Querying website_status...");
  ws.send(JSON.stringify({ website_status: 1 }));

  // Step 2: active_symbols brief
  logStep("Querying active_symbols: brief...");
  ws.send(JSON.stringify({ active_symbols: "brief" }));

  // Step 3: contracts_for 1HZ100V
  logStep("Querying contracts_for: 1HZ100V...");
  ws.send(JSON.stringify({ contracts_for: "1HZ100V", currency: "USD" }));

  // Step 4: ticks_history (On-Demand History)
  logStep("Querying ticks_history (50 count)...");
  ws.send(JSON.stringify({ ticks_history: "1HZ100V", count: 50, end: "latest", style: "ticks" }));

  // Step 5: ticks + subscribe: 1 (Live Tick Stream)
  logStep("Subscribing to live ticks stream (1HZ100V)...");
  ws.send(JSON.stringify({ ticks: "1HZ100V", subscribe: 1 }));

  // Step 6: Authorization test (if token configured)
  if (DERIV_TOKEN) {
    logStep("Authenticating user API token...");
    ws.send(JSON.stringify({ authorize: DERIV_TOKEN }));
  }
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const type = data.msg_type;
  
  if (data.error) {
    console.log(`❌ [RESPONSE: ${type}] ERROR (${data.error.code}): ${data.error.message}`);
  } else {
    console.log(`✅ [RESPONSE: ${type}] SUCCESS`);
    switch (type) {
      case "website_status":
        console.log(`   └─ Site Status: ${data.website_status?.site_status}, Terms Version: ${data.website_status?.terms_conditions_version}`);
        break;
      case "active_symbols":
        console.log(`   └─ Total Active Markets Returned: ${data.active_symbols?.length || 0}`);
        break;
      case "contracts_for":
        console.log(`   └─ Available Contract Types: ${data.contracts_for?.available?.length || 0} contracts found.`);
        break;
      case "history":
        console.log(`   └─ Historical Prices Loaded: ${data.history?.prices?.length || 0} ticks. Latest Spot: $${data.history?.prices?.[data.history.prices.length - 1]}`);
        break;
      case "tick":
        console.log(`   └─ LIVE STREAMING TICK: Symbol=${data.tick?.symbol}, Spot=$${data.tick?.quote}, Epoch=${data.tick?.epoch}`);
        break;
      case "authorize":
        console.log(`   └─ AUTH SUCCESS: Account=${data.authorize?.loginid}, Balance=${data.authorize?.balance} ${data.authorize?.currency}`);
        break;
      default:
        console.log(JSON.stringify(data, null, 2).slice(0, 300));
    }
  }
};

ws.onerror = (err: any) => {
  console.error("❌ WebSocket Error Encountered:", err.message || err);
};

ws.onclose = (event) => {
  console.log(`\n🔴 Socket Connection Closed (Code: ${event.code})`);
};

setTimeout(() => {
  console.log("\n===============================================================");
  console.log("🏁 DERIV DIAGNOSTIC SUITE COMPLETE.");
  console.log("===============================================================");
  ws.close();
  process.exit(0);
}, 10000);
