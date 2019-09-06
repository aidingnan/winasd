/** command polling, from latest cryptoauthlib, lib/atca_execution.c **/
const POLLING_INIT = 10
const POLLING_FREQUENCY = 25
const POLLING_MAX = 2500

const delayAsync = async ms =>
  new Promise((resolve, reject) =>
    setTimeout(() => resolve(null), ms))

const CRC = data => {
  const polynom = 0x8005 // uint16_t
  let crcRegister = 0 // uint16_t
  let shiftRegister, dataBit, crcBit // uint8_t
  for (let i = 0; i < data.length; i++) {
    for (shiftRegister = 0x01;
      shiftRegister > 0x00;
      shiftRegister = ((shiftRegister << 1) & 0xff)) {
      dataBit = ((data[i] & shiftRegister) & 0xff) ? 1 : 0
      crcBit = (crcRegister >> 15) & 0xff
      crcRegister = (crcRegister << 1) & 0xffff
      if (dataBit !== crcBit) crcRegister ^= polynom
    }
  }
  return crcRegister
}

module.exports = {

  async i2cReadAsync (len) {
    const data = Buffer.alloc(len)
    await new Promise((resolve, reject) =>
      this.bus.i2cRead(this.addr >> 1, len, data, err =>
        err ? reject(err) : resolve(null)))
    return data
  },

  async i2cWriteAsync (data) {
    return new Promise((resolve, reject) =>
      this.bus.i2cWrite(this.addr >> 1, data.length, data, err =>
        err ? reject(err) : resolve(null)))
  },

  _handleResponse (rsp) {
    if (rsp[0] < 4) throw new Error('bad rsp count')
    rsp = rsp.slice(0, rsp[0])
    const payload = rsp.slice(0, -2)
    const crc = rsp.slice(rsp.length - 2).readUInt16LE()
    if (CRC(payload) !== crc) throw new Error('bad crc')
    const data = rsp.slice(1, rsp.length - 2)
    if (data.length === 1) {
      const val = data[0]
      if (val === 0x00) {
        return
      } else if (val === 0x01) {
        const err = new Error('checkmac or verify miscompare')
        err.eccStatusCode = err.code = 'ECC_MISCOMPARE'
        throw err
      } else if (val === 0x03) {
        const err = new Error('parse error')
        err.eccStatusCode = err.code = 'ECC_PARSE'
        throw err
      } else if (val === 0x05) {
        const err = new Error('ecc fault')
        err.eccStatusCode = err.code = 'ECC_FAULT'
        throw err
      } else if (val === 0x0f) {
        const err = new Error('execution error')
        err.eccStatusCode = err.code = 'ECC_EXECUTION'
        throw err
      } else if (val === 0x11) {
        // we dont use _handleResponse in wakeAsync, so this is considered an error
        // const err = new Error('unexpected wake response')
        // err.eccStatusCode = err.code = 'ECC_WAKE'
        // throw err
        return
      } else if (val === 0xee) {
        const err = new Error('watchdog about to expire')
        err.eccStatusCode = err.code = 'ECC_WATCHDOG'
        throw err
      } else if (val === 0xff) {
        const err = new Error('crc or other communication error')
        err.eccStatusCode = err.code = 'ECC_COMMUNICATION'
        throw err
      }
    }
    return data
  },

  async _execAsync (packet) {
    let { txsize, opcode, param1, param2, data, /* rxsize */ } = packet
    data = data || Buffer.alloc(0)

    let maxDelayCount = Math.floor(POLLING_MAX / POLLING_FREQUENCY)
    const wordAddress = Buffer.from([0x03])
    let payload = Buffer.from([txsize, opcode, param1, param2, param2 >> 8])
    payload = Buffer.concat([payload, data])
    const crc = CRC(payload)
    const crcLE = Buffer.from([crc, crc >> 8])
    const cmd = Buffer.concat([wordAddress, payload, crcLE])

    await this.wakeAsync()
    try {
      await this.i2cWriteAsync(cmd)
      await delayAsync(POLLING_INIT)
      const error = null
      do {
        try {
          const rsp = await this.i2cReadAsync(75)
          return this._handleResponse(rsp)
        } catch (e) {
          if (e.code !== 'ENXIO') throw e
        }
        await delayAsync(POLLING_FREQUENCY)
      } while (maxDelayCount-- > 0)
      throw error
    } finally {
      await this.idleAsync()
    }
  },

  async execAsync (packet) {
    let count = 10
    let error
    while (count--) {
      try {
        return await this._execAsync(packet)
      } catch (e) {
        error = e
        console.log(`ecc exec failure (${count}):`, e.eccStatusCode, e.message)
      }
      await delayAsync(200)
    }
    throw error
  },

  async dummyWriteAsync () {
    return new Promise((resolve, reject) =>
      this.bus.i2cWrite(0x00, 1, Buffer.from([0x00]), () => resolve()))
  },

  async wakeAsync () {
    // dummy write to wake up
    await this.dummyWriteAsync()

    for (let count = 10; count; count--) {
      await delayAsync(2)
      try {
        const rsp = await this.i2cReadAsync(4)
        if (rsp.equals(Buffer.from([0x04, 0x11, 0x33, 0x43]))) {
          return
        } else {
          // this is possible when something goes wrong in execAsync
          // and the chip is left awake

          // commenting out idleAsync in _execAsync will prove this code works
          // console.log('blame execAsync')

          // dont reset count, which may leads to endless loop
          await this.idleAsync()
          await delayAsync(5)
          await this.dummyWriteAsync()
          continue
        }
      } catch (e) {
        if (e.code !== 'ENXIO') {
          await this.sleepAsync()
          throw e
        }
      }
    }

    throw new Error('wake timeout')
  },

  async idleAsync () {
    return this.i2cWriteAsync(Buffer.from([0x02]))
  },

  async sleepAsync () {
    return this.i2cWriteAsync(Buffer.from([0x01]))
  }
}
