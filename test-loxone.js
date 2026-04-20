require('dotenv').config()
const { pushDaySchedule, pushCurrentState, pushHasNegative } = require('./src/loxone')

const slots = Array.from({ length: 96 }, (_, i) => {
  const m = i * 15
  const hh = String(Math.floor(m / 60)).padStart(2, '0')
  const mm = String(m % 60).padStart(2, '0')
  return { slot: hh + mm, negative: i % 2 === 1 }  // striedavo 0,1,0,1...
})

;(async () => {
  console.log('[test] sending mock slots (alternating 0/1) to Loxone...')
  await pushDaySchedule(slots)
  await pushCurrentState(true, true)
  await pushHasNegative(slots)
  console.log('[test] done — check Loxone monitor')
  process.exit(0)
})()
