const Promise = require('bluebird')
const fs = require('fs')
const path = require('path')
const child = Promise.promisifyAll(require('child_process'))
const Config = require('config')
const State = require('../lib/state')
const { NetworkAddr, deviceName, SoftwareVersion } = require('../lib/device')
const debug = require('debug')('wd:channel')
const request = require('superagent')
const Client = require('../lib/mqttClient')
const AWSCA = require('../lib/awsCA')

const ecc = require('../lib/atecc/atecc')

const IOTConf = Config.get('iot')
const certFolder = path.join(Config.volume.cloud, Config.cloud.domain, Config.cloud.id)
const deviceCert = path.join(certFolder, 'device.crt')
const deviceSN = Config.cloud.id

class Base extends State {
  debug (...args) {
    debug(...args)
  }

  get name () {
    return this.constructor.name
  }

  reconnect () {}

  send (topic, data, opts, callback = () => {}) {
    process.nextTick(() =>
      callback(Object.assign(new Error('can not send in current state: ' + this.name), { code: 'ESTATE' })))
  }
}

class Pending extends Base {
  enter () {
    const loop = () => request
      .get(`https://${Config.cloud.domain}.aidingnan.com/s/v1/station/${Config.cloud.id}/cert`)
      .then(res => fs.writeFile(deviceCert, res.body.data.certPem, err => {
        if (err) return this.setState('Failed', err)
        this.ctx.deviceCert = res.body.data.certPem
        this.setState('Connecting')
      }))
      .catch(_ => setTimeout(() => loop(), 3000))

    this.waitNTP(() => {
      fs.lstat(deviceCert, err => err ? loop()
        // eslint-disable-next-line no-return-assign
        : fs.readFile(deviceCert, (err, data) => err ? this.setState('Failed', err)
          : (this.ctx.deviceCert = data.toString(), this.setState('Connecting'))))
    })
  }

  waitNTP (callback) {
    const loop = () => {
      child.exec(`timedatectl| grep sync | awk '{ print $4 }'`, (err, stdout, stderr) => {
        if (err || stderr || stdout.toString().trim() !== 'yes') return setTimeout(() => loop(), 3000)
        return callback(null, null)
      })
    }
    loop()
  }
}

class Connecting extends Base {
  enter (callback = () => {}) {
    const cb = (err, connection, token, device) => {
      if (err) {
        callback(err)
        return this.setState('Failed', err)
      }
      this.setState('Connected', connection, token, device)
    }
    this._connect(cb)
  }

  _connect (callback) {
    let token, device; let conn; let finished = false
    const cb = (err) => {
      clearTimeout(timer)
      if (finished) return
      finished = true
      if (conn) {
        conn.unsubscribe(`cloud/${deviceSN}/connected`)
        conn.removeAllListeners()
        conn.on('error', () => {})
      }
      if (err) {
        conn && conn.end()
        conn = undefined
      }
      callback(err, conn, token, device)
    }

    // start a timer to exit current state while connecting over 30 seconds
    const timer = setTimeout(() => {
      conn.removeAllListeners()
      conn.on('error', () => {})
      conn.end()
      conn = undefined
      cb(new Error('ETIMEOUT'))
    }, 30 * 1000)

    conn = new Client({
      clientCertificates: [
        Buffer.from(this.ctx.deviceCert
          .split('\n')
          .filter(x => !!x && !x.startsWith('--'))
          .join(''), 'base64')
      ],
      caPath: AWSCA.replace(/\r\n/g, '\n'),
      clientId: deviceSN,
      host: IOTConf.endpoint,
      keepalive: 5,
      clientPrivateKey: (data, callback) =>
        // this.ctx.ctx.ecc.sign({ data, der: true }, callback),
        ecc.sign({ data, der: true }, callback),
      clientCertificateVerifier: {
        algorithm: '',
        sign: ''
      }
    })

    conn.on('connect', () => {
      conn.subscribe(`cloud/${deviceSN}/connected`)
    })
    conn.on('error', cb)
    conn.on('message', (topic, payload) => {
      if (topic === `cloud/${deviceSN}/connected`) {
        let msg
        try {
          msg = JSON.parse(payload.toString())
        } catch (e) {
          return cb(e)
        }
        token = msg.token
        device = msg.device
        cb()
      }
    })
    conn.on('offline', () => cb(new Error('offline')))
  }
}

