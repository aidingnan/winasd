const EventEmitter = require('events')
const child = require('child_process')

const validator = require('validator')
const debug = require('debug')('wd:ping')

/**
Ping object pings target (host)

This object emits 'reachable' event with a boolean value.

Internally it maintains an integer as a measurement, which could also be accessed.

The constructor accepts a target, which is either a ipv4 address or a FQDN
If the target is FQDN, the 'resolved' prop indicates whether the FQDN could be resolved.

refresh() could be used for an instant retry.
destroy() should be called to destruct the object.
*/
class Ping extends EventEmitter {
  constructor (target) {
    super()

    if (!validator.isFQDN(target) && !validator.isIP(target, 4))
      throw new Error('invalid target, neither FQDN nor IPv4')

    this.destroyed = false

    this.target = target
    this.isFQDN = validator.isFQDN(target)

    if (this.isFQDN) this.ip = '0.0.0.0'
    this.reachable = 0

    this.timer = undefined
    this.pinging = false

    this.ping()
  }

  ping () {
    // ping exit 1 if not received anything
    this.pinging = true
    child.exec(`ping -c 3 -q -W 8 ${this.target}`, (err, stdout) => {
      this.pinging = false

      if (this.destroyed) return
      if (this.isFQDN) {
        const first = stdout.toString().split('\n')[0]

        debug('first', first)

        if (first.includes('Name or service not known')) {
          this.ip = '255.255.255.255'
        } else if (first.startsWith('PING')) {
          const ip = first.split(/[()]/)
            .map(phr => phr.trim())
            .find(phr => validator.isIP(phr, 4))
          if (ip) this.ip = ip
        }
      }

      if (err) {
        this.decr()
      } else {
        this.incr()
      }
    })
  }

  decr () {
    const prev = this.reachable
    this.reachable = Math.floor(this.reachable / 2) 
    this.timer = setTimeout(() => this.ping(), 16 * 1000)
    if (prev && !this.reachable) this.emit('reachable', false)
  }

  incr () {
    const prev = this.reachable
    this.reachable++
    const dur = Math.pow(2, this.reachable > 10 ? 10 : this.reachable) 
    this.timer = setTimeout(() => this.ping(), dur * 1000)
    if (!prev && this.reachable) this.emit('reachable', true)
  }

  destroy () {
    this.destroyed = true
  }

  refresh () {
    if (this.destroyed) return
    if (this.pinging) return
    clearTimeout(this.timer)
    this.ping()
  }
}

module.exports = Ping
