const express = require('express')
const { getCachedSlots } = require('./cron')
const { fetchRange, fetchSlots, tomorrow } = require('./okte')

const app = express()

function bratislavaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = t => parts.find(p => p.type === t).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

app.get('/', async (req, res) => {
  const tomorrowDate = tomorrow()
  const selectedDate = req.query.date || tomorrowDate
  const isToday = selectedDate === bratislavaToday()
  const isTomorrow = selectedDate === tomorrowDate

  // use cache for tomorrow, fetch API for any other date
  let slots, error = null
  if (isTomorrow && !req.query.date) {
    slots = getCachedSlots()
  } else {
    try {
      slots = await fetchSlots(selectedDate)
    } catch (err) {
      slots = []
      error = err.message
    }
  }

  // prev / next dates
  const selD = new Date(selectedDate + 'T12:00:00Z')
  const prevDate = new Date(selD); prevDate.setUTCDate(selD.getUTCDate() - 1)
  const nextDate = new Date(selD); nextDate.setUTCDate(selD.getUTCDate() + 1)
  const prevStr = prevDate.toISOString().slice(0, 10)
  const nextStr = nextDate.toISOString().slice(0, 10)

  const dateLabel = new Intl.DateTimeFormat('sk-SK', {
    timeZone: 'Europe/Bratislava', dateStyle: 'full',
  }).format(new Date(selectedDate + 'T12:00:00Z'))

  // current slot index (only meaningful when viewing today/tomorrow)
  const now = new Date()
  const nowParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const hNow = parseInt(nowParts.find(p => p.type === 'hour').value)
  const mNow = parseInt(nowParts.find(p => p.type === 'minute').value)
  const currentIdx = (isToday || isTomorrow) ? Math.floor((hNow * 60 + mNow) / 15) : -1

  const negCount  = slots.filter(s => s.negative).length
  const minPrice  = slots.length ? Math.min(...slots.map(s => s.price)) : 0
  const maxPrice  = slots.length ? Math.max(...slots.map(s => s.price)) : 100
  const priceRange = maxPrice - minPrice || 1

  const bars = slots.map((s, i) => {
    const color      = s.negative ? '#ef4444' : '#22c55e'
    const border     = i === currentIdx ? '2px solid #fff' : 'none'
    const heightPct  = 10 + 80 * (s.price - minPrice) / priceRange
    const time       = `${s.slot.slice(0, 2)}:${s.slot.slice(2)}`
    const label      = `${time}  ${s.price.toFixed(2)} €/MWh`
    return `<div title="${label}" style="display:inline-block;width:1%;height:${heightPct.toFixed(1)}%;background:${color};margin:0 0.5px;vertical-align:bottom;box-sizing:border-box;border-top:${border}"></div>`
  }).join('')

  const hourLabels = Array.from({ length: 9 }, (_, i) => {
    const h = i * 3
    const left = (h / 24 * 100).toFixed(1)
    return `<div style="position:absolute;left:${left}%;font-size:10px;color:#666;transform:translateX(-50%)">${String(h).padStart(2,'0')}:00</div>`
  }).join('')

  const negBlocks = []
  let inBlock = false, blockStart = ''
  slots.forEach(s => {
    const time = `${s.slot.slice(0,2)}:${s.slot.slice(2)}`
    if (s.negative && !inBlock) { inBlock = true; blockStart = time }
    if (!s.negative && inBlock) { negBlocks.push(`${blockStart} – ${time}`); inBlock = false }
  })
  if (inBlock) negBlocks.push(`${blockStart} – 24:00`)

  const blockList = negBlocks.length
    ? negBlocks.map(b => `<li>${b}</li>`).join('')
    : '<li style="color:#555">žiadne záporné ceny</li>'

  // auto-refresh only for today/tomorrow views
  const autoRefresh = (isToday || isTomorrow) ? '<meta http-equiv="refresh" content="60">' : ''

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${autoRefresh}
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Spot ceny</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body { font-family: sans-serif; background: #111; color: #eee; padding: 12px; font-size: 14px }
    .topbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap }
    .nav-btn { color: #888; text-decoration: none; font-size: 20px; padding: 4px 10px; background: #1e1e1e; border-radius: 6px; line-height: 1 }
    .nav-btn:hover { color: #fff }
    input[type=date] { background: #1e1e1e; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 6px 10px; font-size: 14px; cursor: pointer }
    input[type=date]:focus { outline: none; border-color: #555 }
    .today-btn { font-size: 12px; color: #888; text-decoration: none; background: #1e1e1e; border-radius: 6px; padding: 6px 10px }
    .today-btn:hover { color: #fff }
    .date-label { font-size: 13px; color: #666 }
    .error { color: #ef4444; font-size: 13px; margin-bottom: 10px }
    .stats { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap }
    .stat { background: #1e1e1e; border-radius: 8px; padding: 8px 14px; text-align: center }
    .stat .val { font-size: 22px; font-weight: bold }
    .stat .lbl { font-size: 11px; color: #888; margin-top: 2px }
    .neg { color: #ef4444 } .pos { color: #22c55e }
    .chart-wrap { background: #1e1e1e; border-radius: 8px; padding: 12px; margin-bottom: 12px }
    .chart { width: 100%; height: 100px; display: flex; align-items: flex-end }
    .hours { position: relative; height: 16px; margin-top: 2px }
    .blocks h3 { font-size: 12px; color: #888; margin-bottom: 6px; font-weight: normal }
    .blocks ul { list-style: none; display: flex; flex-wrap: wrap; gap: 6px }
    .blocks li { background: #2a1a1a; color: #ef4444; border-radius: 4px; padding: 3px 8px; font-size: 13px }
    .footer { display: flex; justify-content: space-between; margin-top: 12px; font-size: 11px; color: #444 }
    .footer a { color: #555; text-decoration: none } .footer a:hover { color: #aaa }
  </style>
</head>
<body>
  <div class="topbar">
    <a class="nav-btn" href="/?date=${prevStr}">‹</a>
    <input type="date" value="${selectedDate}" onchange="location.href='/?date='+this.value">
    <a class="nav-btn" href="/?date=${nextStr}">›</a>
    ${!isTomorrow ? `<a class="today-btn" href="/">zajtra</a>` : ''}
    <span class="date-label">${dateLabel}</span>
  </div>

  ${error ? `<div class="error">Chyba: ${error}</div>` : ''}

  <div class="stats">
    <div class="stat">
      <div class="val ${negCount > 0 ? 'neg' : 'pos'}">${negCount}</div>
      <div class="lbl">záporných slotov</div>
    </div>
    <div class="stat">
      <div class="val neg">${minPrice.toFixed(1)}</div>
      <div class="lbl">min €/MWh</div>
    </div>
    <div class="stat">
      <div class="val pos">${maxPrice.toFixed(1)}</div>
      <div class="lbl">max €/MWh</div>
    </div>
  </div>

  <div class="chart-wrap">
    <div class="chart">
      ${bars || '<p style="color:#555;padding:8px">Žiadne dáta pre tento deň.</p>'}
    </div>
    <div class="hours">${hourLabels}</div>
  </div>

  <div class="blocks">
    <h3>Záporné bloky</h3>
    <ul>${blockList}</ul>
  </div>

  <div class="footer">
    <a href="/week">Týždenný prehľad →</a>
    ${(isToday || isTomorrow) ? '<span>Aktualizuje sa každú minútu</span>' : ''}
  </div>
</body>
</html>`)
})

// ── Weekly view helpers ──────────────────────────────────────────────────────

function isoWeekDates(year, week) {
  // Returns [Mon..Sun] as YYYY-MM-DD strings for the given ISO week
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function currentISOWeek() {
  const now = new Date()
  const jan4 = new Date(Date.UTC(now.getUTCFullYear(), 0, 4))
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1))
  const week = Math.floor((now - startOfWeek1) / (7 * 864e5)) + 1
  return { year: now.getUTCFullYear(), week }
}

// Aggregate 96 x 15-min slots → 24 hourly buckets
// A bucket is negative if ANY slot in it is negative
function toHourlyBuckets(slots) {
  const hours = Array.from({ length: 24 }, () => ({ negative: false, prices: [] }))
  for (const s of slots) {
    const h = parseInt(s.slot.slice(0, 2))
    hours[h].prices.push(s.price)
    if (s.negative) hours[h].negative = true
  }
  return hours.map(h => ({
    negative: h.negative,
    avg: h.prices.length ? h.prices.reduce((a, b) => a + b, 0) / h.prices.length : 0,
  }))
}

function dayChart(date, slots) {
  const dayNames = ['Ne','Po','Ut','St','Št','Pi','So']
  const d = new Date(date + 'T12:00:00Z')
  const dayName = dayNames[d.getUTCDay()]
  const dayNum  = d.getUTCDate()
  const month   = d.getUTCMonth() + 1

  if (!slots || !slots.length) {
    return `<div style="flex:1;min-width:120px;background:#1e1e1e;border-radius:8px;padding:8px">
      <div style="font-size:12px;color:#666;margin-bottom:6px">${dayName} ${dayNum}.${month}.</div>
      <div style="font-size:11px;color:#444">no data</div>
    </div>`
  }

  const hours = toHourlyBuckets(slots)
  const allPrices = hours.map(h => h.avg)
  const minP = Math.min(...allPrices), maxP = Math.max(...allPrices)
  const range = maxP - minP || 1
  const negCount = slots.filter(s => s.negative).length

  const bars = hours.map((h, i) => {
    const color  = h.negative ? '#ef4444' : '#22c55e'
    const height = 10 + 80 * (h.avg - minP) / range
    const label  = `${String(i).padStart(2,'0')}:00  ${h.avg.toFixed(1)} €`
    return `<div title="${label}" style="flex:1;height:${height.toFixed(1)}%;background:${color};margin:0 1px;align-self:flex-end"></div>`
  }).join('')

  return `<div style="flex:1;min-width:120px;background:#1e1e1e;border-radius:8px;padding:8px">
    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:13px;font-weight:bold">${dayName} ${dayNum}.${month}.</span>
      ${negCount > 0 ? `<span style="font-size:11px;color:#ef4444">${negCount} záp.</span>` : '<span style="font-size:11px;color:#22c55e">✓</span>'}
    </div>
    <div style="display:flex;align-items:flex-end;height:60px;gap:0">${bars}</div>
    <div style="display:flex;justify-content:space-between;margin-top:3px">
      <span style="font-size:9px;color:#555">00</span>
      <span style="font-size:9px;color:#555">12</span>
      <span style="font-size:9px;color:#555">24</span>
    </div>
  </div>`
}

app.get('/week', async (req, res) => {
  const { year: curYear, week: curWeek } = currentISOWeek()
  const year = parseInt(req.query.year) || curYear
  const week = parseInt(req.query.week) || curWeek

  const prevWeek = week === 1 ? { year: year - 1, week: 52 } : { year, week: week - 1 }
  const nextWeek = week === 52 ? { year: year + 1, week: 1 } : { year, week: week + 1 }

  const dates = isoWeekDates(year, week)
  const from = dates[0], to = dates[6]

  let byDay = {}, error = null
  try {
    byDay = await fetchRange(from, to)
  } catch (err) {
    error = err.message
  }

  const charts = dates.map(d => dayChart(d, byDay[d])).join('')

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Týždenný prehľad</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body { font-family: sans-serif; background: #111; color: #eee; padding: 12px }
    h2 { font-size: 15px; margin-bottom: 12px; color: #aaa; font-weight: normal }
    .nav { display: flex; align-items: center; gap: 12px; margin-bottom: 14px }
    .nav a { color: #aaa; text-decoration: none; font-size: 20px; padding: 4px 8px }
    .nav a:hover { color: #fff }
    .week-label { font-size: 15px; font-weight: bold }
    .days { display: flex; gap: 8px; flex-wrap: wrap }
    .legend { display: flex; gap: 14px; margin-top: 12px; font-size: 12px; color: #888 }
    .legend span { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle }
    .error { color: #ef4444; font-size: 13px; margin: 10px 0 }
    .back { display: inline-block; margin-top: 14px; font-size: 12px; color: #555; text-decoration: none }
    .back:hover { color: #aaa }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/week?year=${prevWeek.year}&week=${prevWeek.week}">‹</a>
    <span class="week-label">Týždeň ${week} / ${year} &nbsp;<span style="font-size:12px;color:#666">${from} – ${to}</span></span>
    <a href="/week?year=${nextWeek.year}&week=${nextWeek.week}">›</a>
  </nav>
  ${error ? `<div class="error">Chyba: ${error}</div>` : ''}
  <div class="days">${charts}</div>
  <div class="legend">
    <div><span style="background:#22c55e"></span>kladná cena</div>
    <div><span style="background:#ef4444"></span>záporná cena (aspoň 1 slot v hodine)</div>
  </div>
  <a class="back" href="/">← Zajtrajší deň</a>
</body>
</html>`)
})

function start(port) {
  const p = port || parseInt(process.env.DASHBOARD_PORT || '3000', 10)
  app.listen(p, () => console.log(`[dashboard] listening on http://localhost:${p}`))
}

module.exports = { start }
