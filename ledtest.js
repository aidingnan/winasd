const i2c = require('i2c-bus')

const ledInit = [
  [0x00, 0x55],   // RSTDIR
  [0x07, 0x00],   // Disable all leds
  [0x08, 0x08],   // SYNC/PWMLOG, TRUE COLOR
  [0x10, 0xFF],   // ILED1_1
  [0x11, 0xFF],   // ILED2_1
  [0x12, 0xFF],   // ILED3_1
  [0x13, 0xFF],   // ILED1_2
  [0x14, 0x00],   // ILED2_2
  [0x15, 0x00],   // ILED3_2
  [0x16, 0x00],   // ILED1_3
  [0x17, 0xFF],   // ILED2_3
  [0x18, 0x00],   // ILED3_3
  [0x19, 0x00],   // ILED1_4
  [0x1A, 0x00],   // ILED2_4
  [0x1B, 0xFF],   // ILED3_4
  [0x1C, 0x80],   // PWM1 green
  [0x1D, 0xA0],   // PWM2 blue
  [0x1E, 0xA0],   // PWM3 red
]

const initBuf = Buffer.concat(ledInit.map(kv => Buffer.from(kv)))

const ledEncode = (mode, colors, shots) => {
  let arr = []
  arr.push([0x07, 0x00])        // disable all led channels
  // arr.push([0x09, 0x70])        // stop all pattern
  if (mode === 'on') {
    arr.push([0x08, 0x00])
    arr.push([0x04, 0x00])      // manual
    arr.push([0x05, 0x00])
    arr.push([0x06, 0x00])

    let color = colors[0]
    if (color === 'green') {
      arr.push([0x07, 0x01])    // enable single channel
    } else if (color === 'blue') {
      arr.push([0x07, 0x02])
    } else if (color === 'red') {
      arr.push([0x07, 0x04])
    } else if (color === 'white') {
      arr.push([0x07, 0x07])
    } 
  } else {
    arr.push([0x08, 0x08])
    arr.push([0x04, 0x01])      // pattern
    arr.push([0x05, 0x01])
    arr.push([0x06, 0x01])
    switch (mode) {
      case 'blink':
        arr.push([0x30, 0x22])  // rise, on
        arr.push([0x31, 0x22])  // fall, off
        arr.push([0x32, 0x00])  // slot, delay
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


const redOn = ledEncode('blink', ['red', 'green'])

const bus = i2c.open(1, (err) => {
  bus.scan((err, data) => {
    console.log(err, data)
    let addr = 100

    const ledWriteAsync = async arr => {
      for (let i = 0; i < arr.length; i++) {
        await new Promise((resolve, reject) => {
          bus.i2cWrite(100, 2, Buffer.from(arr[i]), () => resolve(null))
        })
      }
    }

    const initAndSet = async () => {
      console.time('init')
      await ledWriteAsync(ledInit)
      console.timeEnd('init')
      console.time('redOn')
      await ledWriteAsync(redOn)
      console.timeEnd('redOn')
    }
    
    initAndSet()
      .then(() => {})
      .catch(e => {})
  })
})


