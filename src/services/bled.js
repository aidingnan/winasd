const Bluetooth = require('../woodstock/winas/bluetooth')
const DBus = require('../woodstock/lib/dbus')
const { STRING } = require('../woodstock/lib/dbus-types')
const debug = require('debug')('ws:bled')
const os = require('os')

/**
 * BLED 负责初始化 dbus对象
 * 由于ble和networkmanager 都使用debus提供服务，使用服务
 * 所以该模块负责初始化ble中的各种service以及NetworkManager对象
 * definition bluetooth packet
 *
 * {
 *    action: 'scan'/'conn'/'net'/
 *    seq: 1000,
 *    token: '', optional
 *    body:{}
 * }
 */
class BLED extends require('events') {
  constructor (msgHandler) {
    super()
    this.msgHandler = msgHandler
    this.dbus = new DBus()

    /**
     * 1. 0x01 unbound
     * 2. 0x02 bound
     * 3. 0x03 pending - service unavailable
     */
    this.boundState = 0x03
    this.sataState = 0x00
    this.localName = os.hostname()

    this.ble = new Bluetooth(this.boundState, this.sataState, this.localName)
    this.ble.on('LocalAuthWrite', this.handleBleMessage.bind(this, 'LocalAuthWrite')) // LocalAuth
    this.ble.on('NSWrite', this.handleBleMessage.bind(this, 'NSWrite')) // NetSetting
    this.ble.on('BLE_DEVICE_DISCONNECTED', this.handleBleMessage.bind(this, 'deviceDisconnected')) // Device Disconnected
    this.ble.on('BLE_DEVICE_CONNECTED', this.handleBleMessage.bind(this, 'deviceConnected')) // Device Connected
    this.dbus.on('connect', () => {
      this.dbus.attach('/org/bluez/bluetooth', this.ble)
      this.emit('connect')
      this.initProperties()
    })
  }

  initProperties () {
    // debug('initProperties')
    if (!this.ble) return setTimeout(() => this.initProperties(), 1000)
    this.ble.dbus.driver.invoke({
      destination: 'org.bluez',
      path: '/org/bluez/hci0',
      interface: 'org.freedesktop.DBus.Properties',
      member: 'GetAll',
      signature: 's',
      body: [
        new STRING('org.bluez.Adapter1')
      ]
    }, (err, data) => {
      if (err) return setTimeout(() => this.initProperties(), 1000)
      this.info = data[0].eval().reduce((o, [name, kv]) => Object.assign(o, { [name]: kv[1] }), {})
      debug(this.info)
    })
  }

  _updateAdv () {
    this.ble.updateAdv(this.boundState, this.sataState, this.localName)
  }

  updateBoundState (state) {
    if (state !== 0x01 && state !== 0x02) throw new Error('bound state must be 0x01 or 0x02')
    this.boundState = state
    this._updateAdv()
  }

  updateSataState (state) {
    if (!(state >= 0x01 && state <= 0x04) && state !== 0x80) throw new Error('sata state must in 0x01 ~ 0x04 or 0x80')
    this.sataState = state
    this._updateAdv()
  }

  updateLocalName (localName) {
    if (typeof localName !== 'string' || !localName.length) throw new Error('localname must be string')
    this.localName = localName
    this._updateAdv()
  }

  handleBleMessage (type, data) {
    if (this.msgHandler) this.msgHandler.handle(type, data, this.update.bind(this))
  }

  view () {
    return {
      state: this.ble ? 'Started' : 'Starting',
      address: (this.info && this.info.Address) || 'XX:XX:XX:XX:XX:XX',
      info: this.info
    }
  }

  update (type, data) {
    if (this.ble) {
      debug(this.ble[type.slice(0, type.length - 5) + 'Update'], data)
      data = Buffer.from(JSON.stringify(data))
      const funcName = type.slice(0, type.length - 5) + 'Update'
      if (typeof this.ble[funcName] !== 'function') return
      this.ble[funcName](data)
    }
  }
}

module.exports = BLED
