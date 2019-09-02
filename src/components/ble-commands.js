const child = require('child_process')

const bled = require('./bled')
const localAuth = require('./localAuth')
const led = require('./led')
const channel = require('./channel')
const owner = require('./owner')
const sata = require('./sata')

// this is a higher order function
// returns a racer function, which is also a higher order function
const racer = () => {
  // this function accepts a next function and a condition, 
  // which is a synchronous function returning true or false
  // this function could be called multiple times on different next function
  // this function guarantees only one of the next functions is involke and 
  // others rendered void
  return (next, condition) => {
    let fired = false
    return () => {
      if (fired) return
      if (condition && !condition()) return
      fired = true
      next()
    }
  } 
}

const addAndActive = (ssid, pwd, callback) => {
  child.exec(`nmcli d wifi connect ${ssid} password ${passwod}`, (err, stdout, stderr) => {
    if (err) {
      let err = new Error(stderr.toString().trim()) 
      callback(err)
    } else {
      callback(null)
    }
  })
}

// 1. activate wifi
// 2. wait on channel connected
const addAndActiveAndBound = (ssid, password, encrypted, callback) =>
  addAndActive(ssid, password, err => {
    if (err) return callback(err)
    // wait channel to connect in 60 seconds, racing
    let r = racer()
    err = Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })
    setTimeout(r(() => callback(err)), 60 * 1000)   // TODO define timeout
    channel.once('connected', r(() => {
      r = racer()
      setTimeout(r(() => callback(err), 10 * 1000)  // TODO define timeout
      owner.once('update', r(owner => {
        if (owner is invalid) return callback(err)
        owner.requestBind(encrypted, err => callback(err)))
      }))
    })
  })

const cleanVolume = () => {
  sata.format(err => {
  })
} 

bled.on('message', msg => {
  if (msg.charUUID === '70000003-0182-406c-9221-0a6680bd0943') {
    switch (msg.action) {
      case 'addAndActive': {
          addAndActive()
        }
        break
      case 'addAndActiveAndBound': {
          addAndActiveAndBound()
        }
        break
      case 'cleanVolume': {
          cleanVolume()
        }
        break
      default:
        break
    }
  }
})
