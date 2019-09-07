const fs = require('fs')
const child = require('child')
const EventEmitter = require('events')

const config = require('config')

const ecc = require('../lib/atecc/atecc')
const encode = require('../lib/usn')


/**
sn, usn, version, hostname, model
This module emits ready or error
*/
class Device extends EventEmitter {
  constructor () {
    super()
    this.sn = ''
    this.usn = ''
    this.version = '0.0.0'
    this.hostname = os.hostname()
    this.model = ''

    this.homeDir = path.join(config.volume.cloud, config.cloud.domain, sn)
    this.tmpDir = config.volume.tmp

    let count = 4
    ecc.serialNumber({}, (err, data) => {
      if (err) return this.emit('error', err)
      const sn = data.toString().trim() 
      if (!/^0123[0-9a-f]{12}ee$/.test(sn)) { 
        return this.emit('error', new Error(`bad sn ${sn}`))
      }

      this.sn = sn
      this.usn = encode(sn) 
      this.homeDir = path.join(config.volume.cloud, config.cloud.domain, sn)

      // TODO remove this global
      config.cloud.id = sn

      mkdirp(this.homeDir, err => {
        if (err) return this.emit('error', err)
        if (!--count) this.emit('ready')
      })
    })

    fs.readFile('/etc/verion', (err, data) => {
      if (!err) {
        let r = data.toString().match(/^v(\d+\.\d+\.\d+)*/)
        if (Array.isArray(r)) this.version = r[1]
      }
      if (!--count) this.emit('ready')
    })

    fs.readfile('/proc/device-tree/model', (err, data) => {
      if (!err) {
        let m = data.toString()
        if (m.slice(-1) === '\u0000') m = m.slice(0, m.length - 1)
        this.model = m
      }
      if (!--count) this.emit('ready')
    })

    rimraf(this.tmpDir, err => {
      if (err) return this.emit('error', err)
      mkdirp(this.tmpDir, err => {
        if (err) return this.emit('error', err)
        if (!--count) this.emit('ready')
      })
    }) 
  }
}
