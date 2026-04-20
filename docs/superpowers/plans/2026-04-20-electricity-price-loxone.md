# Electricity Price → Loxone Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Node.js service that fetches next-day electricity spot prices from OKTE API daily after 13:00 and pushes 96 boolean slot values + current-state flags into Loxone Miniserver virtual inputs, with an HTML dashboard for day-ahead visualisation.

**Architecture:** A small Node.js process runs persistently, uses node-cron for two scheduled jobs (daily 13:05 fetch+push, every 15 min state update), stores the current day's slots in memory, and exposes an Express HTTP server for the visual dashboard. All Loxone communication is fire-and-forget HTTP GETs to the Miniserver REST API.

**Tech Stack:** Node.js 20+, axios, node-cron, express, dotenv, jest + nock (tests)

---

## File Structure

```
spoty/
├── src/
│   ├── okte.js         # OKTE API client — fetch & parse 96 slots
│   ├── schedule.js     # Slot index math, current-state, prebuffer logic
│   ├── loxone.js       # Push values to Loxone virtual inputs via HTTP
│   ├── cron.js         # Two cron jobs wired to okte + schedule + loxone
│   ├── dashboard.js    # Express app, HTML price chart route
│   └── index.js        # Entry point — starts cron + dashboard
├── tests/
│   ├── okte.test.js
│   ├── schedule.test.js
│   └── loxone.test.js
├── .env.example
├── .gitignore
└── package.json
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Initialise package.json**

```bash
cd /Users/ing.tomaslaso/Documents/work/spoty
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install axios node-cron express dotenv
npm install --save-dev jest nock
```

- [ ] **Step 3: Edit package.json — add scripts and jest config**

In `package.json`, set `"main": "src/index.js"` and replace the `scripts` block:

```json
{
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "jest --testEnvironment=node"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 4: Create .env.example**

```
OKTE_BASE_URL=https://test-isot.okte.sk/api/v1
LOXONE_IP=192.168.1.XX
LOXONE_USER=admin
LOXONE_PASS=secret
PREBUFFER_MINUTES=60
DASHBOARD_PORT=3000
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
.env
```

- [ ] **Step 6: Create src/ directory and verify**

```bash
mkdir -p src tests
ls src tests
```

Expected: both directories exist (empty).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: project setup, dependencies"
```

---

## Task 2: OKTE API Client

**Files:**
- Create: `src/okte.js`
- Create: `tests/okte.test.js`

### What the OKTE API returns

`GET /api/v1/dam/results?deliveryDayFrom=YYYY-MM-DD&deliveryDayTo=YYYY-MM-DD`

The response is a JSON array of objects. Each object represents one 15-minute delivery period. Key fields (verify against real response before running):

```json
[
  {
    "deliveryDay": "2025-04-24",
    "deliveryPeriod": 1,
    "finalPrice": 45.23
  }
]
```

- `deliveryPeriod`: integer 1–96 (1 = 00:00–00:15, 96 = 23:45–00:00)
- `finalPrice`: EUR/MWh, can be negative

**⚠️ Verify field names:** Call the API manually once with:
```bash
curl "https://test-isot.okte.sk/api/v1/dam/results?deliveryDayFrom=2025-04-24&deliveryDayTo=2025-04-24" | head -200
```
If field names differ from above, update the `PRICE_FIELD` and `PERIOD_FIELD` constants in `src/okte.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/okte.test.js`:

```js
const nock = require('nock')
const { fetchSlots } = require('../src/okte')

const BASE_URL = 'https://test-isot.okte.sk'

// minimal 3-slot fixture (real calls return 96)
const fixture = [
  { deliveryDay: '2025-04-24', deliveryPeriod: 1, finalPrice: 45.23 },
  { deliveryDay: '2025-04-24', deliveryPeriod: 2, finalPrice: -12.5 },
  { deliveryDay: '2025-04-24', deliveryPeriod: 3, finalPrice: 0.01 },
]

beforeEach(() => nock.cleanAll())
afterAll(() => nock.restore())

test('fetchSlots returns array of slot objects with HHMM and negative flag', async () => {
  nock(BASE_URL)
    .get('/api/v1/dam/results')
    .query({ deliveryDayFrom: '2025-04-24', deliveryDayTo: '2025-04-24' })
    .reply(200, fixture)

  const slots = await fetchSlots('2025-04-24', BASE_URL)

  expect(slots).toHaveLength(3)
  expect(slots[0]).toEqual({ slot: '0000', price: 45.23,  negative: false, period: 1 })
  expect(slots[1]).toEqual({ slot: '0015', price: -12.5,  negative: true,  period: 2 })
  expect(slots[2]).toEqual({ slot: '0030', price: 0.01,   negative: false, period: 3 })
})

test('fetchSlots throws on non-200 response', async () => {
  nock(BASE_URL)
    .get('/api/v1/dam/results')
    .query({ deliveryDayFrom: '2025-04-24', deliveryDayTo: '2025-04-24' })
    .reply(503, 'Service Unavailable')

  await expect(fetchSlots('2025-04-24', BASE_URL)).rejects.toThrow('OKTE API error: 503')
})

test('fetchSlots throws when response is not an array', async () => {
  nock(BASE_URL)
    .get('/api/v1/dam/results')
    .query({ deliveryDayFrom: '2025-04-24', deliveryDayTo: '2025-04-24' })
    .reply(200, { error: 'unexpected' })

  await expect(fetchSlots('2025-04-24', BASE_URL)).rejects.toThrow('OKTE response is not an array')
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx jest tests/okte.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/okte'`

- [ ] **Step 3: Implement src/okte.js**

```js
const axios = require('axios')

// ⚠️ Verify these field names against the real API response
const PERIOD_FIELD = 'deliveryPeriod'
const PRICE_FIELD  = 'finalPrice'

/**
 * Returns the YYYY-MM-DD string for tomorrow.
 */
function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Converts a 1-indexed delivery period (1–96) to a zero-padded HHMM string.
 * Period 1 → '0000', period 2 → '0015', period 96 → '2345'
 */
function periodToHHMM(period) {
  const totalMinutes = (period - 1) * 15
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const mm = String(totalMinutes % 60).padStart(2, '0')
  return hh + mm
}

/**
 * Fetches 15-min slot prices for the given date from the OKTE DAM results API.
 * @param {string} date - YYYY-MM-DD (defaults to tomorrow)
 * @param {string} baseUrl - override for testing
 * @returns {Promise<Array<{slot: string, price: number, negative: boolean, period: number}>>}
 */
async function fetchSlots(date, baseUrl) {
  const url = baseUrl || process.env.OKTE_BASE_URL
  const resp = await axios.get(`${url}/dam/results`, {
    params: { deliveryDayFrom: date, deliveryDayTo: date },
  })

  if (resp.status !== 200) {
    throw new Error(`OKTE API error: ${resp.status}`)
  }

  const data = resp.data
  if (!Array.isArray(data)) {
    throw new Error('OKTE response is not an array')
  }

  return data.map(item => {
    const period = item[PERIOD_FIELD]
    const price  = item[PRICE_FIELD]
    return {
      slot:     periodToHHMM(period),
      price:    price,
      negative: price < 0,
      period,
    }
  })
}

module.exports = { fetchSlots, tomorrow, periodToHHMM }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest tests/okte.test.js --no-coverage
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/okte.js tests/okte.test.js
git commit -m "feat: OKTE API client with slot parsing"
```

---

## Task 3: Schedule Calculator

**Files:**
- Create: `src/schedule.js`
- Create: `tests/schedule.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/schedule.test.js`:

```js
const { currentSlotNegative, prebufferActive } = require('../src/schedule')

// 96 slots: all positive except periods 5 (01:00) and 6 (01:15) which are negative
// and period 33 (08:00) which is negative
function makeSlots(negativePeriods = []) {
  return Array.from({ length: 96 }, (_, i) => {
    const period = i + 1
    const totalMinutes = i * 15
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const mm = String(totalMinutes % 60).padStart(2, '0')
    const price = negativePeriods.includes(period) ? -10 : 10
    return { slot: hh + mm, price, negative: price < 0, period }
  })
}

describe('currentSlotNegative', () => {
  test('returns true when current 15-min slot is negative', () => {
    const slots = makeSlots([5]) // period 5 = 01:00–01:15
    const date = new Date('2025-04-24T01:07:00')
    expect(currentSlotNegative(slots, date)).toBe(true)
  })

  test('returns false when current slot is positive', () => {
    const slots = makeSlots([5])
    const date = new Date('2025-04-24T00:59:00') // period 4, positive
    expect(currentSlotNegative(slots, date)).toBe(false)
  })

  test('returns false when slots array is empty', () => {
    expect(currentSlotNegative([], new Date())).toBe(false)
  })
})

describe('prebufferActive', () => {
  test('returns true when within prebufferMinutes before a negative block', () => {
    const slots = makeSlots([33]) // period 33 = 08:00
    const date = new Date('2025-04-24T07:10:00') // 50 min before 08:00
    expect(prebufferActive(slots, date, 60)).toBe(true)
  })

  test('returns false when outside prebuffer window', () => {
    const slots = makeSlots([33])
    const date = new Date('2025-04-24T06:50:00') // 70 min before 08:00
    expect(prebufferActive(slots, date, 60)).toBe(false)
  })

  test('returns false when already inside a negative slot (prebuffer does not overlap active negative)', () => {
    const slots = makeSlots([33])
    const date = new Date('2025-04-24T08:05:00') // inside negative period
    expect(prebufferActive(slots, date, 60)).toBe(false)
  })

  test('returns true when 1 minute before negative block', () => {
    const slots = makeSlots([33]) // 08:00
    const date = new Date('2025-04-24T07:59:00')
    expect(prebufferActive(slots, date, 60)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx jest tests/schedule.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/schedule'`

- [ ] **Step 3: Implement src/schedule.js**

```js
/**
 * Returns the index (0-based) of the 15-min slot for a given Date.
 * Slot 0 = 00:00–00:15, slot 95 = 23:45–00:00
 */
function slotIndex(date) {
  const minutesSinceMidnight = date.getHours() * 60 + date.getMinutes()
  return Math.floor(minutesSinceMidnight / 15)
}

/**
 * Returns true if the slot at the current time is negative-priced.
 * @param {Array} slots - from fetchSlots()
 * @param {Date} now
 */
function currentSlotNegative(slots, now) {
  if (!slots.length) return false
  const idx = slotIndex(now)
  return slots[idx] ? slots[idx].negative : false
}

/**
 * Returns true if we are within prebufferMinutes BEFORE the start
 * of any negative-price block AND the current slot itself is NOT negative.
 * @param {Array} slots
 * @param {Date} now
 * @param {number} prebufferMinutes
 */
function prebufferActive(slots, now, prebufferMinutes) {
  if (!slots.length) return false

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const currentIdx = slotIndex(now)
  if (slots[currentIdx] && slots[currentIdx].negative) return false

  // Find start minutes of every negative block
  // A "block start" is a slot that is negative and whose predecessor is not negative (or it's slot 0)
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i].negative) continue
    const isBlockStart = i === 0 || !slots[i - 1].negative
    if (!isBlockStart) continue

    const blockStartMinutes = i * 15
    const minutesBefore = blockStartMinutes - nowMinutes
    if (minutesBefore > 0 && minutesBefore <= prebufferMinutes) return true
  }

  return false
}

module.exports = { currentSlotNegative, prebufferActive, slotIndex }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest tests/schedule.test.js --no-coverage
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schedule.js tests/schedule.test.js
git commit -m "feat: schedule calculator — current slot and prebuffer logic"
```

---

## Task 4: Loxone Pusher

**Files:**
- Create: `src/loxone.js`
- Create: `tests/loxone.test.js`

Loxone virtual input HTTP command format:
```
GET http://USER:PASS@MINISERVER_IP/dev/sps/io/INPUT_NAME/VALUE
```
Returns HTTP 200 on success. We fire all 96 in parallel and log individual failures without aborting.

- [ ] **Step 1: Write the failing test**

Create `tests/loxone.test.js`:

```js
const nock = require('nock')
const { pushDaySchedule, pushCurrentState } = require('../src/loxone')

const config = {
  ip: '192.168.1.100',
  user: 'admin',
  pass: 'secret',
}

beforeEach(() => nock.cleanAll())
afterAll(() => nock.restore())

function makeSlots(negativePeriods = []) {
  return Array.from({ length: 96 }, (_, i) => {
    const period = i + 1
    const totalMinutes = i * 15
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const mm = String(totalMinutes % 60).padStart(2, '0')
    return { slot: hh + mm, price: negativePeriods.includes(period) ? -1 : 1, negative: negativePeriods.includes(period), period }
  })
}

test('pushDaySchedule sends one request per slot with correct name and value', async () => {
  const slots = makeSlots([2]) // slot_0015 should be 1, rest 0
  const interceptors = slots.map(s =>
    nock(`http://${config.ip}`)
      .get(`/dev/sps/io/slot_${s.slot}/${s.negative ? 1 : 0}`)
      .basicAuth({ user: config.user, pass: config.pass })
      .reply(200, 'OK')
  )

  await pushDaySchedule(slots, config)

  interceptors.forEach(i => expect(i.isDone()).toBe(true))
})

