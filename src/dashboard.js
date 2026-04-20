const express = require('express')
const { getCachedSlots } = require('./cron')

const app = express()

app.get('/', (req, res) => {
  const slots = getCachedSlots()

  // tomorrow's date in Bratislava time
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dateStr = new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'full' }).format(tomorrow)

  // current slot index (Bratislava time)
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now)
  const hNow = parseInt(parts.find(p => p.type === 'hour').value)
  const mNow = parseInt(parts.find(p => p.type === 'minute').value)
  const currentIdx = Math.floor((hNow * 60 + mNow) / 15)

  const negCount = slots.filter(s => s.negative).length
  const minPrice = slots.length ? Math.min(...slots.map(s => s.price)) : 0
  const maxPrice = slots.length ? Math.max(...slots.map(s => s.price)) : 100
  const priceRange = maxPrice - minPrice || 1

  // bar chart
  const bars = slots.map((s, i) => {
    const color   = s.negative ? '#ef4444' : '#22c55e'
    const border  = i === currentIdx ? '2px solid #fff' : 'none'
    const heightPct = 10 + 80 * (s.price - minPrice) / priceRange
    const time    = `${s.slot.slice(0, 2)}:${s.slot.slice(2)}`
    const label   = `${time}  ${s.price.toFixed(2)} €/MWh`
    return `<div title="${label}" style="display:inline-block;width:1%;height:${heightPct.toFixed(1)}%;background:${color};margin:0 0.5px;vertical-align:bottom;box-sizing:border-box;border-top:${border}"></div>`
  }).join('')

  // hour labels under chart (every 3h = every 12 slots)
  const hourLabels = Array.from({ length: 9 }, (_, i) => {
    const h = i * 3
    const left = (h / 24 * 100).toFixed(1)
    return `<div style="position:absolute;left:${left}%;font-size:10px;color:#666;transform:translateX(-50%)">${String(h).padStart(2,'0')}:00</div>`
  }).join('')

  // negative blocks summary
  const negBlocks = []
  let inBlock = false, blockStart = ''
  slots.forEach((s, i) => {
    const time = `${s.slot.slice(0,2)}:${s.slot.slice(2)}`
    if (s.negative && !inBlock) { inBlock = true; blockStart = time }
    if (!s.negative && inBlock) { negBlocks.push(`${blockStart} – ${time}`); inBlock = false }
  })
  if (inBlock) negBlocks.push(`${blockStart} – 24:00`)

  const blockList = negBlocks.length
    ? negBlocks.map(b => `<li>${b}</li>`).join('')
    : '<li style="color:#666">žiadne záporné ceny</li>'

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="60">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Spot ceny</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body { font-family: sans-serif; background: #111; color: #eee; padding: 12px; font-size: 14px }
    h2 { font-size: 15px; margin-bottom: 10px; color: #aaa; font-weight: normal }
    .stats { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap }
    .stat { background: #1e1e1e; border-radius: 8px; padding: 8px 14px; text-align: center }
    .stat .val { font-size: 22px; font-weight: bold }
    .stat .lbl { font-size: 11px; color: #888; margin-top: 2px }
    .neg { color: #ef4444 }
    .pos { color: #22c55e }
    .chart-wrap { background: #1e1e1e; border-radius: 8px; padding: 12px; margin-bottom: 12px }
    .chart { width: 100%; height: 100px; display: flex; align-items: flex-end }
    .hours { position: relative; height: 16px; margin-top: 2px }
    .blocks h3 { font-size: 12px; color: #888; margin-bottom: 6px; font-weight: normal }
    .blocks ul { list-style: none; display: flex; flex-wrap: wrap; gap: 6px }
    .blocks li { background: #2a1a1a; color: #ef4444; border-radius: 4px; padding: 3px 8px; font-size: 13px }
    .blocks li[style*="666"] { background: #1a1a1a }
    .footer { margin-top: 10px; font-size: 10px; color: #444; text-align: right }
  </style>
</head>
<body>
  <h2>Spot ceny — ${dateStr}</h2>

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
      ${bars || '<p style="color:#555;padding:8px">Čakám na dáta (každý deň o 13:01).</p>'}
    </div>
    <div class="hours">${hourLabels}</div>
  </div>

  <div class="blocks">
    <h3>Záporné bloky</h3>
    <ul>${blockList}</ul>
  </div>

  <div class="footer">Aktualizuje sa každú minútu</div>
</body>
</html>`)
})

function start(port) {
  const p = port || parseInt(process.env.DASHBOARD_PORT || '3000', 10)
  app.listen(p, () => console.log(`[dashboard] listening on http://localhost:${p}`))
}

module.exports = { start }
