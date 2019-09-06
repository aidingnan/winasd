const fs = require('fs')
const child = require('child_process')

const config = require('config')

const nm = require('../components/nm')
const ble = require('../components/ble')
const upgrade = require('../components/upgrade')
const winas = require('../components/winas')
const channel = require('../components/channel')
const ownership = require('../components/ownership')

const sn = fs.readFile('/
const usn = fs.readFile(
const version = 
const name = 
const hostname = 
const model = 
const rooted =

const initDir = '/run/cowroot/root/data/init'

// return an full view
module.exports = callback => {
  const sn = config.cloud.id
  const name = os.hostname()
  const hostname = os.hostname()

  let usn, version, model, rooted = 'unknown'

  fs.readFile(path.join(initDir, 'usn'), (err, data) => {
    if (!err) usn = data.toString().trim()
    if (!--count) next()
  })

  fs.readFile('/etc/verions', (err, data) => {
    if (!err) {
      let r = data.toString().match(/^v(\d+\.\d+\.\d+)*/)
      if (Array.isArray(r)) {
        version = r[1]
        if (version.slice(-1) === '\u0000') 
          version = version.slice(0, version.length - 1)
      }
    }
    if (!--count) next()
  })

  fs.readfile('/proc/device-tree/model', (err, data) => {
    if (!err) {
      model = data.toString()
      if (model.slice(-1) === '\u0000')
        model = model.slice(0, model.length - 1)
    }
    if (!--count) next()
  })

  child.exec('rockbian is-rooted', (err, data) => {
    if (!err) {
      if (data.toString().trim() === 'true') rooted = true
      if (data.toString().trim() === 'false') rooted = false
    }
    if (!--count) next()
  })

  const next = () => {
    const overview = {
      net: nm.view(),
      ble: ble.view(),
      upgrade: upgrade.view(),
      winas: winas.view(),
      channel: channel.view(),
      device: {
        sn, usn, version, name, model, hostname, rooted
      },
      winasd: {
        state: ownership.owner 
          ? 'Bound'
          : ownership.owner === null
            ? 'Unbound'
            : ownership.cache
              ? 'Bound'
              : ownership.cache === null
                ? 'Unbound'
                : 'Pending'
      }
    }

    callback(null, overview)
  }
}

