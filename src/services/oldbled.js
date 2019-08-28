const Bluetooth = require('../woodstock/winas/bluetooth')
const DBus = require('../woodstock/lib/dbus')
const { STRING } = require('../woodstock/lib/dbus-types')
const debug = require('debug')('ws:bled')
const Device = require('../lib/device')
const Promise = require('bluebird')
const child = Promise.promisifyAll(require('child_process'))

/**
 * BLED 负责初始化 debus对象
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
  /**
   * @param {function} boundF - need return bound state (true false)
   * @param {string} sn - device serial number
   * @param {string} hostname - device hostname
   * @param {MsgHandler} msgHandler - bled message handler
   */
  constructor (boundF, sn, hostname, msgHandler) {
    super()
    this.boundF = boundF
    this.sn = sn
    this.hostname = hostname
    this.handler = msgHandler

    this.dbus = new DBus()
    this.ble = new Bluetooth(boundF, sn, hostname)
    this.ble.on('LocalAuthWrite', this.handleBleMessage.bind(this, 'LocalAuthWrite')) // LocalAuth
    this.ble.on('NSWrite', this.handleBleMessage.bind(this, 'NSWrite')) // NetSetting
    this.ble.on('CloudWrite', this.handleBleMessage.bind(this, 'CloudWrite')) // Cloud
    this.ble.on('BLE_DEVICE_DISCONNECTED', () => this.handleBleMessage('deviceDisconnected')) // Device Disconnected
    this.ble.on('BLE_DEVICE_CONNECTED', () => this.handleBleMessage('deviceConnected')) // Device Connected
    this.dbus.on('connect', () => {
      this.dbus.attach('/org/bluez/bluetooth', this.ble)
      this.emit('connected')
      this.initProperties()
    })
  }

  initProperties () {
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

  // update ble advertisement
  updateAdv () {
    this.ble.updateAdv()
  }

  // 处理来自某个ble service 的消息
  // LocalAuthWrite => localAuth service
  // NSWrite => network setting
  // CloudWrite => cloud
  // NICChar1/NICChar2 => network interface service characteristics
  handleBleMessage (type, data) {
    if (this.handler && this.handler.handle) {
      return this.handler.handle(type, data, this.update.bind(this, type))
    }

    let packet
    try {
      packet = JSON.parse(data)
    } catch (e) {
      return this.update(type, { code: 'ENOTJSON', message: 'packet error' })
    }

    if (type === 'Service1Write') return this.handleLocalAuth(type, packet)
    if (type === 'Service2Write') return this.handleNetworkSetting(type, packet)
    if (type === 'Service3Write') return this.handleCloud(type, packet)
    if (type === 'NICChar1Write') return this.handleNICChar1Write(type, packet)
    if (type === 'NICChar2Write') return this.handleNICChar2Write(type, packet)
    debug('invalid action: ', packet.action)
  }

  handleLocalAuth (type, packet) {
    if (!this.ctx.localAuth) { // ctx not enter starting
      return this.update(type, { seq: packet.seq, error: Object.assign(new Error(`winasd in ${this.ctx.state.name} state`), { code: 'ESTATE' }) })
    }
    if (packet.action === 'req') {
      this.ctx.localAuth.request((err, data) => {
        if (err) return this.update(type, { seq: packet.seq, error: err })
        return this.update(type, { seq: packet.seq, data })
      })
    } else if (packet.action == 'auth') {
      this.ctx.localAuth.auth(packet.body, (err, data) => {
        if (err) return this.update(type, { seq: packet.seq, error: err })
        return this.update(type, { seq: packet.seq, data })
      })
    }
  }

  /**
   * action: auth/conn
   * data: {token}/{ssid, pwd}
   */
  handleNetworkSetting (type, packet) {
    if (!this.ctx.localAuth) { // ctx not enter starting
      this.update(type, { seq: packet.seq, error: Object.assign(new Error(`winasd in ${this.ctx.state.name} state`), { code: 'ESTATE' }) })
    }
    if (packet.action === 'addAndActive') {
      if (this.ctx.localAuth.verify(packet.token)) {
        this.ctx.net.connect(packet.body.ssid, packet.body.pwd, (err, data) => {
          if (err) return this.update(type, { seq: packet.seq, error: err })
          return this.update(type, { seq: packet.seq, data })
        })
      } else {
        const error = Object.assign(new Error('auth failed'), { code: 'EAUTH' })
        return this.update(type, { seq: packet.seq, error })
      }
    } else if (packet.action === 'addAndActiveAndBound') {
      this.handleConnectAndBound(type, packet)
    }
  }

  handleConnectAndBound (type, packet) {
    if (this.ctx.localAuth.verify(packet.token)) {
      this.ctx.net.connect(packet.body.ssid, packet.body.pwd, (err, data) => {
        if (err) return this.update(type, { seq: packet.seq, error: Object.assign(err, { code: 'EWIFI' }) })
        this.update(type, { seq: packet.seq, success: 'WIFI', data })
        this.waitChannel(type, packet, err => {
          if (err) return this.update(type, { seq: packet.seq, error: Object.assign(err, { code: 'ECHANNEL' }) })
          this.update(type, { seq: packet.seq, success: 'CHANNEL' })
          this.waitNTPAsync()
            .then(_ => {
              this.update(type, { seq: packet.seq, success: 'NTP' })
              this.boundDevice(type, packet, (err, data) => {
                if (err) return this.update(type, { seq: packet.seq, error: Object.assign(err, { code: 'EBOUND' }) })
                this.update(type, { seq: packet.seq,
                  success: 'BOUND',
                  data: {
                    sn: this.ctx.deviceSN,
                    addr: Device.NetworkAddr('lanip')
                  }
                })
              })
            })
            .catch(e => this.update(type, { seq: packet.seq, error: Object.assign(e, { code: 'ENTP' }) }))
        })
      })
    } else {
      const error = Object.assign(new Error('auth failed'), { code: 'EAUTH' })
      return this.update(type, { seq: packet.seq, error })
    }
  }

  waitChannel (type, packet, callback) {
    if (this.ctx.channel.status === 'Connected') {
      return process.nextTick(() => callback(null))
    } else {
      let timeout
      const timer = setTimeout(() => {
        timeout = true
        return callback(new Error('channel connect timeout'))
      }, 60 * 1000)
      this.ctx.channel.once('ChannelConnected', () => {
        if (timeout) return
        clearTimeout(timer)
        return callback(null)
      })
    }
  }

  async waitNTPAsync () {
    const timeout = new Date().getTime() + 10 * 1000
    while (true) {
      if (timeout < new Date().getTime()) throw new Error('ntp sync timeout')
      if ((await child.execAsync(`timedatectl| grep sync | awk '{ print $4 }'`)).toString().trim() === 'yes') { return }
      await Promise.delay(1000)
    }
  }

  boundDevice (type, packet, callback) {
    this.ctx.requestBind(packet.body.encrypted, err => {
      if (err) return callback(err)
      return callback(null, {
        sn: this.ctx.deviceSN,
        addr: Device.NetworkAddr('lanip')
      })
    })
  }

  handleCloud (type, packet) {

  }

  handleNICChar1Write (type, packet) {
    if (packet.action === 'list') {
      return this.update(type, { seq: packet.seq, data: { devices: this.ctx.net.devices() } })
    }
  }

  // push model
  handleNICChar2Write (type, packet) {
    if (packet.action === 'list') {
      return this.update(type, { seq: packet.seq, data: { devices: this.ctx.net.devices() } })
    }
  }

  view () {
    return {
      state: this.ble ? 'Started' : 'Starting',
      address: this.info && this.info.Address || 'XX:XX:XX:XX:XX:XX',
      info: this.info
    }
  }

  update (type, data) {
    if (this.ble) {
      // slice `Write` add `Update`
      debug(this.ble[type.slice(0, type.length - 5) + 'Update'], data)
      data = Buffer.from(JSON.stringify(data))
      this.ble[type.slice(0, type.length - 5) + 'Update'](data)
    }
  }
}

module.exports = BLED
