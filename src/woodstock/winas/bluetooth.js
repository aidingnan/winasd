const path = require('path')
const os = require('os')

const DBusObject = require('../lib/dbus-object')
const DBusProperties = require('../lib/dbus-properties')
const DBusObjectManager = require('../lib/dbus-object-manager')
const Advertisement = require('../bluez/advertisement')
const GattSerialService = require('../bluez/serives/gatt-serial-service')
const GattLocalAuthService = require('../bluez/serives/gatt-local-auth-service')
const GattNetworkSettingService = require('../bluez/serives/gatt-network-setting-service')
const GattNICService = require('../bluez/serives/gatt-nic-service')
const GattAccessPointService = require('../bluez/serives/gatt-access-point-service')

/**
 * events
 * BLE_DEVICE_DISCONNECTED
 * BLE_DEVICE_CONNECTED
 */
class Bluetooth extends DBusObject {
  constructor (boundState, sataState, localName = 'noname') {
    super()
    this.adv = new Advertisement('advertisement0', {
      Type: 'peripheral',
      LocalName: localName,
      ManufacturerData: [
        [0xffff, ['ay', [boundState, sataState]]]
      ],
      IncludeTxPower: true
    })

    this.addChild(this.adv)

    // 100 NIC
    const NICService = new GattNICService('service4', true)
    NICService.on('Char1WriteValue', (...args) => this.emit('NICChar1Write', ...args))
    NICService.on('Char2WriteValue', (...args) => this.emit('NICChar2Write', ...args))
    this.NICChar1Update = NICService.char1Update.bind(NICService.rxIface)
    this.NICChar2Update = NICService.char2Update.bind(NICService.rxIface)

    // 200 AP
    const APService = new GattAccessPointService('service5', true)
    APService.on('Char1WriteValue', (...args) => this.emit('APChar1Write', ...args))
    APService.on('Char2WriteValue', (...args) => this.emit('APChar2Write', ...args))
    this.APChar1Update = APService.char1Update.bind(APService.rxIface)
    this.APChar2Update = APService.char2Update.bind(APService.rxIface)

    // 600 LocalAuth
    const service1 = new GattLocalAuthService('service1', true)
    service1.on('WriteValue', (...args) => this.emit('LocalAuthWrite', ...args))
    this.LocalAuthUpdate = service1.rxIface.update.bind(service1.rxIface)

    // 700 NetworkSetting
    const service2 = new GattNetworkSettingService('service2', true)
    service2.on('WriteValue', (...args) => this.emit('NSWrite', ...args))
    this.NSUpdate = service2.rxIface.update.bind(service2.rxIface)

    // 800 Cloud
    const service3 = new GattSerialService('service3', true)
    service3.on('WriteValue', (...args) => this.emit('CloudWrite', ...args))
    this.CloudUpdate = service3.rxIface.update.bind(service3.rxIface)

    // gatt root
    const gatt = new DBusObject('gatt')
      .addInterface(new DBusObjectManager())
      .addChild(service1)

    const gatt1 = new DBusObject('gatt1')
      .addInterface(new DBusObjectManager())
      .addChild(service2)

    const gatt2 = new DBusObject('gatt2')
      .addInterface(new DBusObjectManager())
      .addChild(service3)

    const NICGATT = new DBusObject('gatt3')
      .addInterface(new DBusObjectManager())
      .addChild(NICService)

    const APGATT = new DBusObject('gatt4')
      .addInterface(new DBusObjectManager())
      .addChild(APService)

    this
      .addChild(gatt)
      .addChild(gatt1)
      .addChild(gatt2)
      .addChild(NICGATT)
      .addChild(APGATT)
  }

  updateAdv (boundState, sataState, localName = 'noname') {
    this.adv.updateAdv({
      Type: 'peripheral',
      LocalName: localName,
      ManufacturerData: [
        [0xffff, ['ay', [boundState, sataState]]]
      ],
      IncludeTxPower: true
    })
  }

  mounted () {
    super.mounted()
    this.dbus.listen({
      sender: 'org.bluez',
      path: '/org/bluez/hci0'
    }, this.listen.bind(this))
  }

  /**
  disconnected { path: '/org/bluez/hci0/dev_D4_6A_6A_A1_46_48',
    interface: 'org.bluez.Device1',
    changed: { ServicesResolved: false, Connected: false },
    invalidated: [] }
  connected { path: '/org/bluez/hci0/dev_D4_6A_6A_A1_46_48',
    interface: 'org.bluez.Device1',
    changed: { ServicesResolved: true },
    invalidated: [] }
  */
  listen (m) {
    // device add / remove
    if (m.path.startsWith('/org/bluez/hci0/') && m.interface === 'org.bluez.Device1') {
      // eslint-disable-next-line no-prototype-builtins
      if (m.changed && m.changed.hasOwnProperty('ServicesResolved')) {
        const resolved = m.changed.ServicesResolved
        const addr = path.basename(m.path).slice(4).split('_').join(':')
        if (resolved) {
          this.emit('BLE_DEVICE_CONNECTED', addr) 
        } else {
          this.emit('BLE_DEVICE_DISCONNECTED', addr)
        }
        // this.emit(resolved ? 'BLE_DEVICE_CONNECTED' : 'BLE_DEVICE_DISCONNECTED')
      }
    }
  }

  send (charUUID, obj) {
    const buf = Buffer.from(JSON.stringify(obj))
    switch (charUUID) {
      case '60000002-0182-406c-9221-0a6680bd0943':
        this.LocalAuthUpdate(buf)
        break
      case '70000002-0182-406c-9221-0a6680bd0943':
        this.NSUpdate(buf)
        break
      default:
        break
    } 
  } 
}

module.exports = Bluetooth
