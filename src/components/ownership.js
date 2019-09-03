const path = require('path')
const fs = require('fs')
const child = require('child_process')
const EventEmitter = require('events')
const consts = require('constants')

const uuid = require('uuid')
const config = require('config')
const debug = require('debug')('ws:owner')

const ecc = require('../lib/atecc/atecc')
const channel = require('./channel')
const { reqBind, reqUnbind, verify } = require('../lib/lifecycle')

// TODO debug
const nexter = () => {
  const q = []
  const run = () => q[0](() => (q.shift(), q.length && run()))
  return bf => (q.push(bf), (q.length === 1) && run())
}

class State {
  constructor (ctx) {
    this.ctx = ctx
  }

  setState (NextState, ...args) {
    this.exit()
    this.exited = true
    let ctx = this.ctx
    let nextState = new NextState(ctx, ...args)
    ctx.state = nextState
    ctx.emit('StateEntering', ctx.state.constructor.name)
    ctx.state.enter()
  }

  enter () {
  }

  exit () {
  }

  bind (encrypted, callback) {
    let err = new Error('invalid state')
    err.code = 'EFORBIDDEN'
    process.nextTick(() => callback(err))
  }

  unbind (encrypted, callback) {
    let err = new Error('invalid state')
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
      let err = new Error('no token')
      err.code = 'EUNAVAIL'
      return process.nextTick(() => callback(err))
    } else {
      this.setState(Binding, encrypted, callback)
    }
  }

  unbind (encrypted, callback) {
    if (!this.ctx.token) {
      let err = new Error('no token')
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

class Ownership extends EventEmitter {
  constructor (opts) {
    super()
    this.filePath = opts.filePath
    this.tmpDir = opts.tmpDir
    this.tmpFile = path.join(opts.tmpDir, uuid.v4()) 
    this.channel = opts.channel

    this.channel.on('token', token => this.token = token)
    this.channel.on('ChannelConnected', msg => this.handleChannelConnected(msg))
      // this.handleNext(this.handleChannelConnected.bind(this, msg)))

    this.ecc = opts.ecc
    this.state = new Idle(this)
    this.state.enter()

    this.handleNext = nexter()
    this.saveNext = nexter()

    fs.readFile(this.filePath, (err, data) => {
      if (err) return // including ENOENT
      if (this.owner !== undefined) return  // useless if owner already set
      try {
        this.cache = JSON.parse(data) 
        debug('emitting cached owner', this.cache)
        this.emit('cache', this.cache)
      } catch (e) {
        return
      }
    }) 
  }

  // this function cannot be put into state, including base state
  // during handling, the state may be changed and 'this' points to an outdated object
  // using contextError method to interrupt any state
  // this process should be atomic and has no dependency on state
  // this process should be synchronized (aka, one after another) to avoid race
  handleChannelConnected (msg) {
    debug(msg)
    let err = new Error('bad owner message from channel')
    if (!msg.info) return this.state.contextError(err)

    const { signature, raw } = msg.info
    // sig and raw must be simultaneously truthy or falsy
    if (!!signature !== !!raw) return this.state.contextError(err)

    // sig and raw can only be null once (brand new, not bound yet)
    // in this case, owner must be null
    if (signature === null && msg.owner !== null) return this.state.contextError(err)

    this.verify(signature, raw, (err, verified) => {
      if (err) return this.state.contextError(err)
      if (!verified) {
        let err = new Error('owner not verified')
        return this.state.contextError(err)
      }

      let { owner, username, phone } = msg
      owner = owner ? { id: owner, username, phone } : null

      if (this.owner && owner && this.owner.id !== owner.id) {
        let err = new Error('owner update not allowed')
        return this.state.contextError(err)
      }

      this.owner = owner
      this.saveNext(this.saveOwner.bind(this))

      debug('emitting cloud owner', owner)
      this.emit('owner', owner)
    })
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
}

const homeDir = path.join(config.volume.cloud, config.cloud.domain, config.cloud.id)

module.exports = new Ownership({
  filePath: path.join(homeDir, 'boundUser.json'),
  tmpDir: config.volume.tmp,
  channel,
  ecc
})

