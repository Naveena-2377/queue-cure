# Queue Cure '26

A real-time hospital queue management system built for the Wooble Hackathon 2026.  
Two screens. One server. Zero refresh needed.

---

## What it does

| Screen | Route | Who uses it |
|---|---|---|
| Receptionist | `/receptionist` | Front desk staff |
| Token Display | `/display` | Patients in waiting hall (TV screen) |

All updates sync **instantly** across all tabs via Socket.IO — no polling, no refresh.

---

## Features

### Receptionist Screen
- **Add patient** — Enter name (required) + last 4 digits of phone (optional). Press Enter or click + Add
- **Call next** — Calls the next patient in queue, displays their token number. Button shows which token is next (e.g. "Call next — T-3")
- **Remove patient** — Remove any patient from the queue with one click
- **Consultation timer** — Auto-starts when a patient is called. Shows elapsed time in MM:SS format. Stops when queue empties
- **Auto avg time** — After each consultation, the system calculates a rolling average of the last 10 consultations and updates wait estimates automatically
- **Manual override slider** — Receptionist can manually set avg consult time (1–30 min) at any time. Syncs to display screen instantly
- **Reset day** — Clears queue, resets all counters and tokens back to T-1. Fresh start for a new day
- **Live connection indicator** — Green dot = connected to server. Red = disconnected (auto-reconnects)
- **Stats bar** — Shows served today, patients in queue, avg wait per patient at a glance
- **Error messages** — Invalid inputs or empty queue calls show a red banner that auto-dismisses in 3 seconds

### Token Display Screen (TV / Waiting Hall)
- **Now Serving** — Large token number visible from across the room
- **Upcoming queue** — Shows all waiting patients with estimated wait times
- **People ahead** — Count shown below the current token
- **Next up highlight** — First patient in queue is highlighted in teal
- **Live clock** — Current time shown in top right in a glowing teal box
- **Last updated** — Timestamp of last server sync shown in header
- **Served today** — Footer shows total patients served
- **Empty state** — Shows "All patients seen" when queue clears after seeing patients
- **Live indicator** — Green dot confirms screen is receiving live updates

---

## Tech stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express + Socket.IO |
| Frontend | React + Vite + React Router v6 |
| Real-time | WebSockets via Socket.IO |
| Server deploy | Railway.app |
| Client deploy | Vercel |

---

## How to run locally

### 1. Backend (server)

```bash
cd server
npm install
node server.js       # runs on http://localhost:3001
```

### 2. Frontend (client)

```bash
cd client
npm install
npm run dev          # runs on http://localhost:5173
```

Create a `.env` file inside `/client`:
```
VITE_SERVER_URL=http://localhost:3001
```

Open two tabs:
- `http://localhost:5173/receptionist`
- `http://localhost:5173/display`

---

## Folder structure

```
queue-cure/
├── server/
│   ├── server.js         # Express + Socket.IO backend
│   └── package.json
└── client/
    └── src/
        ├── App.jsx        # React Router setup
        ├── Receptionist.jsx  # Staff screen
        └── Display.jsx    # Patient-facing TV screen
```

---

## Socket events

| Event | Direction | Payload | Description |
|---|---|---|---|
| `add-patient` | Client → Server | `{ name, phone4 }` | Add patient to queue |
| `call-next` | Client → Server | none | Call next token, start consult timer |
| `remove-patient` | Client → Server | `{ token }` | Remove patient from queue |
| `set-avg-time` | Client → Server | `{ avgTime }` | Manually override avg consult time |
| `reset-day` | Client → Server | none | Clear queue and reset all state |
| `queue-updated` | Server → All clients | `{ queue, currentToken, avgTime, servedCount }` | Broadcast full state to every connected screen |
| `error-msg` | Server → Sender | `string` | Error feedback to the emitting client only |

---

## Edge cases handled

- **Empty queue** — Call Next button is disabled on frontend; server also rejects the event with an error message
- **Patient leaves** — Remove button on each queue row fires `remove-patient` event immediately
- **Duplicate names** — Token number is the real unique ID. Optional phone last 4 helps differentiate patients with the same name
- **Server restart** — In-memory state resets. Queue and counters start fresh. Known limitation — production would use a persistent database
- **avgTime floor** — Server enforces minimum of 1 minute. Slider minimum is also 1. Prevents division-by-zero and nonsensical estimates
- **Rapid add clicks** — Each patient gets a unique auto-incrementing token — no duplicates possible
- **Socket disconnect** — Both screens show a red "Disconnected" indicator. Socket.IO auto-reconnects when server is back
- **Consultation timer overflow** — Only records durations between 1 second and 60 minutes. Filters out accidental double-clicks or very long idle gaps
- **Rolling avg** — Only the last 10 consultations are used for auto avg. Prevents old data from skewing estimates

## Concurrency note

Node.js is single-threaded so socket events are processed one at a time — no race conditions on the queue array. If two receptionists clicked "Call Next" simultaneously, the second event would find the queue already updated by the first.

---

## Known limitations

- State lives in memory — server restart clears everything
- No authentication — anyone with the URL can access the receptionist screen
- No database — not designed for multi-day persistence
- Single clinic — not multi-branch

---
