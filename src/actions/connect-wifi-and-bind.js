const os = require('os')
const config = require('config')
const racer = require('../lib/racer')
const ownership = require('../components/ownership')
const connect = require('./connect-wifi')

// the last response called multiple times
// and this is not a good design (no lazy, no end)
module.exports = (ssid, password, encrypted, respond) =>
  connect(ssid, password, err => {
    if (err) {
      err.reason = err.code
      err.code = 'EWIFI'
      respond(err)
    } else {
      // progress
      respond({ success: 'WIFI' })
      const r = racer()
      setTimeout(r(() => {
        const err = new Error('cloud not connected in 60 seconds')
        err.code = 'ETIMEOUT'
        respond(err)
      }), 60 * 1000)
      ownership.on('owner', r(owner => {
        if (owner) {
          const err = new Error('owner exists')
          err.code = 'EEXIST'
          respond(err)
        } else {
          respond({ success: 'CHANNEL' })
          ownership.bind(encrypted, err => {
            if (err) {
              err.reason = err.code
              err.code = 'EBOUND'
              respond(err)
            } else {
              respond({
                success: 'BOUND',
                data: {
                  sn: config.cloud.id,
                  addr: ((
                    wlan0 = os.networkInterfaces().wlan0,
                    ip = wlan0 && wlan0.find(x => x.family === 'IPv4'),
                    addr = ip ? ip.address : '0.0.0.0'
                  ) => addr)()
                }
              })
            }
          })
        }
      }))
    }
  })
