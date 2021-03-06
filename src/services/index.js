/* eslint-disable no-return-assign */
/*
 * @Author: JackYang
 * @Date: 2019-07-10 16:32:51
 * @Last Modified by: JackYang
 * @Last Modified time: 2019-08-09 16:35:25
*/

const fs = require('fs')
const path = require('path')
// const dns = require('dns')
// const UUID = require('uuid')
const request = require('superagent')
const Config = require('config')

const Promise = require('bluebird')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')

const child = Promise.promisifyAll(require('child_process'))

const debug = require('debug')('ws:app')
const debug2 = require('debug')('ws:appService')

const State = require('../lib/state')
const DataStore = require('../lib/DataStore')
const btrfsStat = require('../lib/btrfsStat')

const Bled = require('./bled')
const Winas = require('./winas')
const LED = require('../lib/led') // any question of this moudle , ask liuhua
const Channel = require('./channel')
const Upgrade = require('./upgrade')
const Device = require('../lib/device')
const initEcc = require('../lib/atecc')
const LocalAuth = require('./localAuth')
const { BledHandler } = require('../lib/msgHandler')
// const Provision = require('./provision')
const NetworkManager = require('./network')
const { reqBind, reqUnbind, verify, refresh } = require('../lib/lifecycle')

const NewError = (message, code) => Object.assign(new Error(message), { code })

const EPERSISTENT = NewError('mount persistent partition failed', 'EPERSISTENT')
// const EUSERSTORE = NewError('user store load failed', 'EUSERSTORE')
// const EDEVICE = NewError('device info load failed', 'EDEVICE')
const EBOUND = NewError('device cloud bound with error signature', 'EBOUND')
// const EECCINIT = NewError('ecc init error', 'EECCINIT')
// const EECCPRESET = NewError('ecc preset error', 'EECCPRESET')
const EApp404 = NewError('app not started', 'EAPP404')
const ERace = NewError('operation in progress', 'ERACE')

const remkdirp = (dir, callback) =>
  rimraf(dir, err => err ? callback(err) : mkdirp(dir, callback))

const readFile = (file, callback) =>
  fs.readFile(file, (err, data) => err
    ? callback(err)
    : callback(null, data.toString().trim()))

const noEcc = !!Config.system.withoutEcc

class BaseState extends State {
  requestBind (...args) {
    if (args.length) {
      args.pop()(new Error('error state'))
    }
  }

  requestUnbind (...args) {
    if (args.length) {
      args.pop()(new Error('error state'))
    }
  }

  debug (...args) {
    debug2(...args)
  }

  cleanVolume (callback) {
    if (typeof callback === 'function') {
      return callback(new Error('this function only can be called in Failed state'))
    }
    console.log(`[WARN] call cleanVolume in error state : ${this.name()}`)
  }

  async _cleanVolumeAsync () {
    try {
      await child.execAsync('umount -f /dev/sda')
    } catch (e) {
      if (!e.message || !e.message.includes('not mounted')) {
        throw e
      }
    }
    await child.execAsync(`mkfs.btrfs -f /dev/sda`)

    await child.execAsync('partprobe')
  }

  name () {
    return this.constructor.name
  }
}

const homeDir = path.join(Config.volume.cloud, Config.cloud.domain, Config.cloud.id)
const tmpDir = Config.volume.tmp
const mountTestDir = path.join(homeDir, 'mountTest')

const deviceCert = path.join(homeDir, 'device.crt')
const caCert = path.join(homeDir, 'ca.crt')

/**
 * check all necessary constraints in this winasd.
 * 1. prepare dirs
 * 2. load <vol>/data/init info, including sn, usn etc. TODO
 * 3. load domain TODO
 * 4. cert and user are postponed to next state
 * 5. start ecc service and led service ???
 * 6. provision file is not used anymore
 */
