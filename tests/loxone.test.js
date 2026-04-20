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

function createUdpServer() {
  return new Promise((resolve) => {
    const server = dgram.createSocket('udp4')
    const received = []
    server.on('message', (msg) => received.push(msg.toString()))
    server.bind(0, '127.0.0.1', () => resolve({ server, received, port: server.address().port }))
  })
}

function waitForPackets(received, count, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout
    const check = () => {
      if (received.length >= count) return resolve()
      if (Date.now() > deadline) return reject(new Error(`Timeout: got ${received.length}/${count} packets`))
      setTimeout(check, 10)
    }
    check()
  })
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

test('pushDaySchedule sends correct UDP packet per slot', async () => {
  const { server, received, port } = await createUdpServer()
  const slots = makeSlots([2]) // slot_0015 → 1, rest → 0

  await pushDaySchedule(slots, { ip: '127.0.0.1', port })
  await waitForPackets(received, 96)
  await closeServer(server)

  expect(received).toHaveLength(96)
  expect(received).toContain('\\slot_0000\\0\\')
  expect(received).toContain('\\slot_0015\\1\\')
  expect(received).toContain('\\slot_2345\\0\\')
}, 5000)

test('pushCurrentState sends current_slot_negative and prebuffer_active', async () => {
  const { server, received, port } = await createUdpServer()

  await pushCurrentState(true, false, { ip: '127.0.0.1', port })
  await waitForPackets(received, 2)
  await closeServer(server)

  expect(received).toContain('\\current_slot_negative\\1\\')
  expect(received).toContain('\\prebuffer_active\\0\\')
}, 5000)

test('pushDaySchedule does not throw when host is unreachable', async () => {
  const slots = makeSlots()
  await expect(pushDaySchedule(slots, { ip: '127.0.0.1', port: 1 })).resolves.not.toThrow()
})
