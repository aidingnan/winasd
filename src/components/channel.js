const fs = require('fs')
const path = require('path')
const child = require('child_process')
const Config = require('config')
const State = require('../lib/state')
const { NetworkAddr, deviceName, SoftwareVersion } = require('../lib/device')
const debug = require('debug')('ws:channel')
const request = require('request')
const Client = require('../lib/mqttClient')
const AWSCA = require('../lib/awsCA')

// const storageConf = Config.get('storage')
const IOTConf = Config.get('iot')
const certFolder = path.join(Config.volume.cloud, Config.cloud.domain, Config.cloud.id)
const crtName = 'device.crt'

const deviceCert = path.join(certFolder, 'device.crt')

const deviceSN = Config.cloud.id

class Base extends State {
  debug (...args) {
    debug(...args)
  }
}

class Pending extends State {
  enter () {
    const loop = () => request
      .get(`https://${Config.cloud.domain}.aidingnan.com/s/v1/station/${Config.cloud.id}/cert`)
      .then(res => fs.writeFile(deviceCert, res.body.data.certPem, err => {
        if (err) return this.setState('Failed', err)
        this.setState('Connecting')
      }))
      .catch(_ => setTimeout(() => loop(), 3000))
    fs.lstat(deviceCert, err => err ? loop() : this.setState('Connecting'))
  }
}

class Connecting extends Base {
  enter (callback) {
    const cb = (err, connection, token, device) => {
      if (err) {
        callback && callback(err)
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
        Buffer.from(fs.readFileSync(path.join(certFolder, crtName))
          .toString()
          .split('\n')
          .filter(x => !!x && !x.startsWith('--'))
          .join(''), 'base64')
      ],
      caPath: AWSCA.replace(/\r\n/g, '\n'),
      clientId: deviceSN,
      host: IOTConf.endpoint,
      keepalive: 5,
      clientPrivateKey: (data, callback) =>
        this.ctx.ctx.ecc.sign({ data, der: true }, callback),
      clientCertificateVerifier: {
        algorithm: '',
        sign: ''
      }
    })

    conn.on('connect', () => {
      conn.subscribe(`cloud/${deviceSN}/connected`)
      conn.publish(`device/${deviceSN}/info`, JSON.stringify({
        lanIp: NetworkAddr('lanip'),
        llIp: NetworkAddr('linklocal'),
        version: SoftwareVersion(),
        name: deviceName()
      }))
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

  connect () {}
}

class Connected extends Base {
  enter (connection, token, device) {
    clearTimeout(this.ctx.delayCleanTimer)
    // confirm first
    child.exec('cowroot-confirm', () => {})
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

    this.ctx.emit('ChannelConnected', device)
  }

  // start refresh token
  // 当重试三次累计90秒还不能收到token，视为连接失败
  refreshToken () {
    clearTimeout(this.waitTimer)
    if (++this.counter > 3) {
      return this.setState('Failed', new Error('token refresh timeout 3 times over 90 seconds'))
    }
    this.publish(`device/${deviceSN}/token`, '') // refresh token
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

  connect () {}

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
    this.error = error
    this.timer = setTimeout(() => this.setState('Connecting'), 1000 * 10)
  }

  exit () {
    clearTimeout(this.timer)
  }

  connect () {
    this.setState('Connecting')
  }
}

/***
 * Channel 负责连接AWS IoT,监听 Iot 消息
 * 连接使用telsa + ecc
 */
class Channel extends require('events') {
  constructor () {
    super()

    Object.defineProperty(this, 'token', {
      get: () => this._token,
      set: x => {
        this.token = x
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

  connect () {
    this.state.connect()
  }

  get status () {
    return this.state.constructor.name
  }

  view () {
    return {
      state: this.status
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

module.exports = Channel
