const child = require('child_process')

const strip = require('strip-ansi')

// const bled = require('./bled')
// const localAuth = require('./localAuth')
// const led = require('./led')
// const channel = require('./channel')
const ownership = require('./owner')
const sata = require('./sata')

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

// TODO change callback to send progress
const addAndActiveAndBound = (ssid, password, encrypted, callback) =>
  addAndActive(ssid, password, err => {
    if (err) return callback(err)

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
        ownership.bind(encrypted, err => {
          callback(err)
        })
      }
    }))
  })

const cleanVolume = () => {
  sata.format(err => {
  })
} 

module.exports = {
  addAndActive,
  addAndActiveAndBound,
  cleanVolume 
}
