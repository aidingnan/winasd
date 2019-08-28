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
  constructor(bound, localName = 'noname') {
    super()
    let b = bound ? 0x02 : 0x01
    // let s = sn ? sn.slice(-8) : ''
    // this.localName = hostname || s
    this.localName = localName
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

    this.CloudUpdate = service3.rxIface.update.bind(service3.rxIface)


    // gatt root
    let gatt = new DBusObject('gatt')
      .addInterface(new DBusObjectManager())
      .addChild(service1)

    let gatt1 = new DBusObject('gatt1')
      .addInterface(new DBusObjectManager())
      .addChild(service2)

    let gatt2 = new DBusObject('gatt2')
      .addInterface(new DBusObjectManager())
      .addChild(service3)

    let NICGATT = new DBusObject('gatt3')
      .addInterface(new DBusObjectManager())
      .addChild(NICService)

    let APGATT = new DBusObject('gatt4')
      .addInterface(new DBusObjectManager())
      .addChild(APService)

    this
      .addChild(gatt)
      .addChild(gatt1)
      .addChild(gatt2)
      .addChild(NICGATT)
      .addChild(APGATT)
  }

  updateAdv(bound, localName) {
    let b = bound ? 0x02 : 0x01
    this.adv.updateAdv({
      Type: 'peripheral',
      LocalName: localName || this.localName,
      ManufacturerData: [
        [0xffff, ['ay', [b]]]
      ],
      IncludeTxPower: true
    })
  }

  mounted() {
    super.mounted()
    this.dbus.listen({
      sender: 'org.bluez',
      path: '/org/bluez/hci0'
    }, this.listen.bind(this))
  }

  listen(m) {
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
