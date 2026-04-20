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

function createUdpServer(port) {
  return new Promise((resolve) => {
    const server = dgram.createSocket('udp4')
    const received = []
    server.on('message', (msg) => received.push(msg.toString()))
    server.bind(port, '127.0.0.1', () => resolve({ server, received }))
  })
}

function waitForPackets(received, count, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout
    const check = () => {
      if (received.length >= count) return resolve()
      if (Date.now() > deadline) return reject(new Error(`Timeout: got ${received.length}/${count}`))
      setTimeout(check, 10)
    }
    check()
  })
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

const TEST_PORT = 15700

test('pushDaySchedule sends HHMM=value format on single port', async () => {
  const { server, received } = await createUdpServer(TEST_PORT)
  const slots = makeSlots([2]) // slot_0015 (index 1) → negative

  await pushDaySchedule(slots, { ip: '127.0.0.1', port: TEST_PORT })
  await waitForPackets(received, 96)
  await closeServer(server)

  expect(received).toHaveLength(96)
  expect(received).toContain('0000=0')
  expect(received).toContain('0015=1')
  expect(received).toContain('2345=0')
}, 5000)

test('pushCurrentState sends CSN and PBA codes', async () => {
  const { server, received } = await createUdpServer(TEST_PORT)

  await pushCurrentState(true, false, { ip: '127.0.0.1', port: TEST_PORT })
  await waitForPackets(received, 2)
  await closeServer(server)

  expect(received).toContain('CSN=1')
  expect(received).toContain('PBA=0')
}, 5000)

test('pushDaySchedule does not throw when host is unreachable', async () => {
  const slots = makeSlots()
  await expect(pushDaySchedule(slots, { ip: '127.0.0.1', port: 1 })).resolves.not.toThrow()
})
