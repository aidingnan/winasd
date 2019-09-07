const DBusObject = require('../lib/dbus-object')
const DBusProperties = require('../lib/dbus-properties')
const DBusObjectManager = require('../lib/dbus-object-manager')
const LEAdvertisement1 = require('./le-advertisement1')

const { OBJECT_PATH, ARRAY } = require('../lib/dbus-types')

class Advertisement extends DBusObject {
  constructor (name, props) {
    super(name)
    this.addInterface(new DBusProperties())
    this.addInterface(new DBusObjectManager())
    this.le = new LEAdvertisement1(props)
    this.addInterface(this.le)
    this.listener = this.listen.bind(this)

    // this.isRegisterd = false
    this.isMounted = false
  }

  mounted () {
    super.mounted()
    this.dbus.listen({ sender: 'org.bluez', path: '/org/bluez' }, this.listener)
    this.register()

    this.isMounted = true
  }

  register () {

    // TODO maintaining a isRegisterd state

    this.dbus.driver.invoke({
      destination: 'org.bluez',
      path: '/org/bluez/hci0',
      'interface': 'org.bluez.LEAdvertisingManager1',
      member: 'UnregisterAdvertisement',
      signature: 'o',
      body: [
        new OBJECT_PATH(this.objectPath()),
      ]
    }, (err, data) => {

      err && console.log('ble failed unregistering adv', err.message)

      this.dbus.driver.invoke({
        destination: 'org.bluez',
        path: '/org/bluez/hci0',
        'interface': 'org.bluez.LEAdvertisingManager1',
        member: 'RegisterAdvertisement',
        signature: 'oa{sv}',
        body: [
          new OBJECT_PATH(this.objectPath()),
          new ARRAY('a{sv}')
        ]
      }, err => {

        err && console.log('ble failed registering adv', err.message)

      })
    })
  }

  updateAdv(props) {
    let le = new LEAdvertisement1(props)
    this.removeInterface(this.le)
    this.le = le
    this.addInterface(this.le)
    if (this.isMounted) this.register()
  }

  listen (m) {
    if (m.path === '/org/bluez/hci0' &&
      m.interface === 'org.bluez.Adapter1' && 
      m.changed &&
      m.changed.Powered === true) {
      this.register()
    }
  }
}

module.exports = Advertisement