test('pushCurrentState sends current_slot_negative and prebuffer_active', async () => {
  const n = nock(`http://${config.ip}`)
    .get('/dev/sps/io/current_slot_negative/1')
    .basicAuth({ user: config.user, pass: config.pass })
    .reply(200, 'OK')
    .get('/dev/sps/io/prebuffer_active/0')
    .basicAuth({ user: config.user, pass: config.pass })
    .reply(200, 'OK')

  await pushCurrentState(true, false, config)

  expect(n.isDone()).toBe(true)
})

test('pushDaySchedule does not throw when a slot request fails', async () => {
  const slots = makeSlots()
  // intercept only first slot, rest will fail
  nock(`http://${config.ip}`)
    .get(`/dev/sps/io/slot_0000/0`)
    .basicAuth({ user: config.user, pass: config.pass })
    .reply(200, 'OK')
  // other 95 will get ECONNREFUSED — should not throw

  await expect(pushDaySchedule(slots, config)).resolves.not.toThrow()
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx jest tests/loxone.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/loxone'`

- [ ] **Step 3: Implement src/loxone.js**

```js
const axios = require('axios')

/**
 * Resolves config from object or from process.env.
 */
function getConfig(override) {
  return {
    ip:   (override && override.ip)   || process.env.LOXONE_IP,
    user: (override && override.user) || process.env.LOXONE_USER,
    pass: (override && override.pass) || process.env.LOXONE_PASS,
  }
}

/**
 * Fires a single GET to set a Loxone virtual input value.
 * Does not throw — logs warnings on failure.
 */
async function pushOne(name, value, cfg) {
  const url = `http://${cfg.ip}/dev/sps/io/${name}/${value}`
  try {
    await axios.get(url, {
      auth: { username: cfg.user, password: cfg.pass },
      timeout: 5000,
    })
  } catch (err) {
    console.warn(`[loxone] failed to set ${name}=${value}: ${err.message}`)
  }
}

/**
 * Pushes all 96 slot boolean values to Loxone in parallel.
 * Virtual input names: slot_0000, slot_0015, ..., slot_2345
 * @param {Array} slots - from fetchSlots()
 * @param {object} [configOverride] - for testing
 */
async function pushDaySchedule(slots, configOverride) {
  const cfg = getConfig(configOverride)
  await Promise.all(
    slots.map(s => pushOne(`slot_${s.slot}`, s.negative ? 1 : 0, cfg))
  )
}

/**
 * Pushes current_slot_negative and prebuffer_active to Loxone.
 * @param {boolean} isNegative
 * @param {boolean} prebuffer
 * @param {object} [configOverride]
 */
async function pushCurrentState(isNegative, prebuffer, configOverride) {
  const cfg = getConfig(configOverride)
  await Promise.all([
    pushOne('current_slot_negative', isNegative ? 1 : 0, cfg),
    pushOne('prebuffer_active',      prebuffer   ? 1 : 0, cfg),
  ])
}

module.exports = { pushDaySchedule, pushCurrentState }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest tests/loxone.test.js --no-coverage
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/loxone.js tests/loxone.test.js
git commit -m "feat: Loxone HTTP pusher for day schedule and current state"
```

---

## Task 5: Cron Scheduler

**Files:**
- Create: `src/cron.js`

No unit tests for cron itself — it's a thin wire. Integration is verified manually in Task 7.

- [ ] **Step 1: Run all existing tests to confirm green baseline**

```bash
npx jest --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 2: Create src/cron.js**

```js
require('dotenv').config()
const cron = require('node-cron')
const { fetchSlots, tomorrow } = require('./okte')
const { currentSlotNegative, prebufferActive } = require('./schedule')
const { pushDaySchedule, pushCurrentState } = require('./loxone')

// In-memory store for today's fetched slots
let cachedSlots = []
let cachedDate  = null

const PREBUFFER_MINUTES = parseInt(process.env.PREBUFFER_MINUTES || '60', 10)

/**
 * Fetches next-day slots and pushes all 96 to Loxone.
 * Called once at 13:05 and on startup if cache is stale.
 */
async function runDailyFetch(attempt = 1) {
  const date = tomorrow()
  console.log(`[cron] fetching slots for ${date} (attempt ${attempt}/3)`)
  try {
    const slots = await fetchSlots(date)
    cachedSlots = slots
    cachedDate  = date
    await pushDaySchedule(slots)
    console.log(`[cron] pushed ${slots.length} slots to Loxone for ${date}`)
  } catch (err) {
    console.error(`[cron] daily fetch failed: ${err.message}`)
    if (attempt < 3) {
      console.log(`[cron] retrying in 30 minutes`)
      setTimeout(() => runDailyFetch(attempt + 1), 30 * 60 * 1000)
    } else {
      console.error('[cron] all 3 attempts failed — Loxone keeps previous day data')
    }
  }
}

/**
 * Recomputes current state from cached slots and pushes to Loxone.
 * Called every 15 minutes.
 */
async function runStateUpdate() {
  if (!cachedSlots.length) {
    console.warn('[cron] state update skipped — no cached slots')
    return
  }
  const now = new Date()
  const isNeg     = currentSlotNegative(cachedSlots, now)
  const prebuffer = prebufferActive(cachedSlots, now, PREBUFFER_MINUTES)
  console.log(`[cron] state update: negative=${isNeg}, prebuffer=${prebuffer}`)
  await pushCurrentState(isNeg, prebuffer)
}

/**
 * Starts both cron jobs and runs an immediate startup check.
 */
function start() {
  // Daily at 13:05 — fetch next day's prices and push all 96 slots
  cron.schedule('5 13 * * *', runDailyFetch)

  // Every 15 minutes — push current slot state
  cron.schedule('*/15 * * * *', runStateUpdate)

  // On startup: if we have no cached data, fetch immediately
  const todayStr = new Date().toISOString().slice(0, 10)
  if (cachedDate !== todayStr) {
    console.log('[cron] startup: no cached data, triggering immediate fetch')
    runDailyFetch().then(() => runStateUpdate())
  }
}

module.exports = { start, runDailyFetch, runStateUpdate, getCachedSlots: () => cachedSlots }
```

- [ ] **Step 3: Commit**

```bash
git add src/cron.js
git commit -m "feat: cron scheduler — daily fetch at 13:05 + 15-min state updates"
```

---

## Task 6: HTML Dashboard

**Files:**
- Create: `src/dashboard.js`

- [ ] **Step 1: Create src/dashboard.js**

```js
const express = require('express')
const { getCachedSlots } = require('./cron')

const app = express()

app.get('/', (req, res) => {
  const slots = getCachedSlots()
  const date = slots.length ? 'tomorrow' : 'no data yet'

  const bars = slots.map(s => {
    const color  = s.negative ? '#ef4444' : '#22c55e'
    const height = Math.min(100, Math.max(8, Math.abs(s.price) / 2))
    const label  = `${s.slot.slice(0, 2)}:${s.slot.slice(2)} ${s.price.toFixed(1)} €`
    return `<div title="${label}" style="display:inline-block;width:1%;height:${height}px;background:${color};margin:0 0.5px;vertical-align:bottom"></div>`
  }).join('')

  const negCount = slots.filter(s => s.negative).length

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="300">
  <title>Electricity Prices</title>
  <style>
    body { font-family: sans-serif; background: #111; color: #eee; padding: 16px; }
    h2 { margin-bottom: 4px; }
    .legend { margin: 8px 0 16px; font-size: 13px; }
    .legend span { display: inline-block; width: 12px; height: 12px; margin-right: 4px; vertical-align: middle; }
    .chart { width: 100%; background: #1e1e1e; padding: 16px; border-radius: 8px; }
  </style>
</head>
<body>
  <h2>Spot prices — ${date}</h2>
  <div class="legend">
    <span style="background:#22c55e"></span>Positive &nbsp;
    <span style="background:#ef4444"></span>Negative (${negCount} slots)
  </div>
  <div class="chart" style="height:120px;position:relative;overflow:hidden">
    ${bars || '<p style="color:#888">Waiting for data (runs daily at 13:05).</p>'}
  </div>
  <p style="font-size:11px;color:#666;margin-top:8px">Auto-refreshes every 5 min</p>
</body>
</html>`)
})

