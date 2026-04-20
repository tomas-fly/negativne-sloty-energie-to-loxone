const dgram = require('dgram')

// Slot index 0..95 → port BASE+0..BASE+95
// current_slot_negative → port BASE+96
// prebuffer_active      → port BASE+97
const SLOT_COUNT = 96

function getConfig(override) {
  return {
    ip:       (override && override.ip)       || process.env.LOXONE_IP,
    basePort: (override && override.basePort) || parseInt(process.env.LOXONE_UDP_BASE_PORT, 10) || 5600,
  }
}

function sendUdp(value, port, ip) {
  return new Promise((resolve) => {
    const client = dgram.createSocket('udp4')
    const data = Buffer.from('' + value)
    client.send(data, port, ip, (err) => {
      client.close()
      if (err) console.warn(`[loxone] UDP send to port ${port} failed: ${err.message}`)
      resolve()
    })
  })
}

/**
 * Pushes all 96 slot boolean values to Loxone.
 * slot index 0 (slot_0000) → basePort, index 1 (slot_0015) → basePort+1, ...
 */
async function pushDaySchedule(slots, configOverride) {
  const cfg = getConfig(configOverride)
  await Promise.all(
    slots.map((s, i) => sendUdp(s.negative ? 1 : 0, cfg.basePort + i, cfg.ip))
  )
}

/**
 * Pushes current_slot_negative (basePort+96) and prebuffer_active (basePort+97).
 */
async function pushCurrentState(isNegative, prebuffer, configOverride) {
  const cfg = getConfig(configOverride)
  await Promise.all([
    sendUdp(isNegative ? 1 : 0, cfg.basePort + SLOT_COUNT,     cfg.ip),
    sendUdp(prebuffer  ? 1 : 0, cfg.basePort + SLOT_COUNT + 1, cfg.ip),
  ])
}

module.exports = { pushDaySchedule, pushCurrentState }
