/* * @Author: JackYang  * @Date: 2019-07-10 16:32:51  * @Last Modified by:   JackYang  * @Last Modified time: 2019-07-10 16:32:51  */
const fs = require('fs')
const path = require('path')
const Config = require('config')

const Promise = require('bluebird')
const mkdirpAsync = Promise.promisify(require('mkdirp'))
const rimrafAsync = Promise.promisify(require('rimraf'))
const child = Promise.promisifyAll(require('child_process'))

const debug = require('debug')('ws:app')
const debug2 = require('debug')('ws:appService')

const State = require('../lib/state')
const DataStore = require('../lib/DataStore')

const Bled = require('./bled')
const Winas = require('./winas')
const LED = require('../lib/led') // any question of this moudle , ask liuhua
const Channel = require('./channel')
const Upgrade = require('./upgrade')
const Device = require('../lib/device')
const initEcc = require('../lib/atecc')
const LocalAuth = require('./localAuth')
const Provision = require('./provision')
const NetworkManager = require('./network')
const {
  reqBind,
  reqUnbind,
  verify,
  refresh
} = require('../lib/lifecycle')

const ProvisionFile = path.join(Config.storage.roots.p, Config.storage.files.provision)

const NewError = (message, code) => Object.assign(new Error(message), {
  code
})

const EPERSISTENT = NewError('mount persistent partition failed', 'EPERSISTENT')
const EUSERSTORE = NewError('user store load failed', 'EUSERSTORE')
const EDEVICE = NewError('device info load failed', 'EDEVICE')
const EBOUND = NewError('device cloud bound with error signature', 'EBOUND')
const EECCINIT = NewError('ecc init error', 'EECCINIT')
const EECCPRESET = NewError('ecc preset error', 'EECCPRESET')

class BaseState extends State {
  requestBind(...args) {
    if (args.length) {
      args.pop()(new Error('error state'))
    }
  }

  requestUnbind(...args) {
    if (args.length) {
      args.pop()(new Error('error state'))
    }
  }

  debug(...args) {
    debug2(...args)
  }

  name() {
    return this.constructor.name
  }
}

/**
 * check all necessary constraints in this winasd.
 * make work dirs
 * start ecc service and led service
 * load bound user if exist
 */
class Prepare extends BaseState {
  enter() {
    // mount and init persistence partition
    this.initPersistenceAsync().then(() => {
      Config.system.withoutEcc ? this.startupWithoutEcc() :
        this.startup()
    }, err => this.setState('Failed', EPERSISTENT))
  }

  async initPersistenceAsync() {
    await rimrafAsync(Config.storage.dirs.tmpDir)
    await mkdirpAsync(Config.storage.dirs.tmpDir)
    await mkdirpAsync(Config.storage.dirs.isoDir)
    await mkdirpAsync(Config.storage.dirs.certDir)
    await mkdirpAsync(Config.storage.dirs.bound)
    await mkdirpAsync(Config.storage.dirs.device)
  }

  // skip init ecc
  startupWithoutEcc() {
    if (!fs.existsSync(ProvisionFile)) {
      return this.setState('Provisioning')
    } else {
      this.loadUserStore((err, userStore) => {
        if (err) return this.setState('Failed', EUSERSTORE)
        this.loadDevice((err, device) => {
          if (err) return this.setState('Failed', EDEVICE)
          this.ctx.userStore = userStore // bound user info
          this.ctx.deviceInfo = device
          this.ctx.deviceSN = device.sn // deviceSN
          this.setState('Starting')
        })
      })
    }
  }

  // init ecc first
  startup() {
    this.initLedService((err, ledService) => { // ignore led start failed
      if (err) console.log('LED Service Start Error')
      this.ctx.ledService = ledService
      initEcc(Config.ecc.bus, (err, ecc) => {
        if (err) return this.setState('Failed', EECCINIT)
        ecc.preset(e => {
          if (e) return this.setState('Failed', EECCPRESET)
          this.ctx.ecc = ecc
          this.loadDevice((err, { sn }) => { // provision need
            if (err) return this.setState('Failed', EDEVICE)
            this.ctx.deviceSN = sn
            this.startupWithoutEcc()
          })
        })
      })
    })
  }

  initLedService(callback) {
    let ledService = new LED(Config.led.bus, Config.led.addr) // start led service
    ledService.on('StateEntered', state => {
      if (state === 'Err') {
        ledService.removeAllListeners()
        return callback(ledService.state.error)
      } else if (state === 'StandBy') {
        ledService.removeAllListeners()
        return callback(null, ledService)
      }
    })
  }

