# Design: Electricity Price → Loxone → GoodWe

**Date:** 2026-04-20  
**Status:** Approved

---

## Overview

Node.js service that fetches next-day electricity spot prices from the OKTE API daily after 13:00, pushes 96 boolean slot values (positive/negative price) into Loxone Miniserver virtual inputs, and provides a live current-slot flag plus a pre-buffer flag so Loxone can automate GoodWe inverter behaviour via Modbus TCP.

---

## Goals

- **Step 1 (this spec):** Get day-ahead price slots into Loxone so they can be visualised and used for automation logic.
- **Step 2 (future):** Loxone (or Node.js) writes Modbus TCP registers to GoodWe to control battery charge/discharge/export based on slot values.

### Core automation logic (drives all design decisions)

| Condition | Action |
|---|---|
| `prebuffer_active = 1` (X min before negative block) | Stop charging battery — preserve capacity for upcoming negative period |
| `current_slot_negative = 1` | Charge battery from solar, stop export to grid |
| `current_slot_negative = 0` (positive price) | Normal mode — feed excess to grid |

---

## Architecture

```
OKTE API (https://test-isot.okte.sk/api/v1/dam/results)
   │  GET daily after 13:05
   ▼
Node.js Service
   ├── cron 13:05 → fetch next-day prices, push 96 slots to Loxone
   ├── cron */15min → push current_slot_negative + prebuffer_active
   └── HTTP server → HTML price chart dashboard (for Loxone webview)

Loxone Miniserver
   ├── 96× Virtual Input: slot_0000 … slot_2345  (0=positive, 1=negative)
   ├── Virtual Input: current_slot_negative       (0/1)
   ├── Virtual Input: prebuffer_active             (0/1)
   └── Modbus TCP client → GoodWe inverter (Step 2)
```

---

## Components

### 1. OKTE API client (`src/okte.js`)

- Fetches `GET /api/v1/dam/results?deliveryDayFrom=DATE&deliveryDayTo=DATE`
- Date is always **tomorrow** (`today + 1 day`)
- Parses response: extracts array of 96 price values ordered by delivery period
- Returns `[{ slot: 'HHMM', price: number, negative: boolean }]`
- Error handling: if API returns non-200 or malformed data, logs error and retries after 30 min (max 3 retries); alerts via console if all retries fail

### 2. Schedule calculator (`src/schedule.js`)

- Accepts the 96-slot array
- Computes `prebuffer_active` for a given datetime: returns `1` if within `PREBUFFER_MINUTES` (default: 60) of the start of any negative block
- Computes `current_slot_negative` for a given datetime: finds the slot index from `Math.floor(minutes_since_midnight / 15)`, returns `negative` flag
- Prebuffer window is configurable via env var `PREBUFFER_MINUTES`

### 3. Loxone pusher (`src/loxone.js`)

- Pushes values via `GET http://USER:PASS@MINISERVER_IP/dev/sps/io/VIRTUAL_INPUT_NAME/VALUE`
- `pushDaySchedule(slots)`: pushes all 96 slot values — virtual input names are `slot_HHMM` (e.g. `slot_0000`, `slot_0015`, … `slot_2345`)
- `pushCurrentState(isNegative, prebuffer)`: pushes `current_slot_negative` and `prebuffer_active`
- All requests fire in parallel (Promise.all) — 96 requests complete in < 2s on LAN
- On HTTP error per slot: logs warning, does not abort the rest

### 4. Cron scheduler (`src/cron.js`)

- `13:05` daily: fetch next-day data → push 96 slots → store in memory
- `*/15 * * * *`: recompute current state from stored data → push `current_slot_negative` + `prebuffer_active`
- On startup: if stored data is missing or stale (> 24h old), triggers an immediate fetch

### 5. HTML dashboard (`src/dashboard.js`)

- Express route `GET /` — renders a simple HTML page
- Shows a colour-coded bar chart of all 96 slots for tomorrow (green = positive, red = negative)
- Shows current slot highlighted
- No dependencies beyond a small inline SVG/CSS — no frontend build step
- Loxone embeds this URL as a webview widget

---

## Configuration (`.env`)

```
OKTE_BASE_URL=https://test-isot.okte.sk/api/v1
LOXONE_IP=192.168.1.XX
LOXONE_USER=admin
LOXONE_PASS=secret
PREBUFFER_MINUTES=60
DASHBOARD_PORT=3000
```

---

## Loxone setup (one-time manual)

1. Create 96 Virtual Inputs named `slot_0000`, `slot_0015`, … `slot_2345`
2. Create Virtual Input `current_slot_negative`
3. Create Virtual Input `prebuffer_active`
4. In automation blocks: use `prebuffer_active` → disable battery charge; use `current_slot_negative` → trigger GoodWe Modbus write (Step 2)
5. Add a webview widget pointing to `http://NODE_JS_IP:3000`

---

## GoodWe Modbus — Step 2 (not in scope here, documented for reference)

Register `0x00F4` = EMS Power Mode:
- `0` = General (normal)  
- `2` = Force charge  
- `3` = Stop export  

Register `0x00F5` = EMS Power Value (watts)

Loxone will write these registers directly via its Modbus TCP client block when `current_slot_negative` changes.

---

## Error handling summary

| Scenario | Behaviour |
|---|---|
| OKTE API unavailable at 13:05 | Retry every 30 min, max 3× |
| All retries fail | Log error; previous day's data remains in Loxone (stale but safe) |
| Loxone unreachable for push | Log warning per slot; retry on next 15-min tick |
| Service restarts | On startup, fetch immediately if data missing or stale |

---

## Out of scope (Step 1)

- Writing Modbus commands to GoodWe (Step 2)
- Reading current battery state from GoodWe
- Dynamic prebuffer calculation based on battery SOC
- Integration with car charger or washing machine schedules
