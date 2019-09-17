const EventEmitter = require('events')
const os = require('os')

const config = require('config')
const debug = require('debug')('wd:watson')

const Ping = require('../lib/ping')
const Wlan0 = require('../lib/wlan0') 
const INetMon = require('../lib/inetmon')
const TimeSync = require('../lib/timesync')

class Watson extends EventEmitter {
  constructor () {
    super()
    this.destroyed = false

    this.wlan0 = new Wlan0() 
    this.wlan0.on('state', state => this.handleWlan0State(state))

    this.inetmon = null

    this.epName = config.iot.endpoint
    this.ecName = config.cloud.domain + '.aidingnan.com'
    this.ep = null
    this.ec = null

    this.timesync = null

    this.on('healthy', healthy => debug('healthy', healthy))
  }

  destroyMember (name) {
    if (typeof this[name] === 'object' && this[name] !== null) {
      this[name].removeAllListeners()
      this[name].destroy()
      this[name] = null
    }
  }

  handleWlan0State (state) {
    if (this.destroyed) return

    debug('wlan0 state', state)

    if (state === 'connected') {
      this.inetmon = new INetMon('wlan0')
      this.inetmon.on('online', online => this.handleState('inetmon', online))
      this.ep = new Ping(this.epName)
      this.ep.on('reachable', reachable => this.handleState('ep', reachable))
      this.ec = new Ping(this.ecName) 
      this.ec.on('reachable', reachable => this.handleState('ec', reachable))
      if (this.timesync === null) {
        this.timesync = new TimeSync()
        this.timesync.on('synced', () => this.handleState('timesync', true))
      } 
    } else {
      this.destroyMember('inetmon')
      this.destroyMember('ep')
      this.destroyMember('ec')
      this.destroyMember('timesync')
    }

    const healthy = this.healthy
    this.healthy = false
    if (healthy) this.emit('healthy', false)
   
    this.emit('update') 
  }

  isHealthy () {
    if (this.wlan0.state !== 'connected') return false
    if (!this.inetmon.online) return false
    if (this.timesync !== true) return false
    return this.ep && this.ep.reachable && this.ec && this.ec.reachable
  }

  handleState (member, good) {

    debug('member state:', member, good)

    if (member === 'timesync') this.timesync = true
    if (!this.healthy && this.isHealthy()) {
      this.healthy = true
      this.emit('healthy', true)
    } else if (this.healthy && !this.isHealthy()) {
      this.healthy = false
      this.emit('healthy', false)
    }

    this.emit('update')
  }

  destroy () {
    if (this.destroyed) return
    this.destroyMember('inetmon')
    this.destroyMember('ep')
    this.destroyMember('ec')
    this.destroyMember('timesync')
    this.destroyed = true
  }

  refresh () {
    if (this.destroyed) return
    if (this.inetmon) this.inetmon.refresh()
    if (this.ep) this.ep.refresh()
    if (this.ec) this.ec.refresh()
    if (this.timesync && this.timesync !== true) this.timesync.refresh()
  }

  report () {
    const r = {}

    r.wlan0 = this.wlan0.state

    if (this.wlan0.mac) r.mac = this.wlan0.mac
    if (this.wlan0.connection) r.conn = this.wlan0.connection

    if (this.inetmon && this.inetmon.ip && this.inetmon.netmask) {

      const bits = this.inetmon.netmask.split('.')
        .map(str => parseInt(str))
        .reverse()
        .reduce((sum, n, i) => sum + n * Math.pow(256, i), 0)
        .toString(2)
        .split('')
        .reduce((sum, c) => sum + parseInt(c), 0)

      r.ip = `${this.inetmon.ip}/${bits}`

      if (this.inetmon.gateway) 
        r.gw = `${this.inetmon.gateway.target}:${this.inetmon.gateway.reachable === 0 ? 0 : 1}`

      if (this.inetmon.dns1) 
        r.dns1 = `${this.inetmon.dns1.target}:${this.inetmon.dns1.reachable === 0 ? 0 : 1}`

      if (this.inetmon.dns2)
        r.dns2 = `${this.inetmon.dns2.target}:${this.inetmon.dns2.reachable === 0 ? 0 : 1}`
    }

    if (this.ep) r.ep = this.ep.reachable === 0 ? 0 : 1
    if (this.ec) r.ec = this.ec.reachable === 0 ? 0 : 1
    r.ts = this.timesync === true ? 1 : 0

    return r
  }
}

module.exports = new Watson()