  loadUserStore(callback) {
    let userStore = new DataStore({
      isArray: false,
      file: path.join(Config.storage.dirs.bound, Config.storage.files.boundUser),
      tmpDir: path.join(Config.storage.dirs.tmpDir)
    })

    userStore.once('Update', () => {
      return callback(null, userStore)
    })

    userStore.once('StateEntered', state => {
      if (state === 'Failed')
        return callback(userStore.state.err)
    })
  }

  // read SN...
  loadDevice(callback) {
    if (Config.system.withoutEcc) {
      fs.readFile(path.join(Config.storage.dirs.certDir, 'deviceSN'), (err, data) => {
        if (err) return callback(err)
        return callback(null, {
          sn: data.toString().trim()
        })
      })
    } else {
      this.ctx.ecc.serialNumber({}, (err, sn) => {
        if (err) return callback(err)
        return callback(null, {
          sn: (process.env.NODE_ENV.startsWith('test') ? 'test_' : '') + sn
        })
      })
    }
  }
}

class Provisioning extends BaseState {
  enter() {
    console.log('run in provision state')
    this.ctx.bled = new Bled(this.ctx)
    this.ctx.bled.on('connect', () => {})

    this.ctx.net = new NetworkManager(this.ctx)
    this.ctx.net.on('started', state => {
      if (state !== 70) {
        this.ctx.net.connect('Xiaomi_123', 'wisnuc123456', (err, data) => {
          console.log('Net Module Connect: ', err, data)
        })
      }
    })
    this.ctx.net.once('connect', () => {
      this.ctx.provision = new Provision(this.ctx)
      this.ctx.provision.on('Finished', () => {
        this.ctx.provision.removeAllListeners()
        this.ctx.provision.destroy()
        this.ctx.provision = undefined
        console.log('*** Provision finished, need reboot ***')
      })
    })
  }
}

class Starting extends BaseState {
  enter() {
    console.log('run in normal state')
    this.ctx.localAuth = new LocalAuth(this.ctx)
    this.ctx.bled = new Bled(this.ctx)
    this.ctx.bled.on('connect', () => {
    })
    
    this.ctx.net = new NetworkManager(this.ctx)
    this.ctx.net.on('started', state => {
      console.log('NetworkManager Started: ', state)
      if (state !== 70) {
        console.log('Device Network Disconnect', state)
      }
    })
    this.ctx.net.on('connect', () => {
      process.nextTick(() => this.ctx.channel && this.ctx.channel.connect())
    })

    this.ctx.bled.on('BLE_DEVICE_DISCONNECTED', () => {
      if (this.ctx.localAuth) {
        let bound = this.ctx.state.name() === 'Bound'
        this.ctx.ledService.runGroup(bound ? 'normal' : 'unbind')
      }
    }) // stop localAuth
    
    if (this.ctx.userStore.data) {
      this.setState('Bound')
    } else {
      this.setState('Unbind')
    }
  }
}

/**
 * start channel service, on ***ChannelConnected*** event
 * 
 * if cloud return someone bound this device, that means unbind state error.
 * 
 * maybe bound job had not finished. verify the signature, do bind if verifyed
 */
class Unbind extends BaseState {
  enter() {
    this.ctx.channel = new Channel(this.ctx)
    this.ctx.ledService.runGroup('unbind')
    this.ctx.channel.once('ChannelConnected', (device, user) => {
      if (user) { // mismatch
        console.log('****** cloud device bind state mismatch, check signature *****')
        verify(device.info.signature, (err, verifyed) => {
          if (err || !verifyed) {
            console.log('*** cloud device bind state mismatch, device in unbind ***')
            this.setState('Failed', EBOUND)
          } else {
            this.setState('Binding', user)
          }
        })
      } else {
        console.log('*** cloud device bind state match ***')
      }
    })
  }

  // request to cloud, save userinfo if success
  requestBind(encrypted, callback) {
    if (this.bindingFlag) return process.nextTick(() => callback(new Error('allready in binding state')))
    this.bindingFlag = true
    if (!this.ctx.token) return process.nextTick(() => callback(new Error('Winas Net Error')))
    this.validateBlock(err => {
      if (err) return callback(err)
      return reqBind(this.ctx.ecc, encrypted, this.ctx.token, (err, data) => {
        if (err) {
          this.bindingFlag = false
          return callback(err)
        }
        let user = {
          id: data.data.id,
          username: data.data.username,
          phone: data.data.username
        }
        this.setState('Binding', user, callback)
      })
    })
  }

  validateBlock(callback) {
    fs.exists('/sys/block/sda/size', exists => {
      if (!exists) return callback(new Error('sda not found'))
      fs.readFile('/sys/block/sda/size', (err, data) => {
        if (err || data.toString().trim() === '0') return callback(err || new Error('sda size 0'))
        return callback(null)
      })
    })
  }

  exit() {
    this.ctx.channel.removeAllListeners()
    this.ctx.channel.destroy()
    this.ctx.channel = undefined
  }
}

