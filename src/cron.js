require('dotenv').config()
const cron = require('node-cron')
const { fetchSlots, tomorrow } = require('./okte')
const { currentSlotNegative, prebufferActive } = require('./schedule')
const { pushDaySchedule, pushCurrentState } = require('./loxone')

let cachedSlots = []
let cachedDate  = null

const PREBUFFER_MINUTES = parseInt(process.env.PREBUFFER_MINUTES || '60', 10)

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

function start() {
  cron.schedule('5 13 * * *', runDailyFetch)
  cron.schedule('*/15 * * * *', runStateUpdate)

  const todayStr = new Date().toISOString().slice(0, 10)
  if (cachedDate !== todayStr) {
    console.log('[cron] startup: no cached data, triggering immediate fetch')
    runDailyFetch().then(() => runStateUpdate())
  }
}

module.exports = { start, runDailyFetch, runStateUpdate, getCachedSlots: () => cachedSlots }
