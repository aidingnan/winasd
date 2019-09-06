const child = require('child_process')
const os = require('os')

const strip = require('strip-ansi')

const config = require('config')
const ownership = require('./ownership')
const sata = require('./diskman')

// this is a higher order function
// returns a racer function, which is also a higher order function
const racer = () => {
  // this function accepts a next function and a condition, 
  // which is a synchronous function returning true or false
  // this function could be called multiple times on different next function
  // this function guarantees only one of the next functions is involke and 
  // others rendered void
  let fired = false
  return (next, condition, tag) => {
    return (...args) => {
      if (fired) return
      if (condition && !condition(...args)) return
      fired = true
      next(...args)
    }
  } 
}

const ip = () => {
  let wlan0 = os.networkInterfaces().wlan0
  if (wlan0) {
    ipv4 = wlan0.find(o => o.family === 'IPv4')
    if (ipv4) return ipv4.address
  } 
  return '255.255.255.255' 
}

// TODO error code
// TODO nmcli list before connect, return ENOENT
const addAndActive = (ssid, password, callback) => 
  child.exec(`nmcli d wifi connect ${ssid} password ${password}`, (err, stdout, stderr) => {
    if (err) {
      let err = new Error(strip(stderr).toString().trim()) 
      callback(err)
    } else {
      callback(null)
    }
  })

// the callback can be triggered multiple times
// send obj as progress
// until an Error or null indicating an end
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

module.exports = {
  addAndActive,
  addAndActiveAndBound,
}
