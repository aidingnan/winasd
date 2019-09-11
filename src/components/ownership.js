const path = require('path')
const fs = require('fs')
const child = require('child_process')
const EventEmitter = require('events')
const os = require('os')
// const consts = require('constants')

const rimraf = require('rimraf')
const uuid = require('uuid')
const debug = require('debug')('ws:owner')

const ecc = require('../lib/atecc/atecc')
const nexter = require('../lib/nexter')
const device = require('./device')
const channel = require('./channel')
const { reqBind, reqUnbind, verify } = require('../lib/lifecycle')

class State {
  constructor (ctx) {
    this.ctx = ctx
  }

  setState (NextState, ...args) {
    this.exit()
    this.exited = true
    const ctx = this.ctx
    const nextState = new NextState(ctx, ...args)
    ctx.state = nextState
    ctx.emit('StateEntering', ctx.state.constructor.name)
    ctx.state.enter()
  }

  enter () {
  }

  exit () {
  }

  bind (encrypted, callback) {
    const err = new Error('invalid state')
    err.code = 'EFORBIDDEN'
    process.nextTick(() => callback(err))
  }

  unbind (encrypted, callback) {
    const err = new Error('invalid state')
    err.code = 'EFORBIDDEN'
    process.nextTick(() => callback(err))
  }

  contextError (err) {
    debug('context error', err)
    this.setState(Failed, err)
  }
}

class Idle extends State {
  bind (encrypted, callback) {
    debug('binding')
    if (!this.ctx.token) {
      const err = new Error('no token')
      err.code = 'EUNAVAIL'
      return process.nextTick(() => callback(err))
    } else {
      this.setState(Binding, encrypted, callback)
    }
  }

  unbind (encrypted, callback) {
    if (!this.ctx.token) {
      const err = new Error('no token')
      err.code = 'EUNAVAIL'
      return process.nextTick(() => callback(err))
    } else {
      this.setState(Unbinding, encrypted, callback)
    }
  }
}

class Binding extends State {
  constructor (ctx, encrypted, callback) {
    super(ctx)
    this.encrypted = encrypted
    this.callback = callback
  }

  enter () {
    reqBind(ecc, this.encrypted, this.ctx.token, (err, data) => {
      if (err) {
        this.callback(err)
      } else {
        debug('bind data', data)
        this.callback(null)
        this.ctx.channel.reconnect()
      }
      if (!this.exited) this.setState(Idle)
    })
  }
}

class Unbinding extends State {
  constructor (ctx, encrypted, callback) {
    super(ctx)
    this.encrypted = encrypted
    this.callback = callback
  }

  enter () {
    reqUnbind(ecc, this.encrypted, this.ctx.token, (err, data) => {
      if (err) {
        this.callback(err)
      } else {
        debug('unbind data', data)
        this.callback(null)
        this.ctx.channel.reconnect()
      }
      if (!this.exited) this.setState(Idle)
    })
  }
}

class Failed extends State {
  constructor (ctx, error) {
    super(ctx)
    this.error = error
  }
}

/**
ownership manages several trivial resources:
  - owner cache
  - display name
  - clean network manager connection files when own is nullified

all load method are called only once during initialization.
all save/clean methods are nextified, see nexter
*/
class Ownership extends EventEmitter {
  constructor (opts) {
    super()
    this.filePath = opts.filePath
    this.tmpDir = opts.tmpDir
    this.tmpFile = path.join(opts.tmpDir, uuid.v4())
    this.channel = opts.channel

    this.channel.on('token', token => {
      this.token = token
    })
    this.channel.on('ChannelConnected', msg => this.handleChannelConnected(msg))
    // TODO this.handleNext(this.handleChannelConnected.bind(this, msg)))

    this.ecc = opts.ecc
    this.state = new Idle(this)
    this.state.enter()

    // handle message, save owner and save display name should be executed sequentially
    // clean nm connection files could be run concurrently
    this.handleMessageNext = nexter()
    this.saveOwnerNext = nexter()
    this.saveDisplayNameNext = nexter()

    fs.readFile(this.filePath, (err, data) => {
      if (err) return // including ENOENT
      if (this.owner !== undefined) return // useless if owner already set
      try {
        this.cache = JSON.parse(data)
        debug('emitting cached owner', this.cache)
        this.emit('cache', this.cache)
      } catch (e) {
      }
    })

    // init display name
    this.displayNamePath = path.join(device.homeDir, 'display-name')
    this.displayName = device.hostname
    this.loadDisplayName()

    // init rooted
    this.rooted = false
    this.isRooted((err, rooted) => !err && (this.rooted = rooted))
  }

