const EventEmitter = require('events')
const os = require('os')
const dns = require('dns')

const validator = require('validator')
const config = require('config')
const debug = require('debug')('wd:inetmon')

const Ping = require('./ping')
const routen = require('./routen')

/**
INetMon object monitors inet settings on given nic (gateway),
including gateway and dns.

This object emits 'online' event with a boolean value.
It also has a 'online' prop for synchronous checking.

refreshable.
destroyable.
*/
class INetMon extends EventEmitter {
  constructor (iface) {
    super()
    this.destroyed = false
    this.iface = iface

    this.ip = ''
    this.netmask = ''

    this.gateway = null
    this.dns1 = null
    this.dns2 = null

    this.error = null
    this.timer = undefined

    this.online = false

    this.probing = false
    this.probe()
  }

  inetInfo (callback) {
    routen((err, entries) => {
      if (err) return callback(err)

      const ips = os.networkInterfaces()[this.iface]
      if (!ips) return callback(null, null)

      const ipv4 = ips.find(ip => ip.family === 'IPv4')
      if (!ipv4) return callback(null, null)

      const info = { ip: ipv4.address, netmask: ipv4.netmask }
      const entry = entries.find(ent =>
        ent.iface === this.iface &&
        ent.flags === 'UG' &&
        ent.gateway !== '0.0.0.0' &&
        validator.isIP(ent.gateway, 4))

      if (entry) info.gateway = entry.gateway
      info.dns = dns.getServers()
      callback(null, info)
    })
  }

  destroyProp (prop) {
    if (this[prop]) {
      this[prop].removeAllListeners()
      this[prop].destroy()
      this[prop] = null
    }
  }

  updateProp (prop, ip) {
    if (!this[prop] && !ip) return
    if (this[prop] && this[prop].target === ip) return
    this.destroyProp(prop)
    if (!ip) return

    this[prop] = new Ping(ip)
    this[prop].on('reachable', reachable => this.handleReachable(prop, reachable))
  }

  isOnline () {
    const gateway = !!(this.gateway && this.gateway.reachable)
    const dns1 = !!(this.dns1 && this.dns1.reachable) 
    const dns2 = !!(this.dns2 && this.dns2.reachable)
    return gateway && (dns1 || dns2)
  }

  handleReachable (prop, reachable) {
    if (this.destroyed) return

    debug(prop, this[prop].target, reachable)

/**
    if (this.online && !this.isOnline()) {
      this.online = false
      this.emit('online', false)
    } else if (!this.online && this.isOnline()) {
      this.online = true
      this.emit('online', true)
    }
*/

    // emit anyway to update dns reachable
    this.online = this.isOnline()
    this.emit('online', this.online)
  }

  probe () {
    this.probing = true
    this.inetInfo((err, info) => {
      this.probing = false
      if (this.destroyed) return
      if (err || !info) {
        this.ip = ''
        this.netmask = ''
        this.destroyProp('gateway')
        this.destroyProp('dns1')
        this.destroyProp('dns2')
      } else {
        const { ip, netmask, gateway, dns } = info
        this.ip = ip
        this.netmask = netmask
        this.updateProp('gateway', gateway)
        if (!this.gateway) {
          this.destroyProp('dns1')
          this.destroyProp('dns2')
        } else {
          this.updateProp('dns1', dns[0])
          this.updateProp('dns2', dns[1])
        }
      }

      this.timer = setTimeout(() => this.probe(), 60 * 1000)
    })
  }

  destroy () {
    if (this.destroyed) return
    this.ip = ''
    this.netmask = ''
    this.destroyProp('gateway')
    this.destroyProp('dns1')
    this.destroyProp('dns2')
    this.destroyed = true
  }

  refresh () {
    if (this.destroyed) return
    if (this.probing) return
    clearTimeout(this.timer)
    this.probe()
  }
}

module.exports = INetMon