class Prerequisite extends BaseState {
  enter () {
    let error = null

    // target 1: prepare folders
    let count = 3

    remkdirp(tmpDir, err => (error = error || err, !--count && next()))
    mkdirp(homeDir, err => (error = error || err, !--count && next()))
    mkdirp(mountTestDir, err => (error = error || err, !--count && next()))

    const next = () => {
      if (error) return this.setState('Failed', EPERSISTENT)

      error = null
      let certExists

      // both fstat cert +1, write ca +1
      // ecc: led, ecc, user, sn (deviceSN), hostname, usn, 6
      // no ecc: user, sn (deviceSN) by device file, 2
      count = noEcc ? 3 : 8

      !noEcc && this.initLed((err, led) => {
        err ? error = error || err : this.ctx.ledService = led
        console.log('led ready', count)
        if (!--count) nextNext()
      })

      !noEcc && this.initEcc((err, ecc) => {
        err ? error = error || err : this.ctx.ecc = ecc
        console.log('ecc ready', count)
        if (!--count) nextNext()
      })

      this.initUserStore((err, userStore) => {
        err ? error = error || err : this.ctx.userStore = userStore
        console.log('user store ready', !!userStore.data, count)
        if (!--count) nextNext()
      })

      // eslint-disable-next-line no-unused-expressions
      noEcc ? this.ctx.deviceSN = Config.cloud.id : null

      const initDir = Config.volume.init

      !noEcc && readFile(path.join(initDir, 'sn'), (err, sn) => {
        err ? error = error || err : this.ctx.deviceSN = sn
        console.log(`(hardware) sn: ${sn}`, count)
        if (!--count) nextNext()
      })

      !noEcc && readFile(path.join(initDir, 'usn'), (err, usn) => {
        err ? error = error || err : this.ctx.usn = usn
        console.log(`usn ${usn}`, count)
        if (!--count) nextNext()
      })

      !noEcc && readFile(path.join(initDir, 'hostname'), (err, hostname) => {
        err ? error = error || err : this.ctx.hostname = hostname
        console.log(`hostname ${hostname}`, count)
        if (!--count) nextNext()
      })

      fs.stat(deviceCert, (err, stats) => {
        if (err && err.code === 'ENOENT') {
          certExists = false
        } else if (err) {
          error = error || err
        } else {
          certExists = true
        }
        this.ctx.certExists = certExists // record certExists
        if (typeof certExists === 'boolean') console.log(`certExists`, !!stats, count)
        if (!--count) nextNext()
      })

      const caData = Config.cloud.caList[Config.cloud.caIndex]
      fs.writeFile(caCert, caData, err => {
        // eslint-disable-next-line no-unused-expressions
        err ? error = error || err : null
        console.log(`ca certificate written to ${caCert}`)
        if (!--count) nextNext()
      })

      const nextNext = () => error
        ? this.setState('Failed', error)
        : this.setState('Checking')
    }
  }

  initEcc (callback) {
    initEcc(Config.ecc.bus, (err, ecc) => err
      ? callback(err)
      : ecc.preset(err => err
        ? callback(err)
        : callback(null, ecc)))
  }

  initLed (callback) {
    const ledService = new LED(Config.led.bus, Config.led.addr)
    ledService.once('StateEntered', state => state === 'Err'
      ? callback(ledService.state.error)
      : callback(null, ledService))
  }

  // TODO mutual exclusive ???
  initUserStore (callback) {
    const userStore = new DataStore({
      isArray: false,
      // file: path.join(Config.storage.dirs.bound, Config.storage.files.boundUser),
      // tmpDir: path.join(Config.storage.dirs.tmpDir)
      file: path.join(homeDir, 'boundUser.json'),
      tmpDir: path.join(Config.volume.tmp)
    })

    userStore.once('Update', () => {
      return callback(null, userStore)
    })

    userStore.once('StateEntered', state => {
      if (state === 'Failed') {
        return callback(userStore.state.err)
      }
    })
  }
}

class Checking extends BaseState {
  enter () {
    btrfsStat(mountTestDir, (err, stat) => {
      this.ctx.btrfsStat = stat
      if (err) return this.setState('Failed', err)
      console.log(`(btrfsStat) stat: ${stat}`)
      this.ctx.certExists
        ? this.setState(!!this.ctx.userStore.data ? 'Bound' : 'Unbound') // eslint-disable-line no-extra-boolean-cast
        : this.setState('Pending')
    })
  }
}