/**
 * clean built-in volume device
 * ```bash
 *  umount -f /dev/xxx
 *  mkfs.btrfs -f /dev/xxx
 *  partprobe
 * ```
 */
class Binding extends BaseState {
  enter(user, callback = () => {}) {
    this.start(user)
      .then(() => (process.nextTick(() => callback(null, user)), this.setState('Bound')))
      .catch(e => (process.nextTick(() => callback(Object.assign(new Error('clean drive failed'), {
        code: 'EBINDING'
      }))), this.setState('Failed', Object.assign(e, {
        code: 'EBINDING'
      }))))
  }

  async start(user) {
    await this.cleanVolumeAsync()
    // save user
    await new Promise((resolve, reject) => this.ctx.userStore.save(user, err => err ? reject(err) : resolve()))
    // refresh lifecycle
    await new Promise((res, rej) => refresh(err => err ? rej(err) : res()))
    // update ble advertisement
    this.ctx.bled.updateAdv()
  }

  async cleanVolumeAsync() {
    // FIXME: where is the data device
    try {
      await child.execAsync('umount -f /dev/sda')
    } catch (e){
      if (!e.message || !e.message.includes('not mounted')){ 
        throw e
      }
    }
    // FIXME:
    await child.execAsync(`mkfs.btrfs -f /dev/sda`)

    await child.execAsync('partprobe')
  }
}

class Unbinding extends BaseState {
  enter() {
    this.doUnbind()
      .then(() => this.setState('Unbind'))
      .catch(e => this.setState('Failed', Object.assign(e, {
        code: 'EUNBINDING'
      })))
  }

  async doUnbind() {
    // delete user info
    await new Promise((resolve, reject) => this.ctx.userStore.save(null, err => err ? reject(err) : resolve()))
    // set default device name, ignore error
    await new Promise((res, rej) => Device.setDeviceName(Device.DEVICE_NAME, _ => res()))
    // refresh lifecycle
    await new Promise((res, rej) => refresh(err => err ? rej(err) : res()))

    // update cloud device info
    this.ctx.deviceUpdate()
    // update ble advertisement
    this.ctx.bled.updateAdv()
  }
}

/**
 * start channel service, on ***ChannelConnected*** event
 * 
 * if cloud has no user bound this device, that means bound state error.
 * 
 * maybe unbind job had not finished. verify the signature, do unbind if verifyed
 */
class Bound extends BaseState {
  enter() {
    this.ctx.ledService.runGroup('normal')
    this.ctx.channel = new Channel(this.ctx)
    this.ctx.channel.on('ChannelConnected', (device, user) => {
      if (!user) {
        // save user to user store
        this.ctx.userStore.save(user, console.log) // ignore error

        console.log('****** cloud device Bound state mismatch, check signature *****')
        verify(device.info && device.info.signature, (err, verifyed) => {
          if (err || !verifyed) {
            console.log('*** cloud device bound state mismatch, device in bound ***')
            this.setState('Failed', EBOUND)
          } else {
            this.setState('Unbinding', user)
          }
        })
      } else {
        //ignore
      }
    })
    this.ctx.winas = new Winas(this.ctx)
    this.unbindFlag = false
  }

  // only from channel
  /**
   * @param {object} message - pipe message 
   */
  requestUnbind(encrypted, callback) {
    if (this.unbindFlag) return callback(new Error('error state'))
    if (!this.ctx.token) return callback(new Error('network error'))
    this.unbindFlag = true
    reqUnbind(this.ctx.ecc, encrypted, this.ctx.token, (err, data) => {
      if (err) return callback(err)
      process.nextTick(() => callback(null, null))
      this.setState('Unbinding')
    })
  }

  exit() {
    this.ctx.channel.removeAllListeners()
    this.ctx.channel.destroy()
    this.ctx.channel = undefined
    this.ctx.winas.destroy()
    this.ctx.winas = undefined
  }
}

class Failed extends BaseState {
  enter(reason) {
    this.reason = reason
    console.log(reason)
    this.ctx.ledService.runGroup('error')
  }
}

/**
 * Winasd`s root service
 * control all sub services
 */
class AppService {
  constructor() {
    this.config = Config
    this.upgrade = new Upgrade(this, Config.storage.dirs.tmpDir, Config.storage.dirs.isoDir)

    // services
    this.userStore = undefined // user store
    this.ledService = undefined // led control
    this.ecc = undefined // ecc service
    this.bled = undefined // bled service
    this.net = undefined // networkManager service
    this.channel = undefined // channel service

    // properties
    this.deviceSN = undefined

    Object.defineProperty(this, 'winas', {
      get() {
        return this._winas
      },
      set(x) {
        if (this._winas) {
          this._winas.removeAllListeners()
          if (!this._winas.destroyed)
            this._winas.destroy()
        }
        this._winas = x
        x && this._winas.on('Started', this.handleWinasStarted.bind(this))
        x && this._winas.on('message', this.handleWinasMessage.bind(this))
      }
    })

    Object.defineProperty(this, 'token', {
      get() {
        return this._token
      },
      set(x) {
        this._token = x
        this.winas && this.winas.sendMessage({
          type: 'token',
          data: x
        })
      }
    })

    // initialize　all service and properties
    new Prepare(this)
  }

