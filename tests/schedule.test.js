const { currentSlotNegative, prebufferActive } = require('../src/schedule')

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
