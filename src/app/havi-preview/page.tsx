"use client";

/**
 * TEMPORARY Havi preview playground — not part of the app.
 * Lives outside the (app) route group so it needs no auth.
 * Delete this folder when you're done looking at Havi.
 */

import { useState } from "react";

const card: React.CSSProperties = {
  position: "relative",
  background: "#fff",
  border: "1px solid #e3e3dd",
  borderRadius: 24,
  boxShadow: "0 8px 24px rgba(0,0,0,.06)",
  padding: 28,
  minHeight: 150,
};

const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "#8a8780",
};

const btn: React.CSSProperties = {
  border: "1px solid #e3e3dd",
  background: "#fff",
  borderRadius: 12,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

export default function HaviPreviewPage() {
  const [nearDue, setNearDue] = useState(true);
  const [score, setScore] = useState("18");
  const max = 20;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 160px", fontFamily: "Inter, sans-serif" }}>
      <h1 style={{ fontSize: 32, color: "#2c2c2a", marginBottom: 8 }}>Havi 🐸 preview</h1>
      <p style={{ color: "#8a8780", fontSize: 15, marginBottom: 8 }}>
        Temporary page. Each card below is tagged with a <code>data-havi-role</code>. Havi picks
        the highest-priority one on the page and perches on its top corner.
      </p>
      <p style={{ color: "#8a8780", fontSize: 13, marginBottom: 32 }}>
        Priority: celebrate → current-week (write) → upcoming near-due (watch) → profile (watch) → generic (sleep).
        Scroll the page — Havi should stay glued to the card edge.
      </p>

      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 40 }}>
        <button style={btn} onClick={() => window.havi?.sleep()}>sleep()</button>
        <button style={btn} onClick={() => window.havi?.watch()}>watch()</button>
        <button style={btn} onClick={() => window.havi?.write()}>write()</button>
        <button style={btn} onClick={() => window.havi?.celebrate(0.95)}>celebrate(0.95)</button>
        <button style={btn} onClick={() => window.havi?.refresh()}>refresh()</button>
        <button style={btn} onClick={() => setNearDue((v) => !v)}>
          near-due: {nearDue ? "true" : "false"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {/* current-week -> write */}
        <div style={card} data-havi-role="current-week">
          <div style={label}>data-havi-role=&quot;current-week&quot;</div>
          <h2 style={{ fontSize: 20, marginTop: 10, color: "#2c2c2a" }}>Current week</h2>
          <p style={{ color: "#8a8780", fontSize: 14, marginTop: 8 }}>Havi writes ✍️ here (Schedule page).</p>
        </div>

        {/* upcoming -> watch when near-due */}
        <div style={card} data-havi-role="upcoming" data-havi-near-due={nearDue ? "true" : "false"}>
          <div style={label}>data-havi-role=&quot;upcoming&quot;</div>
          <h2 style={{ fontSize: 20, marginTop: 10, color: "#2c2c2a" }}>Upcoming</h2>
          <p style={{ color: "#8a8780", fontSize: 14, marginTop: 8 }}>
            Watches 👀 when near-due is true (currently <b>{nearDue ? "true" : "false"}</b>).
          </p>
        </div>

        {/* profile -> watch */}
        <div style={card} data-havi-role="profile">
          <div style={label}>data-havi-role=&quot;profile&quot;</div>
          <h2 style={{ fontSize: 20, marginTop: 10, color: "#2c2c2a" }}>Profile</h2>
          <p style={{ color: "#8a8780", fontSize: 14, marginTop: 8 }}>Watches 👀 (new in v2).</p>
        </div>

        {/* generic -> sleep */}
        <div style={card} data-havi-role="generic">
          <div style={label}>data-havi-role=&quot;generic&quot;</div>
          <h2 style={{ fontSize: 20, marginTop: 10, color: "#2c2c2a" }}>Generic / GPA card</h2>
          <p style={{ color: "#8a8780", fontSize: 14, marginTop: 8 }}>Sleeps 😴 with a blanket; relocates every 30s.</p>
        </div>

        {/* course -> celebrate */}
        <div style={{ ...card, gridColumn: "1 / -1" }} data-havi-role="course">
          <div style={label}>data-havi-role=&quot;course&quot;</div>
          <h2 style={{ fontSize: 20, marginTop: 10, color: "#2c2c2a" }}>Course card</h2>
          <p style={{ color: "#8a8780", fontSize: 14, margin: "8px 0 16px" }}>
            Enter a score out of {max} and save — Havi celebrates 🎉 only at ≥ 90% (18/20).
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="number"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              style={{ width: 80, padding: "8px 10px", borderRadius: 10, border: "1px solid #e3e3dd", fontSize: 14 }}
            />
            <span style={{ color: "#8a8780", fontSize: 14 }}>/ {max}</span>
            <button
              style={{ ...btn, background: "#477680", color: "#fff", borderColor: "#477680" }}
              onClick={() => {
                const s = Number(score);
                if (!Number.isNaN(s)) window.havi?.celebrate(s / max);
              }}
            >
              Save grade
            </button>
            <span style={{ color: "#8a8780", fontSize: 13 }}>
              ratio = {(Number(score) / max || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div style={{ height: 700 }} />
      <p style={{ color: "#8a8780", fontSize: 13 }}>↑ Scroll space — Havi should stay stuck to its card.</p>
    </div>
  );
}
