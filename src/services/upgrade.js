/*
 * @Author: JackYang
 * @Date: 2019-07-08 14:06:53  
 * @Last Modified by: JackYang
 * @Last Modified time: 2019-07-26 11:22:08
 * 
 */

const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const event = require('events')
const path = require('path')
const child = Promise.promisifyAll(require('child_process'))

const UUID = require('uuid')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const Config = require('config')
const debug = require('debug')('ws:upgrade')

const Fetch = require('../lib/fetch')
const State = require('../lib/state')
const Download = require('../lib/download')

const upgradeConf = Config.get('upgrade')

const isHighVersion = (current, next) => current < next
const TMPVOL = 'e56e1a2e-9721-4060-87f4-0e6c3ba3574b'

class Base extends State {
  debug(...args) {
    debug(...args)
  }

  upgrade(version, callback) {
    this.setState("Upgrading", version, callback)
  }

  name() {
    return this.constructor.name
  }
}

class Pending extends Base {
  
}

class Upgrading extends Base {
  enter(version, callback) {
    this.version = version
    this.upgradeAsync(version)
      .then(x => 
        this.setState("Finished"))
      .catch(e => 
        this.setState("Failed"))
    process.nextTick(() => callback(null)) // it`s take long times, so early callback, then polling state
  }

  async upgradeAsync(version) {
    if (!/[\d+][\.\d+]*/.test(version))
      throw new Error('version format error')
    if (this.ctx.downloader && this.ctx.downloader.status !== 'Finished') {
      this.ctx.downloader.destroy()
      this.ctx.downloader = null
    }
    let list = await this.ctx.listLocalAsync()
    if (!list.find(x => x === version)) {
      throw new Error('given version not found or not downloaded')
    }
    const tmpvol = path.join(Config.storage.roots.vols, TMPVOL)
    rimraf.sync(tmpvol)
    await child.execAsync(`btrfs subvolume create ${ tmpvol }`)
    await child.execAsync(`tar xf ${ path.join(this.ctx.dir, version) } -C ${ tmpvol } --zstd`)
    await fs.writeFileAsync(path.join(tmpvol, 'etc', 'version'), version)
    const roUUID = UUID.v4()
    await child.execAsync(`btrfs subvolume snapshot ${tmpvol} ${ path.join(Config.storage.roots.vols, roUUID) }`)
    rimraf.sync(tmpvol)
    await child.execAsync(`cowroot-checkout -m ro ${roUUID}`)
  }

  upgrade(version, callback) {
    callback(Object.assign(new Error('race'), { status: 400, code:'ERACE' }))
  }
}

class Finished extends Base {
  enter(version) {
    this.version = version
  }
}

class Failed extends Base {
  enter(version, e) {
    this.version = version
    this.error = e
  }
}

/**
 * fetch + download
 * 检查S3是否有新版本、解析新版本metadata
 * 然后下载新版本
 */
class Upgrade extends event {
  constructor(ctx, tmpDir, dir) {
    super()
    this.ctx = ctx
    this.tmpDir = tmpDir
    this.dir = dir
    this.fetcher = new Fetch(true)
    this.fetcher.on('Pending', this.onFetchData.bind(this))
    this.currentVersion = '0.0.0'
    try {
      this.currentVersion = fs.readFileSync(upgradeConf.version).toString().trim()
    } catch (e) {
      console.log(e.message)
    }
    new Pending(this)
  }

  get downloader() {
    return this._downloader
  }

  set downloader(value) {
    if (this._downloader) {
      this._downloader.removeAllListeners()
      this._downloader.destroy()
    }
    this._downloader = value
    if (!value) return
    this._downloader.on('Finished', () => {})
    this._downloader.on('Failed', () => {})
  }
  /**
   * {
   * "tag": "0.0.1",
   * "hash": "7b85477539c66c2a66cbe5efcc718257840c69f88ab9885389a3d229ac589599",
   * "url": "https://dingnan-upgrade.s3.cn-north-1.amazonaws.com.cn/beta/backus/backus-20190704-0.1.1-accbaa.tar.gz",
   * "desc": "测试镜像",
   * "preRelease": 1,
   * "gradient": 100,
   * "createdAt": "2019-07-09T06:04:49.000Z",
   * "type": "a1"
   * }
   */
  onFetchData() {
    let data = this.fetcher.last.data
    if (this.fetcher.last.error || !data) return // fetch error
    let docs = []
    if (Array.isArray(data))
      docs = data.sort((a, b) => a.tag < b.tag)
    if (docs.length) {
      let latest = docs[0]
      if (isHighVersion(this.currentVersion, latest.tag)) {
        if (!this.downloader || isHighVersion(this.downloader.version, latest.tag) || this.downloader.status === 'Failed')
          this.downloader = new Download(latest, this.tmpDir, this.dir)
        else
          debug('downloader already start')
      }
    } else
      debug('Fetch Empty Data')
  }

  upgrade(version, callback) {
    this.state.upgrade(version, callback)
  }

  confirm(callback) {
    child.exec('cowroot-confirm', e => callback(e))
  }

  listAll(callback) {
    this.listLocal((err, data) => {
      if (err) return callback(err)
      this.fetcher.start((err, data2) => {
        if (err) return callback(err)
        data2.forEach(x => x.downloaded = data.includes(x.tag))
        return callback(null, data2)
      })
    })
  }

  listLocal(callback) {
    fs.readdir(this.dir, (err, data) => {
      if (err) return callback(err)
      data = data.sort((a, b) => a < b)
      if (data.length > 1) {// error case
        data.slice(1).forEach(x => {
          try {
            rimraf.sync(path.join(this.dir, x))
          } catch (e) {/* ignore */ }
        })
        data = [data[0]]
      }
      return callback(null, data)
    })
  }

  async listLocalAsync() {
    return Promise.promisify(this.listLocal).bind(this)()
  }

  view() {
    return {
      state: this.state.name(),
      error: this.state.error,
      version: this.state.version,
      fetch: this.fetcher && this.fetcher.view(),
      download: this.downloader && this.downloader.view()
    }
  }
}

Upgrade.prototype.Upgrading = Upgrading
Upgrade.prototype.Finished = Finished
Upgrade.prototype.Failed = Failed
Upgrade.prototype.Pending = Pending

module.exports = Upgrade