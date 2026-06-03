"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const API_KEY = process.env.NEXT_PUBLIC_GOLDRUSH_API_KEY || "cqt_rQkr97wwfh8PR7Qbx4CxyCjRtr6g";
const WS_URL = "wss://streaming.goldrushdata.com/graphql";

const MARKETS = [
  { symbol: "OPENAI",    deployer: "vntl", label: "OpenAI",         cat: "Pre-IPO",    sector: "AI" },
  { symbol: "SPACEX",    deployer: "vntl", label: "SpaceX",         cat: "Pre-IPO",    sector: "Aero" },
  { symbol: "ANTHROPIC", deployer: "vntl", label: "Anthropic",      cat: "Pre-IPO",    sector: "AI" },
  { symbol: "CRCL",      deployer: "xyz",  label: "Circle",         cat: "Pre-IPO",    sector: "Crypto" },
  { symbol: "CRWV",      deployer: "xyz",  label: "CoreWeave",      cat: "Pre-IPO",    sector: "Cloud" },
  { symbol: "MAG7",      deployer: "vntl", label: "Mag 7",          cat: "Baskets",    sector: "Tech" },
  { symbol: "SEMIS",     deployer: "vntl", label: "Semiconductors", cat: "Baskets",    sector: "Tech" },
  { symbol: "DEFENSE",   deployer: "vntl", label: "Defense",        cat: "Baskets",    sector: "Defense" },
  { symbol: "BIOTECH",   deployer: "vntl", label: "Biotech",        cat: "Baskets",    sector: "Health" },
  { symbol: "NVDA",      deployer: "xyz",  label: "NVIDIA",         cat: "Equities",   sector: "Tech" },
  { symbol: "TSLA",      deployer: "xyz",  label: "Tesla",          cat: "Equities",   sector: "Auto" },
  { symbol: "AAPL",      deployer: "xyz",  label: "Apple",          cat: "Equities",   sector: "Tech" },
  { symbol: "GOOGL",     deployer: "xyz",  label: "Alphabet",       cat: "Equities",   sector: "Tech" },
  { symbol: "META",      deployer: "xyz",  label: "Meta",           cat: "Equities",   sector: "Tech" },
  { symbol: "SP500",     deployer: "xyz",  label: "S&P 500",        cat: "Indices",    sector: "Index" },
  { symbol: "GOLD",      deployer: "xyz",  label: "Gold",           cat: "Commodities",sector: "Commodity" },
];

const PAIR = m => `${m.deployer}:${m.symbol}`;

const SEED = { OPENAI:1350,SPACEX:2199,ANTHROPIC:1746,CRCL:108,CRWV:118,MAG7:69,SEMIS:627,DEFENSE:66,BIOTECH:138,NVDA:218,TSLA:408,AAPL:304,GOOGL:353,META:561,SP500:7600,GOLD:2329 };
const CATS = ["All","Pre-IPO","Baskets","Equities","Indices","Commodities"];
const INTERVALS = ["1s","1m","5m","1h","1D"];
const LOOKBACKS = ["15m","1h","4h","1D","7D"];
const SECT_COL = { AI:"#a78bfa",Aero:"#60a5fa",Crypto:"#f59e0b",Cloud:"#34d399",Tech:"#38bdf8",Defense:"#fb923c",Health:"#f472b6",Auto:"#4ade80",Index:"#a78bfa",Commodity:"#fbbf24" };

const FIELD_SETS = [
  "t o h l c v",
  "timestamp open high low close volume",
  "t open high low close volume",
  "timestamp open high low close volume_quote",
  "dt open high low close volume_quote",
];

function seedCandles(sym, n = 90) {
  let p = SEED[sym] || 50;
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const d = (Math.random() - 0.49) * p * 0.016;
    const o = p; p = Math.max(0.01, p + d); const c = p;
    return { o, h: Math.max(o, c) * (1 + Math.random() * 0.007), l: Math.min(o, c) * (1 - Math.random() * 0.007), c, v: 60000 + Math.random() * 400000, ts: now - (n - i) * 60000 };
  });
}

