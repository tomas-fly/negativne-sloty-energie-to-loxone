const dgram = require('dgram')
const { pushDaySchedule, pushCurrentState } = require('../src/loxone')

function makeSlots(negativePeriods = []) {
  return Array.from({ length: 96 }, (_, i) => {
    const period = i + 1
    const totalMinutes = i * 15
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const mm = String(totalMinutes % 60).padStart(2, '0')
    return { slot: hh + mm, price: negativePeriods.includes(period) ? -1 : 1, negative: negativePeriods.includes(period), period }
  })
}

function createUdpServers(count, basePort) {
  const servers = []
  const received = {} // port → value string
  const promises = Array.from({ length: count }, (_, i) => {
    const port = basePort + i
    return new Promise((resolve) => {
      const server = dgram.createSocket('udp4')
      server.on('message', (msg) => { received[port] = msg.toString() })
      server.bind(port, '127.0.0.1', () => { servers.push(server); resolve() })
    })
  })
  return Promise.all(promises).then(() => ({ servers, received }))
}

function waitForPackets(received, count, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout
    const check = () => {
      if (Object.keys(received).length >= count) return resolve()
      if (Date.now() > deadline) return reject(new Error(`Timeout: got ${Object.keys(received).length}/${count} packets`))
      setTimeout(check, 10)
    }
    check()
  })
}

function closeAll(servers) {
  return Promise.all(servers.map(s => new Promise(resolve => s.close(resolve))))
}

const BASE_PORT = 15600 // high range to avoid conflicts

test('pushDaySchedule sends value 0 or 1 to correct port per slot', async () => {
  const { servers, received } = await createUdpServers(96, BASE_PORT)
  const slots = makeSlots([2]) // slot index 1 (slot_0015) → negative → port BASE+1

  await pushDaySchedule(slots, { ip: '127.0.0.1', basePort: BASE_PORT })
  await waitForPackets(received, 96)
  await closeAll(servers)

  expect(received[BASE_PORT]).toBe('0')       // slot_0000 positive
  expect(received[BASE_PORT + 1]).toBe('1')   // slot_0015 negative
  expect(received[BASE_PORT + 95]).toBe('0')  // slot_2345 positive
}, 5000)

test('pushCurrentState sends to basePort+96 and basePort+97', async () => {
  const { servers, received } = await createUdpServers(2, BASE_PORT + 96)

  await pushCurrentState(true, false, { ip: '127.0.0.1', basePort: BASE_PORT })
  await waitForPackets(received, 2)
  await closeAll(servers)

  expect(received[BASE_PORT + 96]).toBe('1')  // current_slot_negative
  expect(received[BASE_PORT + 97]).toBe('0')  // prebuffer_active
}, 5000)

test('pushDaySchedule does not throw when host is unreachable', async () => {
  const slots = makeSlots()
  await expect(pushDaySchedule(slots, { ip: '127.0.0.1', basePort: 1 })).resolves.not.toThrow()
})
