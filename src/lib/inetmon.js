const EventEmitter = require('events')
const os = require('os')
const dns = require('dns')

const validator = require('validator')
const config = require('config')
const debug = require('debug')('wd:inetmon')

const Ping = require('./ping')
const routen = require('./routen')

/**
This class monitors wlan0 interface
1. retrieve ip, netmask, gateway, and dns
2. 
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

    this.epName = config.iot.endpoint
    this.ecName = config.cloud.domain + '.aidingnan.com'
    this.ep = null
    this.ec = null

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
    this[prop].on('state', state => this.handleStateChange(prop, state))
  }

  handleStateChange (prop, state) {

    debug(prop, this[prop].target, state)

    if (this.gateway && this.gateway.reachable &&
      ((this.dns1 && this.dns1.reachable) || (this.dns2 && this.dns2.reachable))) {
      if (!this.ep) {
        this.ep = new Ping(this.epName) 
        this.ep.on('state', state => this.handleStateChange('ep', state))
      } 

      if (!this.ec) {
        this.ec = new Ping(this.ecName)
        this.ec.on('state', state => this.handleStateChange('ec', state))
      }
    } else {
      this.destroyProp('ep')
      this.destroyProp('ec')
    }
  }

  probe () {
    this.inetInfo((err, info) => {
      if (this.destroyed) return
      if (err || !info) {
        this.ip = ''
        this.netmask = ''
        this.destroyProp('gateway')
        this.destroyProp('dns1')
        this.destroyProp('dns2')
        this.destroyProp('ep')
        this.destroyProp('ec')
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
}

module.exports = INetMon
