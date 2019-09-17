const fs = require('fs')
const EventEmitter = require('events')
const child = require('child_process')
const readline = require('readline')

const debug = require('debug')('wd:wlan0')

class Wlan0 extends EventEmitter {
  constructor () {
    super()
    this.mac = ''
    this.connection = ''
    this.state = 'init'

    this.on('state', (state, connection) => {
      this.state = state
      if (state === 'connecting') {
        this.connection = connection
      } else if (state === 'off' || state === 'disconnected' || state === 'deactivating') {
        this.connection = ''
      }

      debug(this.state, this.connection)
    })

    const monitor = child.spawn('nmcli', ['device', 'monitor'])
    monitor.on('error', err => console.log('wlan0 monitor error', err.message))

    const rl = readline.createInterface({ input: monitor.stdout })
    rl.on('line', _line => {
      if (!_line.startsWith('wlan0: ')) return

      const line = _line.slice('wlan0: '.length)

      if (line.startsWith('unavailable')) {
        this.emit('state', 'off')
      } else if (line.startsWith('disconnected')) {
        this.emit('state', 'disconnected')
      } else if (line.startsWith('connecting')) {
        // use using connection instead 
      } else if (line.startsWith('connected')) {
        this.emit('state', 'connected')
      } else if (line.startsWith('deactivating')) {
        this.emit('state', 'deactivating')
      } else if (line.startsWith('using connection')) {
        let name = line.slice('using connection'.length).trim().slice(1, -1)
        this.emit('state', 'connecting', name)
      } else {
        console.log('wlan0, unexpected message', line)
      }
    })

    fs.readFile('/sys/class/net/wlan0/address', (err, data) => {
      if (err) {
        this.emit('state', 'unavailable')
      } else {
        this.mac = data.toString().trim()
        child.exec('nmcli radio wifi off', () => child.exec('nmcli radio wifi on', () => {}))
      }
    }) 
  }
}

module.exports = Wlan0