class Pending extends BaseState {
  enter () {
    // TODO dns does not work right after start, probably caused by net module.
    // TODO write file safe way
    // TODO save user file
    const loop = () => request
      .get(`https://${Config.cloud.domain}.aidingnan.com/s/v1/station/${Config.cloud.id}/cert`)
      .then(res => fs.writeFile(deviceCert, res.body.data.certPem, err => {
        if (err) return this.setState('Failed')
        this.ctx.channel = new Channel(this.ctx)
        this.ctx.channel.once('ChannelConnected', (device, user) => {
          if (!device.info) {
            return this.setState('Failed', new Error('bad device info'))
          }

          const { signature, raw } = device.info
          // sig and raw must be same truthy/falsy
          if (!!signature !== !!raw) {
            return this.setState('Failed', new Error('bad device info'))
          }

          // sig and raw can only be null once (initial state, never bound)
          // in this case, owner must be null
          if (signature === null) {
            if (device.owner) {
              return this.setState('Failed', new Error('bad device info'))
            } else {
              // nothing to be verified, unbound
              return this.setState('Unbound')
            }
          }
          // unsure if everything ok in Pending state while fulfilled,
          // so we cloud not jump to `Bound` or `Unbound`,
          // only can do binding or unbinding again.(no refresh counter if fulfilled)
          verify(this.ctx.ecc, signature, raw, (err, verified, fulfilled) => {
            if (err || !verified) {
              this.setState('Failed', EBOUND)
            } else if (device.owner) {
              this.setState('Binding', user, fulfilled)
            } else if (!device.owner) {
              this.setState('Unbinding', fulfilled)
            }
          })
        })
      }))
      .catch(_ => setTimeout(() => loop(), 3000))

    loop()
  }

  exit () {
    this.ctx.channel.removeAllListeners()
    this.ctx.channel.on('error', () => {})
    this.ctx.channel.destroy()
    this.ctx.channel = null
  }
}

/**
 * start channel service, on ***ChannelConnected*** event
 *
 * if cloud return someone bound this device, that means unbind state error.
 *
 * maybe bound job had not finished. verify the signature, do bind if verifyed
 */
class Unbound extends BaseState {
  enter () {
    child.exec('sync', () => {})
    this.ctx.channel = new Channel(this.ctx)
    this.ctx.ledService.runGroup('unbind')
    this.ctx.channel.once('ChannelConnected', (device, user) => {
      const i = device.info
      if (user) { // mismatch
        console.log('****** cloud device bind state mismatch, check signature *****')
        // TODO does fulfilled has no meaning ???
        verify(this.ctx.ecc, i && i.signature, i && i.raw, (err, verifyed, fulfilled) => {
          if (err || !verifyed) {
            console.log('*** cloud device bind state mismatch, device in unbind ***')
            this.setState('Failed', EBOUND)
          } else {
            this.setState('Binding', user, fulfilled)
          }
        })
      } else {
        console.log('*** cloud device bind state match ***')
      }
    })
  }

  // request to cloud, save userinfo if success
  requestBind (encrypted, callback) {
    if (this.bindingFlag) return process.nextTick(() => callback(new Error('already in binding state')))
    if (!this.ctx.token) return process.nextTick(() => callback(new Error('Winas Net Error')))
    this.bindingFlag = true
    this.validateBlock(err => {
      if (err) {
        this.bindingFlag = false
        return callback(err)
      }
      return reqBind(this.ctx.ecc, encrypted, this.ctx.token, (err, data) => {
        if (err) {
          this.bindingFlag = false
          return callback(err)
        }
        const user = {
          id: data.data.id,
          username: data.data.username,
          phone: data.data.username
        }
        this.setState('Binding', user, false, callback)
      })
    })
  }

  validateBlock (callback) {
    fs.lstat('/sys/block/sda/size', err => {
      if (err) return callback(new Error('sda not found'))
      fs.readFile('/sys/block/sda/size', (err, data) => {
        if (err || data.toString().trim() === '0') return callback(err || new Error('sda size 0'))
        return callback(null)
      })
    })
  }