  // send token&&owner to winas while Winas started
  handleWinasStarted() {
    this.winas.sendMessage({
      type: 'token',
      data: this.token
    })

    this.userStore.data && this.winas.sendMessage({
      type: 'boundUser',
      data: this.userStore.data
    })

    this.winas.sendMessage({
      type: 'device',
      data: {
        deviceSN: this.deviceSN
      }
    })
  }

  /**
   * handle messages form winas
   * @param {object} message 
   * message.type
   * message.data .....
   */
  handleWinasMessage(message) {
    debug('FROM WINAS MESSAGE:\n', message)
  }

  // return current software mode
  isBeta() {
    return true
  }

  // return node path
  nodePath() {
    return this.config.system.globalNode ? 'node' : '/usr/bin/node'
  }

  colorGroup() {
    return this.state.name() === 'Unbind' ? 'unbind'
      : this.state.name() === 'Bound' ? 'normal'
      : this.state.name() === 'Failed' ? 'error'
      : 'working'
  }

  // start winas
  appStart(callback) {
    if (!this.winas) return process.nextTick(() => callback(EApp404))
    if (this.operation) return process.nextTick(() => callback(ERace))
    this.operation = 'appStart'
    this.winas.startAsync()
      .then(() => (this.operation = null, callback(null)))
      .catch(e => (this.operation = null, callback(e)))
  }

  // stop winas
  appStop(callback) {
    if (!this.winas) return process.nextTick(() => callback(EApp404))
    if (this.operation) return process.nextTick(() => callback(ERace))
    this.operation = 'appStop'
    this.winas.stopAsync()
      .then(() => (this.operation = null, callback(null)))
      .catch(e => (this.operation = null, callback(e)))
  }

  getUpgradeList(local, cb) {
    return local ? this.upgrade.listLocal(cb) :
      this.upgrade.listAll(cb)
  }

  upgradeDevice(version, cb) {
    return this.upgrade.upgrade(version, cb)
  }

  upgradeConfirm(cb) {
    return this.upgrade.confirm(cb)
  }

  updateDeviceName(user, name, callback) {
    Device.setDeviceName(name, (err, data) => {
      callback(err, data)
      this.deviceUpdate()
    })
  }

  // send mqtt message to cloud if device update
  deviceUpdate() {
    this.channel && this.deviceSN && this.channel.publish(`device/${ this.deviceSN }/info`, JSON.stringify({
      lanIp: Device.NetworkAddr('lanip'),
      llIp: Device.NetworkAddr('linklocal'),
      name: Device.deviceName()
    }))
  }

  requestBind(...args) {
    this.state.requestBind(...args)
  }

  requestUnbind(...args) {
    this.state.requestUnbind(...args)
  }

  PATCH(user, props, callback) {
    let op = props.op
    if (!op || !['shutdown', 'reboot'].includes(op))
      return process.nextTick(() => callback(Object.assign(new Error('invaild op'), { status: 400 })))
    switch(op) {
      case 'shutdown': {
        setTimeout(() => {
          child.exec('shutboot', () => {})
        }, 2000)
      }
      case 'reboot':{
        setTimeout(() => {
          child.exec('reboot', () => {})
        }, 2000)
      }
    }
    return process.nextTick(() => callback(null))
  }

  view() {
    return {
      net: this.net && this.net.view(),
      ble: this.bled && this.bled.view(),
      upgrade: this.upgrade && this.upgrade.view(),
      operation: this.operation,
      winas: this.winas && this.winas.view(),
      provision: this.provision && this.provision.view(),
      channel: this.channel && this.channel.view(),
      device: Object.assign(Device.hardwareInfo(), {
        sn: this.deviceSN
      }),
      led: this.ledService && this.ledService.view(),
      winasd: {
        state: this.state.name(),
        reason: this.state.reason // only exist in Failed state
      }
    }
  }

  destroy() {
    if (this.winas) this.winas.destroy()
  }
}

AppService.prototype.Prepare = Prepare
AppService.prototype.Provisioning = Provisioning
AppService.prototype.Starting = Starting
AppService.prototype.Unbind = Unbind
AppService.prototype.Binding = Binding
AppService.prototype.Bound = Bound
AppService.prototype.Unbinding = Unbinding
AppService.prototype.Failed = Failed

module.exports = AppService