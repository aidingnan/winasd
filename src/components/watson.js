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

    this.healthy = false

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
      this.health = true
      this.emit('healthy', true)
    } else if (this.healthy && !this.isHealth()) {
      this.health = false
      this.emit('healthy', false)
    }
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
}

module.exports = new Watson()
