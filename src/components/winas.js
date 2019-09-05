const channel = require('./channel')
const ownership = require('./ownership')

const path = require('path')
const fs = require('fs')
const child = require('child_process')
const EventEmitter = require('events')

const Config = require('config')

const debug = require('debug')('ws:winas')

/**
nexe does not work properly for unknown reason.
*/
class State {
  constructor (ctx, ...args) {
    this.ctx = ctx
    ctx.state = this
    this.enter(...args)

    if (ctx instanceof EventEmitter) ctx.emit(this.constructor.name)
  }

  setState (state, ...args) {
    this.exit()
    // eslint-disable-next-line no-new
    new this.ctx[state](this.ctx, ...args)
  }

  enter () {
    debug(`${this.ctx.constructor.name} enter ${this.constructor.name} state`)
  }

  exit () {
    debug(`${this.ctx.constructor.name} exit ${this.constructor.name} state`)
  }

  destroy () {
    if (this.winas) {
      this.winas.removeAllListeners()
      this.winas.on('error', () => {})
      this.winas.kill()
      this.winas = null
    }

    this.exit()
  }

  start () {}

  stop () {}

  view () { return null }
}

class Stopped extends State {
  start () {
    this.setState('Starting')
  }
}

class Starting extends State {
  enter () {
    super.enter()

    if (process.argv.includes('--withoutWinas')) {
      return
    }
    const opts = {
      cwd: this.ctx.winasDir,

      /**
      node must be in path, for there is no global node in future
      */
      env: Object.assign({}, process.env, {
        PATH: `/wisnuc/node/base/bin:${process.env.PATH}`,
        NODE_ENV: process.env.WINAS_ENV ? process.env.WINAS_ENV : process.env.NODE_ENV,
        NODE_CONFIG_DIR: path.join(this.ctx.winasDir, 'config')
      }),
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    }
    const appPath = path.join(this.ctx.winasDir, 'src', 'app.js')
    const args = [appPath, ...process.argv.slice(2)]

    this.winas = child.spawn('node', args, opts)
    this.winas.on('error', err => console.log('Winas Error in Starting: neglected', err))
    this.winas.once('message', message => (this.ctx.emit('message', message), this.setState('Started', this.winas)))
    // eslint-disable-next-line no-return-assign
    this.winas.on('close', (code, signal) => (this.winas = null, this.setState('Failed', { code, signal })))
  }

  stop () {
    this.setState('Stopping', this.winas)
  }

  exit () {
    if (this.winas) this.winas.removeAllListeners()
    clearTimeout(this.timer)
    this.timer = null
    super.exit()
  }
}

class Started extends State {
  enter (winas) {
    super.enter()
    this.winas = winas
    this.winas.on('error', err => console.log('Winas Error in Started: neglected', err))
    // eslint-disable-next-line no-return-assign
    this.winas.on('close', (code, signal) => (this.winas = null, this.setState('Failed', { code, signal })))
    this.winas.on('message', message => this.handleWinasMessage(message))
  }

  handleWinasMessage (message) {
    let obj
    try {
      obj = JSON.parse(message)
    } catch (e) {
      return console.log('FROM_WINAS_MESSAGE, parse error: ', e)
    }

    if (obj.type === 'appifi_users') {
      this.users = obj.users
    }

    this.ctx.emit('message', obj)
  }

  stop () {
    this.setState('Stopping', this.winas)
  }

  exit () {
    if (this.winas) {
      this.winas.removeAllListeners()
      this.winas.on('error', () => {})
      if (!this.winas.killed) this.winas.kill()
    }
    this.winas = undefined
    this.users = undefined
    super.exit()
  }
}

// Stopping can only be entered when being stopped externally, so it always goes to Stopped state
class Stopping extends State {
  enter (winas) {
    super.enter()
    this.swapoff(err => {
      // TODO: err ?
      if (err) console.log('swapoff error: ', err)
      winas.kill()
      winas.on('error', err => console.log('Winas Error in Stopping: neglected', err))
      winas.on('close', (code, signal) => this.setState('Stopped'))
    })
  }

  swapoff (callback) {
    fs.readFile(`/proc/swaps | awk '{ print $1 }'`, (err, data) => {
      if (err) return callback(err)
      const dl = data.toString().split('\n')
      const l = dl.find(x => x.startsWith('/run/winas'))
      if (l && l.length) {
        child.exec(`swapoff ${l}`, (err, stdout, stderr) => {
          if (err || stderr) {
            return callback(err || new Error(stderr))
          } else {
            callback(null)
          }
        })
      } else {
        callback(null)
      }
    })
  }
}

// Failed and Started are XOR destination of start operation
class Failed extends State {
  enter (err) {
    super.enter()
    this.error = err
    this.timer = setTimeout(() => this.setState('Starting'), 1000 * 30)

    // failed can only be landed for start request
    this.ctx.startCbs.forEach(cb => cb(this.error))
    this.ctx.startCbs = []
  }

