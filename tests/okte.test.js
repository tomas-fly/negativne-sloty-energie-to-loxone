const nock = require('nock')
const { fetchSlots } = require('../src/okte')

const BASE_URL = 'https://test-isot.okte.sk'

// minimal 3-slot fixture (real calls return 96)
const fixture = [
  { deliveryDay: '2025-04-24', deliveryPeriod: 1, finalPrice: 45.23 },
  { deliveryDay: '2025-04-24', deliveryPeriod: 2, finalPrice: -12.5 },
  { deliveryDay: '2025-04-24', deliveryPeriod: 3, finalPrice: 0.01 },
]

beforeEach(() => nock.cleanAll())
afterAll(() => nock.restore())

test('fetchSlots returns array of slot objects with HHMM and negative flag', async () => {
  nock(BASE_URL)
    .get('/api/v1/dam/results')
    .query({ deliveryDayFrom: '2025-04-24', deliveryDayTo: '2025-04-24' })
    .reply(200, fixture)

  const slots = await fetchSlots('2025-04-24', BASE_URL)

  expect(slots).toHaveLength(3)
  expect(slots[0]).toEqual({ slot: '0000', price: 45.23,  negative: false, period: 1 })
  expect(slots[1]).toEqual({ slot: '0015', price: -12.5,  negative: true,  period: 2 })
  expect(slots[2]).toEqual({ slot: '0030', price: 0.01,   negative: false, period: 3 })
})

test('fetchSlots throws on non-200 response', async () => {
  nock(BASE_URL)
    .get('/api/v1/dam/results')
    .query({ deliveryDayFrom: '2025-04-24', deliveryDayTo: '2025-04-24' })
    .reply(503, 'Service Unavailable')

  await expect(fetchSlots('2025-04-24', BASE_URL)).rejects.toThrow('OKTE API error: 503')
})

test('fetchSlots throws when response is not an array', async () => {
  nock(BASE_URL)
    .get('/api/v1/dam/results')
    .query({ deliveryDayFrom: '2025-04-24', deliveryDayTo: '2025-04-24' })
    .reply(200, { error: 'unexpected' })

  await expect(fetchSlots('2025-04-24', BASE_URL)).rejects.toThrow('OKTE response is not an array')
})