function start(port) {
  const p = port || parseInt(process.env.DASHBOARD_PORT || '3000', 10)
  app.listen(p, () => console.log(`[dashboard] listening on http://localhost:${p}`))
}

module.exports = { start }
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard.js
git commit -m "feat: HTML dashboard with price bar chart"
```

---

## Task 7: Entry Point + Smoke Test

**Files:**
- Create: `src/index.js`

- [ ] **Step 1: Create src/index.js**

```js
require('dotenv').config()
const cron      = require('./cron')
const dashboard = require('./dashboard')

dashboard.start()
cron.start()
```

- [ ] **Step 2: Create .env from .env.example and fill in real values**

```bash
cp .env.example .env
# Edit .env with your actual Loxone IP, credentials, and OKTE URL
```

- [ ] **Step 3: Run all tests one final time**

```bash
npx jest --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 4: Smoke test — start the service and verify dashboard**

```bash
node src/index.js
```

Expected output:
```
[dashboard] listening on http://localhost:3000
[cron] startup: no cached data, triggering immediate fetch
[cron] fetching slots for YYYY-MM-DD
[cron] pushed 96 slots to Loxone for YYYY-MM-DD
[cron] state update: negative=..., prebuffer=...
```

Open `http://localhost:3000` — verify the price bar chart appears.

