// ============================================================
// server.js — Queue Cure backend
// Stack: Node.js + Express + Socket.IO
// Deploy: Railway.app
// ============================================================

// --- 1. IMPORTS ---
const express = require("express");       // HTTP server framework
const http = require("http");             // Node's built-in HTTP module (Socket.IO needs this)
const { Server } = require("socket.io"); // Socket.IO server class
const cors = require("cors");             // Allows our React frontend (different port) to talk to this server

// --- 2. APP SETUP ---
const app = express();                    // Create Express app
const server = http.createServer(app);    // Wrap Express in a raw HTTP server

// Socket.IO attaches to the HTTP server, not Express directly
// This is because WebSockets upgrade from HTTP — so they need the same server
const io = new Server(server, {
  cors: {
    origin: ["https://queue-cure-psi.vercel.app", "http://localhost:5173"],   // Allow any origin (fine for hackathon; restrict in production)
    methods: ["GET", "POST"],
  },
});

app.use(cors());          // Allow REST requests from frontend too
app.use(express.json());  // Parse JSON request bodies

// --- 3. IN-MEMORY STATE ---
// This is the single source of truth for the whole system.
// ALL connected clients (receptionist + TV display) read from this.
// WARNING: resets on server restart — noted as edge case in thought sheet.

let queue = [];           // Array of patient objects: { token, name, phone4, addedAt }
let currentToken = 0;     // Token number currently with the doctor (0 = no one called yet)
let nextTokenNumber = 1;  // Auto-incrementing counter for assigning token numbers
let avgTime = 8;          // Average consultation time in minutes (default 8, adjustable)
let servedCount = 0;      // How many patients have been called today (resets on restart)
let consultDurations = []; // Array of past consultation durations in minutes (for auto avg)

// --- 4. HELPER: BROADCAST STATE ---
// Every time anything changes, we call this to push the full state to ALL clients.
// Sending full state (not just the change) makes clients simpler — they just replace their state.
function broadcastState() {
  io.emit("queue-updated", {
    queue,           // Full queue array
    currentToken,    // Current token with doctor
    avgTime,         // Current avg consult time
    servedCount,     // How many served today
  });
}

// --- 5. HTTP HEALTH CHECK ---
// Railway needs at least one HTTP route to confirm the server is alive.
app.get("/", (req, res) => {
  res.send("Queue Cure server is running.");
});

