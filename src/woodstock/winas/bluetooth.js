const DBusObject = require('../lib/dbus-object')
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
  constructor (boundF, sn, hostname) {
    super()
    this.boundF = boundF
    const b = boundF() ? 0x02 : 0x01
    const s = sn ? sn.slice(-8) : ''
    this.localName = hostname || s
    this.adv = new Advertisement('advertisement0', {
      Type: 'peripheral',
      LocalName: this.localName,
      // ServiceUUIDs: ['LOCAL-AUTH', 'CLOUD'],
      // 1805 CTS
      // ServiceUUIDs: ['80000000-0182-406c-9221-0a6680bd0943'],
      ManufacturerData: [
        [0xffff, ['ay', [b]]]
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

  updateAdv () {
    const b = this.boundF() ? 0x02 : 0x01
    this.adv.updateAdv({
      Type: 'peripheral',
      LocalName: this.localName,
      ManufacturerData: [
        [0xffff, ['ay', [b]]]
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

  listen (m) {
    // device add / remove
    if (m.path.startsWith('/org/bluez/hci0/') && m.interface === 'org.bluez.Device1') {
      if (m.changed && m.changed.hasOwnProperty('ServicesResolved')) {
        console.log(m.changed.ServicesResolved ? 'BLE_DEVICE_CONNECTED' : 'BLE_DEVICE_DISCONNECTED')
        this.emit(m.changed.ServicesResolved ? 'BLE_DEVICE_CONNECTED' : 'BLE_DEVICE_DISCONNECTED')
      }
    }
  }
}

module.exports = Bluetooth
