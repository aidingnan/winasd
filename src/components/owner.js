const consts = require('constants')
const uuid = require('uuid')
const config = require('config')
const ecc = require('../lib/atecc/atecc')
const channel = require('./channel')

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
    this.exited = true
    this.exit()
    let ctx = this.ctx
    let nextState = new NextState(ctx, ...args)
    ctx.state = nextState
    ctx.emit('stateEntering', ctx.state.constructor.name)
    ctx.state.enter()
  }

  // common method and don't override
  // this process is atomic, no matter in which state.
  handleChannelMessage (msg) {
    if (!msg.info) {
      return this.setState('Failed', new Error('bad msg info'))
    }

    const { signature, raw } = msg.info
    // sig and raw must be same truthy/falsy
    if (!!signature !== !!raw) {
      return this.setState('Failed', new Error('bad msg info'))
    }

    // sig and raw can only be null once (initial state, never bound)
    // in this case, owner must be null
    if (signature === null) {
      if (msg.owner) {
        return this.setState('Failed', new Error('bad msg info'))
      } else {
        // nothing to be verified, unbound
        return this.setState('Unbound')
      }
    }

    verify(ecc, signature, raw, (err, verified, fulfilled) => {
      if (err) {
        return this.setState(Failed) // TODO
      }

      if (!verified) {
        return this.setState(Failed) // TODO
      }

      const owner = msg.owner === null
        ? null
        : {
            id: msg.owner,
            username: msg.username,
            phone: msg.phone
          }

      if (!fullfiled) {
        // do incr (TODO)
      } else {

      }
    }
  }

  // this setOwner check consistency
  // ctx.setOwner does not check anything
  setOwner (owner) {
    if (this.ctx.owner === undefined) {
      this.ctx.setOwner(owner)
    } else if (this.ctx.owner === null && owner !== null) {
      this.ctx.setOwner(owner)
    } else if (this.ctx.owner !== null && owner === null) {
      this.ctx.setOwner(owner)
    } else {
      let err = new Error('inconsistent owner state')
      this.setState(Failed, err)
    }
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
}

class Idle extends State {
  bind (encrypted, callback) {
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
        this.callback(null)
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
        this.callback(null)
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

class Owner extends EventEmitter {
  constructor (opts) {
    super()
    this.filePath = opts.filePath
    this.tmpDir = opts.tmpDir
    this.tmpFile = path.join(tmpDir, uuid.v4()) 
    this.channel = opts.channel
    this.channel.on('ChannelConnected', msg => this.state.handleChannelMessage(msg))
    this.ecc = opts.ecc
    this.state = new Idle(this)
    this.state.enter()
    this.next = nexter()

    fs.readFile(this.filePath, (err, data) => {
      if (err) return // including ENOENT
      try {
        this.cachedOwner = JSON.parse(data) 
      } catch (e) {
        return
      }

      if (this.owner === undefined) this.emit('owner', owner)
    })
  }

  saveOwner (callback) {
    const { O_CREAT, O_WRONLY, O_TRUNC, O_DIRECT } = consts
    const flag = O_CREAT | O_WRONLY | O_TRUNC | O_DIRECT 

    fs.writeFile(this.tmpFile, JSON.stringify(this.owner), flag, err => {
      if (err) return callback(err)
      fs.rename(this.tmpFile, this.file, err => {
        if (err) return callback(err)
        child.exec('sync', callback)
      })
    })
  }

  setOwner (owner) {
    this.emit('owner', owner)
    this.next(this.saveOwner.bind(this))
  }   

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
