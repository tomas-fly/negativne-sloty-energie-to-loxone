const dgram = require('dgram')

function getConfig(override) {
  return {
    ip:   (override && override.ip)   || process.env.LOXONE_IP,
    port: (override && override.port) || parseInt(process.env.LOXONE_UDP_PORT, 10) || 5600,
  }
}

function sendUdp(message, cfg) {
  return new Promise((resolve) => {
    const client = dgram.createSocket('udp4')
    const data = Buffer.from(message)
    client.send(data, cfg.port, cfg.ip, (err) => {
      client.close()
      if (err) console.warn(`[loxone] UDP send failed (${message}): ${err.message}`)
      resolve()
    })
  })
}

/**
 * Pushes all 96 slot values to a single Loxone UDP port.
 * Format: "HHMM=0" or "HHMM=1"
 * Loxone Command Recognition per input: "0000=<v>", "0015=<v>", etc.
 */
async function pushDaySchedule(slots, configOverride) {
  const cfg = getConfig(configOverride)
  await Promise.all(
    slots.map(s => sendUdp(`${s.slot}=${s.negative ? 1 : 0}`, cfg))
  )
}

/**
 * Pushes current state flags.
 * Format: "CSN=0" / "CSN=1" and "PBA=0" / "PBA=1"
 * Loxone Command Recognition: "CSN=<v>" and "PBA=<v>"
 */
async function pushCurrentState(isNegative, prebuffer, configOverride) {
  const cfg = getConfig(configOverride)
  await Promise.all([
    sendUdp(`CSN=${isNegative ? 1 : 0}`, cfg),
    sendUdp(`PBA=${prebuffer  ? 1 : 0}`, cfg),
  ])
}

/**
 * Pushes whether tomorrow has any negative slots at all.
 * Format: "HN=1" / "HN=0"
 * Loxone Command Recognition: "HN=<v>"
 */
async function pushHasNegative(slots, configOverride) {
  const cfg = getConfig(configOverride)
  const hasNegative = slots.some(s => s.negative) ? 1 : 0
  await sendUdp(`HN=${hasNegative}`, cfg)
}

module.exports = { pushDaySchedule, pushCurrentState, pushHasNegative }
