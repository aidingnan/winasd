const Bluetooth = require('../woodstock/winas/bluetooth')
const DBus = require('../woodstock/lib/dbus')
const { STRING } = require('../woodstock/lib/dbus-types')
const debug = require('debug')('ws:bled')
const Device = require('../lib/device')
const Promise = require('bluebird')
const child = Promise.promisifyAll(require('child_process'))

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
  constructor(ctx) {
    super()
    this.ctx = ctx
    this.dbus = new DBus()
    this.dbus.on('connect', () => {
      this.ble = new Bluetooth(ctx.userStore && ctx.userStore.data || false, ctx.deviceSN, ctx.hostname)
      this.dbus.attach('/org/bluez/bluetooth', this.ble)
      this.emit('connect')
      this.initProperties()
    })
    this.handlers = new Map()
  }

  initProperties() {
    //debug('initProperties')
    if (!this.ble) return setTimeout(() => this.initProperties(), 1000)
    this.ble.dbus.driver.invoke({
      destination: 'org.bluez',
      path: '/org/bluez/hci0',
      'interface': 'org.freedesktop.DBus.Properties',
      member: 'GetAll',
      signature: 's',
      body:[
        new STRING('org.bluez.Adapter1')
      ]
    }, (err, data) => {
      if (err) return setTimeout(() => this.initProperties(), 1000)
      this.info = data[0].eval().reduce((o, [name, kv]) => Object.assign(o, { [name]: kv[1] }), {})
      debug(this.info)
    })
  }

  // update ble advertisement
  updateAdv() {
    this.ble && this.ble.updateAdv(this.ctx.userStore && this.ctx.userStore.data || false, this.ctx.deviceSN)
  }

  // remove all listeners from old ble, then add those to new
  set ble(x) {
    if (this._ble) {
      this._ble.removeAllListeners()
    }
    this._ble = x
    if (!x) return
    this._ble.on('Service1Write', this.handleBleMessage.bind(this, 'Service1Write')) // LocalAuth
    this._ble.on('Service2Write', this.handleBleMessage.bind(this, 'Service2Write')) // NetSetting
    this._ble.on('Service3Write', this.handleBleMessage.bind(this, 'Service3Write')) // Cloud
    this._ble.on('BLE_DEVICE_DISCONNECTED', () => this.emit('BLE_DEVICE_DISCONNECTED')) // Device Disconnected
    this._ble.on('BLE_DEVICE_CONNECTED', () => this.emit('BLE_DEVICE_CONNECTED')) // Device Connected
    this._ble.on('NICChar1Write', this.handleBleMessage.bind(this, 'NICChar1Write'))
    this._ble.on('NICChar2Write', this.handleBleMessage.bind(this, 'NICChar2Write'))
  }

  get ble() { return this._ble }

  // 处理来自某个ble service 的消息
  // service1 => localAuth service
  // service2 => network setting
  // service3 => cloud
  // NICChar1/NICChar2 => network interface service characteristics
  handleBleMessage(type, data) {
    let packet
    try {
      packet = JSON.parse(data)
    } catch(e) {
      return this.update(type, { code: 'ENOTJSON', message: 'packet error'})
    }

    if (type === 'Service1Write') return this.handleLocalAuth(type, packet)
    if (type === 'Service2Write') return this.handleNetworkSetting(type, packet)
    if (type === 'Service3Write') return this.handleCloud(type, packet)
    if (type === 'NICChar1Write') return this.handleNICChar1Write(type, packet)
    if (type === 'NICChar2Write') return this.handleNICChar2Write(type, packet)
    debug('invalid action: ', packet.action)
  }

  handleLocalAuth(type, packet) {
    if (!this.ctx.localAuth) { // ctx not enter starting
      return this.update(type, { seq: packet.seq, error: Object.assign(new Error(`winasd in ${ this.ctx.state.name } state`), { code: 'ESTATE' }) })
    }
    if (packet.action === 'req') {
      this.ctx.localAuth.request((err, data) => {
        if (err) return this.update(type, { seq: packet.seq, error: err })
        return this.update(type, { seq: packet.seq, data})
      })
    } else if (packet.action == 'auth') {
      this.ctx.localAuth.auth(packet.body, (err, data) => {
        if (err) return this.update(type, { seq: packet.seq, error: err })
        return this.update(type, {seq: packet.seq, data})
      })
    }
  }

  /**
   * action: auth/conn
   * data: {token}/{ssid, pwd}
   */
  handleNetworkSetting(type, packet) {
    if (!this.ctx.localAuth) { // ctx not enter starting
      this.update(type, { seq: packet.seq, error: Object.assign(new Error(`winasd in ${ this.ctx.state.name } state`), { code: 'ESTATE' }) })
    }
    if (packet.action === 'addAndActive') {
      if (this.ctx.localAuth.verify(packet.token)) {
        this.ctx.net.connect(packet.body.ssid, packet.body.pwd, (err, data) => {
          if (err) return this.update(type, { seq: packet.seq, error: err })
          return this.update(type, {seq: packet.seq, data})
        })
      } else {
        let error = Object.assign(new Error('auth failed'), { code: 'EAUTH' })
        return this.update(type, { seq: packet.seq, error })
      }
    } else if (packet.action === 'addAndActiveAndBound') {
      this.handleConnectAndBound(type, packet)
    }
  }

  handleConnectAndBound(type, packet) {
    if (this.ctx.localAuth.verify(packet.token)) {
      this.ctx.net.connect(packet.body.ssid, packet.body.pwd, (err, data) => {
        if (err) return this.update(type, { seq: packet.seq, error: Object.assign(err, {code: 'EWIFI'})})
        this.update(type, { seq: packet.seq, success:'WIFI', data })
        this.waitChannel(type, packet, err => {
          if (err) return this.update(type, { seq: packet.seq, error: Object.assign(err, { code: 'ECHANNEL' })})
          this.update(type, { seq: packet.seq, success:'CHANNEL' })
          this.waitNTPAsync()
            .then(_ => {
              this.update(type, { seq: packet.seq, success:'NTP' })
              this.boundDevice(type, packet, (err, data) => {
                if (err) return this.update(type, { seq: packet.seq, error:  Object.assign(err, { code: 'EBOUND' })})
                this.update(type, { seq: packet.seq, success:'BOUND', data:{
                    sn: this.ctx.deviceSN,
                    addr: Device.NetworkAddr('lanip')
                  }
                })
              })
            })
            .catch(e => this.update(type, { seq: packet.seq, error:Object.assign(e, { code: 'ENTP' })}))
        })
      })
    } else {
      let error = Object.assign(new Error('auth failed'), { code: 'EAUTH' })
      return this.update(type, { seq: packet.seq, error })
    }
  }

  waitChannel(type, packet, callback) {
    let ticks = 0
    const tick = setInterval(() => {
      if (this.ctx.state.name() === 'Unbound' && this.ctx.channel) {
        clearInterval(tick) 

        if (this.ctx.channel.status === 'Connected') {
          return process.nextTick(() => callback(null))
        } else {
          let timeout
          let timer = setTimeout(() => {
            timeout = true
            return callback(new Error('channel connect timeout'))
          }, 60 * 1000)
          this.ctx.channel.once('ChannelConnected', () => {
            if (timeout) return
            clearTimeout(timer)
            return callback(null)
          })
        }

      } else if (tick > 10) {
        clearInterval(tick)
        return callback(new Error('channel connect timeout'))
      } else {
        ticks++
      }
    }, 3000)

  }

  async waitNTPAsync() {
    let timeout = new Date().getTime() + 10 * 1000
    while(true) {
      if (timeout < new Date().getTime()) throw new Error('ntp sync timeout')
      if ((await child.execAsync(`timedatectl| grep sync | awk '{ print $4 }'`)).toString().trim() === 'yes')
        return
      await Promise.delay(1000)
    }
  }

  boundDevice(type, packet, callback) {
    this.ctx.requestBind(packet.body.encrypted, err => {
      if (err) return callback(err)
      return callback(null, {
        sn: this.ctx.deviceSN,
        addr: Device.NetworkAddr('lanip')
      })
    })
  }

  handleCloud(type, packet) {

  }

  handleNICChar1Write(type, packet) {
    if (packet.action === 'list') {
      return this.update(type, {seq: packet.seq, data:{ devices:this.ctx.net.devices() }})
    }
  }

  // push model
  handleNICChar2Write(type, packet) {
    if (packet.action === 'list') {
      return this.update(type, {seq: packet.seq, data:{ devices:this.ctx.net.devices() }})
    }
  }

  addHandler(type, callback){
    if (this.handlers.has(type)) {
      this.handlers.get(type).push(callback)
    }
    else {
      this.handlers.set(type, [callback])
    }
  }

  dispatch(type, data) {
    if (this.handlers.has(type)) {
      this.handlers.get(type).forEach(cb => cb(data))
    }
  }

  view() {
    return {
      state: this.ble ? 'Started' : 'Starting',
      address: this.info && this.info.Address || 'XX:XX:XX:XX:XX:XX',
      info: this.info
    }
  }

  update(type, data) {
    if (this.ble) {
      debug(this.ble[type.slice(0, type.length - 5)+ 'Update'], data)
      data = Buffer.from(JSON.stringify(data))
      
      this.ble[type.slice(0, type.length - 5) + 'Update'](data)
    }
  }
}

module.exports = BLED
