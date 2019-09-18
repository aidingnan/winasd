const os = require('os')
const racer = require('../lib/racer')
const device = require('../components/device')
const ownership = require('../components/ownership')
const watson = require('../components/watson')
const channel = require('../components/channel')
const connect = require('./connect-wifi')

const logE = err => {
  const { message, code, reason } = err
  console.log('connect-wifi-and-bind:', { message, code, reason })
}

const logD = data => console.log('connect-wifi-and-bind:', data)
const logI = (...args) => console.log('connect-wifi-and-bind:', ...args)

// the last response called multiple times
// and this is not a good design (no lazy, no end)
module.exports = (ssid, password, encrypted, respond) =>
  connect(ssid, password, err => {
    if (err) {
      respond(err)
      logE(err)
    } else {
      // progress
      const data = { success: 'WIFI' }
      respond(data)
      logD(data)

      logI('channel.status', channel.status)
      if (channel.status !== 'Connecting') channel.reconnect()

      const r = racer()
      setTimeout(r(() => {
        const err = new Error('cloud not connected in 60 seconds')
        err.code = 'ETIMEOUT'
        respond(err)
        logE(err)
      }), 60 * 1000)

      ownership.on('owner', r(owner => {
        if (owner) {
          const err = new Error('owner exists')
          err.code = 'EEXIST'
          respond(err)
          logE(err)
        } else {
          // progress
          const data = { success: 'CHANNEL' }
          respond(data)
          logD(data)

          ownership.bind(encrypted, err => {
            if (err) {
              err.reason = err.code
              err.code = 'EBOUND'
              respond(err)
              logE(err)
            } else {
              const data = {
                success: 'BOUND',
                data: {
                  sn: device.sn,
                  addr: ((
                    wlan0 = os.networkInterfaces().wlan0,
                    ip = wlan0 && wlan0.find(x => x.family === 'IPv4'),
                    addr = ip ? ip.address : '0.0.0.0'
                  ) => addr)()
                }
              }
              respond(data)
              logD(data)
            }
          })
        }
      }))
    }
  })
