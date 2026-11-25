// Deriv API endpoint research — protocol behavior comparison (uses INVALID token, safe)
const ENDPOINTS = [
  { name: "NEW Options WS (used by app)", url: "wss://api.derivws.com/trading/v1/options/ws/public" },
  { name: "CLASSIC WS API (official docs)", url: "wss://ws.derivws.com/websockets/v3?app_id=1089" }
];

function testEndpoint(ep) {
  return new Promise((resolve) => {
    const log = [];
    let ws;
    try {
      ws = new WebSocket(ep.url);
    } catch (e) {
      resolve(`[${ep.name}] CONNECTION THREW: ${e.message}`);
      return;
    }
    const timer = setTimeout(() => {
      log.push("TIMEOUT after 12s");
      try { ws.close(); } catch { }
      resolve(`[${ep.name}]\n` + log.join("\n"));
    }, 12000);

    ws.onopen = () => {
      log.push(`OPEN ok (${ep.url})`);
      ws.send(JSON.stringify({ ping: 1 }));
      ws.send(JSON.stringify({ authorize: "INVALID_TOKEN_FOR_RESEARCH_x9" }));
      setTimeout(() => { try { ws.send(JSON.stringify({ ticks: "R_100", subscribe: 1 })); } catch { } }, 800);
    };
    ws.onmessage = (ev) => {
      let d; try { d = JSON.parse(ev.data); } catch { log.push(`RAW: ${String(ev.data).slice(0, 140)}`); return; }
      const keys = Object.keys(d).join(",");
      const brief = JSON.stringify(d).slice(0, 220);
      log.push(`MSG [${d.msg_type || keys}]: ${brief}`);
      if (d.req_id === 3) { clearTimeout(timer); try { ws.close(); } catch { } resolve(`[${ep.name}]\n` + log.join("\n")); }
    };
    ws.onerror = () => log.push("ONERROR (connection-level failure)");
    ws.onclose = (ev) => {
      log.push(`CLOSED code=${ev.code} reason="${ev.reason || ""}"`);
      clearTimeout(timer);
      resolve(`[${ep.name}]\n` + log.join("\n"));
    };
  });
}

for (const ep of ENDPOINTS) {
  console.log(await testEndpoint(ep));
  console.log("");
}