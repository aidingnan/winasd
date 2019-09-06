/*
 * @Author: JackYang
 * @Date: 2019-07-08 14:06:53
 * @Last Modified by: JackYang
 * @Last Modified time: 2019-09-06 16:07:16
 *
 */

const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))
const event = require('events')
const path = require('path')
const child = Promise.promisifyAll(require('child_process'))

const Config = require('config')
const validator = require('validator')

const channel = require('./channel')
const Download = require('../lib/download')
const { SoftwareVersion } = require('../lib/device')

const VolsPath = Config.volume.vols
const TMPVOL = 'e56e1a2e-9721-4060-87f4-0e6c3ba3574b'
const WORKINGVOL = 'ebcc3123-127a-4d26-b083-38e8c0bf7f09'
const isUUID = uuid => typeof uuid === 'string' && /[a-f0-9-]/.test(uuid) && validator.isUUID(uuid)

const readFileWithoutErrorAsync = async (fp) => {
  try {
    return (await fs.readFileAsync(fp)).toString().trim()
  } catch (e) {
  }
}

class Upgrade extends event {
  constructor (tmpDir /*, dir */) {
    super()
    this.tmpDir = tmpDir
    this.currentVersion = SoftwareVersion()
    channel.on('checkout', this.handleCheckoutMessage.bind(this))
    channel.on('download', this.handleDownloadMessage.bind(this))
  }

  get downloader () {
    return this._downloader
  }

  set downloader (value) {
    if (this._downloader) {
      this._downloader.removeAllListeners()
      this._downloader.destroy()
    }
    this._downloader = value
    if (!value) return
    this._downloader.on('Finished', () => {})
    this._downloader.on('Failed', () => {})
  }

  handleDownloadMessage (data) {
    if (this.downloader && !this.downloader.isFinished()) return // ignore message
    if (this.working) return
    this.downloader = new Download(this, data, this.tmpDir /*, this.dir */)
  }

  handleCheckoutMessage (data) {
    if (this.downloader && !this.downloader.isFinished()) return
    if (this.working) return
    this.working = true
    this.checkoutAsync(data)
      .then(_ => (this.working = false))
      .catch(e => {
        this.working = false
        console.log(e)
      })
  }

  async checkoutAsync (data) {
    if (!data || !data.uuid || !isUUID(data.uuid)) return
    const uuid = data.uuid
    const vols = await this.listLocalAsync()
    if (uuid === vols.current.uuid) return
    if (!vols.roots.find(x => x.uuid === uuid)) return
    await child.execAsync(`cowroot-checkout -m ro ${uuid}`)
    console.log('checkout success')
    await child.execAsync('sync; sleep 1; reboot')
  }

  async listLocalAsync () {
    let vols = await fs.readdirAsync(VolsPath)
    // filter built-in vols
    vols = vols.filter(x => x !== WORKINGVOL && x !== TMPVOL && isUUID(x))

    const roots = []
    for (let i = 0; i < vols.length; i++) {
      let version
      const commit = await readFileWithoutErrorAsync(path.join(VolsPath, vols[i], '/boot/.commit'))
      const parent = await readFileWithoutErrorAsync(path.join(VolsPath, vols[i], '/boot/.parent'))
      version = (await readFileWithoutErrorAsync(path.join(VolsPath, vols[i], '/etc/version')))
      if (version) version = version.slice(1).split('-')[0]
      const uuid = vols[i]
      roots.push({ commit, parent, version, uuid })
    }

    const current = {}
    current.commit = await readFileWithoutErrorAsync('/boot/.commit')
    current.uuid = await readFileWithoutErrorAsync('/boot/.parent')
    let version = (await readFileWithoutErrorAsync('/etc/version'))
    if (version) version = version.slice(1).split('-')[0]
    current.version = version
    return { current, roots }
  }

  listLocal (callback) {
    this.listLocalAsync()
      .then(x => callback(null, x))
      .catch(e => callback(e))
  }

  view () {
    return {
      current: this.currentVersion,
      download: this.downloader && this.downloader.view()
    }
  }
}

const upgrade = new Upgrade(Config.volume.tmp)

module.exports = upgrade
