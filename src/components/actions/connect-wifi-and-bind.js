const racer = require('../lib/racer')
const connectWifi = require('./connect-wifi')

const addAndActiveAndBound = (ssid, password, encrypted, callback) =>
  addAndActive(ssid, password, err => {
    if (err) {
      err.reason = err.code
      err.code = 'EWIFI'
      callback(err)
    } else {
      // progress
      callback({ success: 'WIFI' })
      let r = racer()
      setTimeout(r(() => {
        let err = new Error('cloud not connected in 60 seconds')
        err.code = 'ETIMEOUT'
        callback(err)
      }), 60 * 1000)
      ownership.on('owner', r(owner => {
        if (owner) {
          let err = new Error('owner exists')
          err.code = 'EEXIST'
          callback(err)
        } else {
          callback({ success: 'CHANNEL' })
          ownership.bind(encrypted, err => {
            if (err) {
              err.reason = err.code
              err.code = 'EBOUND'
              callback(err)
            } else {
              callback({
                success: 'BOUND',
                data: {
                  sn: config.cloud.id,
                  addr: ip() 
                }
              }) 
            }
          })
        }
      }))
    }
  })

module.exports = connectWifiAndBind