  // this function cannot be put into state, including base state
  // during handling, the state may be changed and 'this' points to an outdated object
  // using contextError method to interrupt any state
  // this process should be atomic and has no dependency on state
  // this process should be synchronized (aka, one after another) to avoid race
  handleChannelConnected (msg) {
    debug(msg)
    try {
      const err = new Error('bad owner message from channel')
      if (!msg.info) return this.state.contextError(err)

      const { signature, raw } = msg.info
      // sig and raw must be simultaneously truthy or falsy
      if (!!signature !== !!raw) return this.state.contextError(err)

      // sig and raw can only be null once (brand new, not bound yet)
      // in this case, owner must be null
      if (signature === null && msg.owner !== null) return this.state.contextError(err)

      this.verify(signature, raw, (err, verified) => {
        try {
          if (err) return this.state.contextError(err)
          if (!verified) {
            const err = new Error('owner not verified')
            return this.state.contextError(err)
          }

          let { owner, username, phone } = msg
          owner = owner ? { id: owner, username, phone } : null

          if (this.owner && owner && this.owner.id !== owner.id) {
            const err = new Error('owner update not allowed')
            return this.state.contextError(err)
          }

          console.log('owner module:', owner)

          this.owner = owner
          this.saveOwnerNext(this.saveOwner.bind(this))
          if (owner === null) {
            this.setDisplayName(null)
            // disable temporarily
            // this.cleanNmConnections()
          }

          debug('emitting cloud owner', owner)
          this.emit('owner', owner)
        } catch (e) {
          console.log(e)
        }
      })
    } catch (e) {
      console.log(e)
    }
    // publish device info
    this.publishDeviceInfo()
  }

  // wrapper to eliminate fulfilled and bypass null sig
  // TODO there is no need for verify to expose fulfilled
  // it could adjust counter internally
  verify (signature, raw, callback) {
    if (!signature) return process.nextTick(() => callback(null, true))
    verify(this.ecc, signature, raw, (err, verified, fulfilled) => {
      if (err) return callback(err)
      if (!verified) return callback(null, false)
      if (!fulfilled) {
        this.ecc.incCounter({}, err => err ? callback(err) : callback(null, true))
      } else {
        callback(null, true)
      }
    })
  }

  saveOwner (callback) {
    // const { O_CREAT, O_WRONLY, O_TRUNC, O_DIRECT } = consts
    // const flag = O_CREAT | O_WRONLY | O_TRUNC | O_DIRECT
    fs.writeFile(this.tmpFile, JSON.stringify(this.owner), err => {
      if (err) return callback(err)
      fs.rename(this.tmpFile, this.filePath, err => {
        if (err) return callback(err)
        child.exec('sync', callback)
      })
    })
  }

  // external method, return owner if available, cachedOwner otherwise, or undefined
  getOwner () {
    if (this.owner !== undefined) return this.owner
    if (this.cachedOwner !== undefined) return this.cachedOwner
  }

  bind (encrypted, callback) {
    this.state.bind(encrypted, callback)
  }

  unbind (encrypted, callback) {
    this.state.unbind(encrypted, callback)
  }

  loadDisplayName () {
    fs.readFile(this.displayNamePath, (err, data) => {
      if (!err) {
        const name = data.toString()
        if (name.length) this.displayName = name
      }
    })
  }

  publishDeviceInfo () {
    const interfaces = os.networkInterfaces()
    const usb0iface = interfaces.usb0 && interfaces.usb0.find(x => x.family === 'IPv4')
    const wlan0iface = interfaces.wlan0 && interfaces.wlan0.find(x => x.family === 'IPv4')
    console.log({
      lanIp: (wlan0iface && wlan0iface.address) || '0.0.0.0',
      llIp: (usb0iface && usb0iface.address) || '169.254.0.0',
      version: device.version,
      name: this.displayName
    })
    channel.send(`device/${device.sn}/info`, JSON.stringify({
      lanIp: (wlan0iface && wlan0iface.address) || '0.0.0.0',
      llIp: (usb0iface && usb0iface.address) || '0.0.0.0',
      version: device.version,
      name: this.displayName
    }))
  }

  // this function is called by setDisplayName only
  saveDisplayName (name, callback) {
    if (typeof name === 'string' && name.length) {
      fs.writeFile(this.displayNamePath, name, () => callback)
    } else {
      rimraf(this.displayNamePath, () => callback())
    }
  }

  setDisplayName (name) {
    if (typeof name === 'string' && name.length) {
      this.displayName = name
      this.saveDisplayNameNext(this.saveDisplayName.bind(this, name))
    } else {
      this.displayName = device.hostname
      this.saveDisplayNameNext(this.saveDisplayName.bind(this, null))
    }
    // publish device info
    this.publishDeviceInfo()
  }

  isRooted (callback) {
    child.exec('rockbian is-rooted', (err, stdout) => {
      if (err) {
        callback(err)
      } else {
        if (stdout.toString().trim() === 'true') {
          callback(null, true)
        } else if (stdout.toString().trim() === 'false') {
          callback(null, false)
        } else {
          const err = new Error('bad data')
          callback(err)
        }
      }
    })
  }

  root (callback) {
    child.exec('rockbian root', err => {
      if (err) {
        callback(err)
      } else {
        this.rooted = true
        callback(null)
      }
    })
  }

  unroot (callback) {
    child.exec('rockbian unroot', err => {
      if (err) {
        callback(err)
      } else {
        this.rooted = false
        callback(null)
      }
    })
  }

  // /etc/NetworkManager/system-connections
  // usb0.nmconnection
  cleanNmConnections (callback = () => {}) {
    const nmDir = '/etc/NetworkManager/system-connections'
    const reserved = ['usb0.nmconnection']
    fs.readdir(nmDir, (err, entries) => {
      if (err) {
        callback(err)
      } else {
        entries
          .filter(name => name.endsWith('.nmconnection'))
          .filter(name => !reserved.includes(name))
          .forEach(name => rimraf(path.join(nmDir, name), () => {}))
        callback(null)
      }
    })
  }
}

module.exports = new Ownership({
  filePath: path.join(device.homeDir, 'boundUser.json'),
  tmpDir: device.tmpDir,
  channel,
  ecc
})
