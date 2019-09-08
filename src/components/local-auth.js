const crypto = require('crypto')
const EventEmitter = require('events')
const deepEqual = require('fast-deep-equal')
// const debug = require('debug')('ws:auth')

// const led = require('./led')

const KEYS = 'abcdefg12345678'.split('')
const RandomKey = () => KEYS.map(x => KEYS[Math.round(Math.random() * 14)]).join('')

const COLORS = [
  ['#ff0000', 'alwaysOn'],
  ['#ffffff', 'alwaysOn'],
  ['#0000ff', 'alwaysOn'],
  ['#ff0000', 'breath'],
  ['#00ff00', 'breath'],
  ['#ffffff', 'breath']
]

const CreateArgs = () => COLORS[Math.floor(Math.random() * 6)]

const fixedToken = '2b5c2d7c7d6ce647266bb08891e037e38cbfd36fac32e40250e517120a0bfecaf197121889fbec76657e79ed0137ed40'
const useFixedToken = process.argv.find(arg => arg === '--use-fixed-local-token')
if (useFixedToken) console.log('local auth accepts fixed token:', fixedToken)

/**
 * Hardware Auth
 * Using Led color or touch-button to check is it owner operation
 */
class LocalAuth extends EventEmitter {
  constructor (ctx) {
    super()
    this._state = 'Idle' // 'Workding'
    this.timer = undefined // working timer
    this.secret = RandomKey()
    Object.defineProperty(this, 'state', {
      get () {
        return this._state
      },
      set (v) {
        console.log('Local Auth Change State :  ', this._state, '  ->  ', v)
        if (v === 'Idle') this.args = undefined
        this._state = v
      }
    })
  }

  // request hardware auth/ transfer to authing state
  request (callback) {
    if (this.state === 'Idle') {
      const args = CreateArgs()
      try {
        this.emit('startcc', args)
        this.args = args
        console.log('LocalAuth ==> ', args)
        this.state = 'Working'
        this.timer = setTimeout(() => this.stop(), 60 * 1000)
        process.nextTick(() => callback(null, { colors: COLORS }))
      } catch (e) {
        this.stop()
        process.nextTick(() => callback(Object.assign(e, { code: 'ELED' })))
      }
    } else {
      process.nextTick(() => callback(Object.assign(new Error('busy'), { code: 'EBUSY' })))
    }
  }

  // stop local auth
  stop () {
    if (this.state === 'Idle') return
    clearTimeout(this.timer)
    this.state = 'Idle'
    this.emit('stopcc')
  }

  // check auth result
  auth (data, callback) {
    if (this.state !== 'Working') { return callback(Object.assign(new Error('error state'), { code: 'ESTATE', status: 400 })) }

    // check data maybe led colors
    if (!data.color || !deepEqual(data.color, this.args)) {
      this.stop()
      return callback(Object.assign(new Error('color error'), { code: 'ECOLOR', status: 400 }))
    }
    // create token
    // eslint-disable-next-line node/no-deprecated-api
    const cipher = crypto.createCipher('aes128', this.secret)
    let token = cipher.update(JSON.stringify({
      from: 'ble',
      ctime: new Date().getTime()
    }), 'utf8', 'hex')
    token += cipher.final('hex')
    this.stop()
    process.nextTick(() => callback(null, { token }))
  }

  // verify token
  // the bound version is set to bled
  verify (token) {
    if (useFixedToken) return token === fixedToken

    try {
      // eslint-disable-next-line node/no-deprecated-api
      const decipher = crypto.createDecipher('aes128', this.secret)
      let data = decipher.update(token, 'hex', 'utf8')
      data += decipher.final('utf8')
      data = JSON.parse(data)
      if (!data.ctime || !Number.isInteger(data.ctime) || Date.now() - data.ctime > 1000 * 60 * 60) {
        return false
      }
      return true
    } catch (e) {
      return false
    }
  }
}

const localAuth = new LocalAuth()

module.exports = localAuth