// --- 6. SOCKET.IO CONNECTION ---
// This fires every time a new client connects (receptionist tab opens, TV display opens, etc.)
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // --- 6a. SEND CURRENT STATE TO NEW CLIENT ---
  // When a new tab opens, immediately send the current queue state.
  // Without this, the TV display would show nothing until the next event fires.
  socket.emit("queue-updated", {
    queue,
    currentToken,
    avgTime,
    servedCount,
  });

  // --- 6b. EVENT: add-patient ---
  // Fired by: Receptionist clicks "Add" button
  // Payload: { name: "Ramesh Kumar", phone4: "4521" }  (phone4 is optional)
  socket.on("add-patient", (data) => {
    // Guard: reject if name is missing or empty after trimming whitespace
    if (!data.name || data.name.trim() === "") {
      // Emit error only back to the sender, not all clients
      socket.emit("error-msg", "Patient name is required.");
      return; // Stop here — don't add to queue
    }

    // Build the patient object
    const patient = {
      token: nextTokenNumber,          // e.g. 8
      tokenLabel: `T-${nextTokenNumber}`, // e.g. "T-8" — displayed on screen
      name: data.name.trim(),          // Remove accidental leading/trailing spaces
      phone4: data.phone4 || "",       // Optional — empty string if not provided
      addedAt: Date.now(),             // Timestamp — useful for debugging
    };

    queue.push(patient);    // Add to end of queue
    nextTokenNumber++;       // Increment for next patient

    console.log(`Patient added: ${patient.tokenLabel} - ${patient.name}`);
    broadcastState();        // Push new queue to ALL clients instantly
  });

  // --- 6c. EVENT: call-next ---
  // Fired by: Receptionist clicks "Call Next" button
  // Payload: none
  socket.on("call-next", () => {
    // Guard: if queue is empty, do nothing
    // (Button should be disabled on frontend too, but server-side guard is the real safety net)
    if (queue.length === 0) {
      socket.emit("error-msg", "Queue is empty. No patient to call.");
      return;
    }

    // Record consultation duration for auto avg calculation
    // We only record if a patient was already being seen (currentToken > 0)
    if (currentToken > 0) {
      // Find when the current patient's consult started
      // We track this via consultStartTime set when call-next was last fired
      if (consultStartTime > 0) {
        const durationMs = Date.now() - consultStartTime;
        const durationMin = durationMs / 1000 / 60; // Convert ms → minutes

        // Only record if duration is reasonable (between 1 sec and 60 min)
        // Filters out accidental double-clicks or very long gaps
        if (durationMin >= (1/60) && durationMin <= 60) {
          consultDurations.push(durationMin);

          // Keep only last 10 durations for rolling average
          if (consultDurations.length > 10) {
            consultDurations.shift(); // Remove oldest
          }

          // Auto-update avgTime from real data
          const sum = consultDurations.reduce((a, b) => a + b, 0);
          avgTime = Math.round(sum / consultDurations.length);
          avgTime = Math.max(avgTime, 1); // Never go below 1 min
        }
      }
    }

    // Move first patient from queue to "being seen"
    const nextPatient = queue.shift(); // Remove and return first item
    currentToken = nextPatient.token;  // Update current token
    servedCount++;                     // Increment today's served count
    consultStartTime = Date.now();     // Record when this consultation started

    console.log(`Calling: ${nextPatient.tokenLabel} - ${nextPatient.name}`);
    broadcastState(); // Push updated state to ALL clients
  });

  // --- 6d. EVENT: remove-patient ---
  // Fired by: Receptionist clicks "Remove" on a patient row
  // Payload: { token: 9 }  (the token number of the patient to remove)
  socket.on("remove-patient", (data) => {
    // Guard: token must be provided
    if (data.token === undefined || data.token === null) {
      socket.emit("error-msg", "No token specified for removal.");
      return;
    }

    const before = queue.length;
    // Filter out the patient with this token number
    queue = queue.filter((p) => p.token !== data.token);
    const after = queue.length;

    if (before === after) {
      // Token not found — patient may have already been called
      socket.emit("error-msg", "Patient not found in queue.");
      return;
    }

    console.log(`Patient removed: T-${data.token}`);
    broadcastState(); // Push updated queue to ALL clients
  });

  // --- 6e. EVENT: set-avg-time ---
  // Fired by: Receptionist moves the manual override slider
  // Payload: { avgTime: 10 }
  socket.on("set-avg-time", (data) => {
    // Guard: must be a positive number
    if (!data.avgTime || data.avgTime < 1) {
      socket.emit("error-msg", "Avg time must be at least 1 minute.");
      return;
    }

    avgTime = Math.round(data.avgTime); // Round to whole minutes
    console.log(`Avg time updated to: ${avgTime} min`);
    broadcastState(); // All clients (including TV display) update wait times instantly
  });

  // --- 6f. DISCONNECT ---
 // --- 6f. EVENT: reset-day ---
socket.on("reset-day", () => {
  queue = [];
  currentToken = 0;
  nextTokenNumber = 1;
  servedCount = 0;
  consultDurations = [];
  consultStartTime = 0;
  broadcastState();
  console.log("Day reset by receptionist");
});

// --- 6g. DISCONNECT ---
socket.on("disconnect", () => {
  console.log("Client disconnected:", socket.id);
});
});

// --- 7. CONSULTATION TIMER TRACKING ---
// Server tracks when the current consultation started (for auto avg calculation)
let consultStartTime = 0; // Unix timestamp in ms, 0 means no active consultation

// --- 8. START SERVER ---
// Railway injects PORT via environment variable. We fall back to 3001 for local dev.
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Queue Cure server running on port ${PORT}`);
});