/*
 * @Author: JackYang
 * @Date: 2019-07-08 14:06:53  
 * @Last Modified by: JackYang
 * @Last Modified time: 2019-07-09 18:22:45
 * 
 */
const fs = require('fs')
const event = require('events')
const path = require('path')
const Promise = require('bluebird')
const child = Promise.promisifyAll(require('child_process'))

const UUID = require('uuid')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const Config = require('config')
const debug = require('debug')('ws:upgrade')

const Fetch = require('../lib/fetch')
const Download = require('../lib/download')

const upgradeConf = Config.get('upgrade')

const isHighVersion = (current, next) => current < next
const TMPVOL = 'e56e1a2e-9721-4060-87f4-0e6c3ba3574b'

/**
 * fetch + download
 * 检查S3是否有新版本、解析新版本metadata
 * 然后下载新版本
 */
class Upgrade extends event {

  constructor (ctx, tmpDir, dir) {
    super()
    this.ctx = ctx
    this.tmpDir = tmpDir
    this.dir = dir
    this.fetcher = new Fetch(true)
    this.fetcher.on('Pending', this.onFetchData.bind(this))
    this.currentVersion = '0.0.0'
    this.upgrading = false
    try {
      this.currentVersion = fs.readFileSync(upgradeConf.version).toString().trim()
    } catch (e) {
      console.log(e.message)
    }
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

  // 文件命名： abel-20181021-0.1.1-acbbbcca
  onFetchData() {
    let data = this.fetcher.last.data
    if (this.fetcher.last.error || !data) return // fetch error
    let docs = []
    if (Array.isArray(data))
      docs = data.filter(d => d.Key.endsWith('.json')).sort((a, b) => a.LastModified < b.LastModified)
    if (docs.length) {
      let latest = docs[0]
      let nameArr = latest.Key.slice(0, -5).split('-').map(x => x.trim())
      if (nameArr.length && nameArr.length === 4) {
        const version = nameArr[2]
        if (isHighVersion(this.currentVersion, version)) {
          // check if downloading
          if (this.downloader && !isHighVersion(this.downloader.version, version)) {
            debug('already ' + this.downloader.status)
          } else {
            this.downloader = new Download(latest.Key, this.tmpDir, this.dir, version)
          }
        } else {
          debug('current system is newest')
        }
      }
      else {
        debug('Invalid doc name: ', latest.Key)
      }
    }
    else
      debug('Invalid Fetch Data')
  }

  // check downloader status === Finished
  // btrfs subvolume create uuid
  // tar xzf
  // btrfs subvolume snap -r uuid ruuid
  // rm -r  uuid
  // cowroot_checkout ruuid
  // ???
  // cowroot_confirm
  async upgradeAsync(version) {
    if (!/[\d+][\.\d+]*/.test(version))
      throw new Error('version format error')
    if (this.downloader && this.downloader.status !== 'Finished') {
        this.downloader.destroy()
        this.downloader = null
    }
    let list= await this.listLocalAsync()
    if (!list.find(x => x === version + '.tar.gz')) {
      throw new Error('given version not found or not downloaded')
    }
    if (this.upgrading)
      throw new Error('upgrading')
    this.upgrading = true
    try{
      const tmpvol = path.join(Config.storage.roots.vols, TMPVOL)
      rimraf.sync(tmpvol)
      await child.execAsync(`btrfs subvolume create ${ tmpvol }`)
      await child.execAsync(`tar xf ${ path.join(this.dir, version + '.tar.gz') } -C ${ tmpvol }`)
      const roUUID = UUID.v4()
      await child.execAsync(`btrfs subvolume snapshot ${tmpvol} ${ path.join(Config.storage.roots.vols, roUUID) }`)
      rimraf.sync(tmpvol)
      await child.execAsync(`cowroot-checkout -m ro ${roUUID}`)
    }finally{
      this.upgrading = false
    }
  }

  upgrade(version, callback) {
    this.upgradeAsync(version)
      .then(x => {
        callback(null)
        child.exec('sleep 2; reboot')
      })
      .catch(e => callback(e))
  }

  confirm(callback) {
    child.exec('cowroot-confirm', e => callback(e))
  }

  listAll (callback) {
    return callback ? this.fetcher.start(callback) : this.fetcher.view()
  }

  listLocal (callback) {
    fs.readdir(this.dir, callback)
  }

  async listLocalAsync() {
    return fs.promises.readdir(this.dir)
  }

  view() {
    return {
      fetch: this.fetcher && this.fetcher.view(),
      download: this.downloader && this.downloader.view()
    }
  }
}

module.exports = Upgrade