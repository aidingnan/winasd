const os = require('os')
const debug = require('debug')('ws:net')
const child = require('child_process')
const readline = require('readline')

const DBus = require('../woodstock/lib/dbus')
const { STRING } = require('../woodstock/lib/dbus-types')
const NM = require('../woodstock/nm/NetworkManager')
/*
  NetworkManager State
  NM_STATE_UNKNOWN = 0 
  NM_STATE_ASLEEP = 10 
  NM_STATE_DISCONNECTED = 20
  NM_STATE_DISCONNECTING = 30
  NM_STATE_CONNECTING = 40
  NM_STATE_CONNECTED_LOCAL = 50
  NM_STATE_CONNECTED_SITE = 60 
  NM_STATE_CONNECTED_GLOBAL = 70
  */

class NetWorkManager extends require('events') {
  constructor(ctx) {
    super()
    this.ctx = ctx
    this.dbus = new DBus()
    this.dbus.on('connect', () => {
      this.nm = new NM()
      this.dbus.attach('/org/freedesktop/NetworkManager', this.nm)
      this.initState()
    })
  }

  set nm(x) {
    if (this._nm) this._nm.removeAllListeners()
    this._nm = x
    if (!x) return
    x.on('NM_DeviceChanged', (...args) => this.emit('NM_DeviceChanged', ...args))
    x.on('NM_StateChanged', (...args) => (this.emit('NM_StateChanged', ...args), this.handleStateChanged(...args)))
    x.on('NM_ST_ConnectionChanged', (...args) => (this.emit('NM_ST_ConnectionChanged', ...args), this.handleConnectionChanaged(...args)))
    x.on('NM_AP_AccessPointAdded', (...args) => this.emit('NM_AP_AccessPointAdded', ...args))
    x.on('NM_AP_AccessPointRemoved', (...args) => this.emit('NM_AP_AccessPointRemoved', ...args))
  }

  get nm() {
    return this._nm
  }

  initState() {
    this.nm.State((err, data) => {
      this.emit('started', this.hasOwnProperty('state') ? this.state : err ? 0 : data) 
      if (this.hasOwnProperty('state')) return
      if (err) return setTimeout(() => this.initState(), 1000)
      this.state = data || 0
    })
    this.nm.addressDatas((err, data) => {
      if (data) this.addresses = data
    })
    this.nm.currentNetinfo((err, data) => {
      if (data) this.detail = data
    })
  }

  connect(ssid, pwd, callback) {
    this.nm ? this.nm.connect2(ssid, pwd, callback)
      : callback(Object.assign(new Error('nm not started'), {code: 'ESTATE'}))
  }

  devices() {
    return this.nm ? this.nm.devices : []
  }

  handleDeviceChanged() {

  }

  handleConnectionChanaged() {
    debug('handleConnectionChanaged')
  }

  handleStateChanged(state) {
    debug('handleStateChanged', state)
    this.state = state
    //FIXME: will race
    if (state === 70) {
      this.emit('connect')
      this.nm.addressDatas((err, data) => {
        if (data) this.addresses = data
      })
      this.nm.currentNetinfo((err, data) => {
        if (data) this.detail = data
      })
    }
  }

  view() {
    return {
      state: this.state,
      addresses: this.addresses,
      detail: this.detail
    }
  }
}

class Network extends require('events') {
  constructor(ctx) {
    super()
    this.ctx = ctx
    this.startMonitor()
  }

  startMonitor() {
    this.monitor = child.spawn('nmcli', ['monitor'])
    this.readline = readline.createInterface({ input: this.monitor.stdout })
    this.readline.on("close", () => {
      debug('monitor closed')
    })
    this.readline.on("line", this.parseMessage.bind(this))
  }

  parseMessage(message) {
    clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => this.refreshInfo(), 1500)
    message = message.toString().trim()
    if (!message) return
    let ms = message.split(': ')
    if (ms.length === '1') {
      if (ms[0].startsWith('Networkmanager is now in the')) {

      } else if (ms[0].startsWith('Connectivity is now')) {

      }
    } else if (ms.length === '2') {

    }
  }

  refreshInfo() {
    if (this.refreshing) {
      this.pending = true
      return
    }
    this.refreshing = true
    this.pending = false
    child.exec('nmcli d show wlan0', (err, stdout, stderr) => {
      this.refreshing = false
      if (err || stderr) console.log('network info refresh failed')
      else {
        stdout.toString()
          .split('/n')
          .forEach(x => {
            let arr = x.split(':')
          })
      }
      if (this.pending) {
        this.refreshInfo()
      }
    })
  }

  connect(ssid, pwd, callback) {
    child.exec(`nmcli d wifi connect ${ ssid } password ${pwd}`, (err, stdout, stderr) => {

    })
  }

  destroy() {

  }

  view() {

  }
}

module.exports = NetWorkManager