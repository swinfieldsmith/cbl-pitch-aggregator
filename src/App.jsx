import { useState, useCallback, useRef } from "react";

// ── Constants ────────────────────────────────────────────────────────────────
const PITCH_TYPES  = ["Fastball", "Breaking Ball"];
const ALL_RESULTS  = ["Strike", "Whiff", "Ball", "HBP", "Single", "Double", "Triple", "HR", "Out"];
const BALLS        = [0, 1, 2, 3];
const STRIKES      = [0, 1, 2];
const COUNTS       = STRIKES.flatMap(s => BALLS.map(b => `${b}-${s}`));
const GRID_SIZE    = 3;
const TOTAL_CELLS  = GRID_SIZE + 2;

const RESULT_COLORS = {
  Strike: "#22c55e", Whiff: "#86efac", Ball: "#3b82f6", HBP: "#a855f7",
  Single: "#fbbf24", Double: "#f97316", Triple: "#ef4444", HR: "#ec4899", Out: "#64748b",
};

const PITCH_COLORS = { "Fastball": "#f59e0b", "Breaking Ball": "#60a5fa" };

// ── Grid helpers ─────────────────────────────────────────────────────────────
function isInner(r, c) { return r >= 1 && r < GRID_SIZE + 1 && c >= 1 && c < GRID_SIZE + 1; }
function isOOZ(r, c)   { return !isInner(r, c) && r >= 0 && r < TOTAL_CELLS && c >= 0 && c < TOTAL_CELLS; }

function buildGrid(pitches) {
  const g = Array.from({ length: TOTAL_CELLS }, () => Array(TOTAL_CELLS).fill(0));
  pitches.forEach(({ row, col }) => { if (row < TOTAL_CELLS && col < TOTAL_CELLS) g[row][col]++; });
  return g;
}

function getInnerColor(count, max) {
  if (count === 0) return "rgba(255,255,255,0.04)";
  const t = count / max;
  if (t < 0.33) return `rgba(34,197,94,${0.3 + t * 0.7})`;
  if (t < 0.66) return `rgba(250,204,21,${0.4 + t * 0.5})`;
  return `rgba(239,68,68,${0.5 + t * 0.5})`;
}
function getOOZColor(count, max) {
  if (count === 0) return "rgba(255,255,255,0.02)";
  return `rgba(148,163,184,${0.15 + (count / max) * 0.55})`;
}

// ── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text, filename) {
  const lines  = text.trim().split("\n");
  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const idx    = k => header.indexOf(k);

  return lines.slice(1).map(line => {
    const cols = line.split(",");
    const get  = k => (cols[idx(k)] ?? "").trim();
    const zone = get("zone");
    const row  = parseInt(get("row"),  10);
    const col  = parseInt(get("col"),  10);
    return {
      pitcher:   get("pitcher") || filename.replace(/[-_]/g, " ").replace(/\.csv$/i, ""),
      batter:    get("batter")  || "?",
      pitchType: get("pitch type"),
      result:    get("result"),
      count:     get("count"),
      hand:      get("batter hand"),
      zone,
      row:       isNaN(row) ? -1 : row,
      col:       isNaN(col) ? -1 : col,
      filename,
    };
  }).filter(p => p.row >= 0 && p.col >= 0);
}

