const path = require('path')
const child = require('child_process')

const debug = require('debug')('ws:led')

const next = require('../lib/nexter')()

const device = require('./device')
const ble = require('./ble')
const auth = require('./local-auth')

const ledInit = [
  [0x00, 0x55], // RSTDIR
  [0x07, 0x00], // Disable all leds
  [0x08, 0x08], // SYNC/PWMLOG, TRUE COLOR
  [0x10, 0xFF], // ILED1_1
  [0x11, 0xFF], // ILED2_1
  [0x12, 0xFF], // ILED3_1
  [0x13, 0xFF], // ILED1_2
  [0x14, 0x00], // ILED2_2
  [0x15, 0x00], // ILED3_2
  [0x16, 0x00], // ILED1_3
  [0x17, 0xFF], // ILED2_3
  [0x18, 0x00], // ILED3_3
  [0x19, 0x00], // ILED1_4
  [0x1A, 0x00], // ILED2_4
  [0x1B, 0xFF], // ILED3_4
  [0x1C, 0x80], // PWM1 green
  [0x1D, 0xA0], // PWM2 blue
  [0x1E, 0xA0] // PWM3 red
]

const ledEncode = (mode, colors, shots) => {
  const arr = []
  arr.push([0x07, 0x00]) // disable all led channels
  // arr.push([0x09, 0x70])        // stop all pattern
  if (mode === 'on') {
    arr.push([0x08, 0x00])
    arr.push([0x04, 0x00]) // manual
    arr.push([0x05, 0x00])
    arr.push([0x06, 0x00])

    const color = colors[0]
    if (color === 'green') {
      arr.push([0x07, 0x01]) // enable single channel
    } else if (color === 'blue') {
      arr.push([0x07, 0x02])
    } else if (color === 'red') {
      arr.push([0x07, 0x04])
    } else if (color === 'white') {
      arr.push([0x07, 0x07])
    }
  } else {
    arr.push([0x08, 0x08])
    arr.push([0x04, 0x01]) // pattern
    arr.push([0x05, 0x01])
    arr.push([0x06, 0x01])
    switch (mode) {
      case 'blink':
        arr.push([0x30, 0x22]) // rise, on
        arr.push([0x31, 0x22]) // fall, off
        arr.push([0x32, 0x00]) // slot, delay
        break
      case 'breathing':
        arr.push([0x30, 0xA2])
        arr.push([0x31, 0xA2])
        arr.push([0x32, 0x00])
        break
      case 'pulse':
        arr.push([0x30, 0x11])
        arr.push([0x31, 0x1A])
        arr.push([0x32, 0x10])
        break
      default:
        break
    }

    let b = 0
    colors.forEach(color => {
      switch (color) {
        case 'green':
          b |= 0x02
          break
        case 'blue':
          b |= 0x04
          break
        case 'red':
          b |= 0x08
          break
        case 'white':
          b |= 0x01
          break
        default:
          break
      }
    })

    if (mode === 'pulse') {
      if (Number.isInteger(shots) && shots > 0 && shots < 5) {
        b |= ((shots - 1) << 4)
      } else {
        b |= 0x10
      }
    }
    arr.push([0x33, b])
    arr.push([0x07, 0x07])
  }
  return arr
}

const ledWriteAsync = async arr => {
  // debug('ledwrite', arr.map(([k,v]) => `${k}/${v}`).join(', '))
  for (let i = 0; i < arr.length; i++) {
    const [addr, val] = arr[i]
    await new Promise((resolve, reject) => {
      const a = addr.toString(16).padStart(2, '0')
      const v = val.toString(16).padStart(2, '0')
      child.exec(`i2cset -y 1 0x64 0x${a} 0x${v}`, err =>
        err ? reject(err) : resolve(null))
    })
  }
}

const ledWrite = (arr, callback) =>
  ledWriteAsync(arr)
    .then(() => callback())
    .catch(e => {
      console.log(e)
      callback(e)
    })

let running = {}

const update = (mode, colors, shots, force) => {
  debug('update:', mode, colors, shots)
  const o = { mode, colors, shots }
  if (JSON.stringify(running) === JSON.stringify(o)) return
  running = o
  const codes = ledEncode(mode, colors, shots)
  next(ledWrite.bind(undefined, codes))
}

const forceUpdate = (mode, colors, shots) => {
  debug('force update:', mode, colors, shots)
  const o = { mode, colors, shots }
  running = o
  const codes = ledEncode(mode, colors, shots)
  next(ledWrite.bind(undefined, codes))
}

const refresh = force => {
  const f = force ? forceUpdate : update 
  if (device.shuttingDown) {
    f('breathing', ['green'])
  } else if (device.error) {
    f('blink', ['red'])
  } else if (!device.ready) {
    f('breathing', ['green'])
  } else if (!diskman.mounted) {
    if (diskman.status !== 0x00) f('blink', ['red'])
  } else { // device ready and disk OK
    if (ownership.getOwner()) { // greenish
      f('on', ['green'])
    } else { // blue
      if (ble.isConnected) {
        f('on', ['blue'])
      } else {
        f('blink', ['blue'])
      }
    }
  }
}

let diskman, ownership

device.on('error', () => refresh())
device.on('ready', () => {
  diskman = require('./diskman')
  diskman.on('mounted', () => {
    ownership = require('./ownership')
    ownership.on('cache', () => setTimeoutrefresh())
    ownership.on('owner', () => console.log('owner owner') || refresh())
    // refresh() don't do this!
  })
  // refresh() don't do this!
})

auth.on('startcc', cc => {

  debug('startcc', cc)

  const [c, m] = cc
  let mode, color

  if (c === '#ff0000') color = 'red'
  else if (c === '#00ff00') color = 'green'
  else if (c === '#0000ff') color = 'blue'
  else color = 'white'

  if (m === 'breath') mode = 'blink' 
  else mode = 'on'

  // low level write, don't update running  
  next(ledWrite.bind(undefined, ledEncode(mode, [color])))
})

auth.on('stopcc', () => {
  debug('stopcc')
  refresh(true)
})

ble.on('connected', () => {
  debug('bluetooth connected')
  refresh()
})

ble.on('disconnected', () => {
  debug('bluetooth disconnected')
  refresh()
})

next(ledWrite.bind(undefined, ledInit))
update('breathing', ['green'])