  exit () {
    this.ctx.channel.removeAllListeners()
    this.ctx.channel.on('error', () => {})
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
  // norefresh - no refresh counter
  enter (user, norefresh, callback = () => {}) {
    this.start(user, norefresh)
      .then(() => {
        process.nextTick(() => callback(null, user))
        this.setState('Bound')
      })
      .catch(e => {
        process.nextTick(() =>
          callback(Object.assign(new Error('clean drive failed'), { code: 'EBINDING' })))
        this.setState('Failed', Object.assign(e, { code: 'EBINDING' }))
      })
  }

  async start (user, norefresh) {
    // save user
    await new Promise((resolve, reject) => this.ctx.userStore.save(user, err => err ? reject(err) : resolve()))
    // refresh lifecycle
    if (!norefresh) await new Promise((resolve, reject) => refresh(this.ctx.ecc, err => err ? reject(err) : resolve()))
  }
}

class Unbinding extends BaseState {
  // norefresh - no refresh counter
  enter (norefresh, cleanVolume = false, callback = () => {}) {
    this.doUnbind(norefresh, cleanVolume)
      .then(() => {
        callback(null, null)
        this.setState('Unbound')
      })
      .catch(e => {
        callback(e)
        this.setState('Failed', Object.assign(e, {
          code: 'EUNBINDING'
        }))
      })
  }

  async doUnbind (norefresh, cleanVolume) {
    if (cleanVolume) await this._cleanVolumeAsync()
    // delete user info
    await new Promise((resolve, reject) => this.ctx.userStore.save(null, err => err ? reject(err) : resolve()))
    // set default device name, ignore error
    await new Promise((resolve, reject) => Device.setDeviceName(Device.DEVICE_NAME, _ => resolve()))

    // refresh lifecycle
    if (!norefresh) await new Promise((resolve, reject) => refresh(this.ctx.ecc, err => err ? reject(err) : resolve()))
    // update cloud device info
    this.ctx.deviceUpdate()
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
  enter () {
    child.exec('sync', () => {})
    this.ctx.ledService.runGroup('normal')
    this.ctx.channel = new Channel(this.ctx)
    this.ctx.channel.once('ChannelConnected', (device, user) => {
      const i = device.info
      if (!user) {
        // save user to user store
        this.ctx.userStore.save(user, console.log) // ignore error

        console.log('****** cloud device Bound state mismatch, check signature *****')
        // TODO fulfilled meaningless ???
        verify(this.ctx.ecc, i && i.signature, i && i.raw, (err, verifyed, fulfilled) => {
          if (err || !verifyed) {
            console.log('*** cloud device bound state mismatch, device in bound ***')
            this.setState('Failed', EBOUND)
          } else {
            this.setState('Unbinding', fulfilled)
          }
        })
      } else {
        // ignore
      }
    })
    this.ctx.winas = new Winas(this.ctx)
    this.unbindFlag = false
  }

  requestUnbind (encrypted, cleanVolume, callback) {
    if (this.unbindFlag) return callback(new Error('error state'))
    if (!this.ctx.token) return callback(new Error('network error'))
    this.unbindFlag = true
    reqUnbind(this.ctx.ecc, encrypted, this.ctx.token, (err, data) => {
      if (err) {
        this.unbindFlag = false
        return callback(err)
      }
      process.nextTick(() => callback(null, null))
      this.setState('Unbinding', false, cleanVolume)
    })
  }

  exit () {
    this.ctx.channel.removeAllListeners()
    this.ctx.channel.on('error', () => {})
    this.ctx.channel.destroy()
    this.ctx.channel = undefined
    this.ctx.winas.destroy()
    this.ctx.winas = undefined
  }
}

class Failed extends BaseState {
  enter (reason) {
    this.reason = reason
    console.log(reason)
    this.ctx.ledService.runGroup('error')
  }

