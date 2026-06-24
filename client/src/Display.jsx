// ============================================================
// Display.jsx — Waiting hall TV screen
// Route: /display
// What it does: Shows current token, queue list, wait times
// Read-only — patients and visitors only watch this screen
// Updates instantly via Socket.IO without any refresh
// ============================================================

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

// --- SOCKET CONNECTION ---
// Same server URL as Receptionist.jsx
// Both screens share one server — that's how live sync works
const SOCKET_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const socket = io(SOCKET_URL);

export default function Display() {

  // --- STATE ---
  const [queue, setQueue] = useState([]);           // Waiting patients
  const [currentToken, setCurrentToken] = useState(0); // Token currently with doctor
  const [avgTime, setAvgTime] = useState(8);        // Avg consult time in minutes
  const [servedCount, setServedCount] = useState(0); // Patients served today
  const [lastUpdated, setLastUpdated] = useState(null); // Timestamp of last socket update
  const [connected, setConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  // --- SOCKET SETUP ---
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // When server broadcasts a state update, replace our local state entirely
    socket.on("queue-updated", (data) => {
      setQueue(data.queue);
      setCurrentToken(data.currentToken);
      setAvgTime(data.avgTime);
      setServedCount(data.servedCount);
      setLastUpdated(new Date()); // Record the exact moment this update arrived
    });

    return () => {
      clearInterval(clockTimer);
      socket.off("connect");
      socket.off("disconnect");
      socket.off("queue-updated");
    };
  }, []);

  // --- HELPER: WAIT TIME LABEL ---
  // index = position in queue array (0 = next up)
  // wait = index × avgTime
  function waitLabel(index) {
    if (index === 0) return "Next up";
    return `~${index * avgTime} min`;
  }

  // --- HELPER: FORMAT TIMESTAMP ---
  // Shows "Last updated: 10:42:31 AM" in the header
  function formatTime(date) {
    if (!date) return "—";
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  // --- RENDER ---
  // Two states:
  // 1. Normal: show current token + queue list
  // 2. Empty: show "All patients seen" message
  const isQueueEmpty = queue.length === 0;
  const hasStarted = currentToken > 0; // Has at least one patient been called?

  return (
    <div style={styles.page}>
      <div style={styles.screen}>

        {/* ── HEADER BAR ── */}
        <div style={styles.header}>
          <span style={styles.headerTitle}>Token Display</span>
          <div style={styles.headerRight}>
            {/* Last updated timestamp — builds patient trust that the screen is live */}
            <div style={{
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  border: "0.5px solid rgba(93,202,165,0.3)",
  borderRadius: 10,
  padding: "6px 18px",
  background: "rgba(93,202,165,0.05)",
  boxShadow: "0 0 12px rgba(93,202,165,0.1)",
}}>
  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
    Current Time
  </span>
  <span style={{ fontSize: 28, fontWeight: 500, color: "#5DCAA5", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
    {formatTime(currentTime)}
  </span>
</div>
<span style={styles.lastUpdated}>
  Last updated: {formatTime(lastUpdated)}
</span>
            <span style={styles.lastUpdated}>
              Last updated: {formatTime(lastUpdated)}
            </span>
            {/* Live indicator dot */}
            <div style={styles.liveRow}>
              <span style={{
                ...styles.liveDot,
                background: connected ? "#1D9E75" : "#E24B4A",
              }} />
              <span style={styles.liveLabel}>
                {connected ? "Live" : "Reconnecting…"}
              </span>
            </div>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={styles.body}>

          {/* ── EMPTY STATE ── */}
          {/* Show this when queue is empty AND at least one patient has been seen */}
          {isQueueEmpty && hasStarted && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>✓</div>
              <p style={styles.emptyTitle}>All patients seen</p>
              <p style={styles.emptySubtitle}>Thank you for your patience!</p>
              <p style={styles.emptyServed}>
                {servedCount} patient{servedCount !== 1 ? "s" : ""} served today
              </p>
            </div>
          )}

          {/* ── WAITING STATE (before any patient called) ── */}
          {isQueueEmpty && !hasStarted && (
            <div style={styles.emptyState}>
              <p style={styles.emptyTitle}>Queue Cure</p>
              <p style={styles.emptySubtitle}>Waiting for first patient to be called…</p>
            </div>
          )}

          {/* ── NORMAL STATE: queue has patients OR current token is active ── */}
          {(!isQueueEmpty || currentToken > 0) && (
            <div style={styles.mainGrid}>

              {/* LEFT: NOW SERVING — big token number */}
              <div style={styles.nowServingCard}>
                <p style={styles.nowServingLabel}>Now serving</p>
                {/* Show token or dash if nothing called yet */}
                <p style={styles.nowServingToken}>
                  {currentToken > 0 ? `T-${currentToken}` : "—"}
                </p>
                <div style={styles.nowServingDivider} />
                <div style={styles.nowServingDivider} />
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", margin: "0 0 8px" }}>
  People ahead
                </p>
                <p style={{ fontSize: 36, fontWeight: 500, color: "#ffffff", margin: "0 0 8px" }}>
                {queue.length}
                </p>
                <p style={styles.nowServingHint}>
                Please proceed to the consultation room
                </p>
              </div>

              {/* RIGHT: QUEUE LIST */}
              <div style={styles.queuePanel}>
                <p style={styles.queuePanelLabel}>Upcoming</p>

                {/* If queue is empty but someone is being served, show a calm message */}
                {isQueueEmpty && (
                  <div style={styles.noMore}>
                    No more patients in queue
                  </div>
                )}

                {/* Patient rows */}
                {queue.map((patient, index) => (
                  <div
                    key={patient.token}
                    style={{
                      ...styles.queueRow,
                      // First row gets a subtle teal highlight — "you're next"
                      background: index === 0
                        ? "rgba(93, 202, 165, 0.08)"
                        : "rgba(255,255,255,0.03)",
                      border: index === 0
                        ? "0.5px solid rgba(93, 202, 165, 0.2)"
                        : "0.5px solid transparent",
                    }}
                  >
                    {/* Token + name */}
                    <div style={styles.queueRowLeft}>
                      <span style={{
                        ...styles.queueToken,
                        // Full white for next up, dimmer for the rest
                        color: index === 0 ? "#ffffff" : "rgba(255,255,255,0.65)",
                      }}>
                        T-{patient.token}
                      </span>
                      <span style={{
                        ...styles.queueName,
                        color: index === 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)",
                      }}>
                        {patient.name}
                      </span>
                    </div>

                    {/* Wait time */}
                    <span style={{
                      ...styles.queueWait,
                      color: index === 0 ? "#5DCAA5" : "rgba(255,255,255,0.4)",
                      fontWeight: index === 0 ? 500 : 400,
                    }}>
                      {waitLabel(index)}
                    </span>
                  </div>
                ))}

                {/* Footer: served count */}
                <div style={styles.servedFooter}>
                  <span style={styles.servedLabel}>Served today</span>
                  <span style={styles.servedValue}>
                    {servedCount} patient{servedCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ============================================================
// STYLES
// Dark theme throughout — TV in a waiting hall
// Large fonts so text is readable from across the room
// ============================================================
const styles = {
  page: {
    minHeight: "100vh",
    height: "100vh",
    background: "#07070d",
    display: "flex",
    alignItems: "stretch",
    fontFamily: "system-ui, sans-serif",
    boxSizing: "border-box",
  },
  screen: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },

  // Header — slim, just metadata
  header: {
    padding: "14px 28px",
    borderBottom: "0.5px solid rgba(255,255,255,0.07)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 14, color: "rgba(255,255,255,0.3)", letterSpacing: "0.04em" },
  headerRight: { display: "flex", alignItems: "center", gap: 20 },
  lastUpdated: { fontSize: 12, color: "rgba(255,255,255,0.2)" },
  liveRow: { display: "flex", alignItems: "center", gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: "50%", display: "inline-block" },
  liveLabel: { fontSize: 12, color: "rgba(255,255,255,0.3)" },

  // Body takes remaining height
  body: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 28px",
  },

  // Empty / waiting state
  emptyState: {
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: 48,
    color: "#5DCAA5",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 32, fontWeight: 500, color: "#ffffff", margin: "0 0 8px" },
  emptySubtitle: { fontSize: 18, color: "rgba(255,255,255,0.4)", margin: "0 0 16px" },
  emptyServed: { fontSize: 14, color: "rgba(255,255,255,0.25)", margin: 0 },

  // Main grid: left (now serving) + right (queue)
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1.4fr",
    gap: 24,
    alignItems: "start",
    width: "100%",
    maxWidth: 1400,
    width: "100%",
  },

  // NOW SERVING card — the hero element
  nowServingCard: {
    textAlign: "center",
    border: "1px solid rgba(93,202,165,0.3)",
    boxShadow: "0 0 40px rgba(93, 202, 165, 0.12)",
    borderRadius: 12,
    padding: "32px 24px",
    background: "rgba(255,255,255,0.02)",
  },
  nowServingLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    margin: "0 0 10px",
  },
  nowServingToken: {
    fontSize: 120,         // Big enough to read across the room
    fontWeight: 500,
    color: "#5DCAA5",     // Teal — calm, clinic-appropriate
    margin: 0,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums", // Prevents layout shift when number changes
  },
  nowServingDivider: {
    borderTop: "0.5px solid rgba(255,255,255,0.07)",
    margin: "18px 0 14px",
  },
  nowServingHint: {
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    margin: 0,
    lineHeight: 1.5,
  },

  // Queue panel — right side
  queuePanel: {},
  queuePanelLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    margin: "0 0 12px",
  },
  noMore: {
    padding: "16px 0",
    fontSize: 14,
    color: "rgba(255,255,255,0.25)",
    textAlign: "center",
  },
  queueRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "13px 16px",
    borderRadius: 8,
    marginBottom: 7,
  },
  queueRowLeft: { display: "flex", alignItems: "center", gap: 12 },
  queueToken: {
    fontSize: 26,
    fontWeight: 500,
    minWidth: 44,
    fontVariantNumeric: "tabular-nums",
  },
  queueName: { fontSize: 17 },
  queueWait: { fontSize: 17 },

  // Footer row inside queue panel
  servedFooter: {
    marginTop: 12,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    border: "0.5px solid rgba(255,255,255,0.05)",
    display: "flex",
    justifyContent: "space-between",
  },
  servedLabel: { fontSize: 12, color: "rgba(255,255,255,0.25)" },
  servedValue: { fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 500 },
};