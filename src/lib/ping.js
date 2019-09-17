const EventEmitter = require('events')
const child = require('child_process')

const validator = require('validator')

class Ping extends EventEmitter {
  constructor (target) {
    super()

    if (!validator.isFQDN(target) && !validator.isIP(target, 4))
      throw new Error('invalid target, neither FQDN nor IPv4')

    this.destroyed = false

    this.target = target
    this.isFQDN = validator.isFQDN(target)
    if (this.isFQDN) this.resolved = false
    this.reachable = 0
    this.timer = undefined

    this.ping()
  }

  ping () {
    // ping exit 1 if not received anything
    child.exec(`ping -c 3 -q -W 8 ${this.target}`, (err, stdout) => {
      if (this.destroyed) return
      if (err) {
        if (this.isFQDN) {
          if (stdout.toString().includes('Name or service not known')) {
            this.resolved = false
          } else {
            this.resolved = true
          }
        }
        this.decr()
      } else {
        if (this.isFQDN) this.resolved = true
        this.incr()
      }
    })
  }

  decr () {
    const prev = this.reachable
    this.reachable = Math.floor(this.reachable / 2) 
    this.timer = setTimeout(() => this.ping(), 16 * 1000)
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
    if (this.destroyed) return
    clearTimeout(this.timer)
    this.ping()
  }
}

module.exports = Ping
