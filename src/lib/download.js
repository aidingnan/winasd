/*
 * Filename: /home/jackyang/Documents/winas-daemon/src/lib/download.js
 * Path: /home/jackyang/Documents/winas-daemon
 * Created Date: Monday, July 29th 2019, 6:15:37 pm
 * Author: jackyang
 * 
 * Copyright (c) 2019 Wisnuc Inc
 */
const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const path = Promise.promisifyAll(require('path'))
const child = Promise.promisifyAll(require('child_process'))
const EventEmitter = require('events')
const request = require('superagent')
const mkdirp = require('mkdirp')
const mkdirpAsync = Promise.promisify(mkdirp)
const rimraf = require('rimraf')
const rimrafAsync = Promise.promisify(rimraf)
const Config = require('config')
const crypto = require('crypto')
const UUID = require('uuid')
const debug = require('debug')('ws:downloader')

const State = require('./state')

const HOUR = 1 * 1000 * 60 * 60
const TMPVOL = 'e56e1a2e-9721-4060-87f4-0e6c3ba3574b'

class HashTransform extends require('stream').Transform {
  constructor() {
    super()
    this.hashStream = crypto.createHash('sha256')
    this.length = 0
  }

  _transform(buf, enc, next) {
    this.length += buf.length
    this.hashStream.update(buf, enc)
    this.push(buf)
    next()
  }

  getHash() {
    return this.hashStream.digest('hex')
  }

  destroy() {
    this.hashStream.end()
    super.destroy()
  }
}

class Checking extends State {
  enter() {
    mkdirp.sync(this.ctx.tmpDir)
    let dstName = this.ctx.version
    this.ctx.ctx.LIST(null, null, (err, data) => {
      console.log('Download Checking', err, data)
      if (err) return this.setState('Failed', err)
      let rootfs = data.roots.find(x => x.version === dstName && !x.parent)
      if (rootfs) {
        this.setState('Finished', path.join(Config.storage.roots.vols, rootfs.uuid))
      } else {
        this.setState('Working')
      }
    })
  }

  destroy() {
    this.destroyed = true
    super.destroy()
  }
}

//TODO: check hash and write to free partition
class Working extends State {
  enter() {
    let tmpPath = path.join(this.ctx.tmpDir, UUID.v4())
    let fHash = this.ctx.hash
    let url = this.ctx.url
    debug('download url:', url)
    this.rs = request.get(url)
    this.rs.on('error', err => {
      this.destroy()
      this.setState('Failed', err)
    })
    this.rs.on('response', res => {
      if (res.header['content-length']) {
        this.ctx.length = parseInt(res.header['content-length'])
      } else {
        this.ctx.length = 'unknown'
      }
    })
    this.hashT = new HashTransform()
    this.ws = fs.createWriteStream(tmpPath)
    this.ws.on('error', err => {
      this.destroy()
      this.setState('Failed', err)
    })
    this.ws.on('finish', () => {
      let hash = this.hashT.getHash()
      if (hash !== fHash) {
        let e = new Error('hash mismatch')
        e.code = 'EHASHMISMATCH'
        return this.setState('Failed', e)
      }
      if ((this.ctx.length && this.ctx.length !== 'unknown') && this.ctx.length !== this.ws.bytesWritten) {
        let e = new Error('size mismatch')
        e.code = 'ESIZEMISMATCH'
        this.setState('Failed', e)
      } else {
        this.setState('Extracting', tmpPath)
      }
    })
    this.rs.pipe(this.hashT).pipe(this.ws)
  }

  bytesWritten() {
    return this.ws.bytesWritten
  }

  exit() {}

  destroy() {
    this.rs.removeAllListeners('error')
    this.rs.removeAllListeners('response')
    this.rs.on('error', () => {})
    this.ws.removeAllListeners()
    this.ws.on('error', () => {})
    this.hashT.unpipe(this.ws)
    this.rs.abort()
    this.ws.destroy()
    this.hashT.destroy()
    super.destroy()
  }
}

class Extracting extends State {
  enter(tmpPath) {
    this.extractAsync(tmpPath)
      .then(_ => this.setState('Finished', tmpPath))
      .catch(e => this.setState('Failed', e))
  }

  async extractAsync(tmpPath) {
    const tmpvol = path.join(Config.storage.roots.vols, TMPVOL)
    await rimrafAsync(tmpvol)
    await child.execAsync(`btrfs subvolume create ${ tmpvol }`)
    const dirs = ['bin', 'etc', 'lib', 'root', 'sbin', 'usr', 'var']
    for (let i = 0; i < dirs.length; i++) {
      let p = path.join(tmpvol, dirs[i])
      await mkdirpAsync(p)
      await child.execAsync(`chattr +c ${p}`)
    }
    await child.execAsync(`tar xf ${ tmpPath } -C ${ tmpvol } --zstd`)
    const roUUID = UUID.v4()
    await child.execAsync(`btrfs subvolume snapshot -r ${tmpvol} ${ path.join(Config.storage.roots.vols, roUUID) }`)
    await rimrafAsync(tmpvol)
    await child.execAsync('sync')
  }
}

class Failed extends State {
  enter(err) {
    debug(err)
    this.error = err
    // this.timer = setTimeout(() => this.setState('Checking'), 1 * HOUR)
  }

  destroy() {
    // clearTimeout(this.timer)
  }
}

class Finished extends State {
  enter(fpath) {
    this.fpath = fpath
  }
}

class Download extends EventEmitter {
  constructor(ctx, latest, tmpDir, dstDir) {
    super()
    this.ctx = ctx
    this.latest = latest
    this.tmpDir = tmpDir
    this.dstDir = dstDir
    this.url = latest.url
    this.hash = latest.hash
    this.desc = latest.desc
    this.version = latest.tag
    this.gradient = latest.gradient //灰度值
    this.createAt = latest.createAt
    this.preRelease = latest.preRelease // 是否为beta版
    new Checking(this)
  }

  bytesWritten() {
    return this.state instanceof Working ? this.state.bytesWritten() :
      this.state instanceof Finished ? this.state.fLength : 0
  }

  get status() {
    return this.state.constructor.name
  }

  destroy() {
    this.state.destroy()
  }

  isFinished() {
    return this.status === 'Finished' || this.status === 'Failed'
  }

  view() {
    return Object.assign({}, this.latest, {
      version: this.version,
      state: this.status,
      error: this.state.error,
      bytesWritten: this.bytesWritten()
    })
  }
}

Download.prototype.Working = Working
Download.prototype.Failed = Failed
Download.prototype.Finished = Finished
Download.prototype.Checking = Checking
Download.prototype.Extracting = Extracting

module.exports = Download