class Connected extends Base {
  enter (connection, token, device) {
    try {
      clearTimeout(this.ctx.delayCleanTimer)
      // confirm first
      // child.exec('cowroot-confirm', () => {})
      this.ctx.token = token
      this.counter = 0
      this.refreshTokenTime = 1000 * 60 * 60 * 2
      this.connection = connection
      this.connection.on('message', (...args) => {
        this.revToken(...args) // hijack refresh token topic to reset waitTimer
        this.ctx.handleIotMsg.bind(this.ctx)(...args)
      })
      this.connection.on('close', () => this.setState('Failed', new Error('close')))
      this.connection.on('error', err => this.setState('Failed', err))
      this.connection.on('offline', () => this.setState('Failed', new Error('offline')))
      this.connection.subscribe(`cloud/${deviceSN}/pipe`)
      this.connection.subscribe(`cloud/${deviceSN}/users`)
      this.connection.subscribe(`cloud/${deviceSN}/token`)
      this.connection.subscribe(`cloud/${deviceSN}/checkout`)
      this.connection.subscribe(`cloud/${deviceSN}/download`)
      this.timer = setTimeout(() => {
        this.refreshToken() // refresh token
      }, this.refreshTokenTime)

      debug('ChannelConnected', device)

      this.ctx.emit('ChannelConnected', device)
    } catch (e) {
      console.log(e)
    }
  }

  // start refresh token
  // 当重试三次累计90秒还不能收到token，视为连接失败
  refreshToken () {
    clearTimeout(this.waitTimer)
    if (++this.counter > 3) {
      return this.setState('Failed', new Error('token refresh timeout 3 times over 90 seconds'))
    }
    this.connection.publish(`device/${deviceSN}/token`, '') // refresh token
    this.waitTimer = setTimeout(() => { // refresh timeout
      this.refreshToken()
    }, 30 * 1000)
  }

  // hijack refresh token topic to reset timer
  revToken (topic) {
    if (!topic || !topic.endsWith('token')) return // donot care this topic
    clearTimeout(this.waitTimer)
    this.counter = 0
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { // refresh every 2 hours
      this.refreshToken()
    }, this.refreshTokenTime)
  }

  reconnect () {
    this.setState('Connecting')
  }

  send (topic, data, opts, callback = () => {}) {
    if (!opts) {
      return this.connection.publish(topic, JSON.stringify(data))
    }
    this.connection.publish(topic, JSON.stringify(data), opts, callback)
  }

  exit () {
    this.connection.removeAllListeners()
    this.connection.on('error', () => {})
    this.connection.end()
    this.connection = undefined
    // 延迟清理Token, 防止网络波动
    this.ctx.delayCleanTimer = setTimeout(() => (this.ctx.token = undefined), 60 * 1000)
    clearTimeout(this.timer)
    clearTimeout(this.waitTimer)
  }
}

class Failed extends Base {
  enter (error) {
    // console.log('Failed: ', error)
    debug('Failed', error)
    this.error = error
    this.timer = setTimeout(() => this.setState(this.ctx.deviceCert ? 'Connecting' : 'Pending'), 1000 * 10)
  }

  exit () {
    clearTimeout(this.timer)
  }

  reconnect () {
    this.setState(this.ctx.deviceCert ? 'Connecting' : 'Pending')
  }
}

/***
 * Channel 负责连接AWS IoT,监听 Iot 消息
 * 连接使用telsa + ecc
 *
 * emit events
 * 1. ChannelConnected
 * 2. token
 * 3. pipe
 * 4. users
 * 5. checkout
 * 6. download
 */
class Channel extends require('events') {
  constructor () {
    super()
    this._token = ''

    Object.defineProperty(this, 'token', {
      get: () => this._token,
      set: x => {
        this._token = x
        this.emit('token', x)
      }
    })

    // eslint-disable-next-line no-new
    new Pending(this)
  }

  handleIotMsg (topic, payload) {
    let data
    try {
      data = JSON.parse(payload.toString())
    } catch (e) {
      return console.log('MQTT PAYLOAD FORMATE ERROR')
    }
    if (topic.endsWith('pipe')) {
      this.emit('pipe', data)
    } else if (topic.endsWith('users')) {
      this.emit('users', data)
    } else if (topic.endsWith('token')) {
      this.token = data.token
      this.emit('token', data.token)
    } else if (topic.endsWith('checkout')) { // upgrade
      this.emit('checkout', data)
    } else if (topic.endsWith('download')) { // download image
      this.emit('download', data)
    } else {
      console.log('miss channel message:\n', topic, data)
    }
  }

  reconnect () {
    this.state.reconnect()
  }

  send (topic, data, opts, callback) {
    this.state.send(topic, data, opts, callback)
  }

  get status () {
    return this.state.name
  }

  view () {
    return {
      state: this.state.name
    }
  }

  destroy () {
    this.state.destroy()
    clearTimeout(this.delayCleanTimer)
  }
}

Channel.prototype.Connecting = Connecting
Channel.prototype.Connected = Connected
Channel.prototype.Failed = Failed
Channel.prototype.Pending = Pending

const channel = new Channel()
module.exports = channel