If OKTE API returns data with different field names than `deliveryPeriod` / `finalPrice`, edit the constants at the top of `src/okte.js`.

- [ ] **Step 5: Commit**

```bash
git add src/index.js
git commit -m "feat: entry point — wires dashboard and cron"
```

---

## Task 8: Loxone Manual Setup Checklist

This is a one-time manual step in Loxone Config — not code.

- [ ] Open Loxone Config → Periphery → Virtual Inputs
- [ ] Create 96 Digital Virtual Inputs named `slot_0000`, `slot_0015`, `slot_0030` … `slot_2345`

  Fastest way: use the "duplicate" feature in Loxone Config — create the first one, duplicate 95 times, rename via find-replace.

- [ ] Create Digital Virtual Input `current_slot_negative`
- [ ] Create Digital Virtual Input `prebuffer_active`
- [ ] In your automation program: connect `prebuffer_active` → disable GoodWe battery charge (Modbus write, Step 2)
- [ ] In your automation program: connect `current_slot_negative` → stop export, enable charge from solar (Modbus write, Step 2)
- [ ] Add a Loxone Web Page widget pointing to `http://NODE_JS_MACHINE_IP:3000`
- [ ] Save and send config to Miniserver

---

## Appendix: Running as a persistent service (macOS launchd)

After everything works, to run the Node.js service automatically on boot:

```bash
# Create ~/Library/LaunchAgents/spoty.plist
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>spoty</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/ing.tomaslaso/Documents/work/spoty/src/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/ing.tomaslaso/Documents/work/spoty</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/spoty.log</string>
  <key>StandardErrorPath</key><string>/tmp/spoty.err</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/spoty.plist
```
