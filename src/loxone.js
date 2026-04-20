const dgram = require('dgram')

function getConfig(override) {
  return {
    ip:   (override && override.ip)   || process.env.LOXONE_IP,
    port: (override && override.port) || parseInt(process.env.LOXONE_UDP_PORT, 10) || 7777,
  }
}

function pushOne(name, value, cfg) {
  return new Promise((resolve) => {
    const client = dgram.createSocket('udp4')
    const message = Buffer.from(`\\${name}\\${value}\\`)
    client.send(message, cfg.port, cfg.ip, (err) => {
      client.close()
      if (err) console.warn(`[loxone] failed to set ${name}=${value}: ${err.message}`)
      resolve()
    })
  })
}

async function pushDaySchedule(slots, configOverride) {
  const cfg = getConfig(configOverride)
  await Promise.all(
    slots.map(s => pushOne(`slot_${s.slot}`, s.negative ? 1 : 0, cfg))
  )
}

async function pushCurrentState(isNegative, prebuffer, configOverride) {
  const cfg = getConfig(configOverride)
  await Promise.all([
    pushOne('current_slot_negative', isNegative ? 1 : 0, cfg),
    pushOne('prebuffer_active',      prebuffer   ? 1 : 0, cfg),
  ])
}

module.exports = { pushDaySchedule, pushCurrentState }