  start () {
    this.setState('Starting')
  }

  stop () {
    this.setState('Stopped')
  }

  exit () {
    clearTimeout(this.timer)
    this.timer = null
    super.exit()
  }
}

// 负责整个 winas 生命周期
class Winas extends EventEmitter {
  /**
  Create Winas
  @param {object} ctx - the model. ctx.releases is guaranteed to be available.
  @param {string} tagName - the currently deployed version
  */
  constructor () {
    super()
    // this.winasDir = ctx.config.storage.dirs.winasDir
    this.winasDir = Config.winas.dir

    ownership.on('cache', this.handleOwnerMessage.bind(this))
    ownership.on('owner', this.handleOwnerMessage.bind(this))
    channel.on('token', this.handleTokenMessage.bind(this))
    channel.on('pipe', this.handlePipeMessage.bind(this))

    this.on('Started', this.handleStarted.bind(this))
    this.on('Stopped', this.handleStoped.bind(this))

    // mutual exclusive
    this.startCbs = []
    this.stopCbs = []
    // eslint-disable-next-line no-new
    new Stopped(this)
  }

  handleStoped () {
    // After ERACE, auto fix
    if (this.owner) this.start()
  }

  handleStarted () {
    // After ERACE, auto fix
    if (!this.owner) return this.stop()

    if (this.token) {
      this.send({ type: 'token', data: this.token })
    }
    if (this.owner) {
      this.send({ type: 'boundUser', data: this.userStore.data })
    }
    this.send({ type: 'device', data: { deviceSN: Config.cloud.id } })
  }

  handleOwnerMessage (owner) {
    this.owner = owner
    owner ? this.start() : this.stop()
  }

  handlePipeMessage (msg) {
    if (msg.urlPath && !msg.urlPath.startsWith('/winasd')) {
      // if starting or restarting , buffer the msg
      this.send(msg)
    }
  }

  handleTokenMessage (token) {
    this.token = token
    if (this.getState() === 'Started') {
      this.send({ type: 'token', data: token })
    }
  }

  get users () {
    if (this.getState() !== 'Started') return
    if (!this.state.users) return
    return this.state.users
  }

  getState () {
    return this.state.constructor.name
  }

  // start may land started or failed
  start (callback = () => {}) {
    if (this.stopCbs.length) {
      const err = new Error('winas is requested to stop')
      err.code = 'ERACE'
      process.nextTick(() => callback(err))
      return
    }

    if (this.getState() === 'Started') {
      process.nextTick(() => callback(null))
      return
    }

    if (!this.startCbs.length) {
      // eslint-disable-next-line no-return-assign
      const f = err => (this.startCbs.forEach(cb => cb(err)), this.startCbs = [])
      const startedHandler = () => (this.removeListener('Failed', failedHandler), f(null))
      const failedHandler = () => (this.removeListener('Started', startedHandler), f(this.state.error))
      this.once('Started', startedHandler)
      this.once('Failed', failedHandler)
      process.nextTick(() => this.state.start())
    }

    this.startCbs.push(callback)
  }

  // stop may land stopped
  stop (callback = () => {}) {
    if (this.startCbs.length) {
      const err = new Error('winas is requested to start')
      err.code = 'ERACE'
      process.nextTick(() => callback(err))
      return
    }

    if (this.getState() === 'Stopped') {
      process.nextTick(() => callback(null))
      return
    }

    if (!this.stopCbs.length) {
      // eslint-disable-next-line no-return-assign
      this.once('Stopped', () => (this.stopCbs.forEach(cb => cb(null)), this.stopCbs = []))
      process.nextTick(() => this.state.stop())
    }

    this.stopCbs.push(callback)
  }

  send (obj, callback = () => {}) {
    let message
    try {
      message = JSON.stringify(obj)
    } catch (e) {
      return callback(e)
    }
    if (this.getState() !== 'Started') {
      return callback(null)
    }
    debug('*******Send To Winas*******\n', message)
    this.state.winas.send && this.state.winas.send(message, callback)
  }

  view () {
    return {
      state: this.getState(),
      users: this.users
    }
  }

  destroy () {
    this.state.destroy()

    const err = new Error('app is destroyed')
    err.code = 'EDESTROYED'

    this.startCbs.forEach(cb => cb(err))
    this.stopCbs.forEach(cb => cb(err))
    this.startCbs = []
    this.stopCbs = []
    this.destroyed = true // already destroy
  }
}

Winas.prototype.Stopped = Stopped
Winas.prototype.Starting = Starting
Winas.prototype.Started = Started
Winas.prototype.Stopping = Stopping
Winas.prototype.Failed = Failed

const winas = new Winas()

module.exports = winas