// ── Stat helpers ─────────────────────────────────────────────────────────────
function calcStats(pitches) {
  const total   = pitches.length;
  const whiffs  = pitches.filter(p => p.result === "Whiff").length;
  const swings  = pitches.filter(p => ["Whiff","Single","Double","Triple","HR","Out"].includes(p.result)).length;
  const strikes = pitches.filter(p => ["Strike","Whiff"].includes(p.result)).length;
  const balls   = pitches.filter(p => p.result === "Ball").length;
  const oozPitches = pitches.filter(p => isOOZ(p.row, p.col)).length;
  const hits    = pitches.filter(p => ["Single","Double","Triple","HR"].includes(p.result)).length;

  const pitchMix = PITCH_TYPES.reduce((acc, pt) => {
    acc[pt] = pitches.filter(p => p.pitchType === pt).length;
    return acc;
  }, {});
  const resultBreakdown = ALL_RESULTS.reduce((acc, r) => {
    acc[r] = pitches.filter(p => p.result === r).length;
    return acc;
  }, {});

  return {
    total, whiffs, swings, strikes, balls, oozPitches, hits, pitchMix, resultBreakdown,
    whiffPct:  swings > 0 ? Math.round(whiffs  / swings  * 100) : null,
    strikePct: total  > 0 ? Math.round(strikes / total   * 100) : null,
    oozPct:    total  > 0 ? Math.round(oozPitches / total * 100) : null,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Heatmap({ pitches, label }) {
  const [hovered, setHovered] = useState(null);
  const grid = buildGrid(pitches);
  const innerMax = Math.max(1, ...grid.flatMap((row, r) => row.filter((_, c) => isInner(r, c))));
  const oozMax   = Math.max(1, ...grid.flatMap((row, r) => row.filter((_, c) => isOOZ(r, c))));

  const innerW = 72, innerH = 62, oozW = 40, oozH = 34;
  const colW = Array.from({ length: TOTAL_CELLS }, (_, c) => isInner(1, c) ? innerW : oozW);
  const rowH = Array.from({ length: TOTAL_CELLS }, (_, r) => isInner(r, 1) ? innerH : oozH);
  const gtc  = colW.map(w => `${w}px`).join(" ");
  const gtr  = rowH.map(h => `${h}px`).join(" ");

  if (pitches.length === 0) return (
    <div style={{ textAlign: "center", color: "#334155", fontSize: 12, padding: 40 }}>
      No pitches match the current filters
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {label && <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 3, marginBottom: 8 }}>{label}</div>}
      <div style={{ fontSize: 9, color: "#334155", marginBottom: 4, letterSpacing: 2 }}>HIGH</div>
      <div style={{
        display: "grid", gridTemplateColumns: gtc, gridTemplateRows: gtr,
        gap: 2, padding: 6, background: "#0d1520", borderRadius: 10,
        border: "2px solid #1e3a5f", boxShadow: "0 0 32px rgba(59,130,246,0.06)",
      }}>
        {grid.map((row, r) => row.map((cnt, c) => {
          const inner = isInner(r, c);
          const hov   = hovered?.r === r && hovered?.c === c;
          return (
            <div key={`${r}-${c}`}
              onMouseEnter={() => setHovered({ r, c })}
              onMouseLeave={() => setHovered(null)}
              title={`${inner ? "Zone" : "OOZ"} (${r},${c}) — ${cnt} pitch${cnt !== 1 ? "es" : ""}`}
              style={{
                width: inner ? innerW : oozW, height: inner ? innerH : oozH,
                background: inner ? getInnerColor(cnt, innerMax) : getOOZColor(cnt, oozMax),
                border: hov ? "2px solid #f59e0b" : inner ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.03)",
                borderRadius: inner ? 5 : 3,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: inner ? 16 : 10, fontWeight: 700,
                color: cnt > 0 ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.06)",
                cursor: "default", userSelect: "none", boxSizing: "border-box",
                transition: "border 0.1s",
              }}>
              {cnt > 0 ? cnt : ""}
            </div>
          );
        }))}
      </div>
      <div style={{ fontSize: 9, color: "#334155", marginTop: 4, letterSpacing: 2 }}>LOW</div>
      <div style={{ fontSize: 9, color: "#334155", marginTop: 2 }}>{pitches.length} pitches</div>
    </div>
  );
}