  cleanVolume (callback) {
    if (this.working) {
      return process.nextTick(() => callback(NewError('already start clean volume', 'ERACE')))
    }
    if (!this.reason || this.reason.errType !== 'btrfsStat') {
      return process.nextTick(() => callback(NewError('clean volume in error state', 'ESTATE')))
    }
    if (this.ctx.btrfsStat !== 0x03 && this.ctx.btrfsStat !== 0x04) {
      return process.nextTick(() => callback(NewError('this probm can not be fix', 'ESTATE')))
    }
    this.working = true
    const done = err => {
      this.working = false
      callback(err)
      this.setState('Checking')
    }
    this._cleanVolumeAsync()
      .then(_ => done())
      .catch(e => done(e))
  }
}

/**
 * Winasd`s root service
 * control all sub services
 */
class AppService {
  constructor () {
    this.config = Config
    // this.upgrade = new Upgrade(this, Config.storage.dirs.tmpDir, Config.storage.dirs.isoDir)
    this.upgrade = new Upgrade(this, Config.volume.tmp /*, Config.storage.dirs.isoDir */)

    // services
    this.userStore = undefined // user store
    this.ledService = undefined // led control
    this.ecc = undefined // ecc service
    this.bled = undefined // bled service
    this.net = undefined // networkManager service
    this.channel = undefined // channel service

    // properties
    this.deviceSN = undefined
    this.usn = undefined
    this.hostname = undefined

    Object.defineProperty(this, 'winas', {
      get () {
        return this._winas
      },
      set (x) {
        if (this._winas) {
          this._winas.removeAllListeners()
          if (!this._winas.destroyed) {
            this._winas.destroy()
          }
        }
        this._winas = x
        x && this._winas.on('Started', this.handleWinasStarted.bind(this))
        x && this._winas.on('message', this.handleWinasMessage.bind(this))
      }
    })

    Object.defineProperty(this, 'token', {
      get () {
        return this._token
      },
      set (x) {
        this._token = x
        this.winas && this.winas.sendMessage({
          type: 'token',
          data: x
        })
      }
    })

    Object.defineProperty(this, 'userStore', {
      get () {
        return this._userStore
      },
      set (x) {
        if (this._userStore) {
          this._userStore.removeAllListeners()
        }
        this._userStore = x
        // update ble advertisement
        this.bled && this.bled.updateBoundState((x && x.data) ? 0x02 : 0x01)
        if (!x) return
        x.on('Update', () => {
          this.bled && this.bled.updateBoundState((x && x.data) ? 0x02 : 0x01)
        })
      }
    })

    Object.defineProperty(this, 'btrfsStat', {
      get () {
        return this._btrfsStat
      },
      set (x) {
        this._btrfsStat = x
        this.bled && this.bled.updateSataState(x)
      }
    })

    this.localAuth = new LocalAuth(this)

    const msgHandler = new BledHandler()
    this.registerBleHandler(msgHandler)
    this.bled = new Bled(msgHandler)
    this.bled.on('connect', () => {
      // TODO anything to do?
    })

    this.net = new NetworkManager(this)
    this.net.on('started', state => {
      console.log('NetworkManager Started: ', state)
      if (state !== 70) {
        console.log('Device Network Disconnect', state)
      }
    })

    this.net.on('connect', () => {
      process.nextTick(() => this.channel && this.channel.connect())
    })

    // initialize all service and properties
    // eslint-disable-next-line no-new
    new Prerequisite(this)
  }

