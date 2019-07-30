/*
 * @Author: JackYang
 * @Date: 2019-07-08 14:06:53  
 * @Last Modified by: JackYang
 * @Last Modified time: 2019-07-30 13:09:09
 * 
 */

const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const event = require('events')
const path = require('path')
const child = Promise.promisifyAll(require('child_process'))

const UUID = require('uuid')
const mkdirp = require('mkdirp')
const mkdirpAsync = Promise.promisify(mkdirp)
const rimraf = require('rimraf')
const rimrafAsync = Promise.promisify(rimraf)
const Config = require('config')
const validator = require('validator')
const debug = require('debug')('ws:upgrade')

// const Fetch = require('../lib/fetch')
const State = require('../lib/state')
const Download = require('../lib/download')
const { SoftwareVersion } = require('../lib/device')

const VolsPath = Config.storage.roots.vols

// const isHighVersion = (current, next) => current < next

const TMPVOL = 'e56e1a2e-9721-4060-87f4-0e6c3ba3574b'
const WORKINGVOL = 'ebcc3123-127a-4d26-b083-38e8c0bf7f09'
const isUUID = uuid => typeof uuid === 'string' && /[a-f0-9\-]/.test(uuid) && validator.isUUID(uuid)

const readFileWithoutErrorAsync = async (fp) => {
  try {
    return (await fs.readFileAsync(fp)).toString()
  }catch(e) {
    return
  }
}

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
    await rimrafAsync(tmpvol)
    await child.execAsync(`btrfs subvolume create ${ tmpvol }`)
    const dirs = ['bin', 'etc', 'lib', 'root', 'sbin', 'usr', 'var']
    for (let i = 0; i < dirs.length; i++) {
      let p = path.join(tmpvol, dirs[i])
      await mkdirpAsync(p)
      await child.execAsync(`chattr +c ${p}`)
    }
    await child.execAsync(`tar xf ${ path.join(this.ctx.dir, version) } -C ${ tmpvol } --zstd`)
    await fs.writeFileAsync(path.join(tmpvol, 'etc', 'version'), version)
    const roUUID = UUID.v4()
    await child.execAsync(`btrfs subvolume snapshot ${tmpvol} ${ path.join(Config.storage.roots.vols, roUUID) }`)
    await rimrafAsync(tmpvol)
    await child.execAsync(`cowroot-checkout -m ro ${roUUID}`)
    await child.execAsync('sync')
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
    // this.fetcher = new Fetch(true)
    // this.fetcher.on('Pending', this.onFetchData.bind(this))
    this.currentVersion = SoftwareVersion()
    // new Pending(this)
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
  // onFetchData() {
  //   let data = this.fetcher.last.data
  //   if (this.fetcher.last.error || !data) return // fetch error
  //   let docs = []
  //   if (Array.isArray(data))
  //     docs = data.sort((a, b) => a.tag < b.tag)
  //   if (docs.length) {
  //     let latest = docs[0]
  //     if (isHighVersion(this.currentVersion, latest.tag)) {
  //       if (!this.downloader || isHighVersion(this.downloader.version, latest.tag) || this.downloader.status === 'Failed')
  //         this.downloader = new Download(latest, this.tmpDir, this.dir)
  //       else
  //         debug('downloader already start')
  //     }
  //   } else
  //     debug('Fetch Empty Data')
  // }
  
  handleDownloadMessage(data) {
    if (this.downloader && !this.downloader.isFinished()) return // ignore message
    if (this.working) return
    this.downloader = new Download(this, data, this.tmpDir, this.dir)
  }

  handleCheckoutMessage(data) {
    if (this.downloader && !this.downloader.isFinished()) return
    if (this.working) return
    this.working = true
    this.checkoutAsync(data)
      .then(_ => this.working = false)
      .catch(e => {
        this.working = false
        console.log(e)
      })
  }
  
  async checkoutAsync(data) {
    if (!data || !data.uuid || !isUUID(data.uuid)) return
    let uuid = data.uuid
    let vols = await this.listLocalAsync()
    if (uuid === vols.current.uuid) return
    if (!vols.roots.find(x => x.uuid === uuid)) return
    await child.execAsync(`cowroot-checkout -m ro ${uuid}`)
    console.log('checkout success')
    await child.execAsync('sync; sleep 1; reboot')
  }

  async listLocalAsync() {
    let vols = await fs.readdirAsync(VolsPath)
    // filter built-in vols
    vols = vols.filter(x => x !== WORKINGVOL && x !== TMPVOL && isUUID(x))
    
    let roots = []
    for (let i = 0; i < vols.length; i++) {
      let tag, commit, parent, version
      tag = await readFileWithoutErrorAsync(path.join(VolsPath, vols[i], '/boot/.tag'))
      commit = await readFileWithoutErrorAsync(path.join(VolsPath, vols[i], '/boot/.commit'))
      parent = await readFileWithoutErrorAsync(path.join(VolsPath, vols[i], '/boot/.parent'))
      version = (await readFileWithoutErrorAsync(path.join(VolsPath, vols[i], '/etc/version'))) || '0.0.0'
      uuid = vols[i]
      roots.push({ tag, commit, parent, version })
    }

    let current = {}
    current.tag = await readFileWithoutErrorAsync('/boot/.tag')
    current.commit = await readFileWithoutErrorAsync('/boot/.commit')
    current.uuid = await readFileWithoutErrorAsync('/boot/.parent')
    current.version = (await readFileWithoutErrorAsync('/etc/version')) || '0.0.0'
    return { current, roots }
  }

  LIST(user, props, callback) {
    this.listLocalAsync()
      .then(x => callback(null, x))
      .catch(e => callback(e))
  }

  view() {
    return {
      current: this.currentVersion,
      download: this.downloader && this.downloader.view()
    }
  }
}

Upgrade.prototype.Upgrading = Upgrading
Upgrade.prototype.Finished = Finished
Upgrade.prototype.Failed = Failed
Upgrade.prototype.Pending = Pending

module.exports = Upgrade