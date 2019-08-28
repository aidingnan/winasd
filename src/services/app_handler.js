const Promise = require('bluebird')
const child = Promise.promisifyAll(require('child_process'))
const Device = require('../lib/device')

module.exports = {
  registerBleHandler (msgHandler) {
    msgHandler.register('LocalAuthWrite', this.handleLocalAuth.bind(this))
    msgHandler.register('NSWrite', this.handleNetworkSetting.bind(this))
    msgHandler.register('deviceDisconnected', this.handleDeviceDisconnect.bind(this))
    msgHandler.register('deviceConnected', this.handleDeviceConnect.bind(this))
  },

  handleLocalAuth (packet, done) {
    if (!this.localAuth) { // ctx not enter starting
      return done({ seq: packet.seq, error: Object.assign(new Error(`winasd in ${this.state.name} state`), { code: 'ESTATE' }) })
    }
    if (packet.action === 'req') {
      this.localAuth.request((err, data) => 
        done({ seq: packet.seq, error: err, data }))
    } else if (packet.action === 'auth') {
      this.localAuth.auth(packet.body, (err, data) => 
        done({ seq: packet.seq, error: err, data }))
    } else {
      console.log('Unknown action to localAuth: ', packet.action)
    }
  },

  /**
   * action: auth/conn
   * data: {token}/{ssid, pwd}
   */
  handleNetworkSetting (packet, done) {
    if (!this.localAuth) { // ctx not enter starting
      done({ seq: packet.seq, error: Object.assign(new Error(`winasd in ${this.state.name} state`), { code: 'ESTATE' }) })
    }
    if (packet.action === 'addAndActive') {
      if (this.localAuth.verify(packet.token)) {
        this.net.connect(packet.body.ssid, packet.body.pwd, 
          (err, data) => done({ seq: packet.seq, error: err, data }))
      } else {
        const error = Object.assign(new Error('auth failed'), { code: 'EAUTH' })
        return done({ seq: packet.seq, error })
      }
    } else if (packet.action === 'addAndActiveAndBound') {
      this.handleConnectAndBound(packet, done)
    }
  },

  handleConnectAndBound (packet, done) {
    if (this.localAuth.verify(packet.token)) {
      this.net.connect(packet.body.ssid, packet.body.pwd, (err, data) => {
        if (err) return done({ seq: packet.seq, error: Object.assign(err, { code: 'EWIFI' }) })
        done({ seq: packet.seq, success: 'WIFI', data })
        this.waitChannel(packet, err => {
          if (err) return done({ seq: packet.seq, error: Object.assign(err, { code: 'ECHANNEL' }) })
          done({ seq: packet.seq, success: 'CHANNEL' })
          this.waitNTPAsync()
            .then(_ => {
              done({ seq: packet.seq, success: 'NTP' })
              this.boundDevice(packet, (err, data) => {
                if (err) return done({ seq: packet.seq, error: Object.assign(err, { code: 'EBOUND' }) })
                done({ seq: packet.seq,
                  success: 'BOUND',
                  data: {
                    sn: this.deviceSN,
                    addr: Device.NetworkAddr('lanip')
                  }
                })
              })
            })
            .catch(e => done({ seq: packet.seq, error: Object.assign(e, { code: 'ENTP' }) }))
        })
      })
    } else {
      const error = Object.assign(new Error('auth failed'), { code: 'EAUTH' })
      return done({ seq: packet.seq, error })
    }
  },

  /**
  This is a workaround, not a fix
  The request is a batch action
  1. set wifi and return error if failed
  2. wait ntp to update, otherwise, the requirement is not met, but this is suspicious since it is an internal requirement of channel module
  3. the bad thing is we should know the internal state of app service. This breaks the design critera of a state machine.
  4. the better solution should takes two steps:
    1. set up wifi and return error if failed
    2. blindly send request to state machine and let the state machine to return error
    3. ntp dependency should not be externally visible. It is simple an internal error and the channel can not be established.
  */
  waitChannel (packet, callback) {
    let ticks = 0 // eslint-disable-line no-unused-vars
    const tick = setInterval(() => {
      if (this.state.name() === 'Unbound' && this.channel) {
        clearInterval(tick)

        if (this.channel.status === 'Connected') {
          return process.nextTick(() => callback(null))
        } else {
          let timeout
          const timer = setTimeout(() => {
            timeout = true
            return callback(new Error('channel connect timeout'))
          }, 60 * 1000)
          this.channel.once('ChannelConnected', () => {
            if (timeout) return
            clearTimeout(timer)
            return callback(null)
          })
        }
      } else if (tick > 10) {
        clearInterval(tick)
        return callback(new Error('channel connect timeout'))
      } else {
        ticks++
      }
    }, 3000)
  },

  async waitNTPAsync () {
    const timeout = new Date().getTime() + 10 * 1000
    while (true) {
      if (timeout < new Date().getTime()) throw new Error('ntp sync timeout')
      if ((await child.execAsync(`timedatectl| grep sync | awk '{ print $4 }'`)).toString().trim() === 'yes') { return }
      await Promise.delay(1000)
    }
  },

  boundDevice (packet, callback) {
    this.requestBind(packet.body.encrypted, err => {
      if (err) return callback(err)
      return callback(null, {
        sn: this.deviceSN,
        addr: Device.NetworkAddr('lanip')
      })
    })
  },

  handleDeviceConnect (packet, callback) {
    console.log('handleDeviceConnect')
  },

  handleDeviceDisconnect (packet, callback) {
    console.log('handleDeviceDisconnect')
    // TODO question, when to start?
    if (this.localAuth) this.localAuth.stop()
    if (this.ledService) {
      const bound = this.state.name() === 'Bound'
      this.ledService.runGroup(bound ? 'normal' : 'unbind')
    }
  }
}
