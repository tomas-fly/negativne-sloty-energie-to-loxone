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