function StatCard({ label, value, sub, color = "#e2e8f0" }) {
  return (
    <div style={{
      background: "#0d1520", border: "1px solid #1e293b", borderRadius: 8,
      padding: "12px 16px", minWidth: 90, textAlign: "center",
    }}>
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: 2, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: 1 }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 9, color: "#334155", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PitchMixBar({ pitchMix, total }) {
  return (
    <div style={{ background: "#0d1520", border: "1px solid #1e293b", borderRadius: 8, padding: "12px 16px" }}>
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: 2, marginBottom: 10 }}>PITCH MIX</div>
      {PITCH_TYPES.map(pt => {
        const cnt = pitchMix[pt] ?? 0;
        const pct = total > 0 ? Math.round(cnt / total * 100) : 0;
        return (
          <div key={pt} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
              <span style={{ color: PITCH_COLORS[pt] }}>{pt}</span>
              <span style={{ color: "#64748b" }}>{cnt} · {pct}%</span>
            </div>
            <div style={{ height: 5, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: PITCH_COLORS[pt], borderRadius: 3, transition: "width 0.4s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResultsBreakdown({ breakdown, total }) {
  return (
    <div style={{ background: "#0d1520", border: "1px solid #1e293b", borderRadius: 8, padding: "12px 16px" }}>
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: 2, marginBottom: 10 }}>RESULTS</div>
      {ALL_RESULTS.map(r => {
        const cnt = breakdown[r] ?? 0;
        if (cnt === 0) return null;
        const pct = total > 0 ? Math.round(cnt / total * 100) : 0;
        return (
          <div key={r} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
              <span style={{ color: RESULT_COLORS[r] }}>{r}</span>
              <span style={{ color: "#64748b" }}>{cnt} · {pct}%</span>
            </div>
            <div style={{ height: 3, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: RESULT_COLORS[r], borderRadius: 2, opacity: 0.7, transition: "width 0.4s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function DropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleFiles = files => {
    const csvFiles = Array.from(files).filter(f => f.name.endsWith(".csv"));
    Promise.all(csvFiles.map(f =>
      f.text().then(text => ({ text, filename: f.name }))
    )).then(results => onFiles(results));
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current.click()}
      style={{
        border: `2px dashed ${dragging ? "#f59e0b" : "#1e3a5f"}`,
        borderRadius: 12, padding: "32px 24px", textAlign: "center",
        cursor: "pointer", transition: "border 0.15s",
        background: dragging ? "rgba(245,158,11,0.05)" : "rgba(59,130,246,0.03)",
      }}>
      <input ref={inputRef} type="file" accept=".csv" multiple style={{ display: "none" }}
        onChange={e => handleFiles(e.target.files)} />
      <div style={{ fontSize: 28, marginBottom: 10 }}>📂</div>
      <div style={{ fontSize: 13, color: "#64748b", letterSpacing: 1 }}>
        Drop CSV files here or click to browse
      </div>
      <div style={{ fontSize: 10, color: "#334155", marginTop: 6, letterSpacing: 1 }}>
        Accepts exports from the CBL Pitch Heat Map tool
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [allPitches,   setAllPitches]   = useState([]);
  const [loadedFiles,  setLoadedFiles]  = useState([]);
  const [filterPitch,  setFilterPitch]  = useState("All");
  const [filterResult, setFilterResult] = useState("All");
  const [filterCount,  setFilterCount]  = useState("All");
  const [filterPitcher,setFilterPitcher]= useState("All");
  const [splitBy,      setSplitBy]      = useState("none"); // none | pitchType | hand

  const handleFiles = useCallback(files => {
    const newPitches = [];
    const newFiles   = [];
    files.forEach(({ text, filename }) => {
      if (loadedFiles.includes(filename)) return;
      const parsed = parseCSV(text, filename);
      newPitches.push(...parsed);
      newFiles.push(filename);
    });
    setAllPitches(prev => [...prev, ...newPitches]);
    setLoadedFiles(prev => [...prev, ...newFiles]);
  }, [loadedFiles]);

  const removeFile = filename => {
    setAllPitches(prev => prev.filter(p => p.filename !== filename));
    setLoadedFiles(prev => prev.filter(f => f !== filename));
  };

  // Derived pitcher list
  const pitchers = ["All", ...Array.from(new Set(allPitches.map(p => p.pitcher))).sort()];

  // Apply filters
  const filtered = allPitches.filter(p => {
    if (filterPitch   !== "All" && p.pitchType !== filterPitch)  return false;
    if (filterResult  !== "All" && p.result    !== filterResult) return false;
    if (filterCount   !== "All" && p.count     !== filterCount)  return false;
    if (filterPitcher !== "All" && p.pitcher   !== filterPitcher)return false;
    return true;
  });

  const stats = calcStats(filtered);

  // Split views
  const splitGroups = splitBy === "pitchType"
    ? PITCH_TYPES.map(pt => ({ label: pt, pitches: filtered.filter(p => p.pitchType === pt) }))
    : splitBy === "hand"
      ? ["RHB", "LHB"].map(h => ({ label: `vs ${h}`, pitches: filtered.filter(p => p.hand === h) }))
      : [{ label: null, pitches: filtered }];

  const isFiltered = filterPitch !== "All" || filterResult !== "All" || filterCount !== "All" || filterPitcher !== "All";

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0f1e", color: "#e2e8f0",
      fontFamily: "'Courier New', monospace",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "28px 16px 60px",
    }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 10, letterSpacing: 6, color: "#475569", marginBottom: 5 }}>
          CANADIAN BASEBALL LEAGUE
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: 1,
          background: "linear-gradient(90deg, #60a5fa, #a78bfa)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Pitch Aggregator
        </h1>
        <div style={{ fontSize: 10, color: "#334155", marginTop: 6, letterSpacing: 2 }}>
          MULTI-GAME HEATMAP & ANALYSIS
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 820 }}>

        {/* Drop zone */}
        <DropZone onFiles={handleFiles} />

        {/* Loaded files */}
        {loadedFiles.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {loadedFiles.map(f => (
              <div key={f} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "#111827", border: "1px solid #1e3a5f",
                borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#60a5fa",
              }}>
                <span>📄 {f}</span>
                <button onClick={() => removeFile(f)} style={{
                  background: "none", border: "none", color: "#ef4444",
                  cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1,
                }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {allPitches.length > 0 && (<>

          {/* Filters */}
          <div style={{
            background: "#111827", border: "1px solid #1e293b", borderRadius: 12,
            padding: "14px 18px", marginTop: 20,
          }}>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: 2, marginBottom: 12 }}>FILTERS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              {[
                { label: "Pitcher",    value: filterPitcher, setter: setFilterPitcher, options: pitchers },
                { label: "Pitch Type", value: filterPitch,   setter: setFilterPitch,   options: ["All", ...PITCH_TYPES] },
                { label: "Result",     value: filterResult,  setter: setFilterResult,  options: ["All", ...ALL_RESULTS] },
                { label: "Count",      value: filterCount,   setter: setFilterCount,   options: ["All", ...COUNTS] },
              ].map(({ label, value, setter, options }) => (
                <div key={label}>
                  <div style={{ fontSize: 9, color: "#475569", letterSpacing: 2, marginBottom: 4 }}>{label}</div>
                  <select value={value} onChange={e => setter(e.target.value)} style={{
                    background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0",
                    padding: "5px 10px", borderRadius: 5, fontSize: 12,
                    fontFamily: "'Courier New', monospace", cursor: "pointer",
                  }}>
                    {options.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 2, marginBottom: 4 }}>SPLIT BY</div>
                <select value={splitBy} onChange={e => setSplitBy(e.target.value)} style={{
                  background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0",
                  padding: "5px 10px", borderRadius: 5, fontSize: 12,
                  fontFamily: "'Courier New', monospace", cursor: "pointer",
                }}>
                  <option value="none">None</option>
                  <option value="pitchType">Pitch Type</option>
                  <option value="hand">Batter Hand</option>
                </select>
              </div>
              {isFiltered && (
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button onClick={() => { setFilterPitch("All"); setFilterResult("All"); setFilterCount("All"); setFilterPitcher("All"); }}
                    style={{
                      background: "transparent", border: "1px solid #334155", color: "#64748b",
                      padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10,
                      letterSpacing: 1, fontFamily: "'Courier New', monospace",
                    }}>CLEAR</button>
                </div>
              )}
            </div>
          </div>

          {/* Summary stats */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: 2, marginBottom: 10 }}>
              SUMMARY — {filtered.length} pitches across {loadedFiles.length} game{loadedFiles.length !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <StatCard label="TOTAL"    value={stats.total} />
              <StatCard label="WHIFF %"  value={stats.whiffPct  != null ? `${stats.whiffPct}%`  : "—"} color="#86efac" />
              <StatCard label="STRIKE %" value={stats.strikePct != null ? `${stats.strikePct}%` : "—"} color="#22c55e" />
              <StatCard label="OOZ %"    value={stats.oozPct    != null ? `${stats.oozPct}%`    : "—"} color="#94a3b8" />
              <StatCard label="HITS"     value={stats.hits} color="#fbbf24" />
            </div>
          </div>

          {/* Heatmap(s) + side panels */}
          <div style={{ marginTop: 24, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>

            {/* Heatmaps */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {splitGroups.map(({ label, pitches }) => (
                <div key={label ?? "all"} style={{
                  background: "#111827", border: "1px solid #1e293b",
                  borderRadius: 12, padding: "16px 16px 12px",
                  display: "flex", flexDirection: "column", alignItems: "center",
                }}>
                  <Heatmap pitches={pitches} label={label?.toUpperCase()} />
                  {/* mini legend */}
                  <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 9, color: "#475569" }}>
                    {[
                      { label: "Low",  color: "rgba(34,197,94,0.6)"   },
                      { label: "Mid",  color: "rgba(250,204,21,0.7)"  },
                      { label: "High", color: "rgba(239,68,68,0.9)"   },
                      { label: "OOZ",  color: "rgba(148,163,184,0.4)" },
                    ].map(({ label: l, color }) => (
                      <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 8, height: 8, background: color, borderRadius: 2 }} />
                        {l}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Side panels */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minWidth: 200 }}>
              <PitchMixBar pitchMix={stats.pitchMix} total={stats.total} />
              <ResultsBreakdown breakdown={stats.resultBreakdown} total={stats.total} />
            </div>
          </div>

        </>)}

        {allPitches.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 40, color: "#1e3a5f", fontSize: 12, letterSpacing: 2 }}>
            LOAD CSV FILES TO BEGIN
          </div>
        )}
      </div>
    </div>
  );
}
