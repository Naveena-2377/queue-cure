// ============================================================
// Receptionist.jsx — Staff screen
// Route: /receptionist
// What it does: Add patients, call next, remove, set avg time
// Connects to server via Socket.IO and updates instantly
// ============================================================

import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

// --- SOCKET CONNECTION ---
// Connect once when this module loads — not inside the component.
// If you put it inside the component, it reconnects on every re-render.
// Replace this URL with your Railway URL after deploying.
const SOCKET_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const socket = io(SOCKET_URL);

export default function Receptionist() {

  // --- STATE ---
  // These useState variables are what React uses to re-render the UI.
  // When any of these change, React automatically updates the screen.

  const [queue, setQueue] = useState([]);           // Array of patient objects from server
  const [currentToken, setCurrentToken] = useState(0); // Token currently with doctor
  const [avgTime, setAvgTime] = useState(8);        // Avg consult time in minutes
  const [servedCount, setServedCount] = useState(0); // How many served today
  const [autoAvg, setAutoAvg] = useState(null);     // Auto-calculated avg from timer (null = not enough data)

  const [nameInput, setNameInput] = useState("");   // Controlled input: patient name field
  const [phone4Input, setPhone4Input] = useState(""); // Controlled input: last 4 digits
  const [sliderValue, setSliderValue] = useState(8); // Slider position (mirrors avgTime)

  const [connected, setConnected] = useState(false); // Socket connection status
  const [errorMsg, setErrorMsg] = useState("");      // Error message to show user

  // --- TIMER STATE ---
  // The consultation timer counts up from 0 every second.
  // It resets when "Call Next" is clicked.
  const [timerSeconds, setTimerSeconds] = useState(0);  // Current elapsed seconds
  const [timerRunning, setTimerRunning] = useState(false); // Is timer active?
  const timerRef = useRef(null);     // Ref to hold the setInterval ID so we can clear it
  const consultTimes = useRef([]);   // Ref array to store past durations (persists across renders)

  // --- SOCKET SETUP ---
  // useEffect with empty [] runs once when the component mounts (first renders).
  // We register all socket event listeners here.
  useEffect(() => {

    // Socket connected to server
    socket.on("connect", () => {
      setConnected(true);
      console.log("Connected to server");
    });

    // Socket disconnected from server
    socket.on("disconnect", () => {
      setConnected(false);
      console.log("Disconnected from server");
    });

    // Main event: server broadcasts this whenever ANYTHING changes
    // We receive the full state and replace our local state
    socket.on("queue-updated", (data) => {
      setQueue(data.queue);
      setCurrentToken(data.currentToken);
      setAvgTime(data.avgTime);
      setSliderValue(data.avgTime); // Keep slider in sync with server avg
      setServedCount(data.servedCount);
    });

    // Server sends this if something went wrong (e.g. empty queue call)
    socket.on("error-msg", (msg) => {
      setErrorMsg(msg);
      // Auto-clear the error after 3 seconds
      setTimeout(() => setErrorMsg(""), 3000);
    });

    // Cleanup: remove listeners when component unmounts
    // Without this, listeners stack up and cause memory leaks
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("queue-updated");
      socket.off("error-msg");
    };
  }, []); // Empty array = run once on mount

  // --- TIMER LOGIC ---
  // useEffect watches timerRunning. When it becomes true, start the interval.
  // When it becomes false (or component unmounts), clear the interval.
  useEffect(() => {
    if (timerRunning) {
      // setInterval calls the function every 1000ms (1 second)
      timerRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev + 1); // Increment by 1 each second
      }, 1000);
    } else {
      clearInterval(timerRef.current); // Stop the timer
    }

    // Cleanup: clear interval when effect re-runs or component unmounts
    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

  useEffect(() => {
  if (queue.length === 0) {
    setTimerRunning(false);
  }
}, [queue]);

  // --- HELPER: FORMAT SECONDS TO MM:SS ---
  // Converts raw seconds (e.g. 384) to display format (e.g. "06:24")
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0"); // Minutes, zero-padded
    const s = (seconds % 60).toString().padStart(2, "0");           // Seconds, zero-padded
    return `${m}:${s}`;
  }

  // --- HELPER: COMPUTE WAIT TIME ---
  // For a patient at index i in the queue, wait = i × avgTime
  // Index 0 = next up = ~0 min (or "Next up")
  function waitLabel(index) {
    if (index === 0) return "Next up";
    return `~${index * avgTime} min`;
  }

  // --- HANDLER: ADD PATIENT ---
  function handleAddPatient() {
    // Guard: name must not be empty
    if (!nameInput.trim()) {
      setErrorMsg("Please enter the patient name.");
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }

    // Guard: phone4 must be exactly 4 digits if provided
    if (phone4Input && !/^\d{4}$/.test(phone4Input)) {
      setErrorMsg("Phone last 4 must be exactly 4 digits.");
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }

    // Emit to server — server will validate, add to queue, and broadcast
    socket.emit("add-patient", {
      name: nameInput.trim(),
      phone4: phone4Input.trim(),
    });

    // Clear the input fields after adding
    setNameInput("");
    setPhone4Input("");
  }

  // --- HANDLER: CALL NEXT ---
  function handleCallNext() {
    // Guard: don't emit if queue is empty (button should be disabled too, but double-check)
    if (queue.length === 0) return;

    // Record how long the current consultation took (for auto avg)
    if (timerRunning && timerSeconds > 0) {
      const durationMin = timerSeconds / 60; // Convert seconds to minutes
      consultTimes.current.push(durationMin);

      // Keep only last 10 consultations for rolling average
      if (consultTimes.current.length > 10) {
        consultTimes.current.shift();
      }

      // Recalculate auto avg from recorded durations
      const sum = consultTimes.current.reduce((a, b) => a + b, 0);
      const newAutoAvg = Math.round(sum / consultTimes.current.length);
      setAutoAvg(newAutoAvg);
    }

    // Reset and restart the timer for the next patient
    setTimerSeconds(0);
    setTimerRunning(true);

    // Emit to server
    socket.emit("call-next");
  }

  // --- HANDLER: REMOVE PATIENT ---
  function handleRemove(token) {
    socket.emit("remove-patient", { token });
  }
  function handleReset() {
  socket.emit("reset-day");
}

  // --- HANDLER: SLIDER CHANGE ---
  // Fires as user drags the slider (live feedback)
  function handleSliderChange(e) {
    const val = Number(e.target.value);
    setSliderValue(val); // Update slider display immediately (feels responsive)
  }

  // --- HANDLER: SLIDER RELEASE ---
  // Only emit to server when user releases the slider, not on every pixel drag
  // This prevents flooding the server with events while dragging
  function handleSliderRelease(e) {
    const val = Number(e.target.value);
    socket.emit("set-avg-time", { avgTime: val });
  }

  // --- HANDLER: ENTER KEY on name input ---
  // Pressing Enter in the name field should trigger Add (faster UX)
  function handleNameKeyDown(e) {
    if (e.key === "Enter") handleAddPatient();
  }

  // --- RENDER ---
  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* ── HEADER ── */}
        <div style={styles.header}>
          <span style={styles.headerTitle}>Queue Cure — Receptionist</span>
          {/* Connection indicator: green dot = live, red = disconnected */}
          <div style={styles.connRow}>
            <span style={{ ...styles.dot, background: connected ? "#1D9E75" : "#E24B4A" }} />
            <span style={styles.connLabel}>{connected ? "Connected" : "Disconnected"}</span>
            <span style={styles.connLabel}>{connected ? "Connected" : "Disconnected"}</span>
            <button onClick={handleReset} style={styles.resetBtn}>
            Reset day
            </button>
          </div>
        </div>

        {/* ── STATS BAR ── */}
        {/* Three quick numbers at a glance */}
        <div style={styles.statsBar}>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Served today</span>
            <span style={styles.statValue}>{servedCount}</span>
          </div>
          <div style={{ ...styles.statItem, borderLeft: "0.5px solid var(--border)", borderRight: "0.5px solid var(--border)" }}>
            <span style={styles.statLabel}>In queue</span>
            <span style={styles.statValue}>{queue.length}</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Avg wait / patient</span>
            <span style={styles.statValue}>{avgTime} min</span>
          </div>
        </div>

        {/* ── TIMER STRIP ── */}
        {/* Slim single-row banner. Shows current token, stopwatch, and auto avg */}
        <div style={styles.timerStrip}>
          <div style={styles.timerLeft}>
            {/* Only show token if someone has been called */}
            <span style={styles.timerTokenLabel}>
              {currentToken > 0 ? `T-${currentToken}` : "—"}
            </span>
            <span style={styles.timerClock}>{formatTime(timerSeconds)}</span>
            <span style={styles.timerHint}>
              {timerRunning ? "Consultation in progress" : "Timer stopped"}
            </span>
          </div>
          {/* Auto avg only shows after at least 1 consultation is recorded */}
          {autoAvg !== null && (
            <div style={styles.timerRight}>
              <span style={styles.timerAvgLabel}>Auto avg</span>
              <span style={styles.timerAvgValue}>~{autoAvg} min</span>
            </div>
          )}
        </div>

        {/* ── ERROR MESSAGE ── */}
        {/* Only shows when there's an error. Disappears after 3 seconds. */}
        {errorMsg && (
          <div style={styles.errorBanner}>
            ⚠ {errorMsg}
          </div>
        )}

        {/* ── ADD PATIENT FORM ── */}
        <div style={styles.section}>
          <span style={styles.sectionLabel}>Add patient</span>
          <div style={styles.addRow}>
            {/* Name input — required */}
            <div style={{ flex: 1 }}>
              <label style={styles.inputLabel}>
                Name <span style={{ color: "#E24B4A" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Patient name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={handleNameKeyDown} // Enter key triggers add
                style={styles.input}
              />
            </div>
            {/* Phone last 4 — optional */}
            <div style={{ width: 130 }}>
              <label style={styles.inputLabel}>
                Phone last 4 <span style={styles.optionalTag}>(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 4521"
                value={phone4Input}
                maxLength={4}
                onChange={(e) => setPhone4Input(e.target.value.replace(/\D/g, ""))} // Only allow digits
                onKeyDown={(e) => { if (e.key === "Enter") handleAddPatient(); }}
                style={styles.input}
              />
            </div>
            {/* Add button */}
            <button onClick={handleAddPatient} style={styles.addBtn}>
              + Add
            </button>
          </div>
        </div>

        {/* ── CALL NEXT + SLIDER ── */}
        <div style={styles.section}>
          <div style={styles.actionRow}>
            {/* Call Next button — disabled when queue is empty */}
            <button
              onClick={handleCallNext}
              disabled={queue.length === 0}
              style={{
                ...styles.callBtn,
                // When disabled, visually mute the button
                opacity: queue.length === 0 ? 0.4 : 1,
                cursor: queue.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {/* Show next token number in button text when queue has patients */}
              {queue.length > 0
                ? `Call next — T-${queue[0].token}`
                : "Call next (queue empty)"}
            </button>

            {/* Manual override slider */}
            <div style={styles.sliderGroup}>
              <span style={styles.sliderLabel}>Override avg:</span>
              <input
                type="range"
                min={1}
                max={30}
                step={1}
                value={sliderValue}
                onChange={handleSliderChange}    // Live slider display
                onMouseUp={handleSliderRelease}  // Emit to server only on release
                onTouchEnd={handleSliderRelease} // Mobile touch support
                style={{ flex: 1 }}
              />
              <span style={styles.sliderValue}>{sliderValue} min</span>
            </div>
          </div>
        </div>

        {/* ── QUEUE LIST ── */}
        <div style={styles.section}>
          <span style={styles.sectionLabel}>
            Queue — {queue.length} waiting
          </span>

          {/* Empty state: show a message when queue is empty */}
          {queue.length === 0 && (
            <div style={styles.emptyQueue}>
              No patients in queue. Add one above.
            </div>
          )}

          {/* Patient rows */}
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {queue.map((patient, index) => (
            <div
              key={patient.token} // key must be unique — token number is perfect
              style={{
                ...styles.queueRow,
                // Highlight the first patient (next up) in blue
                background: index === 0 ? "#E6F1FB" : "var(--surface)",
                border: index === 0 ? "0.5px solid #B5D4F4" : "0.5px solid transparent",
              }}
            >
              {/* Left: token + name + optional phone4 */}
              <div style={styles.queueLeft}>
                <span style={{
                  ...styles.tokenLabel,
                  color: index === 0 ? "#185FA5" : "#888780", // Blue for next, gray for rest
                }}>
                  T-{patient.token}
                </span>
                <span style={{
  ...styles.patientName,
  color: index === 0 ? "#1a1a2e" : "rgba(255,255,255,0.8)",
}}>
  {patient.name}
</span>
                {/* Show phone4 only if it was provided */}
                {patient.phone4 && (
  <span style={{
    ...styles.phone4,
    color: index === 0 ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.25)",
  }}>·{patient.phone4}</span>
)}
                {/* "Next up" badge on first row */}
                {index === 0 && (
                  <span style={styles.nextBadge}>next up</span>
                )}
              </div>

              {/* Right: wait time + remove button */}
              <div style={styles.queueRight}>
                <span style={{
                  ...styles.waitTime,
                  color: index === 0 ? "#185FA5" : "#888780",
                }}>
                  {waitLabel(index)}
                </span>
                {/* Remove button — fires remove-patient socket event */}
                <button
                  onClick={() => handleRemove(patient.token)}
                  style={styles.removeBtn}
                  title="Remove patient from queue"
                >
                  ✕ Remove
                </button>
              </div>
            </div>
          ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ============================================================
// STYLES
// Using plain JS objects (no CSS file needed for hackathon speed)
// ============================================================
const styles = {
  page: {
    minHeight: "100vh",
    background: "#07070d",
    display: "flex",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#0c0c12",
    borderRadius: 12,
    border: "0.5px solid rgba(93,202,165,0.3)",
    boxShadow: "0 0 32px rgba(93,202,165,0.08), 0 0 80px rgba(93,202,165,0.04)",
    width: "100%",
    maxWidth: 960,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  header: {
    padding: "13px 20px",
    borderBottom: "0.5px solid rgba(255,255,255,0.07)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontWeight: 500, fontSize: 14, color: "rgba(255,255,255,0.8)" },
  connRow: { display: "flex", alignItems: "center", gap: 10 },
  dot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  connLabel: { fontSize: 12, color: "rgba(255,255,255,0.35)" },
  resetBtn: {
    padding: "4px 12px",
    background: "none",
    border: "0.5px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    cursor: "pointer",
  },

  statsBar: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    borderBottom: "0.5px solid rgba(255,255,255,0.07)",
  },
  statItem: { padding: "12px 16px" },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.3)", display: "block", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 },
  statValue: { fontSize: 22, fontWeight: 500, color: "#ffffff" },

  timerStrip: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "9px 20px",
    background: "rgba(255,255,255,0.02)",
    borderBottom: "0.5px solid rgba(255,255,255,0.07)",
  },
  timerLeft: { display: "flex", alignItems: "center", gap: 12 },
  timerTokenLabel: { fontSize: 20, fontWeight: 600, color: "#5DCAA5", minWidth: 44 },
  timerClock: { fontSize: 20, fontWeight: 500, color: "rgba(255,255,255,0.9)", fontVariantNumeric: "tabular-nums" },
  timerHint: { fontSize: 11, color: "rgba(255,255,255,0.25)" },
  timerRight: { textAlign: "right" },
  timerAvgLabel: { fontSize: 11, color: "rgba(255,255,255,0.3)", display: "block" },
  timerAvgValue: { fontSize: 15, fontWeight: 500, color: "#5DCAA5" },

  errorBanner: {
    margin: "0 20px 12px",
    padding: "9px 14px",
    background: "rgba(226,75,74,0.1)",
    color: "#FF6B6B",
    borderRadius: 8,
    fontSize: 13,
    marginTop: 12,
    border: "0.5px solid rgba(226,75,74,0.2)",
  },

  section: {
    padding: "14px 20px",
    borderBottom: "0.5px solid rgba(255,255,255,0.07)",
  },
  sectionLabel: { fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 10 },

  addRow: { display: "flex", gap: 8, alignItems: "flex-end" },
  inputLabel: { fontSize: 12, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 5 },
  optionalTag: { fontWeight: 400, color: "rgba(255,255,255,0.2)" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 10px",
    fontSize: 13,
    border: "0.5px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    outline: "none",
    fontFamily: "inherit",
    background: "rgba(255,255,255,0.05)",
    color: "#ffffff",
  },
  addBtn: {
    height: 36,
    padding: "0 16px",
    background: "#185FA5",
    color: "#E6F1FB",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    alignSelf: "flex-end",
  },

  actionRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    alignItems: "center",
  },
  callBtn: {
    padding: "11px 0",
    background: "#0F6E56",
    color: "#E1F5EE",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    width: "100%",
  },
  sliderGroup: { display: "flex", alignItems: "center", gap: 8 },
  sliderLabel: { fontSize: 12, color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" },
  sliderValue: { fontSize: 13, fontWeight: 500, minWidth: 42, textAlign: "right", color: "rgba(255,255,255,0.7)" },

  emptyQueue: {
    padding: "16px 0",
    fontSize: 13,
    color: "rgba(255,255,255,0.2)",
    textAlign: "center",
  },
  queueRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "9px 12px",
    borderRadius: 8,
    marginBottom: 6,
  },
  queueLeft: { display: "flex", alignItems: "center", gap: 10 },
  tokenLabel: { fontSize: 15, fontWeight: 500, minWidth: 36 },
  patientName: { fontSize: 15, color: "#1a1a2e" },
  phone4: { fontSize: 11, color: "rgba(255,255,255,0.25)" },
  nextBadge: {
    fontSize: 12,
    color: "#5DCAA5",
    background: "rgba(93,202,165,0.1)",
    padding: "2px 7px",
    borderRadius: 10,
    border: "0.5px solid rgba(93,202,165,0.2)",
  },
  queueRight: { display: "flex", alignItems: "center", gap: 10 },
  waitTime: { fontSize: 12 },
  resetBtn: {
  padding: "4px 12px",
  background: "none",
  border: "0.5px solid rgba(255,255,255,0.15)",
  borderRadius: 6,
  fontSize: 13,
  color: "rgba(255,255,255,0.4)",
  cursor: "pointer",
},
  removeBtn: {
    border: "none",
    background: "none",
    cursor: "pointer",
    color: "rgba(226,75,74,0.7)",
    fontSize: 13,
    padding: "2px 4px",
  },
};