const fmt = (n, d = 2) => typeof n === "number" && isFinite(n) ? n.toFixed(d) : "--";
const fmtVol = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n?.toFixed(0) || "--";

function parseTs(v) {
  if (v == null) return Date.now();
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  const n = Number(v);
  if (isFinite(n)) return n > 1e12 ? n : n * 1000;
  const p = Date.parse(v);
  return isFinite(p) ? p : Date.now();
}

function drawChart(canvas, data) {
  if (!canvas || !data || data.length < 2) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  const UP = "#22c55e", DN = "#ef4444", GR = "rgba(255,255,255,0.04)", TX = "#4b5563";
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, W, H);
  const pad = { t: 12, r: 64, b: 30, l: 6 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b - 48, vH = 40;
  const disp = data.slice(-70);
  const n = disp.length;
  const ps = disp.flatMap(c => [c.h, c.l]);
  const mn = Math.min(...ps), mx = Math.max(...ps), rng = mx - mn || 1, pd = rng * 0.08;
  const toY = p => pad.t + ch - ((p - (mn - pd)) / (rng + 2 * pd)) * ch;
  const bw = Math.max(2, cw / n - 1.2);
  const toX = i => pad.l + (i + 0.5) * (cw / n);
  const maxV = Math.max(...disp.map(c => c.v), 1);
  ctx.strokeStyle = GR; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (ch / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillStyle = TX; ctx.font = "9px monospace"; ctx.textAlign = "right";
    ctx.fillText(fmt(mx + pd - (i / 4) * (rng + 2 * pd)), W - 3, y + 3);
  }
  disp.forEach((c, i) => {
    const x = toX(i), vh = (c.v / maxV) * vH;
    ctx.fillStyle = c.c >= c.o ? `${UP}28` : `${DN}28`;
    ctx.fillRect(x - bw / 2, H - pad.b - vH + 8 + vH - vh, bw, vh);
  });
  ctx.strokeStyle = GR; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(pad.l, H - pad.b - vH + 6); ctx.lineTo(W - pad.r, H - pad.b - vH + 6); ctx.stroke();
  disp.forEach((c, i) => {
    const x = toX(i), up = c.c >= c.o, col = up ? UP : DN;
    const hY = toY(c.h), lY = toY(c.l), oY = toY(c.o), cY = toY(c.c);
    const bT = Math.min(oY, cY), bH = Math.max(1, Math.abs(cY - oY));
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(x - bw / 2, bT, bw, bH);
  });
  const last = disp[disp.length - 1];
  const lY = toY(last.c), lc = last.c >= last.o ? UP : DN;
  ctx.strokeStyle = lc; ctx.lineWidth = 0.7; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(pad.l, lY); ctx.lineTo(W - pad.r, lY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = lc; ctx.beginPath(); ctx.roundRect(W - pad.r + 2, lY - 8, 61, 16, 3); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
  ctx.fillText(fmt(last.c), W - pad.r + 32, lY + 4);
  ctx.fillStyle = TX; ctx.font = "9px monospace"; ctx.textAlign = "center";
  const step = Math.ceil(n / 6);
  disp.forEach((c, i) => {
    if (i % step === 0) {
      const dt = new Date(c.ts);
      ctx.fillText(`${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`, toX(i), H - 6);
    }
  });
}

export default function Dashboard() {
  const [cat, setCat] = useState("All");
  const [sel, setSel] = useState(MARKETS[0]);
  const [interval, setIntervalVal] = useState("1m");
  const [lookback, setLookback] = useState("1h");
  const [cmap, setCmap] = useState(() => {
    const m = {}; MARKETS.forEach(mk => { m[mk.symbol] = seedCandles(mk.symbol); }); return m;
  });
  const [live, setLive] = useState({});
  const [status, setStatus] = useState("connecting");
  const [debug, setDebug] = useState("starting up");
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const liveRef = useRef(false);
  const candidateRef = useRef(0);
  const gotRef = useRef(0);
  const cycleTimerRef = useRef(null);

  useEffect(() => {
    const iv = setInterval(() => {
      if (liveRef.current) return;
      setCmap(prev => {
        const nxt = { ...prev };
        MARKETS.forEach(mk => {
          const arr = nxt[mk.symbol];
          if (!arr?.length) return;
          const last = arr[arr.length - 1];
          const d = (Math.random() - 0.49) * last.c * 0.003;
          const nc = { ...last, c: Math.max(0.01, last.c + d) };
          nc.h = Math.max(nc.h, nc.c); nc.l = Math.min(nc.l, nc.c);
          const ts = Date.now();
          if (ts - last.ts > 60000) {
            nxt[mk.symbol] = [...arr.slice(-99), { o: last.c, h: nc.c, l: nc.c, c: nc.c, v: 50000 + Math.random() * 300000, ts }];
          } else {
            nxt[mk.symbol] = [...arr.slice(0, -1), nc];
          }
        });
        return nxt;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const s = {};
    MARKETS.forEach(mk => {
      const arr = cmap[mk.symbol] || [];
      if (arr.length < 2) return;
      const last = arr[arr.length - 1];
      const o0 = arr[Math.max(0, arr.length - 60)].o;
      s[mk.symbol] = {
        price: last.c,
        pct: ((last.c - o0) / o0) * 100,
        high: Math.max(...arr.slice(-60).map(c => c.h)),
        low: Math.min(...arr.slice(-60).map(c => c.l)),
        vol: arr.slice(-60).reduce((a, c) => a + c.v, 0),
        open: last.o, close: last.c,
      };
    });
    setLive(s);
  }, [cmap]);

  useEffect(() => { drawChart(canvasRef.current, cmap[sel.symbol]); }, [cmap, sel]);

  function applyCandle(sym, raw) {
    if (!sym || !MARKETS.find(m => m.symbol === sym)) return;
    const c = +(raw.c ?? raw.close);
    if (!isFinite(c) || c <= 0) return;
    const o = +(raw.o ?? raw.open ?? c);
    const h = +(raw.h ?? raw.high ?? c);
    const l = +(raw.l ?? raw.low ?? c);
    const v = +(raw.v ?? raw.volume ?? raw.volume_quote ?? 0);
    const ts = parseTs(raw.t ?? raw.timestamp ?? raw.dt);
    if (!liveRef.current) { liveRef.current = true; setStatus("connected"); }
    gotRef.current += 1;
    setDebug(`LIVE - ${gotRef.current} candles received (field set #${candidateRef.current + 1})`);
    setCmap(prev => {
      const arr = prev[sym] ? [...prev[sym]] : [];
      const li = arr.length - 1;
      const candle = { o, h, l, c, v, ts };
      if (li >= 0 && Math.abs(arr[li].ts - ts) < 30000) arr[li] = candle;
      else arr.push(candle);
      return { ...prev, [sym]: arr.slice(-120) };
    });
  }

  const subscribeAll = useCallback((ws) => {
    const fields = FIELD_SETS[candidateRef.current] || FIELD_SETS[0];
    MARKETS.forEach(mk => {
      const q = `subscription{ohlcvCandlesForPair(chain_name:HYPERCORE_MAINNET pair_addresses:["${PAIR(mk)}"] interval:ONE_MINUTE timeframe:ONE_HOUR){${fields}}}`;
      ws.send(JSON.stringify({ id: `ohlcv-${mk.symbol}`, type: "subscribe", payload: { query: q } }));
    });
    setDebug(`trying field set #${candidateRef.current + 1}: { ${fields} }`);
    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    cycleTimerRef.current = setTimeout(() => {
      if (gotRef.current === 0 && candidateRef.current < FIELD_SETS.length - 1 && ws.readyState === 1) {
        MARKETS.forEach(mk => ws.send(JSON.stringify({ id: `ohlcv-${mk.symbol}`, type: "complete" })));
        candidateRef.current += 1;
        subscribeAll(ws);
      } else if (gotRef.current === 0 && candidateRef.current >= FIELD_SETS.length - 1) {
        setStatus("demo");
        setDebug("no live candles from any field set - using demo");
      }
    }, 3500);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
    liveRef.current = false;
    candidateRef.current = 0;
    gotRef.current = 0;
    setStatus("connecting");
    setDebug("opening websocket...");
    const failTimer = setTimeout(() => { if (!liveRef.current) { setStatus("demo"); } }, 20000);
    try {
      const ws = new WebSocket(WS_URL, ["graphql-transport-ws"]);
      wsRef.current = ws;
      ws.onopen = () => {
        setDebug("connected - authenticating");
        ws.send(JSON.stringify({ type: "connection_init", payload: { GOLDRUSH_API_KEY: API_KEY } }));
      };
      ws.onmessage = e => {
        let msg; try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === "ping") { ws.send(JSON.stringify({ type: "pong" })); return; }
        if (msg.type === "connection_ack") { setDebug("authenticated - subscribing"); subscribeAll(ws); }
        if (msg.type === "next") {
          const sym = (msg.id || "").replace("ohlcv-", "");
          const raw = msg.payload?.data?.ohlcvCandlesForPair;
          if (!raw) return;
          clearTimeout(failTimer);
          (Array.isArray(raw) ? raw : [raw]).filter(Boolean).forEach(c => applyCandle(sym, c));
        }
        if (msg.type === "error") {
          const m = JSON.stringify(msg.payload || msg);
          setDebug(`field set #${candidateRef.current + 1} rejected: ${m.slice(0, 100)}`);
          if (gotRef.current === 0 && candidateRef.current < FIELD_SETS.length - 1) {
            candidateRef.current += 1;
            subscribeAll(ws);
          }
        }
      };
      ws.onerror = () => setDebug("websocket error");
      ws.onclose = (ev) => {
        clearTimeout(failTimer);
        if (!liveRef.current) { setStatus("demo"); setDebug(`socket closed (code ${ev.code}) - using demo`); }
      };
    } catch (err) {
      setStatus("demo");
      setDebug("connect threw: " + err.message);
    }
  }, [subscribeAll]);

  useEffect(() => {
    connect();
    return () => { if (wsRef.current) try { wsRef.current.close(); } catch {} };
  }, [connect]);

  const filtered = cat === "All" ? MARKETS : MARKETS.filter(m => m.cat === cat);
  const sl = live[sel.symbol] || {};
  const up = (sl.pct || 0) >= 0;
  const statusMeta = {
    connected: { dot: "#22c55e", txt: "LIVE" },
    connecting: { dot: "#f59e0b", txt: "CONNECTING" },
    demo: { dot: "#6b7280", txt: "DEMO" },
  }[status];

  const heatData = ["Pre-IPO", "Baskets", "Equities", "Indices", "Commodities"].map(c => {
    const ms = MARKETS.filter(m => m.cat === c);
    const avg = ms.reduce((a, m) => a + (live[m.symbol]?.pct || 0), 0) / ms.length;
    return { label: c, avg };
  });

  return (
    <div style={{ fontFamily: "system-ui,sans-serif", background: "#0d1117", color: "#e6edf3", display: "flex", flexDirection: "column", height: "100svh", overflow: "hidden", fontSize: 13 }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
        .mr { cursor: pointer; transition: background .1s; }
        .mr:hover { background: rgba(255,255,255,.04); }
        .mr.act { background: rgba(255,255,255,.06); border-left: 2px solid #3b82f6; }
        .pill { cursor: pointer; padding: 3px 11px; border-radius: 20px; font-size: 11px; border: 0.5px solid #30363d; color: #8b949e; background: transparent; }
        .pill:hover { border-color: #484f58; color: #e6edf3; }
        .pill.on { background: #21262d; border-color: #484f58; color: #e6edf3; }
        .seg { cursor: pointer; padding: 2px 8px; border-radius: 4px; font-size: 10px; color: #6e7681; transition: all .12s; }
        .seg:hover { color: #c9d1d9; background: #21262d; }
        .seg.on { background: #21262d; color: #e6edf3; }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>

      <header style={{ background: "#161b22", borderBottom: "0.5px solid #30363d", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#e6edf3" }}>
            &#9670; PRE-IPO<span style={{ fontWeight: 400, color: "#6e7681" }}> Dashboard</span>
            <span style={{ color: "#a78bfa", fontSize: 11, marginLeft: 6 }}>HIP-3</span>
          </span>
          <span style={{ fontSize: 10, color: "#484f58", borderLeft: "0.5px solid #30363d", paddingLeft: 12 }}>
            HyperCore Mainnet &middot; {MARKETS.length} markets
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusMeta.dot, boxShadow: status === "connected" ? `0 0 5px ${statusMeta.dot}` : "none" }} />
          <span style={{ color: statusMeta.dot }}>{statusMeta.txt}</span>
          <span style={{ color: "#484f58", marginLeft: 4 }}>GoldRush WebSocket</span>
        </div>
      </header>

      <div style={{ background: "#0d1117", borderBottom: "0.5px solid #21262d", padding: "4px 0", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ display: "flex", animation: "ticker 35s linear infinite", whiteSpace: "nowrap" }}>
          {[...MARKETS, ...MARKETS].map((mk, i) => {
            const d = live[mk.symbol] || {}; const pu = (d.pct || 0) >= 0;
            return (
              <span key={i} style={{ fontSize: 11, padding: "0 14px", color: pu ? "#22c55e" : "#ef4444", borderRight: "0.5px solid #21262d33" }}>
                {mk.symbol} <span style={{ color: "#e6edf3" }}>${fmt(d.price, 2)}</span>
                {" "}<span>{pu ? "\u25B2" : "\u25BC"}{Math.abs(d.pct || 0).toFixed(2)}%</span>
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 290, borderRight: "0.5px solid #21262d", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ padding: "10px 12px", borderBottom: "0.5px solid #21262d" }}>
            <div style={{ fontSize: 9, color: "#484f58", letterSpacing: ".1em", marginBottom: 8 }}>SECTOR HEATMAP</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
              {heatData.map(({ label, avg }) => {
                const col = avg >= 1 ? "#16a34a" : avg >= 0 ? "#15803d" : avg >= -1 ? "#b91c1c" : "#991b1b";
                const bg = avg >= 1 ? "#16a34a18" : avg >= 0 ? "#15803d18" : avg >= -1 ? "#b91c1c18" : "#991b1b18";
                return (
                  <div key={label} style={{ background: bg, border: `0.5px solid ${col}44`, borderRadius: 4, padding: "5px 7px" }}>
                    <div style={{ fontSize: 8, color: col, letterSpacing: ".06em", marginBottom: 2 }}>{label.toUpperCase()}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: avg >= 0 ? "#22c55e" : "#ef4444" }}>{avg >= 0 ? "+" : ""}{avg.toFixed(2)}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ padding: "8px 12px", borderBottom: "0.5px solid #21262d", display: "flex", flexWrap: "wrap", gap: 4 }}>
            {CATS.map(c => <button key={c} className={`pill${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>

          <div style={{ padding: "5px 12px", display: "flex", justifyContent: "space-between", fontSize: 9, color: "#484f58", borderBottom: "0.5px solid #21262d", letterSpacing: ".08em" }}>
            <span>SYMBOL</span>
            <span style={{ display: "flex", gap: 24 }}><span>PRICE</span><span>24H %</span></span>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.map(mk => {
              const d = live[mk.symbol] || {}; const pu = (d.pct || 0) >= 0;
              return (
                <div key={mk.symbol} className={`mr${sel.symbol === mk.symbol ? " act" : ""}`}
                  onClick={() => setSel(mk)}
                  style={{ padding: "8px 12px", borderBottom: "0.5px solid #21262d18", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: (SECT_COL[mk.sector] || "#6e7681") + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: SECT_COL[mk.sector] || "#6e7681", flexShrink: 0 }}>
                      {mk.symbol[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#e6edf3" }}>{mk.label}</div>
                      <div style={{ fontSize: 9, color: "#484f58" }}>{mk.deployer}:{mk.symbol}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "#e6edf3" }}>${fmt(d.price)}</div>
                    <div style={{ fontSize: 10, color: pu ? "#22c55e" : "#ef4444" }}>{pu ? "+" : ""}{fmt(d.pct, 2)}%</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ padding: "5px 12px", fontSize: 9, color: "#484f58", borderTop: "0.5px solid #21262d" }}>
            Powered by GoldRush &middot; Real-time WebSocket
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "10px 16px", borderBottom: "0.5px solid #21262d", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: (SECT_COL[sel.sector] || "#6e7681") + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: SECT_COL[sel.sector] || "#6e7681" }}>
              {sel.symbol[0]}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3" }}>
                {sel.label}<span style={{ fontSize: 10, color: "#6e7681", marginLeft: 6 }}>{sel.cat}</span>
              </div>
              <div style={{ fontSize: 9, color: "#484f58" }}>{sel.deployer}:{sel.symbol}</div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginLeft: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: up ? "#22c55e" : "#ef4444" }}>${fmt(sl.price)}</span>
              <span style={{ fontSize: 12, color: up ? "#22c55e" : "#ef4444" }}>{up ? "+" : ""}{fmt(sl.pct, 3)}%</span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <div style={{ display: "flex", gap: 2, background: "#161b22", borderRadius: 6, padding: 3, border: "0.5px solid #30363d" }}>
                <span style={{ fontSize: 8, color: "#484f58", padding: "2px 5px", alignSelf: "center" }}>Interval</span>
                {INTERVALS.map(v => <button key={v} className={`seg${interval === v ? " on" : ""}`} onClick={() => setIntervalVal(v)}>{v}</button>)}
              </div>
              <div style={{ display: "flex", gap: 2, background: "#161b22", borderRadius: 6, padding: 3, border: "0.5px solid #30363d" }}>
                <span style={{ fontSize: 8, color: "#484f58", padding: "2px 5px", alignSelf: "center" }}>Lookback</span>
                {LOOKBACKS.map(v => <button key={v} className={`seg${lookback === v ? " on" : ""}`} onClick={() => setLookback(v)}>{v}</button>)}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>

          <div style={{ padding: "10px 16px", borderTop: "0.5px solid #21262d", display: "flex", flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
            {[["Open", `$${fmt(sl.open)}`], ["High", `$${fmt(sl.high)}`], ["Low", `$${fmt(sl.low)}`], ["Close", `$${fmt(sl.close)}`], ["Volume (USD)", fmtVol(sl.vol)]].map(([l, v], i, arr) => (
              <div key={l} style={{ flex: 1, padding: "0 12px", borderRight: i < arr.length - 1 ? "0.5px solid #21262d" : "none", minWidth: 80 }}>
                <div style={{ fontSize: 9, color: "#484f58", letterSpacing: ".08em", marginBottom: 3 }}>{l.toUpperCase()}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: l === "High" ? "#22c55e" : l === "Low" ? "#ef4444" : "#e6edf3" }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: "4px 16px", background: "#0a0d12", borderTop: "0.5px solid #21262d", fontSize: 9, color: "#484f58", flexShrink: 0, fontFamily: "monospace" }}>
            status: {debug}
          </div>
        </div>
      </div>
    </div>
  );
}