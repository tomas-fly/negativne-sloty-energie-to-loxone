const axios = require('axios')

// ⚠️ Verify these field names against the real API response
const PERIOD_FIELD = 'deliveryPeriod'
const PRICE_FIELD  = 'finalPrice'

/**
 * Returns the YYYY-MM-DD string for tomorrow.
 */
function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Converts a 1-indexed delivery period (1–96) to a zero-padded HHMM string.
 * Period 1 → '0000', period 2 → '0015', period 96 → '2345'
 */
function periodToHHMM(period) {
  const totalMinutes = (period - 1) * 15
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const mm = String(totalMinutes % 60).padStart(2, '0')
  return hh + mm
}

/**
 * Fetches 15-min slot prices for the given date from the OKTE DAM results API.
 * @param {string} date - YYYY-MM-DD (defaults to tomorrow)
 * @param {string} baseUrl - override for testing
 * @returns {Promise<Array<{slot: string, price: number, negative: boolean, period: number}>>}
 */
async function fetchSlots(date, baseUrl) {
  const url = baseUrl || process.env.OKTE_BASE_URL
  try {
    const resp = await axios.get(`${url}/api/v1/dam/results`, {
      params: { deliveryDayFrom: date, deliveryDayTo: date },
    })

    if (resp.status !== 200) {
      throw new Error(`OKTE API error: ${resp.status}`)
    }

    const data = resp.data
    if (!Array.isArray(data)) {
      throw new Error('OKTE response is not an array')
    }

    return data.map(item => {
      const period = item[PERIOD_FIELD]
      const price  = item[PRICE_FIELD]
      return {
        slot:     periodToHHMM(period),
        price:    price,
        negative: price < 0,
        period,
      }
    })
  } catch (error) {
    if (error.response && error.response.status) {
      throw new Error(`OKTE API error: ${error.response.status}`)
    }
    throw error
  }
}

module.exports = { fetchSlots, tomorrow, periodToHHMM }
