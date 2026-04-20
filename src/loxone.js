const axios = require('axios')

function getConfig(override) {
  return {
    ip:   (override && override.ip)   || process.env.LOXONE_IP,
    user: (override && override.user) || process.env.LOXONE_USER,
    pass: (override && override.pass) || process.env.LOXONE_PASS,
  }
}

async function pushOne(name, value, cfg) {
  const url = `http://${cfg.ip}/dev/sps/io/${name}/${value}`
  try {
    await axios.get(url, {
      auth: { username: cfg.user, password: cfg.pass },
      timeout: 5000,
    })
  } catch (err) {
    console.warn(`[loxone] failed to set ${name}=${value}: ${err.message}`)
  }
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
