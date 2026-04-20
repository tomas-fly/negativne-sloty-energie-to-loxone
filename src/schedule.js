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
