const nock = require('nock')
const { pushDaySchedule, pushCurrentState } = require('../src/loxone')

const config = {
  ip: '192.168.1.100',
  user: 'admin',
  pass: 'secret',
}

beforeEach(() => nock.cleanAll())
afterAll(() => nock.restore())

function makeSlots(negativePeriods = []) {
  return Array.from({ length: 96 }, (_, i) => {
    const period = i + 1
    const totalMinutes = i * 15
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const mm = String(totalMinutes % 60).padStart(2, '0')
    return { slot: hh + mm, price: negativePeriods.includes(period) ? -1 : 1, negative: negativePeriods.includes(period), period }
  })
}

test('pushDaySchedule sends one request per slot with correct name and value', async () => {
  const slots = makeSlots([2]) // slot_0015 should be 1, rest 0
  const interceptors = slots.map(s =>
    nock(`http://${config.ip}`)
      .get(`/dev/sps/io/slot_${s.slot}/${s.negative ? 1 : 0}`)
      .basicAuth({ user: config.user, pass: config.pass })
      .reply(200, 'OK')
  )

  await pushDaySchedule(slots, config)

  interceptors.forEach(i => expect(i.isDone()).toBe(true))
})

test('pushCurrentState sends current_slot_negative and prebuffer_active', async () => {
  const n = nock(`http://${config.ip}`)
    .get('/dev/sps/io/current_slot_negative/1')
    .basicAuth({ user: config.user, pass: config.pass })
    .reply(200, 'OK')
    .get('/dev/sps/io/prebuffer_active/0')
    .basicAuth({ user: config.user, pass: config.pass })
    .reply(200, 'OK')

  await pushCurrentState(true, false, config)

  expect(n.isDone()).toBe(true)
})

test('pushDaySchedule does not throw when a slot request fails', async () => {
  const slots = makeSlots()
  // intercept only first slot, rest will fail
  nock(`http://${config.ip}`)
    .get(`/dev/sps/io/slot_0000/0`)
    .basicAuth({ user: config.user, pass: config.pass })
    .reply(200, 'OK')
  // other 95 will get connection error — should not throw

  await expect(pushDaySchedule(slots, config)).resolves.not.toThrow()
})
