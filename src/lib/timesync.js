const EventEmitter = require('events')
const child = require('child_process')
const readline = require('readline')

const debug = require('debug')('wd:timesync')

class TimeSync extends EventEmitter {
  constructor () {
    super()
    this.timesync = child.spawn('stdbuf',
      ['-o0', 'timedatectl', 'timesync-status', '--monitor'])

    this.timesync.on('error', err => {
      console.log('timesync error', err.message)
    })

    this.timesync.on('close', (code, signal) => {
      console.log(`timesync exit, code ${code}, signal ${signal}`)
    })

    this.rl = readline.createInterface({ input: this.timesync.stdout })
    this.rl.on('line', line => {
      debug('line', line)

      if (line.includes('Packet count:')) {
        const count = parseInt(line.split(':')[1].trim())

        debug('count', count)

        if (count > 0) {
          this.destroy()
          process.nextTick(() => this.emit('synced'))
        }
      }
    })

    this.sync()
  }

  sync () {
    child.exec('systemctl restart systemd-timesync.service', () => {
      if (!this.timesync) return
      setTimeout(() => {
        if (!this.timesync) return
        this.sync()
      }, 10 * 1000)
    })
  }

  destroy () {
    if (!this.timesync) return
    if (this.rl) {
      this.rl.removeAllListeners('line')
      this.rl = null
    }
    this.timesync.removeAllListeners()
    this.timesync.on('error', () => {})
    this.timesync.kill()
    this.timesync = null
  }

  refresh () {
    if (!this.timesync) return
    child.exec('systemctl restart systemd-timesync.service', () => {})
  }
}

module.exports = TimeSync
