const EventEmitter = require('events')
const os = require('os')

const debug = require('debug')('ws:ble')

const Bluetooth = require('../woodstock/winas/bluetooth')
const DBus = require('../woodstock/lib/dbus')
const { STRING } = require('../woodstock/lib/dbus-types')

/**
 * BLE 负责初始化 dbus对象
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
class BLE extends EventEmitter {
  constructor () {
    super()

    /**
     * 1. 0x01 unbound
     * 2. 0x02 bound
     * 3. 0x03 pending - service unavailable
     */
    this.boundState = 0x00
    this.sataState = 0x00
    this.localName = os.hostname()

    // available after ready
    this.info = null
    this.ready = false

    // set by external module (ble-app, supposedly)
    this.verify = null

    // updated when device connected / disconnected
    // this.connected = false

    // this.msgHandler = msgHandler
    this.dbus = new DBus()
    this.ble = new Bluetooth(this.boundState, this.sataState, this.localName)

    /**
    this.ble.on('LocalAuthWrite', this.handleBleMessage.bind(this, 'LocalAuthWrite')) // LocalAuth
    this.ble.on('NSWrite', this.handleBleMessage.bind(this, 'NSWrite')) // NetSetting
    this.ble.on('BLE_DEVICE_DISCONNECTED', this.handleBleMessage.bind(this, 'deviceDisconnected')) // Device Disconnected
    this.ble.on('BLE_DEVICE_CONNECTED', this.handleBleMessage.bind(this, 'deviceConnected')) // Device Connected
*/

    this.ble.on('LocalAuthWrite', data => {
      let obj
      try {
        obj = JSON.parse(data)
      } catch (e) {
        return
      }

      this.emit('message', Object.assign(obj, {
        charUUID: '60000003-0182-406c-9221-0a6680bd0943'
      }))
    })

    this.ble.on('NSWrite', data => {
      let msg
      try {
        msg = JSON.parse(data)
      } catch (e) {
        return // TODO
      }

      if (!this.verify) {
        const err = new Error('verify not found')
        err.code = 'EUNAVAIL'
        this.send('70000002-0182-406c-9221-0a6680bd0943', {
          seq: msg.seq,
          error: err
        })
      } else if (typeof msg.token !== 'string' || !msg.token || !this.verify(msg.token)) {
        const err = new Error('access denied')
        err.code = 'EPERM'
        this.send('70000002-0182-406c-9221-0a6680bd0943', {
          seq: msg.seq,
          error: err
        })
      } else {
        this.emit('message', Object.assign(msg, {
          charUUID: '70000003-0182-406c-9221-0a6680bd0943'
        }))
      }
    })

    this.ble.on('BLE_DEVICE_CONNECTED', addr => this.emit('connected', addr))
    this.ble.on('BLE_DEVICE_DISCONNECTED', data => this.emit('disconnected', data))
    this.dbus.on('connect', () => {
      this.dbus.attach('/org/bluez/bluetooth', this.ble)
      this.initProperties()
    })
  }

  initProperties () {
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
      this.updateAdv()
    })
  }

  useAuth (f) {
    this.verify = f
  }

  // internal method
  updateAdv () {
    console.log('update adv', this.boundState, this.sataState)
    this.ble.updateAdv(this.boundState, this.sataState, this.localName)
  }

  updateBoundState (state) {
    if (state !== 0x01 && state !== 0x02) throw new Error('bound state must be 0x01 or 0x02')
    this.boundState = state
    this.updateAdv()
  }

  updateSataState (state) {
    if (!(state >= 0x01 && state <= 0x04) && state !== 0x80) throw new Error('sata state must in 0x01 ~ 0x04 or 0x80')
    this.sataState = state
    this.updateAdv()
  }

  /**
  handleBleMessage (type, data) {
    console.log('type', type)
    console.log('data', data)
    if (this.msgHandler) this.msgHandler.handle(type, data, this.update.bind(this))
  }
*/

  updateLocalName (localName) {
    if (typeof localName !== 'string' || !localName.length) throw new Error('localname must be string')
    this.localName = localName
    this.updateAdv()
  }

  view () {
    return {
      state: this.ble ? 'Started' : 'Starting',
      address: (this.info && this.info.Address) || 'XX:XX:XX:XX:XX:XX',
      info: this.info
    }
  }

  // obsolete
  update (type, data) {
    if (this.ble) {
      debug(this.ble[type.slice(0, type.length - 5) + 'Update'], data)
      data = Buffer.from(JSON.stringify(data))
      const funcName = type.slice(0, type.length - 5) + 'Update'
      if (typeof this.ble[funcName] !== 'function') return
      this.ble[funcName](data)
    }
  }

  // char uuid
  // 60000002-0182-406c-9221-0a6680bd0943 auth
  // 70000002-0182-406c-9221-0a6680bd0943 command
  send (charUUID, obj) {
    this.ble.send(charUUID, obj)
  }
}

const ble = new BLE()

module.exports = ble