  // send token&&owner to winas while Winas started
  handleWinasStarted () {
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
  handleWinasMessage (message) {
    debug('FROM WINAS MESSAGE:\n', message)
  }

  // return current software mode
  isBeta () {
    return true
  }

  // return node path
  nodePath () {
    return this.config.system.globalNode ? 'node' : '/usr/bin/node'
  }

  colorGroup () {
    return this.state.name() === 'Unbound'
      ? 'unbind'
      : this.state.name() === 'Bound'
        ? 'normal'
        : this.state.name() === 'Failed'
          ? 'error'
          : 'working'
  }

  // start winas
  appStart (callback) {
    if (!this.winas) return process.nextTick(() => callback(EApp404))
    if (this.operation) return process.nextTick(() => callback(ERace))
    this.operation = 'appStart'
    this.winas.startAsync()
      .then(() => {
        this.operation = null
        callback(null)
      })
      .catch(e => {
        this.operation = null
        callback(e)
      })
  }

  // stop winas
  appStop (callback) {
    if (!this.winas) return process.nextTick(() => callback(EApp404))
    if (this.operation) return process.nextTick(() => callback(ERace))
    this.operation = 'appStop'
    this.winas.stopAsync()
      .then(() => {
        this.operation = null
        callback(null)
      })
      .catch(e => {
        this.operation = null
        callback(e)
      })
  }

  updateDeviceName (user, name, callback) {
    Device.setDeviceName(name, (err, data) => {
      callback(err, data)
      this.deviceUpdate()
    })
  }

  // send mqtt message to cloud if device update
  deviceUpdate () {
    this.channel && this.deviceSN && this.channel.publish(`device/${this.deviceSN}/info`, JSON.stringify({
      lanIp: Device.NetworkAddr('lanip'),
      llIp: Device.NetworkAddr('linklocal'),
      version: Device.SoftwareVersion(),
      name: Device.deviceName()
    }))
  }

  requestBind (...args) {
    this.state.requestBind(...args)
  }

  requestUnbind (...args) {
    this.state.requestUnbind(...args)
  }

  cleanVolume (callback) {
    this.state.cleanVolume(callback)
  }

  PATCH (user, props, callback) {
    const op = props.op
    if (!op || !['shutdown', 'reboot', 'root', 'unroot'].includes(op)) {
      return process.nextTick(() => callback(Object.assign(new Error('invalid op'), { status: 400 })))
    }
    switch (op) {
      case 'shutdown': {
        return setTimeout(() => {
          child.exec('shutboot', () => {})
        }, 2000)
      }
      case 'reboot': {
        return setTimeout(() => {
          child.exec('reboot', () => {})
        }, 2000)
      }
      case 'root': {
        return child.exec('rockbian root', (err, stdout, stderr) => {
          if (err || stderr) {
            return callback(Object.assign(NewError((err && err.message) || stderr), { status: 400 }))
          }
          child.exec('sleep 2; reboot', () => {})
          return callback(null)
        })
      }
      case 'unroot': {
        return child.exec('rockbian unroot', (err, stdout, stderr) => {
          if (err || stderr) {
            return callback(Object.assign(NewError((err && err.message) || stderr), { status: 400 }))
          }
          child.exec('sleep 2; reboot', () => {})
          return callback(null)
        })
      }
    }
    return process.nextTick(() => callback(null))
  }

  isRooted () {
    try {
      return child.execSync('rockbian is-rooted').toString().startsWith('true')
    } catch (e) {
      return false
    }
  }

  view () {
    return {
      net: this.net && this.net.view(),
      ble: this.bled && this.bled.view(),
      upgrade: this.upgrade && this.upgrade.view(),
      operation: this.operation,
      winas: this.winas && this.winas.view(),
      provision: this.provision && this.provision.view(),
      channel: this.channel && this.channel.view(),
      device: Object.assign(Device.deviceInfo(), {
        sn: this.deviceSN,
        hostname: this.hostname,
        usn: this.usn,
        rooted: this.isRooted()
      }),
      led: this.ledService && this.ledService.view(),
      winasd: {
        state: this.state.name(),
        reason: this.state.reason // only exist in Failed state
      }
    }
  }

  destroy () {
    if (this.winas) this.winas.destroy()
  }
}

Object.assign(AppService.prototype, require('./app_handler'))

AppService.prototype.Prerequisite = Prerequisite
// AppService.prototype.Provisioning = Provisioning
AppService.prototype.Pending = Pending
AppService.prototype.Unbound = Unbound
AppService.prototype.Binding = Binding
AppService.prototype.Bound = Bound
AppService.prototype.Unbinding = Unbinding
AppService.prototype.Failed = Failed
AppService.prototype.Checking = Checking

module.exports = AppService
