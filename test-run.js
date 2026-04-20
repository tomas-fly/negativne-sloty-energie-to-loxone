require('dotenv').config()
const { runDailyFetch, runStateUpdate } = require('./src/cron')
const { fetchSlots, tomorrow } = require('./src/okte')
const { pushDaySchedule, pushCurrentState } = require('./src/loxone')
const { currentSlotNegative, prebufferActive } = require('./src/schedule')

const PREBUFFER_MINUTES = parseInt(process.env.PREBUFFER_MINUTES, 10) || 60

// optional: node test-run.js 2025-04-24
const date = process.argv[2] || tomorrow()

;(async () => {
  console.log(`[test] fetching slots for ${date}`)
  const slots = await fetchSlots(date)
  console.log(`[test] got ${slots.length} slots`)
  console.log(`[test] sample: ${JSON.stringify(slots.slice(0, 3))}`)

  const negCount = slots.filter(s => s.negative).length
  console.log(`[test] negative slots: ${negCount}`)

  await pushDaySchedule(slots)
  console.log(`[test] pushed ${slots.length} slots to Loxone via UDP`)

  const now = new Date()
  const isNeg     = currentSlotNegative(slots, now)
  const prebuffer = prebufferActive(slots, now, PREBUFFER_MINUTES)
  await pushCurrentState(isNeg, prebuffer)
  console.log(`[test] current state pushed: negative=${isNeg}, prebuffer=${prebuffer}`)

  process.exit(0)
})().catch(err => {
  console.error('[test] failed:', err.message)
  process.exit(1)
})
