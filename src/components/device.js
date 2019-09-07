const path = require('path')
const fs = require('fs')
const child = require('child_process')
const EventEmitter = require('events')
const os = require('os')

const config = require('config')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const debug = require('debug')('ws:device')

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

    this.homeDir = ''
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

        debug(`sn: ${this.sn}, usn: ${this.usn}, home dir: ${this.homeDir}, count down: ${count}`)

        if (!--count) this.emit('ready')
      })
    })

    fs.readFile('/etc/version', (err, data) => {
      if (!err) {
        const r = data.toString().match(/^v(\d+\.\d+\.\d+)*/)
        if (Array.isArray(r)) this.version = r[1]
      }

      debug(`version: ${this.version}, count down: ${count}`)

      if (!--count) this.emit('ready')
    })

    fs.readFile('/proc/device-tree/model', (err, data) => {
      if (!err) {
        let m = data.toString()
        if (m.slice(-1) === '\u0000') m = m.slice(0, m.length - 1)
        this.model = m
      }

      debug(`model: ${this.model}, count down: ${count}`)

      if (!--count) this.emit('ready')
    })

    rimraf(this.tmpDir, err => {
      if (err) return this.emit('error', err)
      mkdirp(this.tmpDir, err => {
        if (err) return this.emit('error', err)

        debug(`tmp dir ready: ${this.tmpDir}, count down: ${count}`)

        if (!--count) this.emit('ready')
      })
    })
  }

  reboot () {
    this.emit('shutdown')
    this.setTimeout(() => {
      child.exec('reboot', () => {})
    }, 5 * 1000)
  }

  shutdown () {
    this.emit('shutdown')
    this.setTimeout(() => {
      child.exec('shutdown', () => {})
    }, 5 * 1000)
  }
}

module.exports = new Device()
