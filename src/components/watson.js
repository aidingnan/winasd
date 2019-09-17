const EventEmitter = require('events')
const os = require('os')

const config = require('config')

console.log('config', config)

class Watson extends EventEmitter {
  constructor () {
    super()
    this.ip = ''
    this.gateway = null
    this.dns = []

    setInterval(() => {
      const wlan0 = os.networkInterfaces().wlan0  
      if (wlan0) {
        const ipv4 = wlan0.find(ipo => ipo.family === 'IPv4')
        // if (ipv4)
      }
    }, 1000)
  }
}

