const EventEmitter = require('events')
const child = require('child_process')

const debug = require('debug')('wd:ping')

class Ping extends EventEmitter {
  constructor (ip) {
    super()
    this.destroyed = false

    this.ip = ip
    this.reachable = 0

    this.timer = undefined

    this.ping()
  }

  ping () {
    child.exec(`ping -c 2 -q ${this.ip}`, (err, stdout) => {
      if (this.destroyed) return
      if (err) {
        if (this.reachable) console.log(`error ping ${this.ip}: ${err.message}`)
        this.decr()
      } else {
        const sline = stdout.toString().split('\n').find(l => l.includes('received'))
        if (!sline) {
          console.log(`ping returns no stats line`)
          this.decr()
        } else {
          const r = sline
            .split(',')
            .reduce((o, phr) => {
              if (phr.endsWith('transmitted')) {
                o.transmitted = parseInt(phr.trim().split(' ')[0])
              } else if (phr.endsWith('received')) {
                o.received = parseInt(phr.trim().split(' ')[0])
              }
              return o
            }, {})

          debug(this.ip, this.reachable, r)
          r.received ? this.incr () : this.decr()
        }
      }
    })
  }

  decr () {
    const prev = this.reachable
    this.reachable = Math.floor(this.reachable / 2) 
    this.timer = setTimeout(() => this.ping(), 2 * 1000)
    if (prev && !this.reachable) this.emit('down')
  }

  incr () {
    const prev = this.reachable
    this.reachable++
    const dur = Math.pow(2, this.reachable > 10 ? 10 : this.reachable) 
    this.timer = setTimeout(() => this.ping(), dur * 1000)
    if (!prev && this.reachable) this.emit('up')
  }

  destroy () {
    this.destroyed = true
  }

  refresh () {
    clearTimeout(this.timer)
    this.ping()
  }
}

module.exports = Ping
