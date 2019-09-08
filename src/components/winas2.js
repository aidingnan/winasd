const path = require('path')
const fs = require('fs')
const child = require('child_process')
const EventEmitter = require('events')

const Config = require('config')

const debug = require('debug')('ws:winas')

const channel = require('./channel')
const diskman = require('./diskman')
const ownership = require('./ownership')

/**
winas has the responsibility to maintain winas service, starting, stopping, restarting, and buffering incoming message.

1. token, token is always stored in context, in stared state, the token is always sent to winas immediately.
2. pipe message. pipe message is sent to winas in stopping state. buffered, in expecting and pending state.
3. owner message. owner has both edge trigger and level trigger logic. In stopped, expecting, and pending state it  
trigger a starting immediately. In started state, it trigger stopping state. The transient state should

State:

1. Idle, condition not met for starting winas, no timer, buffer pipe request (each request has its own timer)
2. Starting, starting winas, transient state, buffered pipe request
3. Started, message channel has be established
4. Stopping, stopping winas due to condition unmet, transient state, reject pipe request, since there is no commanded restarting.
5. RestartDelay, waiting for a timer timeout to start winas again. pipe request triggers an immediate starting. The timer period should be short.

              ownerOn                   ownerOff            pipe     
Idle          Starting (if mounted)     -                   buffer
Starting      -                         Stopping            buffer, pass to next state (Started/Stopping)
Started       -                         Stopping            pass to winas 
Stopping      -                         -                   reject
Retry         -                         Idle                Starting
*/




/**
nexe does not work properly for unknown reason.
*/
class State {
  constructor (ctx, ...args) {
    this.ctx = ctx
  }

  setState (NextState, ...args) {
    // emit exiting 
    this.exit()
    this.exited = true
    // emit exited
    this.ctx.state = new NextState(this.ctx, ...args)
    // emit entering
    this.ctx.state.enter(...args)
    // emit entered
  }

  enter () {
  }

  exit () {
  }

  token (token) {
  }

  reject (msg) {
  }

  // reject by default
  pipe (msg) {
    this.reject(msg)
  }

  view () { 
    return null 
  }
}

class Stopped extends State {
  constructor () {
    super()

    if (!diskman.mounted) {
      diskman.once('mounted', () => ownership.getOwner() && this.start())
    }

    /**
    Each element in queue is a timer and a msg
    */
    this.timedMsgs = []
  }

  pipe (msg) {
    const timeout = setTimeout(() => {
      const index = this.timedMsgs.find(tm => tm.msg === msg)
      this.timedMsgs = [
        ...this.timeMsgs.slice(0, index), 
        ...this.timeMsgs.slice(index + 1)
      ]
      this.ctx.reject(msg)
    }, 5 * 1000)

    this.timeMsgs.push({ timeout, msg })
  }

  // private method
  start () {
    this.timedMsg.forEach(tm => clearTimeout(tm.timeout))
    this.setState(Starting, this.timedMsgs.map(tm => tm.msg))
  }
}

class Starting extends State {
  enter (msgs) {
    this.msgs = msgs

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

    const winas = child.spawn('node', args, opts)

    /**
    The 'error' event is emitted whenever:

    The process could not be spawned, or            // unless no memory or path error
                                                    // then there won't be a close event
                                                    // this should be a panic

    The process could not be killed, or             // n/a, we don't kill Starting in this state
    Sending a message to the child process failed.  // n/a, we don't send message in this state
    */

    // critial error
    const handleError = (...args) => {
      winas.removeListener('error', handleError)
      winas.on('error', () => {})
      winas.removeListener('message', handleMessage)
      winas.removeListener('close', handleError)

      if (args[0] instanceof Error) {
        const err = args[0]
        console.log(`winas failed to start, ${err.message}`)
        this.ctx.criticalErrorCount++ 
      } else {
        const [code, signal] = args
        console.log(`winas failed to start, code ${code}, signal ${signal}`)
        if (code) this.ctx.criticalErrorCount++ 
      }

      // TODO reject all messages

      if (this.ctx.criticalErrorCount > 10) {
        this.setState(Dead)
      } else {
        this.setState(Retry)
      }
    }

    // success path
    const handleMessage = message => {
      winas.removeListener('error', handleError)
      winas.removeListener('close', handleError)

      // TODO what is this?
      this.ctx.emit('message', message) 

      this.setState(Started, winas, this.msgs)
    }

    winas.once('error', handleError)
    winas.once('message', handleMessage)
    winas.once('close', handleClose) 
  }

  pipe (msg) {
    this.msgs.push(msg)
  }
}

class Started extends State {

  enter (winas, msgs) {
    // don't know how to deal with this error, kill ???
    winas.on('error', err => console.log('Winas Error in Started: neglected', err))
    winas.on('close', (code, signal) => {
      this.setState('Failed', { code, signal })
    })

    winas.on('message', message => this.handleWinasMessage(message))
    this.winas = winas

    if (this.ctx.token) this.token(this.ctx.token)

    const handleOwner = owner => {
      if (owner === null) {
        this.setState(Stopping, winas)
      }
    }
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

  token (token) {
    this.ctx. // TODO
  }

  pipe (msg) {
    
  }
}

// Stopping can only be entered when being stopped externally, so it always goes to Stopped state
class Stopping extends State {
  enter (winas) {
    winas.kill()
    winas.on('error', err => {})
    winas.on('close', (code, signal) => {
      if (ownership.getOwner()) {
        this.setState(Starting)
      } else {
        this.setState(Stopped)
      }
    })
  }
}

class Retry extends State {
  enter () {
    this.timer = setTimeout(() => this.setState('Starting'), 1000 * 30)
    const handleOwner = owner => {
      if (owner === null) {
        this.setState(Stopped)
      }
    }
  }

  pipe (msg) {
    this.setState(Starting, [msg])
  }

  exit () {
    clearTimeout(this.timer)
  }
}

class Dead extends State {
}

/**
1. This module is responsible for starting / stopping / restarting winas, assuring
the operation is synchronized.
*/
class Winas extends EventEmitter {
  /**
  Create Winas
  @param {object} ctx - the model. ctx.releases is guaranteed to be available.
  @param {string} tagName - the currently deployed version
  */
  constructor () {
    super()
    this.winasDir = Config.winas.dir
    this.token = ''
    this.criticalErrorCount = 0

    channel.on('token', token => {
      this.token = token
      this.state.token(token)
    })

    channel.on('pipe', this.handlePipeMessage.bind(this))

    this.on('Started', this.handleStarted.bind(this))
    this.on('Stopped', this.handleStoped.bind(this))

    // mutual exclusive
    this.startCbs = []
    this.stopCbs = []

    this.state = new Stopped(this)
    this.state.enter()
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
      // this.send({ type: 'boundUser', data: this.userStore.data })
      this.send({ type: 'boundUser', data: this.owner })
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

      console.log('winas handle message:', msg)

      // this.send(msg)
      this.send({ type: 'pipe', data: msg })
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
