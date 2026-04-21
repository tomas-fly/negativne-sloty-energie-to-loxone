# GoodWe GW10K-ET Battery Control via Modbus TCP — Design

## Goal

Use spot price negativity (from the existing `spoty` service) to control a GoodWe GW10K-ET inverter via Modbus TCP: stop grid export during negative-price slots, charge the battery from solar instead, and resume normal export when prices are positive.

## Hardware

- **Inverter:** GoodWe GW10K-ET (3-phase hybrid, 10 kW)
- **Battery:** ~10 kWh (connected via DC port)
- **Interface:** Modbus TCP on the inverter's LAN IP, port **502**, Unit ID **247**

## Three-State Control Logic

| State | Trigger | Export limit | Charge behaviour |
|---|---|---|---|
| **Normal** | Positive price | 10 000 W (unrestricted) | Auto — battery charges from solar surplus, grid export allowed |
| **Prebuffer** | N minutes before negative block starts | 10 000 W (keep exporting) | Charge current = 0 A — stop charging now, preserve capacity for negative period |
| **Negative** | Negative price slot active | 0 W — block all export | Charge current = max — absorb all solar into battery |

`PREBUFFER_MINUTES` (default 60) is already read from `.env` by the cron service.

## Key Modbus Registers

All registers are **holding registers** (function code 16 / `writeRegisters`). Values are unsigned 16-bit integers.

| Register | Address (decimal) | Address (hex) | Name | Normal value | Negative value | Notes |
|---|---|---|---|---|---|---|
| Export Power Limit | **47510** | 0xB9D6 | `wor_export_limitation` | 10 000 (W) | **0** | Blocks AC export when 0 |
| EMS Mode | **47511** | 0xB9E7 | `ems_mode` | 1 (Auto) | 1 (Auto) | Leave on Auto; other modes (2=Charge, 3=Discharge, 5=Export AC) are for manual override |
| EMS Power Limit | **47512** | 0xB9E8 | `ems_power_limit` | 10 000 (W) | 10 000 (W) | Power limit for EMS; keep at max |
| Battery Charge Current | **37004** | 0x906C | `battery_charge_current_limit` | 100 (A, = max) | **0** (Prebuffer) / 100 (Negative) | `0` stops charging; verify max value for your battery spec |

> ⚠️ **Field names and register addresses were sourced from community-published GoodWe Modbus documentation (SolarEdge-compatible mapping and GoodWe OSS Home Assistant integration).** They should be verified against the official GoodWe Modbus document for firmware version installed on your unit before writing to any register. Read the register first and confirm the returned value matches expectations.

## Proposed Spoty Integration

### New module: `src/goodwe.js`

```js
const Modbus = require('jsmodbus') // or modbus-serial
const net    = require('net')

const REG_EXPORT_LIMIT   = 47510
const REG_BATTERY_CHARGE = 37004

const DEFAULT_IP   = process.env.GOODWE_IP
const DEFAULT_PORT = parseInt(process.env.GOODWE_PORT, 10) || 502
const UNIT_ID      = parseInt(process.env.GOODWE_UNIT_ID, 10) || 247

async function writeRegister(register, value, cfg) {
  const ip   = (cfg && cfg.ip)   || DEFAULT_IP
  const port = (cfg && cfg.port) || DEFAULT_PORT
  const unit = (cfg && cfg.unit) || UNIT_ID

  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const client = new Modbus.client.TCP(socket, unit)

    socket.connect(port, ip, () => {
      client.writeSingleRegister(register, value)
        .then(() => { socket.end(); resolve() })
        .catch(err  => { socket.destroy(); reject(err) })
    })
    socket.on('error', reject)
    socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('Modbus TCP timeout')) })
  })
}

async function setNormal()    {
  await writeRegister(REG_EXPORT_LIMIT,   10000)
  await writeRegister(REG_BATTERY_CHARGE, 100)
}

async function setPrebuffer() {
  await writeRegister(REG_EXPORT_LIMIT,   10000) // keep exporting
  await writeRegister(REG_BATTERY_CHARGE, 0)     // stop charging — preserve capacity
}

async function setNegative()  {
  await writeRegister(REG_EXPORT_LIMIT,   0)     // block grid export
  await writeRegister(REG_BATTERY_CHARGE, 100)   // charge from solar
}

module.exports = { setNormal, setPrebuffer, setNegative, writeRegister }
```

### Changes to `src/cron.js` — `runStateUpdate()`

```js
const goodwe = require('./goodwe')

async function runStateUpdate() {
  if (!cachedSlots) return
  const now = new Date()
  const negative  = currentSlotNegative(cachedSlots, now)
  const prebuffer = prebufferActive(cachedSlots, now, PREBUFFER_MINUTES)

  await loxone.pushCurrentState(cachedSlots, cfg)

  if (negative)       await goodwe.setNegative().catch(e => console.error('[goodwe] setNegative:', e.message))
  else if (prebuffer) await goodwe.setPrebuffer().catch(e => console.error('[goodwe] setPrebuffer:', e.message))
  else                await goodwe.setNormal().catch(e => console.error('[goodwe] setNormal:', e.message))
}
```

### New `.env` variables

```
GOODWE_IP=192.168.1.YY
GOODWE_PORT=502
GOODWE_UNIT_ID=247
```

## Recommended npm package

**`jsmodbus`** (pure JS, no native bindings, Modbus TCP client):

```bash
npm install jsmodbus
```

Alternatively **`modbus-serial`** works too and exposes a nearly identical async API; either is fine.

## Step-by-Step Verification Before Going Live

1. **Read before writing.** Use a Modbus tool (e.g. `modpoll`, Home Assistant Modbus integration, or a quick Node script) to read registers 47510 and 37004. Confirm the current values make sense (export limit ≈ 10000, charge current ≈ max).
2. **Test export limit = 0.** While the sun is generating, set register 47510 to 0 and confirm in the GoodWe SEMS portal or inverter display that AC export drops to 0 W.
3. **Test charge current = 0.** Set register 37004 to 0 and confirm battery charge power drops to 0 W. Restore to 100 before extending the test.
4. **Test prebuffer.** Manually trigger `setPrebuffer()` and confirm battery stops charging while the inverter still exports.
5. **Test full negative sequence.** Manually trigger `setNegative()`: export should drop to 0, battery should charge.
6. **Integrate into cron.** Once verified, enable the `goodwe.*` calls in `runStateUpdate()`.

## Safety Considerations

- The 15-minute cron tick always re-applies the correct state, so a transient Modbus error self-corrects on the next tick.
- If the Node service crashes, the inverter stays in whatever state it was last commanded — usually better to let it stay in Auto (setNormal values) rather than stuck in export-blocked mode. Consider sending `setNormal()` on process `SIGTERM`.
- `PREBUFFER_MINUTES` should be at least one full charge cycle for your battery capacity (e.g. 60 min for 10 kWh at 10 kW charge rate).

## Future Extension

Once Modbus control is verified, the GoodWe `battery_discharge_power` register can be used to also dispatch battery discharge during high-price peaks — completing a full buy-low/sell-high cycle. This is out of scope for the current phase.
